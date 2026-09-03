const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected', timestamp: new Date().toISOString() });
});

// Helper: Resolve Short URLs (fb.watch, /share/r/, etc.)
async function resolveFacebookUrl(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            maxRedirects: 5,
            timeout: 4000,
            validateStatus: (status) => status >= 200 && status < 400
        });

        if (response.request?.res?.responseUrl) {
            return response.request.res.responseUrl.split('?')[0];
        }
    } catch (_) {}
    return url.split('?')[0];
}

router.post('/download', async (req, res) => {
    const rawUrl = req.body.url || req.body.link || req.body.videoUrl || req.query.url;
    if (!rawUrl) {
        return res.status(400).json({ success: false, error: 'Facebook URL is required' });
    }

    try {
        let cleanUrl = rawUrl.trim();
        if (cleanUrl.includes('fb.watch') || cleanUrl.includes('/share/')) {
            cleanUrl = await resolveFacebookUrl(cleanUrl);
        } else {
            cleanUrl = cleanUrl.split('?')[0];
        }

        console.log(`[Facebook] Processing Target URL: ${cleanUrl}`);

        let videoDownloadUrl = null;
        let thumbnail = null;

        // ============================================================
        // 🌟 ENGINE 1: Direct Meta Video Payload Extraction (Fastest)
        // ============================================================
        try {
            const pageRes = await axios.get(cleanUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Sec-Fetch-Mode': 'navigate'
                },
                timeout: 5000
            });

            const html = pageRes.data;

            // Direct HD/SD stream matching
            const hdMatch = html.match(/"browser_native_hd_url":"([^"]+)"/) || html.match(/"playable_url_quality_hd":"([^"]+)"/);
            const sdMatch = html.match(/"browser_native_sd_url":"([^"]+)"/) || html.match(/"playable_url":"([^"]+)"/);
            const thumbMatch = html.match(/"preferred_thumbnail":{"image":{"uri":"([^"]+)"/);

            const chosen = hdMatch ? hdMatch[1] : (sdMatch ? sdMatch[1] : null);

            if (chosen) {
                videoDownloadUrl = JSON.parse(`"${chosen}"`);
                if (thumbMatch && thumbMatch[1]) {
                    thumbnail = JSON.parse(`"${thumbMatch[1]}"`);
                }
            }
        } catch (err) {
            console.log('[Facebook] Direct Meta parsing failed:', err.message);
        }

        // ============================================================
        // 🌟 ENGINE 2: Siputzx HD Downloader Engine (Primary Backup)
        // ============================================================
        if (!videoDownloadUrl) {
            try {
                const apiRes = await axios.get(`https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(cleanUrl)}`, {
                    timeout: 5000
                });

                if (apiRes.data?.status && apiRes.data?.data) {
                    const data = apiRes.data.data;
                    videoDownloadUrl = data.hd || data.sd || data.video || (Array.isArray(data) ? data[0]?.url : null);
                    thumbnail = data.thumbnail || thumbnail;
                }
            } catch (err) {
                console.log('[Facebook] Siputzx engine failed:', err.message);
            }
        }

        // ============================================================
        // 🌟 ENGINE 3: Fast CDN Media Stream Relay (Final Safe Fallback)
        // ============================================================
        if (!videoDownloadUrl) {
            try {
                const fbdownRes = await axios.get(`https://widipe.com/download/fb?url=${encodeURIComponent(cleanUrl)}`, {
                    timeout: 5000
                });

                if (fbdownRes.data?.result) {
                    const resData = fbdownRes.data.result;
                    videoDownloadUrl = resData.hd || resData.sd || resData.video;
                    thumbnail = resData.thumbnail || thumbnail;
                }
            } catch (err) {
                console.log('[Facebook] Widipe engine failed:', err.message);
            }
        }

        // ============================================================
        // ✅ SUCCESS RESPONSE
        // ============================================================
        if (videoDownloadUrl) {
            return res.json({
                success: true,
                title: `Facebook_Video_${Date.now()}`,
                thumbnail: thumbnail || videoDownloadUrl,
                downloadUrl: videoDownloadUrl,
                formats: [{
                    quality: 'HD Video (MP4)',
                    downloadUrl: videoDownloadUrl,
                    extension: 'mp4',
                    type: 'video'
                }]
            });
        }

        return res.status(400).json({
            success: false,
            error: 'Facebook video stream could not be extracted. Make sure the post is public and active.'
        });

    } catch (err) {
        console.error('[Facebook] Fatal Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
