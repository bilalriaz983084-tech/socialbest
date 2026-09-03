const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'Instagram', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

router.post('/download', async (req, res) => {
    let { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'Instagram URL is required' });

    try {
        let cleanUrl = url.trim().split('?')[0];

        // 🌟 GATEWAY 1: FastDL Engine (Direct Rotating Proxy API)
        try {
            const fdlRes = await axios.post('https://api.fastdl.app/api/convert', {
                url: cleanUrl
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                    'Origin': 'https://fastdl.app',
                    'Referer': 'https://fastdl.app/'
                },
                timeout: 9000
            });

            if (fdlRes.data && fdlRes.data.url) {
                const results = Array.isArray(fdlRes.data.url) ? fdlRes.data.url : [fdlRes.data.url];
                const formats = results.map((item, idx) => {
                    const dl = item.url || item;
                    const isVid = dl.includes('.mp4') || (item.type && item.type === 'video');
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

        // 🌟 GATEWAY 2: SnapSave Direct Parser
        try {
            const snapRes = await axios.post('https://snapsave.app/action.php', 
                new URLSearchParams({ url: cleanUrl }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
                    },
                    timeout: 9000
                }
            );

            if (snapRes.data) {
                const html = snapRes.data;
                const match = html.match(/href="([^"]+)" class="button is-success/i) || html.match(/download-box[\s\S]*?href="([^"]+)"/i);
                if (match && match[1]) {
                    const finalUrl = match[1].replace(/&amp;/g, '&');
                    return res.json({
                        success: true,
                        title: `Instagram_${Date.now()}`,
                        thumbnail: finalUrl,
                        downloadUrl: finalUrl,
                        formats: [{
                            quality: 'HD Video (MP4)',
                            downloadUrl: finalUrl,
                            extension: 'mp4',
                            type: 'video'
                        }]
                    });
                }
            }
        } catch (_) {}

        // 🌟 GATEWAY 3: Cobalt V10 Universal Stream
        const cobaltHosts = [
            'https://cobalt-api.kwiatekm.tokyo',
            'https://api.wuk.sh'
        ];

        for (const host of cobaltHosts) {
            try {
                const cRes = await axios.post(`${host}/`, {
                    url: cleanUrl,
                    videoQuality: 'max'
                }, {
                    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                    timeout: 8000
                });

                if (cRes.data && cRes.data.url) {
                    return res.json({
                        success: true,
                        title: `Instagram_${Date.now()}`,
                        thumbnail: cRes.data.url,
                        downloadUrl: cRes.data.url,
                        formats: [{
                            quality: 'HD Video (MP4)',
                            downloadUrl: cRes.data.url,
                            extension: 'mp4',
                            type: 'video'
                        }]
                    });
                } else if (cRes.data && cRes.data.picker) {
                    const formats = cRes.data.picker.map((p, idx) => ({
                        quality: `Item ${idx + 1} (${p.type === 'photo' ? 'Photo' : 'Video'})`,
                        downloadUrl: p.url,
                        extension: p.type === 'photo' ? 'jpg' : 'mp4',
                        type: p.type === 'photo' ? 'photo' : 'video'
                    }));

                    return res.json({
                        success: true,
                        title: `Instagram_${Date.now()}`,
                        thumbnail: formats[0].downloadUrl,
                        downloadUrl: formats[0].downloadUrl,
                        formats: formats
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
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
