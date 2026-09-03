const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected', timestamp: new Date().toISOString() });
});

// Helper: Extract Numeric Video ID
function extractVideoId(url) {
    const clean = (url || '').trim();
    const match = clean.match(/(?:v=|videos\/|reel\/)(\d+)/i) || clean.match(/\/(\d+)\/?$/);
    return match ? match[1] : null;
}

router.post('/download', async (req, res) => {
    const rawUrl = req.body?.url || req.body?.link || req.body?.videoUrl || req.query?.url;

    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
        return res.status(400).json({ success: false, error: 'Facebook URL is required' });
    }

    try {
        const videoId = extractVideoId(rawUrl);
        const targetUrl = videoId ? `https://www.facebook.com/watch/?v=${videoId}` : rawUrl.trim().split('?')[0];
        console.log(`[Facebook Target]: ${targetUrl}`);

        let videoUrl = null;
        let thumbnail = null;

        // ============================================================
        // 🌟 ENGINE 1: FDownloader Proxy Engine (< 2.5s)
        // ============================================================
        try {
            const fdownRes = await axios.post('https://fdownloader.net/api/ajaxSearch',
                new URLSearchParams({ k_exp: '', k_token: '', q: targetUrl }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': 'https://fdownloader.net/'
                    },
                    timeout: 4500
                }
            );

            if (fdownRes.data?.data) {
                const html = fdownRes.data.data;
                const match = html.match(/href="([^"]+)"[^>]*class="[^"]*download-link[^"]*"/i) ||
                              html.match(/href="([^"]+)"[^>]*>Download/i);

                if (match && match[1]) {
                    videoUrl = match[1].replace(/&amp;/g, '&');
                }
            }
        } catch (e) {
            console.log('[Facebook] FDownloader skipped:', e.message);
        }

        // ============================================================
        // 🌟 ENGINE 2: Cobalt Fast Mirror Fallback (< 2.5s)
        // ============================================================
        if (!videoUrl) {
            const cobaltMirrors = [
                'https://cobalt-api.kwiatekm.tokyo',
                'https://api.wuk.sh'
            ];

            for (const mirror of cobaltMirrors) {
                try {
                    const cRes = await axios.post(`${mirror}/`, {
                        url: targetUrl,
                        videoQuality: '720'
                    }, {
                        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                        timeout: 3000
                    });

                    if (cRes.data?.url) {
                        videoUrl = cRes.data.url;
                        thumbnail = cRes.data.url;
                        break;
                    }
                } catch (_) {}
            }
        }

        // ============================================================
        // Response Dispatcher
        // ============================================================
        if (videoUrl) {
            return res.json({
                success: true,
                type: 'video',
                title: `Facebook_Video_${Date.now()}`,
                thumbnail: thumbnail || videoUrl,
                downloadUrl: videoUrl,
                formats: [{
                    quality: 'HD Video (MP4)',
                    downloadUrl: videoUrl,
                    extension: 'mp4',
                    type: 'video'
                }]
            });
        }

        return res.status(400).json({
            success: false,
            error: 'Facebook video stream could not be reached. Ensure video is public.'
        });

    } catch (err) {
        console.error('[Facebook Fatal Error]:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
