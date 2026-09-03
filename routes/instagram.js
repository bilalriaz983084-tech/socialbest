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

        // 🌟 GATEWAY 1: High-Speed FastDL Public CDN API (Works reliably on Vercel IPs)
        try {
            const apiRes = await axios.post('https://api.fastdl.app/api/convert', {
                url: `https://www.instagram.com/reel/${shortcode}/`
            }, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                    'Content-Type': 'application/json',
                    'Origin': 'https://fastdl.app',
                    'Referer': 'https://fastdl.app/'
                },
                timeout: 8000
            });

            if (apiRes.data && apiRes.data.url) {
                const results = Array.isArray(apiRes.data.url) ? apiRes.data.url : [apiRes.data.url];
                const formats = results.map((item, idx) => {
                    const dl = item.url || item;
                    const isVid = dl.includes('.mp4') || (item.type && item.type === 'video');
                    return {
                        quality: `Item ${idx + 1} (${isVid ? 'Video' : 'Photo'})`,
                        downloadUrl: dl,
                        extension: isVid ? 'mp4' : 'jpg',
                        type: isVid ? 'video' : 'photo'
                    };
                });

                return res.json({
                    success: true,
                    title: `Instagram_${shortcode}`,
                    thumbnail: formats[0].downloadUrl,
                    downloadUrl: formats[0].downloadUrl,
                    formats: formats
                });
            }
        } catch (_) {}

        // 🌟 GATEWAY 2: SnapInsta API Engine
        try {
            const snapRes = await axios.post('https://snapinsta.app/action.php', 
                new URLSearchParams({ url: `https://www.instagram.com/p/${shortcode}/`, action: 'post' }).toString(), 
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
                    },
                    timeout: 7000
                }
            );

            if (snapRes.data) {
                const vidMatch = snapRes.data.match(/href="([^"]+)" class="btn download-media/);
                if (vidMatch && vidMatch[1]) {
                    const dlUrl = vidMatch[1].replace(/&amp;/g, '&');
                    return res.json({
                        success: true,
                        title: `Instagram_${shortcode}`,
                        thumbnail: dlUrl,
                        downloadUrl: dlUrl,
                        formats: [{
                            quality: 'HD Quality (MP4)',
                            downloadUrl: dlUrl,
                            extension: 'mp4',
                            type: 'video'
                        }]
                    });
                }
            }
        } catch (_) {}

        // 🌟 GATEWAY 3: Cobalt Modern Stream Bridge
        const mirrors = [
            'https://cobalt-api.kwiatekm.tokyo',
            'https://api.wuk.sh'
        ];

        for (const mirror of mirrors) {
            try {
                const mirrorRes = await axios.post(`${mirror}/`, {
                    url: `https://www.instagram.com/p/${shortcode}/`,
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
            error: 'Instagram link could not be parsed. Verify the reel is public.'
        });

    } catch (err) {
        console.error('Instagram Route Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
