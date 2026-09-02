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
        const cleanUrl = url.trim().split('?')[0];
        const match = cleanUrl.match(/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
        if (!match) {
            return res.status(400).json({ success: false, error: 'Invalid Instagram URL format' });
        }
        const shortcode = match[1];

        // 🌟 GATEWAY 1: Direct SnapSave API Bridge (Bypasses Vercel IP Block completely)
        try {
            const formData = new URLSearchParams();
            formData.append('url', `https://www.instagram.com/reel/${shortcode}/`);

            const snapRes = await axios.post('https://snapsave.app/action.php?lang=en', formData.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                    'Referer': 'https://snapsave.app/'
                },
                timeout: 8000
            });

            if (snapRes.data) {
                const vidUrlMatch = snapRes.data.match(/href="([^"]+)" class="btn download-media/);
                if (vidUrlMatch && vidUrlMatch[1]) {
                    const finalMediaUrl = vidUrlMatch[1].replace(/&amp;/g, '&');
                    return res.json({
                        success: true,
                        title: `Instagram_${shortcode}`,
                        thumbnail: finalMediaUrl,
                        downloadUrl: finalMediaUrl,
                        formats: [{
                            quality: 'HD Quality (MP4)',
                            downloadUrl: finalMediaUrl,
                            extension: 'mp4',
                            type: 'video'
                        }]
                    });
                }
            }
        } catch (_) {}

        // 🌟 GATEWAY 2: DDInstagram Resolver (Emulates Twitter/Telegram Bot crawler)
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

        // 🌟 GATEWAY 3: Fast-Proxy Deno Resolver
        try {
            const proxyRes = await axios.get(`https://instagram-media-downloader.deno.dev/media?url=https://www.instagram.com/p/${shortcode}/`, {
                timeout: 8000
            });

            if (proxyRes.data && proxyRes.data.url) {
                const isVid = proxyRes.data.type === 'video' || proxyRes.data.url.includes('.mp4');
                return res.json({
                    success: true,
                    title: `Instagram_${shortcode}`,
                    thumbnail: proxyRes.data.url,
                    downloadUrl: proxyRes.data.url,
                    formats: [{
                        quality: isVid ? 'HD Video' : 'HD Photo',
                        downloadUrl: proxyRes.data.url,
                        extension: isVid ? 'mp4' : 'jpg',
                        type: isVid ? 'video' : 'photo'
                    }]
                });
            }
        } catch (_) {}

        return res.status(400).json({
            success: false,
            error: 'Instagram media could not be parsed. Verify the reel is public.'
        });

    } catch (err) {
        console.error('Instagram Route Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
