const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected', timestamp: new Date().toISOString() });
});

// Helper: Extract Numeric Video ID and create universal canonical URL
function normalizeFacebookUrl(inputUrl) {
    let clean = (inputUrl || '').trim();

    // 1. Check direct video ID matches
    const idMatch = clean.match(/\/videos\/(?:[^\/]+\/)?(\d+)/i) || 
                    clean.match(/(?:v=|reel\/|videos\/)(\d+)/i) ||
                    clean.match(/\/(\d+)\/?$/);

    if (idMatch && idMatch[1]) {
        // Universal clean Facebook watch URL that works with all scrapers
        return `https://www.facebook.com/watch/?v=${idMatch[1]}`;
    }

    if (clean.includes('?')) {
        clean = clean.split('?')[0];
    }
    return clean;
}

// Helper: Real Unshortener for /share/, fb.watch & Redirects
async function resolveFacebookUrl(inputUrl) {
    try {
        let clean = inputUrl.trim();
        const res = await axios.get(clean, {
            headers: {
                'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            maxRedirects: 10,
            timeout: 3500,
            validateStatus: (status) => status >= 200 && status < 400
        });

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

function cleanDecodedUrl(raw) {
    if (!raw) return null;
    try {
        return JSON.parse(`"${raw}"`);
    } catch (_) {
        return raw.replace(/\\u0025/g, '%').replace(/\\u0026/g, '&').replace(/\\\//g, '/');
    }
}

router.post('/download', async (req, res) => {
    const rawUrl = req.body?.url || req.body?.link || req.body?.videoUrl || req.query?.url;
    
    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
        return res.status(400).json({ 
            success: false, 
            error: 'Facebook URL is required and must be a valid string.' 
        });
    }

    try {
        let targetUrl = rawUrl.trim();
        
        if (targetUrl.includes('/share/') || targetUrl.includes('fb.watch')) {
            targetUrl = await resolveFacebookUrl(targetUrl);
        }

        // Normalize slugged URLs to direct universal watch URL
        const canonicalUrl = normalizeFacebookUrl(targetUrl);
        console.log(`[Facebook Normalized URL]: ${canonicalUrl}`);

        let videoDownloadUrl = null;
        let thumbnail = null;

        // ============================================================
        // 🌟 ENGINE 1: Rapid Multi-Node Stream Gateways (< 2.5s)
        // ============================================================
        const streamGateways = [
            `https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(canonicalUrl)}`,
            `https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(targetUrl)}`
        ];

        for (const ep of streamGateways) {
            try {
                const apiRes = await axios.get(ep, { timeout: 3500 });
                if (apiRes.data?.status && apiRes.data?.data) {
                    const data = apiRes.data.data;
                    const foundUrl = data.hd || data.sd || data.video || (Array.isArray(data) ? data[0]?.url : null);
                    if (foundUrl && foundUrl.startsWith('http')) {
                        videoDownloadUrl = foundUrl;
                        thumbnail = data.thumbnail || thumbnail;
                        break;
                    }
                }
            } catch (_) {}
        }

        // ============================================================
        // 🌟 ENGINE 2: Direct Meta CDN Tag Extraction (< 2s)
        // ============================================================
        if (!videoDownloadUrl) {
            try {
                const pageRes = await axios.get(canonicalUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                        'Accept-Language': 'en-US,en;q=0.9',
                        'Sec-Fetch-Mode': 'navigate'
                    },
                    timeout: 3500
                });

                const html = pageRes.data;
                const hdMatch = html.match(/"browser_native_hd_url":"([^"]+)"/) || html.match(/"playable_url_quality_hd":"([^"]+)"/);
                const sdMatch = html.match(/"browser_native_sd_url":"([^"]+)"/) || html.match(/"playable_url":"([^"]+)"/);
                const thumbMatch = html.match(/"preferred_thumbnail":{"image":{"uri":"([^"]+)"/);

                const chosen = hdMatch ? hdMatch[1] : (sdMatch ? sdMatch[1] : null);
                if (chosen) {
                    videoDownloadUrl = cleanDecodedUrl(chosen);
                    if (thumbMatch && thumbMatch[1]) {
                        thumbnail = cleanDecodedUrl(thumbMatch[1]);
                    }
                }
            } catch (_) {}
        }

        // ============================================================
        // 🌟 ENGINE 3: Mobile Basic HTML5 Stream (< 2s)
        // ============================================================
        if (!videoDownloadUrl) {
            try {
                const mUrl = canonicalUrl.replace('www.facebook.com', 'mbasic.facebook.com');
                const mRes = await axios.get(mUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    },
                    timeout: 3000
                });

                const mHtml = mRes.data;
                const redirectMatch = mHtml.match(/href="(\/video_redirect\/[^"]+)"/);
                const directSrcMatch = mHtml.match(/src="([^"]+\.mp4[^"]*)"/);

                if (redirectMatch && redirectMatch[1]) {
                    const parsed = new URL('https://mbasic.facebook.com' + redirectMatch[1]);
                    const srcParam = parsed.searchParams.get('src');
                    if (srcParam) videoDownloadUrl = decodeURIComponent(srcParam);
                } else if (directSrcMatch && directSrcMatch[1]) {
                    videoDownloadUrl = directSrcMatch[1].replace(/&amp;/g, '&');
                }
            } catch (_) {}
        }

        // ============================================================
        // Strict MP4 Response
        // ============================================================
        if (videoDownloadUrl) {
            console.log('[Facebook] Video Stream Successfully Resolved!');
            return res.json({
                success: true,
                type: 'video',
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
            error: 'Facebook video stream could not be extracted. Make sure the video is public.'
        });

    } catch (err) {
        console.error('[Facebook Fatal Error]:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
