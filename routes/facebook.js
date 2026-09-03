const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected', timestamp: new Date().toISOString() });
});

// Helper: Real Unshortener for Facebook Share / Watch / Short Links
async function resolveFacebookUrl(inputUrl) {
    try {
        const clean = inputUrl.trim();
        const res = await axios.get(clean, {
            headers: {
                'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            maxRedirects: 10,
            timeout: 5000,
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
        let cleanUrl = rawUrl.trim();
        
        if (cleanUrl.includes('/share/') || cleanUrl.includes('fb.watch')) {
            cleanUrl = await resolveFacebookUrl(cleanUrl);
        } else {
            cleanUrl = cleanUrl.split('?')[0];
        }

        console.log(`[Facebook] Target Process URL: ${cleanUrl}`);

        let videoDownloadUrl = null;
        let thumbnail = null;
        let images = [];

        // ============================================================
        // 🌟 ENGINE 1: Direct Meta GraphQL / OpenGraph Scraper
        // ============================================================
        let rawHtml = '';
        try {
            const pageRes = await axios.get(cleanUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Sec-Fetch-Mode': 'navigate'
                },
                timeout: 5000
            });

            rawHtml = pageRes.data;

            const hdMatch = rawHtml.match(/"browser_native_hd_url":"([^"]+)"/) || rawHtml.match(/"playable_url_quality_hd":"([^"]+)"/);
            const sdMatch = rawHtml.match(/"browser_native_sd_url":"([^"]+)"/) || rawHtml.match(/"playable_url":"([^"]+)"/);
            const thumbMatch = rawHtml.match(/"preferred_thumbnail":{"image":{"uri":"([^"]+)"/);

            const chosen = hdMatch ? hdMatch[1] : (sdMatch ? sdMatch[1] : null);

            if (chosen) {
                videoDownloadUrl = cleanDecodedUrl(chosen);
                if (thumbMatch && thumbMatch[1]) {
                    thumbnail = cleanDecodedUrl(thumbMatch[1]);
                }
            }
        } catch (err) {
            console.log('[Facebook] Direct Meta parsing failed:', err.message);
        }

        // ============================================================
        // 🌟 ENGINE 2: Siputzx Resolver (Video Priority)
        // ============================================================
        if (!videoDownloadUrl) {
            try {
                const apiRes = await axios.get(`https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(cleanUrl)}`, {
                    timeout: 5000
                });

                if (apiRes.data?.status && apiRes.data?.data) {
                    const data = apiRes.data.data;
                    if (data.hd || data.sd || data.video) {
                        videoDownloadUrl = data.hd || data.sd || data.video;
                        thumbnail = data.thumbnail || thumbnail;
                    } else if (Array.isArray(data)) {
                        const vidItem = data.find(item => item.url && item.url.includes('.mp4'));
                        if (vidItem) {
                            videoDownloadUrl = vidItem.url;
                        }
                    }
                }
            } catch (err) {
                console.log('[Facebook] Siputzx failed:', err.message);
            }
        }

        // ============================================================
        // 🌟 ENGINE 3: Widipe Resolver (Video Priority)
        // ============================================================
        if (!videoDownloadUrl) {
            try {
                const fbRes = await axios.get(`https://widipe.com/download/fb?url=${encodeURIComponent(cleanUrl)}`, {
                    timeout: 5000
                });

                if (fbRes.data?.result) {
                    const d = fbRes.data.result;
                    if (d.hd || d.sd || d.video) {
                        videoDownloadUrl = d.hd || d.sd || d.video;
                        thumbnail = d.thumbnail || thumbnail;
                    }
                }
            } catch (err) {
                console.log('[Facebook] Widipe failed:', err.message);
            }
        }

        // ============================================================
        // Video check: Agar video mil gayi to sirf aur sirf MP4 bhejega
        // ============================================================
        if (videoDownloadUrl) {
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

        // ============================================================
        // 🌟 Image Extraction: Sirf tab chalegi jab post Video na ho
        // ============================================================
        if (rawHtml) {
            const fullImageMatches = [...rawHtml.matchAll(/"image":{"uri":"([^"]+)"/g)];
            if (fullImageMatches.length > 0) {
                fullImageMatches.forEach(m => {
                    const decoded = cleanDecodedUrl(m[1]);
                    if (decoded && !images.includes(decoded) && !decoded.includes('/rsrc.php/')) {
                        images.push(decoded);
                    }
                });
            }
        }

        if (images.length > 0) {
            return res.json({
                success: true,
                type: 'image',
                title: `Facebook_Photo_${Date.now()}`,
                thumbnail: images[0],
                downloadUrl: images[0],
                images: images,
                formats: images.map((imgUrl, index) => ({
                    quality: `Photo ${index + 1}`,
                    downloadUrl: imgUrl,
                    extension: 'jpg',
                    type: 'image'
                }))
            });
        }

        return res.status(400).json({
            success: false,
            error: 'Facebook video/photo stream could not be extracted. Make sure the post is public.'
        });

    } catch (err) {
        console.error('[Facebook] Fatal Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
