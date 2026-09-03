const express = require('express');
const router = express.Router();
const { ApifyClient } = require('apify-client');
const axios = require('axios');

// Apify Token (Isko .env mein APIFY_API_TOKEN ke naam se rakhein ya direct string yahan dein)
const APIFY_TOKEN = process.env.APIFY_API_TOKEN || 'YAHAN_APNA_APIFY_TOKEN_DAALEIN';

const apifyClient = new ApifyClient({
    token: APIFY_TOKEN,
});

router.get('/status', (req, res) => {
    res.json({ platform: 'Instagram', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

router.post('/download', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'Instagram URL is required' });

    const cleanUrl = url.trim().split('?')[0];

    // ============================================================
    // 🌟 METHOD 1: Apify Instagram Scraper (100% IP Block Bypass)
    // ============================================================
    if (APIFY_TOKEN && APIFY_TOKEN !== 'YAHAN_APNA_APIFY_TOKEN_DAALEIN') {
        try {
            // Apify ka official reliable actor: apify/instagram-post-scraper
            const run = await apifyClient.actor("apify/instagram-post-scraper").call({
                directUrls: [cleanUrl],
                resultsLimit: 1
            });

            const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();

            if (items && items.length > 0) {
                const item = items[0];
                const formats = [];

                // 1. Check for Carousel (Multiple Images / Videos)
                if (item.childPosts && item.childPosts.length > 0) {
                    item.childPosts.forEach((child, idx) => {
                        const isVid = child.type === 'Video' || child.videoUrl;
                        const dlUrl = isVid ? child.videoUrl : (child.displayUrl || child.images?.[0]);

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
                // 2. Single Video / Reel
                else if (item.videoUrl) {
                    formats.push({
                        quality: 'HD Video (MP4)',
                        downloadUrl: item.videoUrl,
                        extension: 'mp4',
                        type: 'video'
                    });
                }
                // 3. Single Photo
                else if (item.displayUrl) {
                    formats.push({
                        quality: 'HD Photo (JPG)',
                        downloadUrl: item.displayUrl,
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
            // Agar Apify ka quota khatam ho ya error aaye to neeche fallback par jayega
        }
    }

    // ============================================================
    // 🌟 METHOD 2: FastDL Gateway Fallback (Zero Setup)
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
            timeout: 9000
        });

        if (fdlRes.data && fdlRes.data.url) {
            const results = Array.isArray(fdlRes.data.url) ? fdlRes.data.url : [fdlRes.data.url];
            const formats = results.map((entry, idx) => {
                const dl = entry.url || entry;
                const isVid = dl.includes('.mp4') || entry.type === 'video';
                return {
                    quality: results.length > 1 ? `Item ${idx + 1} (${isVid ? 'Video' : 'Photo'})` : (isVid ? 'HD Video (MP4)' : 'HD Photo (JPG)'),
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
    } catch (_) {}

    return res.status(400).json({
        success: false,
        error: 'Instagram link could not be parsed. Verify the reel/post is public.'
    });
});

module.exports = router;
