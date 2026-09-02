const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'Instagram', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

router.post('/download', async (req, res) => {
    let { url } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: 'Instagram URL is required' });
    }

    try {
        let cleanUrl = url.trim();

        // 🌟 Extract shortcode correctly
        const match = cleanUrl.match(/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
        if (!match) {
            return res.status(400).json({ success: false, error: 'Invalid Instagram URL format' });
        }
        const shortcode = match[1];

        // 🌟 Engine 1: Dedicated Instagram Media API Gateway (Bypasses Vercel IP Block)
        const gatewayRes = await axios.get(`https://instavideosave.net/wp-json/aio-dl/api/v1/preflight?url=${encodeURIComponent(`https://www.instagram.com/reel/${shortcode}/`)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 7000
        }).catch(() => null);

        if (gatewayRes && gatewayRes.data && gatewayRes.data.url) {
            const downloadUrl = gatewayRes.data.url;
            return res.json({
                success: true,
                title: `Instagram_${shortcode}`,
                thumbnail: downloadUrl,
                downloadUrl: downloadUrl,
                formats: [{
                    quality: 'HD Quality (MP4)',
                    downloadUrl: downloadUrl,
                    extension: 'mp4',
                    type: 'video'
                }]
            });
        }

        // 🌟 Engine 2: DDInstagram Mobile Service
        try {
            const ddRes = await axios.get(`https://api.ddinstagram.com/videos/${shortcode}`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' },
                timeout: 6000
            });

            if (ddRes.data && ddRes.data.direct_url) {
                return res.json({
                    success: true,
                    title: `Instagram_${shortcode}`,
                    thumbnail: ddRes.data.direct_url,
                    downloadUrl: ddRes.data.direct_url,
                    formats: [{
                        quality: 'HD Video',
                        downloadUrl: ddRes.data.direct_url,
                        extension: 'mp4',
                        type: 'video'
                    }]
                });
            }
        } catch (_) {}

        // 🌟 Engine 3: Native Instagram Web API (Emulating iOS App)
        const webApiRes = await axios.get(`https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 289.0.0.25.109',
                'Sec-Fetch-Site': 'same-origin'
            },
            timeout: 6000
        }).catch(() => null);

        if (webApiRes && webApiRes.data) {
            const data = webApiRes.data.graphql ? webApiRes.data.graphql.shortcode_media : (webApiRes.data.items ? webApiRes.data.items[0] : null);
            if (data) {
                const isVideo = data.video_versions || data.is_video;
                const streamUrl = isVideo 
                    ? (data.video_versions ? data.video_versions[0].url : data.video_url)
                    : (data.image_versions2 ? data.image_versions2.candidates[0].url : data.display_url);

                if (streamUrl) {
                    return res.json({
                        success: true,
                        title: `Instagram_${shortcode}`,
                        thumbnail: streamUrl,
                        downloadUrl: streamUrl,
                        formats: [{
                            quality: isVideo ? 'HD Video' : 'HD Photo',
                            downloadUrl: streamUrl,
                            extension: isVideo ? 'mp4' : 'jpg',
                            type: isVideo ? 'video' : 'photo'
                        }]
                    });
                }
            }
        }

        return res.status(400).json({
            success: false,
            error: 'Unable to extract media. Profile might be private.'
        });

    } catch (err) {
        console.error('Instagram Route Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
