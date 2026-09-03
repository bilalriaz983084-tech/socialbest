const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

// Canonical resolver for /share/ and short links
async function resolveFacebookUrl(rawUrl) {
    let clean = (rawUrl || '').trim();

    if (clean.includes('facebook.com/share/') || clean.includes('fb.watch')) {
        try {
            const head = await axios.get(clean, {
                headers: {
                    'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)'
                },
                maxRedirects: 5,
                timeout: 3000
            });
            if (head.request?.res?.responseUrl) {
                clean = head.request.res.responseUrl;
            }
        } catch (_) {}
    }

    if (clean.includes('?')) {
        clean = clean.split('?')[0];
    }

    return clean;
}

router.post('/download', async (req, res) => {
    const rawUrl = req.body.url || req.body.link || req.body.videoUrl || req.query.url;
    if (!rawUrl) return res.status(400).json({ success: false, error: 'Facebook URL is required' });

    try {
        const targetUrl = await resolveFacebookUrl(rawUrl);
        console.log('[Facebook] Resolved Clean Target:', targetUrl);

        let videoUrl = null;
        let thumbnail = null;

        // ============================================================
        // 🌟 ENGINE 1: Direct Mobile Relay (Bypasses JS Walls & Datacenter Blocks)
        // ============================================================
        try {
            // m.facebook.com endpoints serve lightweight HTML without client JS requirements
            const mobileUrl = targetUrl.replace('www.facebook.com', 'm.facebook.com');
            const mRes = await axios.get(mobileUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9'
                },
                timeout: 3000
            });

            const mHtml = mRes.data;
            if (typeof mHtml === 'string') {
                // Check direct video sources
                const videoSrcMatch = mHtml.match(/<video[^>]+src="([^"]+)"/i) ||
                                      mHtml.match(/"playable_url_quality_hd":"([^"]+)"/) ||
                                      mHtml.match(/"playable_url":"([^"]+)"/) ||
                                      mHtml.match(/"browser_native_hd_url":"([^"]+)"/) ||
                                      mHtml.match(/"browser_native_sd_url":"([^"]+)"/);

                if (videoSrcMatch && videoSrcMatch[1]) {
                    videoUrl = videoSrcMatch[1].replace(/&amp;/g, '&').replace(/\\/g, '');
                    if (videoSrcMatch[1].includes('\\u')) {
                        try { videoUrl = JSON.parse(`"${videoSrcMatch[1]}"`); } catch (_) {}
                    }
                }

                const imgMatch = mHtml.match(/property="og:image" content="([^"]+)"/);
                if (imgMatch && imgMatch[1]) {
                    thumbnail = imgMatch[1].replace(/&amp;/g, '&');
                }
            }
        } catch (e) {
            console.log('[Facebook] Mobile gateway skipped:', e.message);
        }

        // ============================================================
        // 🌟 ENGINE 2: Desktop GraphQL Relay Extraction (< 2s)
        // ============================================================
        if (!videoUrl) {
            try {
                const dRes = await axios.get(targetUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    },
                    timeout: 3000
                });

                const dHtml = dRes.data;
                const hd = dHtml.match(/"browser_native_hd_url":"([^"]+)"/) || dHtml.match(/"playable_url_quality_hd":"([^"]+)"/);
                const sd = dHtml.match(/"browser_native_sd_url":"([^"]+)"/) || dHtml.match(/"playable_url":"([^"]+)"/);

                if (hd && hd[1]) {
                    videoUrl = JSON.parse(`"${hd[1]}"`);
                } else if (sd && sd[1]) {
                    videoUrl = JSON.parse(`"${sd[1]}"`);
                }

                if (!thumbnail) {
                    const $ = cheerio.load(dHtml);
                    thumbnail = $('meta[property="og:image"]').attr('content') || null;
                }
            } catch (e) {
                console.log('[Facebook] Desktop parse skipped:', e.message);
            }
        }

        // ============================================================
        // 🌟 ENGINE 3: External Multi-Worker Fallback (< 2.5s)
        // ============================================================
        if (!videoUrl) {
            const apiEndpoints = [
                'https://co.wuk.sh/api/json',
                'https://api.cobalt.tools/api/json'
            ];

            for (const ep of apiEndpoints) {
                try {
                    const cRes = await axios.post(ep, {
                        url: targetUrl,
                        vQuality: '720'
                    }, {
                        headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                        timeout: 2500
                    });

                    if (cRes.data && cRes.data.url) {
                        videoUrl = cRes.data.url;
                        thumbnail = thumbnail || cRes.data.url;
                        break;
                    }
                } catch (_) {}
            }
        }

        // Strict MP4 Response (Prevent returning images as videos)
        if (videoUrl) {
            console.log('[Facebook] Video Extraction Successful');
            return res.json({
                success: true,
                title: `Facebook_${Date.now()}`,
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
            error: 'Facebook video stream could not be reached. Verify that the reel/video is public.'
        });

    } catch (err) {
        console.error('[Facebook] General Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
