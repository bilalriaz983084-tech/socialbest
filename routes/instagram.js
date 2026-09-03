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
    // 🌟 METHOD 1: Fast Direct Extraction (< 1.5 Seconds, Zero Timeout)
    // ============================================================
    try {
        const directRes = await axios.get(`https://api.vkrdownloader.vercel.app/server?vkr=${encodeURIComponent(cleanUrl)}`, {
            timeout: 6000
        });

        if (directRes.data && directRes.data.data) {
            const data = directRes.data.data;
            const dlUrl = data.url || data.download_url;

            if (dlUrl) {
                const isVid = dlUrl.includes('.mp4') || data.type === 'video';
                return res.json({
                    success: true,
                    title: `Instagram_${Date.now()}`,
                    thumbnail: dlUrl,
                    downloadUrl: dlUrl,
                    formats: [{
                        quality: isVid ? 'HD Video (MP4)' : 'HD Photo (JPG)',
                        downloadUrl: dlUrl,
                        extension: isVid ? 'mp4' : 'jpg',
                        type: isVid ? 'video' : 'photo'
                    }]
                });
            }
        }
    } catch (_) {}

    // ============================================================
    // 🌟 METHOD 2: Apify Fixed Actor (Single Post / Reel Scraper)
    // ============================================================
    if (APIFY_TOKEN) {
        try {
            // Sahi Actor jo direct post URLs leti hai aur username nahi mangti
            const run = await apifyClient.actor("shu8h4m/instagram-downloader").call({
                url: cleanUrl
            }, { timeoutSecs: 9 });

            const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();

            if (items && items.length > 0) {
                const item = items[0];
                const formats = [];

                // Multi-item / Carousel post
                if (item.medias && Array.isArray(item.medias)) {
                    item.medias.forEach((m, idx) => {
                        const isVid = m.type === 'video' || (m.url && m.url.includes('.mp4'));
                        formats.push({
                            quality: `Item ${idx + 1} (${isVid ? 'Video' : 'Photo'})`,
                            downloadUrl: m.url,
                            extension: isVid ? 'mp4' : 'jpg',
                            type: isVid ? 'video' : 'photo'
                        });
                    });
                } 
                // Single Video ya Single Photo
                else if (item.url || item.downloadUrl) {
                    const finalUrl = item.url || item.downloadUrl;
                    const isVid = item.type === 'video' || finalUrl.includes('.mp4');
                    formats.push({
                        quality: isVid ? 'HD Video (MP4)' : 'HD Photo (JPG)',
                        downloadUrl: finalUrl,
                        extension: isVid ? 'mp4' : 'jpg',
                        type: isVid ? 'video' : 'photo'
                    });
                }

                if (formats.length > 0) {
                    return res.json({
                        success: true,
                        title: `Instagram_${Date.now()}`,
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

    // ============================================================
    // 🌟 METHOD 3: Public Rapid Gateway Fallback
    // ============================================================
    try {
        const rapidRes = await axios.post('https://api.fastdl.app/api/convert', {
            url: cleanUrl
        }, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 6000
        });

        if (rapidRes.data && rapidRes.data.url) {
            const rawList = Array.isArray(rapidRes.data.url) ? rapidRes.data.url : [rapidRes.data.url];
            const formats = rawList.map((entry, idx) => {
                const dl = entry.url || entry;
                const isVid = dl.includes('.mp4') || entry.type === 'video';
                return {
                    quality: rawList.length > 1 ? `Item ${idx + 1} (${isVid ? 'Video' : 'Photo'})` : (isVid ? 'HD Video (MP4)' : 'HD Photo (JPG)'),
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
