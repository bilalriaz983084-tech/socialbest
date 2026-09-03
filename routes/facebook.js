const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

router.post('/download', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'Facebook URL is required' });

    let targetUrl = url.trim();

    // 🌟 Step 1: Expand Short URLs (e.g. fb.watch)
    try {
        if (targetUrl.includes('fb.watch') || targetUrl.includes('facebook.com/share')) {
            const redirectCheck = await axios.get(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                maxRedirects: 5,
                timeout: 5000
            });
            targetUrl = redirectCheck.request?.res?.responseUrl || targetUrl;
        }
    } catch (_) {}

    // ============================================================
    // 🌟 METHOD 1: High-Speed Direct Stream Resolver
    // ============================================================
    try {
        const streamRes = await axios.get(`https://api.vkrdownloader.vercel.app/server?vkr=${encodeURIComponent(targetUrl)}`, {
            timeout: 6000
        });

        if (streamRes.data && streamRes.data.data) {
            const data = streamRes.data.data;
            const dlUrl = data.url || data.download_url;

            if (dlUrl) {
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
        }
    } catch (_) {}

    // ============================================================
    // 🌟 METHOD 2: SnapSave Facebook Video Pipeline
    // ============================================================
    try {
        const snapRes = await axios.post('https://snapsave.app/action.php', 
            new URLSearchParams({ url: targetUrl }).toString(),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 6000
            }
        );

        const html = snapRes.data;
        if (typeof html === 'string') {
            const hdMatch = html.match(/href="([^"]+)"[^>]*>Render/i) || 
                            html.match(/href="([^"]+)"[^>]*>Download<\/a>/i) ||
                            html.match(/href="([^"]+)" class="button is-success/i);

            if (hdMatch && hdMatch[1]) {
                const finalUrl = hdMatch[1].replace(/&amp;/g, '&');
                return res.json({
                    success: true,
                    title: `Facebook_${Date.now()}`,
                    thumbnail: finalUrl,
                    downloadUrl: finalUrl,
                    formats: [{
                        quality: 'HD Quality (MP4)',
                        downloadUrl: finalUrl,
                        extension: 'mp4',
                        type: 'video'
                    }]
                });
            }
        }
    } catch (_) {}

    // ============================================================
    // 🌟 METHOD 3: FastDL Universal Converter
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
            timeout: 6000
        });

        if (fdlRes.data && fdlRes.data.url) {
            const dl = Array.isArray(fdlRes.data.url) ? fdlRes.data.url[0].url : (fdlRes.data.url.url || fdlRes.data.url);
            return res.json({
                success: true,
                title: `Facebook_${Date.now()}`,
                thumbnail: dl,
                downloadUrl: dl,
                formats: [{
                    quality: 'HD Video (MP4)',
                    downloadUrl: dl,
                    extension: 'mp4',
                    type: 'video'
                }]
            });
        }
    } catch (_) {}

    return res.status(400).json({
        success: false,
        error: 'Facebook video could not be parsed. Verify the video/reel is public.'
    });
});

module.exports = router;
