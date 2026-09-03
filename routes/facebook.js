const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected', timestamp: new Date().toISOString() });
});

// Helper: Real Unshortener for Facebook Share / Watch Links
async function resolveFacebookUrl(inputUrl) {
    try {
        const clean = inputUrl.trim();
        const res = await axios.get(clean, {
            headers: {
                'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            maxRedirects: 10,
            timeout: 6000,
            validateStatus: (status) => status >= 200 && status < 400
        });

        // Check canonical URL or OpenGraph URL in Meta tags
        const html = typeof res.data === 'string' ? res.data : '';
        const ogMatch = html.match(/property="og:url"\s+content="([^"]+)"/i) || 
                        html.match(/content="([^"]+)"\s+property="og:url"/i);
        if (ogMatch && ogMatch[1] && !ogMatch[1].includes('/share/')) {
            return ogMatch[1].split('?')[0];
        }

        if (res.request?.res?.responseUrl && !res.request.res.responseUrl.includes('/share/')) {
            return res.request.res.responseUrl.split('?')[0];
        }
    } catch (_) {}
    return inputUrl.split('?')[0];
}

router.post('/download', async (req, res) => {
    const rawUrl = req.body.url || req.body.link || req.body.videoUrl || req.query.url;
    if (!rawUrl) {
        return res.status(400).json({ success: false, error: 'Facebook URL is required' });
    }

    try {
        let cleanUrl = rawUrl.trim();
        
        // 1. Resolve share/short links to canonical video/reel URL
        if (cleanUrl.includes('/share/') || cleanUrl.includes('fb.watch')) {
            cleanUrl = await resolveFacebookUrl(cleanUrl);
        } else {
            cleanUrl = cleanUrl.split('?')[0];
        }

        console.log(`[Facebook] Target Process URL: ${cleanUrl}`);

        let videoDownloadUrl = null;
        let thumbnail = null;

        // ============================================================
        // 🌟 ENGINE 1: Direct Meta GraphQL / JSON Payload Scraper
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
        // 🌟 ENGINE 2: Fast Multi-Engine API Fallback
        // ============================================================
        if (!videoDownloadUrl) {
            try {
                const apiRes = await axios.get(`https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(cleanUrl)}`, {
                    timeout: 6000
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
        // 🌟 ENGINE 3: Widipe FB Resolver
        // ============================================================
        if (!videoDownloadUrl) {
            try {
                const fbRes = await axios.get(`https://widipe.com/download/fb?url=${encodeURIComponent(cleanUrl)}`, {
                    timeout: 6000
                });

                if (fbRes.data?.result) {
                    const d = fbRes.data.result;
                    videoDownloadUrl = d.hd || d.sd || d.video;
                    thumbnail = d.thumbnail || thumbnail;
                }
            } catch (err) {
                console.log('[Facebook] Widipe engine failed:', err.message);
            }
        }

        // ============================================================
        // RESPONSE
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
            error: 'Facebook video stream could not be extracted. Make sure the video or reel is public.'
        });

    } catch (err) {
        console.error('[Facebook] Fatal Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
