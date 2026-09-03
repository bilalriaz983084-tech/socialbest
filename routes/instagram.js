const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'Instagram', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

router.post('/download', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'Instagram URL is required' });

    let cleanUrl = url.trim().split('?')[0];

    // ============================================================
    // 🌟 GATEWAY 1: Indown High-Speed JSON API (< 2 Seconds)
    // ============================================================
    try {
        const inRes = await axios.post('https://api.indown.io/download', 
            new URLSearchParams({ link: cleanUrl }).toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 5000
            }
        );

        if (inRes.data && (inRes.data.data || inRes.data.url)) {
            const rawData = inRes.data.data || inRes.data.url;
            const items = Array.isArray(rawData) ? rawData : [rawData];
            const formats = [];

            items.forEach((item, idx) => {
                const dlUrl = typeof item === 'string' ? item : (item.url || item.download_url);
                if (dlUrl) {
                    const isVid = dlUrl.includes('.mp4') || (item.type && item.type === 'video');
                    formats.push({
                        quality: items.length > 1 ? `Item ${idx + 1} (${isVid ? 'Video' : 'Photo'})` : (isVid ? 'HD Video (MP4)' : 'HD Photo (JPG)'),
                        downloadUrl: dlUrl,
                        extension: isVid ? 'mp4' : 'jpg',
                        type: isVid ? 'video' : 'photo'
                    });
                }
            });

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
    } catch (_) {}

    // ============================================================
    // 🌟 GATEWAY 2: SnapSave Direct Parser (< 3 Seconds)
    // ============================================================
    try {
        const snapRes = await axios.post('https://snapsave.app/action.php',
            new URLSearchParams({ url: cleanUrl }).toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36'
                },
                timeout: 5000
            }
        );

        const html = snapRes.data;
        if (typeof html === 'string') {
            const match = html.match(/href="([^"]+)" class="button is-success/i) ||
                          html.match(/download-box[\s\S]*?href="([^"]+)"/i);

            if (match && match[1]) {
                const dlUrl = match[1].replace(/&amp;/g, '&');
                return res.json({
                    success: true,
                    title: `Instagram_${Date.now()}`,
                    thumbnail: dlUrl,
                    downloadUrl: dlUrl,
                    formats: [{
                        quality: 'HD Video (MP4)',
                        downloadUrl: dlUrl,
                        extension: 'mp4',
                        type: 'video'
                    }]
                });
            }
        }
    } catch (_) {}

    // ============================================================
    // 🌟 GATEWAY 3: FastDL Instant Extractor (< 3 Seconds)
    // ============================================================
    try {
        const fdlRes = await axios.post('https://api.fastdl.app/api/convert', {
            url: cleanUrl
        }, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                'Origin': 'https://fastdl.app',
                'Referer': 'https://fastdl.app/'
            },
            timeout: 5000
        });

        if (fdlRes.data && fdlRes.data.url) {
            const rawList = Array.isArray(fdlRes.data.url) ? fdlRes.data.url : [fdlRes.data.url];
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
