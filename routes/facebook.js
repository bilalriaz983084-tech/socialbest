const express = require('express');
const router = express.Router();
const { ApifyClient } = require('apify-client');
const axios = require('axios');

const APIFY_TOKEN = process.env.APIFY_API_TOKEN || 'apify_api_QigZyIwNVCerPEctLzFxffpTXt6jnF48DGlI';

const apifyClient = new ApifyClient({
    token: APIFY_TOKEN,
});

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

// Helper: Redirects expand karein aur clean URL banayein
async function cleanAndExpandFacebookUrl(rawUrl) {
    let clean = rawUrl.trim();

    if (clean.includes('facebook.com') && clean.includes('?')) {
        clean = clean.split('?')[0];
    }

    if (clean.includes('fb.watch') || clean.includes('/share/')) {
        try {
            const headRes = await axios.get(clean, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                maxRedirects: 5,
                timeout: 4000
            });
            const redirected = headRes.request?.res?.responseUrl;
            if (redirected) {
                clean = redirected.split('?')[0];
            }
        } catch (_) {}
    }

    return clean;
}

router.post('/download', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'Facebook URL is required' });

    try {
        const targetUrl = await cleanAndExpandFacebookUrl(url);

        // ============================================================
        // 🌟 METHOD 1: FastDL Direct Conversion (< 2s)
        // ============================================================
        try {
            const fdlRes = await axios.post('https://api.fastdl.app/api/convert', {
                url: targetUrl
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Origin': 'https://fastdl.app',
                    'Referer': 'https://fastdl.app/'
                },
                timeout: 4000
            });

            if (fdlRes.data && fdlRes.data.url) {
                const results = Array.isArray(fdlRes.data.url) ? fdlRes.data.url : [fdlRes.data.url];
                const formats = [];

                results.forEach((entry, idx) => {
                    const dl = entry.url || entry;
                    if (dl && typeof dl === 'string') {
                        const isHd = entry.name?.toLowerCase().includes('hd') || dl.includes('_hd');
                        formats.push({
                            quality: isHd ? 'HD Quality (MP4)' : `SD Quality (MP4) ${idx > 0 ? idx + 1 : ''}`.trim(),
                            downloadUrl: dl,
                            extension: 'mp4',
                            type: 'video'
                        });
                    }
                });

                if (formats.length > 0) {
                    return res.json({
                        success: true,
                        title: `Facebook_${Date.now()}`,
                        thumbnail: formats[0].downloadUrl,
                        downloadUrl: formats[0].downloadUrl,
                        formats: formats
                    });
                }
            }
        } catch (_) {}

        // ============================================================
        // 🌟 METHOD 2: Verified Lightweight Actor (ID: OkuDbWbIxkgSRhppo)
        // ============================================================
        if (APIFY_TOKEN) {
            try {
                const input = {
                    "direct_urls": [
                        {
                            "url": targetUrl
                        }
                    ]
                };

                const run = await apifyClient.actor("OkuDbWbIxkgSRhppo").call(input, {
                    waitSecs: 8
                });

                const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();

                if (items && items.length > 0) {
                    const post = items[0];
                    console.log("Apify Facebook Raw Output:", JSON.stringify(post));

                    const formats = [];

                    // 1. Comprehensive search for video URL
                    let targetVideo = post.video ||
                                     post.video_url || 
                                     post.videoUrl || 
                                     post.playable_url_quality_hd || 
                                     post.playable_url ||
                                     post.download_url;

                    // Agar media array mein video ho
                    if (!targetVideo && post.media && Array.isArray(post.media)) {
                        const vItem = post.media.find(m => (typeof m === 'string' && m.includes('.mp4')) || m.type === 'video' || m.video_url);
                        if (vItem) {
                            targetVideo = typeof vItem === 'string' ? vItem : (vItem.video_url || vItem.url);
                        }
                    }

                    if (targetVideo && typeof targetVideo === 'string') {
                        formats.push({
                            quality: 'HD Video (MP4)',
                            downloadUrl: targetVideo,
                            extension: 'mp4',
                            type: 'video'
                        });
                    }

                    // 2. Comprehensive search for photo(s)
                    if (formats.length === 0) {
                        let targetImg = post.image ||
                                        post.image_url || 
                                        post.imageUrl || 
                                        post.thumbnail;

                        if (!targetImg && post.media && Array.isArray(post.media)) {
                            const imgItem = post.media.find(m => typeof m === 'string' || m.type === 'image' || m.url);
                            if (imgItem) {
                                targetImg = typeof imgItem === 'string' ? imgItem : imgItem.url;
                            }
                        }

                        if (targetImg && typeof targetImg === 'string') {
                            formats.push({
                                quality: 'HD Photo (JPG)',
                                downloadUrl: targetImg,
                                extension: 'jpg',
                                type: 'photo'
                            });
                        }
                    }

                    if (formats.length > 0) {
                        return res.json({
                            success: true,
                            title: `Facebook_${post.id || post.post_id || Date.now()}`,
                            thumbnail: formats[0].downloadUrl,
                            downloadUrl: formats[0].downloadUrl,
                            formats: formats
                        });
                    }
                }
            } catch (apifyErr) {
                console.error('Apify Facebook Fast Error:', apifyErr.message);
            }
        }

        return res.status(400).json({
            success: false,
            error: 'Facebook media could not be parsed. Verify the post/reel is public.'
        });

    } catch (err) {
        console.error('Facebook Route Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
