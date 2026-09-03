const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

// Helper: Redirect expand aur clean target URL
async function getTargetUrl(rawUrl) {
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
                timeout: 3000
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
        const targetUrl = await getTargetUrl(url);

        // ============================================================
        // 🌟 GATEWAY 1: Direct SnapSave Public Worker (< 2s)
        // Resolves both Video (MP4) and Photos (JPG)
        // ============================================================
        try {
            const snapRes = await axios.post('https://snapsave.app/action.php', 
                new URLSearchParams({ url: targetUrl }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                        'Origin': 'https://snapsave.app',
                        'Referer': 'https://snapsave.app/'
                    },
                    timeout: 4500
                }
            );

            const rawData = snapRes.data;
            if (typeof rawData === 'string') {
                // 1. Check for Video Download Links
                const videoMatch = rawData.match(/href="([^"]+)"[^>]*class="button is-success/i) || 
                                   rawData.match(/href="([^"]+)"[^>]*>Download<\/a>/i);

                if (videoMatch && videoMatch[1]) {
                    const dlUrl = videoMatch[1].replace(/&amp;/g, '&');
                    return res.json({
                        success: true,
                        title: `Facebook_${Date.now()}`,
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

                // 2. Check for Photos / Album Images
                const photoMatches = [...rawData.matchAll(/href="([^"]+)"[^>]*class="button is-download/gi)];
                if (photoMatches.length > 0) {
                    const formats = photoMatches.map((m, idx) => ({
                        quality: `HD Photo ${idx + 1} (JPG)`,
                        downloadUrl: m[1].replace(/&amp;/g, '&'),
                        extension: 'jpg',
                        type: 'photo'
                    }));

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
        // 🌟 GATEWAY 2: FastDL Dedicated Converter (< 2s)
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

                results.forEach((item, idx) => {
                    const dl = item.url || item;
                    if (dl && typeof dl === 'string') {
                        const isVideo = dl.includes('.mp4') || item.type === 'video';
                        formats.push({
                            quality: isVideo ? 'HD Video (MP4)' : `HD Photo ${idx + 1} (JPG)`,
                            downloadUrl: dl,
                            extension: isVideo ? 'mp4' : 'jpg',
                            type: isVideo ? 'video' : 'photo'
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
        // 🌟 GATEWAY 3: Cobalt Stream Relay Fallback (< 2.5s)
        // ============================================================
        try {
            const cRes = await axios.post('https://cobalt-api.kwiatekm.tokyo/', {
                url: targetUrl,
                videoQuality: '720'
            }, {
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                timeout: 3500
            });

            if (cRes.data && cRes.data.url) {
                return res.json({
                    success: true,
                    title: `Facebook_${Date.now()}`,
                    thumbnail: cRes.data.url,
                    downloadUrl: cRes.data.url,
                    formats: [{
                        quality: 'HD Video (MP4)',
                        downloadUrl: cRes.data.url,
                        extension: 'mp4',
                        type: 'video'
                    }]
                });
            }
        } catch (_) {}

        return res.status(400).json({
            success: false,
            error: 'Facebook media is private or could not be reached.'
        });

    } catch (err) {
        console.error('Facebook General Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
