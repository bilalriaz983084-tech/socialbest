const express = require('express');
const router = express.Router();
const { ApifyClient } = require('apify-client');
const axios = require('axios');

const APIFY_TOKEN = process.env.APIFY_API_TOKEN || 'apify_api_QigZyIwNVCerPEctLzFxffpTXt6jnF48DGlI';

const apifyClient = new ApifyClient({
    token: APIFY_TOKEN,
});

router.get('/status', (req, res) => {
    res.json({ platform: 'Instagram', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

router.post('/download', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'Instagram URL is required' });

    let cleanUrl = url.trim().split('?')[0];

    // ============================================================
    // 🌟 METHOD 1: FastDL Multi-Item Extractor
    // ============================================================
    try {
        const fdlRes = await axios.post('https://api.fastdl.app/api/convert', {
            url: cleanUrl
        }, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Origin': 'https://fastdl.app',
                'Referer': 'https://fastdl.app/'
            },
            timeout: 4500
        });

        if (fdlRes.data && fdlRes.data.url) {
            const rawList = Array.isArray(fdlRes.data.url) ? fdlRes.data.url : [fdlRes.data.url];
            if (rawList.length > 1) { // Agar multi-media post pakar le
                const formats = rawList.map((entry, idx) => {
                    const dl = entry.url || entry;
                    const isVid = dl.includes('.mp4') || entry.type === 'video';
                    return {
                        quality: `Photo/Video ${idx + 1}`,
                        downloadUrl: dl,
                        extension: isVid ? 'mp4' : 'jpg',
                        type: isVid ? 'video' : 'photo'
                    };
                });

                return res.json({
                    success: true,
                    title: `Instagram_${Date.now()}`,
                    thumbnail: formats[0].downloadUrl,
                    downloadUrl: formats[0].downloadUrl,
                    formats: formats
                });
            }
        }
    } catch (_) {}

    // ============================================================
    // 🌟 METHOD 2: Apify Complete Carousel Extraction (All Photos/Videos)
    // ============================================================
    if (APIFY_TOKEN) {
        try {
            const input = {
                username: [cleanUrl],
                resultsLimit: 1,
                skipPinnedPosts: false
                // dataDetailLevel basic se hata diya hai taake poora multi-item data aye
            };

            const run = await apifyClient.actor("nH2AHrwxeTRJoN5hX").call(input, {
                waitSecs: 8
            });

            const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();

            if (items && items.length > 0) {
                const item = items[0];
                const formats = [];

                // 1. Check for childPosts (Carousel format A)
                const children = item.childPosts || item.sidecarChildren || [];
                if (children.length > 0) {
                    children.forEach((child, idx) => {
                        const isVid = child.type === 'Video' || !!child.videoUrl;
                        const dlUrl = isVid ? child.videoUrl : (child.displayUrl || (child.images && child.images[0]));

                        if (dlUrl) {
                            formats.push({
                                quality: `Item ${idx + 1} (${isVid ? 'Video' : 'Photo'})`,
                                downloadUrl: dlUrl,
                                extension: isVid ? 'mp4' : 'jpg',
                                type: isVid ? 'video' : 'photo'
                            });
                        }
                    });
                }
                // 2. Check for images array (Carousel format B - Multiple Images)
                else if (item.images && Array.isArray(item.images) && item.images.length > 1) {
                    item.images.forEach((imgUrl, idx) => {
                        formats.push({
                            quality: `Photo ${idx + 1}`,
                            downloadUrl: imgUrl,
                            extension: 'jpg',
                            type: 'photo'
                        });
                    });
                }
                // 3. Single Video / Reel
                else if (item.videoUrl) {
                    formats.push({
                        quality: 'HD Video (MP4)',
                        downloadUrl: item.videoUrl,
                        extension: 'mp4',
                        type: 'video'
                    });
                }
                // 4. Single Photo
                else if (item.displayUrl || (item.images && item.images.length > 0)) {
                    const imgUrl = item.displayUrl || item.images[0];
                    formats.push({
                        quality: 'HD Photo (JPG)',
                        downloadUrl: imgUrl,
                        extension: 'jpg',
                        type: 'photo'
                    });
                }

                if (formats.length > 0) {
                    return res.json({
                        success: true,
                        title: `Instagram_${item.shortCode || Date.now()}`,
                        thumbnail: formats[0].downloadUrl,
                        downloadUrl: formats[0].downloadUrl,
                        formats: formats
                    });
                }
            }
        } catch (apifyErr) {
            console.error('Apify execution error:', apifyErr.message);
        }
    }

    return res.status(400).json({
        success: false,
        error: 'Instagram link could not be parsed. Verify the reel/post is public.'
    });
});

module.exports = router;
