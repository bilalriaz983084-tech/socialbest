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

// Helper: Redirects resolve karein aur tracking parameters clean karein
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
        // 🌟 METHOD 1: FastDL Gateway (Instant Sub-2s Response)
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
                timeout: 4500
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
        // 🌟 METHOD 2: Verified Apify Actor (ID: 3fjTw1dfOOEYaG4eI)
        // ============================================================
        if (APIFY_TOKEN) {
            try {
                const input = {
                    urls: [targetUrl],
                    includeCommentText: false,
                    proxy: {
                        useApifyProxy: true
                    }
                };

                // Wait secs 8 rakha hai taake container build pull hone ka time mile
                const run = await apifyClient.actor("3fjTw1dfOOEYaG4eI").call(input, {
                    waitSecs: 8
                });

                const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();

                if (items && items.length > 0) {
                    const post = items[0];
                    const formats = [];

                    // Exhaustive search across all possible video attributes in actor output
                    const videoUrl = post.videoUrl || 
                                     post.media?.[0]?.videoUrl || 
                                     post.media?.[0]?.url ||
                                     post.attachments?.[0]?.url || 
                                     post.attachments?.[0]?.playable_url ||
                                     post.playable_url_quality_hd ||
                                     post.playable_url;

                    if (videoUrl && typeof videoUrl === 'string') {
                        formats.push({
                            quality: 'HD Video (MP4)',
                            downloadUrl: videoUrl,
                            extension: 'mp4',
                            type: 'video'
                        });
                    }

                    // Fallback to Photo if post is an image
                    if (formats.length === 0) {
                        const imgUrl = post.imageUrl || post.media?.[0]?.url || post.images?.[0];
                        if (imgUrl) {
                            formats.push({
                                quality: 'HD Photo (JPG)',
                                downloadUrl: imgUrl,
                                extension: 'jpg',
                                type: 'photo'
                            });
                        }
                    }

                    if (formats.length > 0) {
                        return res.json({
                            success: true,
                            title: `Facebook_${post.id || Date.now()}`,
                            thumbnail: formats[0].downloadUrl,
                            downloadUrl: formats[0].downloadUrl,
                            formats: formats
                        });
                    }
                }
            } catch (apifyErr) {
                console.error('Apify Facebook Error:', apifyErr.message);
            }
        }

        return res.status(400).json({
            success: false,
            error: 'Facebook video could not be parsed. Verify the post/reel is public.'
        });

    } catch (err) {
        console.error('Facebook Route Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
