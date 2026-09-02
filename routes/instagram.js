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
        const cleanUrl = url.trim();
        const match = cleanUrl.match(/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
        if (!match) {
            return res.status(400).json({ success: false, error: 'Invalid Instagram URL format' });
        }
        const shortcode = match[1];

        // 🌟 GATEWAY 1: High-Speed SnapSave / FastDL Public Bridge
        try {
            const snapRes = await axios.post('https://snapinsta.app/action.php', 
                new URLSearchParams({ url: `https://www.instagram.com/reel/${shortcode}/`, action: 'post' }).toString(), 
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 7000
                }
            );

            if (snapRes.data) {
                const vidMatch = snapRes.data.match(/href="([^"]+)" class="btn download-media/);
                if (vidMatch && vidMatch[1]) {
                    const videoUrl = vidMatch[1].replace(/&amp;/g, '&');
                    return res.json({
                        success: true,
                        title: `Instagram_${shortcode}`,
                        thumbnail: videoUrl,
                        downloadUrl: videoUrl,
                        formats: [{
                            quality: 'HD Video',
                            downloadUrl: videoUrl,
                            extension: 'mp4',
                            type: 'video'
                        }]
                    });
                }
            }
        } catch (_) {}

        // 🌟 GATEWAY 2: DDInstagram JSON Direct Resolution
        try {
            const ddRes = await axios.get(`https://api.ddinstagram.com/videos/${shortcode}`, {
                headers: {
                    'User-Agent': 'TelegramBot (like TwitterBot)'
                },
                timeout: 7000
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

        // 🌟 GATEWAY 3: Instavideosave Fast API
        try {
            const ivsRes = await axios.get(`https://instavideosave.net/wp-json/aio-dl/api/v1/preflight?url=${encodeURIComponent(`https://www.instagram.com/reel/${shortcode}/`)}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X)'
                },
                timeout: 7000
            });

            if (ivsRes.data && ivsRes.data.url) {
                return res.json({
                    success: true,
                    title: `Instagram_${shortcode}`,
                    thumbnail: ivsRes.data.url,
                    downloadUrl: ivsRes.data.url,
                    formats: [{
                        quality: 'HD Video',
                        downloadUrl: ivsRes.data.url,
                        extension: 'mp4',
                        type: 'video'
                    }]
                });
            }
        } catch (_) {}

        // 🌟 GATEWAY 4: Multi-Mirror Engine Fallback
        const mirrors = [
            'https://cobalt-api.kwiatekm.tokyo',
            'https://api.wuk.sh'
        ];

        for (const mirror of mirrors) {
            try {
                const mirrorRes = await axios.post(`${mirror}/`, {
                    url: `https://www.instagram.com/reel/${shortcode}/`,
                    videoQuality: 'max'
                }, {
                    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                    timeout: 7000
                });

                if (mirrorRes.data && mirrorRes.data.url) {
                    return res.json({
                        success: true,
                        title: `Instagram_${shortcode}`,
                        thumbnail: mirrorRes.data.url,
                        downloadUrl: mirrorRes.data.url,
                        formats: [{
                            quality: 'HD Video',
                            downloadUrl: mirrorRes.data.url,
                            extension: 'mp4',
                            type: 'video'
                        }]
                    });
                }
            } catch (_) {
                continue;
            }
        }

        return res.status(400).json({
            success: false,
            error: 'Instagram rate-limited this request. Please try another reel link.'
        });

    } catch (err) {
        console.error('Instagram Route Crash:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
