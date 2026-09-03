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

// Helper: Safely decode unicode/slash URLs from raw HTML
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
        
        // 1. Resolve share/short links to canonical video/post URL
        if (cleanUrl.includes('/share/') || cleanUrl.includes('fb.watch')) {
            cleanUrl = await resolveFacebookUrl(cleanUrl);
        } else {
            cleanUrl = cleanUrl.split('?')[0];
        }

        console.log(`[Facebook] Target Process URL: ${cleanUrl}`);

        let mediaType = null; // 'video' ya 'image'
        let videoDownloadUrl = null;
        let thumbnail = null;
        let images = [];

        // ============================================================
        // 🌟 ENGINE 1: Direct Meta GraphQL / JSON / OpenGraph Scraper
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

            // Video Patterns (HD & SD)
            const hdMatch = html.match(/"browser_native_hd_url":"([^"]+)"/) || html.match(/"playable_url_quality_hd":"([^"]+)"/);
            const sdMatch = html.match(/"browser_native_sd_url":"([^"]+)"/) || html.match(/"playable_url":"([^"]+)"/);
            const thumbMatch = html.match(/"preferred_thumbnail":{"image":{"uri":"([^"]+)"/);

            const chosen = hdMatch ? hdMatch[1] : (sdMatch ? sdMatch[1] : null);

            if (chosen) {
                mediaType = 'video';
                videoDownloadUrl = cleanDecodedUrl(chosen);
                if (thumbMatch && thumbMatch[1]) {
                    thumbnail = cleanDecodedUrl(thumbMatch[1]);
                }
            }

            // Image Extraction (Agar Video na ho ya post Image wali ho)
            if (!videoDownloadUrl) {
                // Check OpenGraph Image
                const ogImageMatch = html.match(/property="og:image"\s+content="([^"]+)"/i) || 
                                     html.match(/content="([^"]+)"\s+property="og:image"/i);
                
                // Check GraphQL Full-Resolution Images
                const fullImageMatches = [...html.matchAll(/"image":{"uri":"([^"]+)"/g)];

                if (fullImageMatches.length > 0) {
                    fullImageMatches.forEach(m => {
                        const decoded = cleanDecodedUrl(m[1]);
                        if (decoded && !images.includes(decoded) && !decoded.includes('/rsrc.php/')) {
                            images.push(decoded);
                        }
                    });
                }

                if (ogImageMatch && ogImageMatch[1]) {
                    const decodedOg = cleanDecodedUrl(ogImageMatch[1]);
                    if (!images.includes(decodedOg)) {
                        images.unshift(decodedOg);
                    }
                }

                if (images.length > 0) {
                    mediaType = 'image';
                }
            }
        } catch (err) {
            console.log('[Facebook] Direct Meta parsing failed:', err.message);
        }

        // ============================================================
        // 🌟 ENGINE 2: Fast Multi-Engine API Fallback (Videos & Images)
        // ============================================================
        if (!videoDownloadUrl && images.length === 0) {
            try {
                const apiRes = await axios.get(`https://api.siputzx.my.id/api/d/facebook?url=${encodeURIComponent(cleanUrl)}`, {
                    timeout: 5000
                });

                if (apiRes.data?.status && apiRes.data?.data) {
                    const data = apiRes.data.data;
                    
                    if (data.hd || data.sd || data.video) {
                        mediaType = 'video';
                        videoDownloadUrl = data.hd || data.sd || data.video;
                        thumbnail = data.thumbnail || thumbnail;
                    } else if (Array.isArray(data)) {
                        // Check if it returned a list of images or videos
                        data.forEach(item => {
                            if (item.url && item.url.includes('.mp4')) {
                                mediaType = 'video';
                                videoDownloadUrl = item.url;
                            } else if (item.url) {
                                images.push(item.url);
                            }
                        });
                        if (!videoDownloadUrl && images.length > 0) {
                            mediaType = 'image';
                        }
                    }
                }
            } catch (err) {
                console.log('[Facebook] Siputzx engine failed:', err.message);
            }
        }

        // ============================================================
        // 🌟 ENGINE 3: Widipe FB Resolver
        // ============================================================
        if (!videoDownloadUrl && images.length === 0) {
            try {
                const fbRes = await axios.get(`https://widipe.com/download/fb?url=${encodeURIComponent(cleanUrl)}`, {
                    timeout: 5000
                });

                if (fbRes.data?.result) {
                    const d = fbRes.data.result;
                    if (d.hd || d.sd || d.video) {
                        mediaType = 'video';
                        videoDownloadUrl = d.hd || d.sd || d.video;
                        thumbnail = d.thumbnail || thumbnail;
                    }
                }
            } catch (err) {
                console.log('[Facebook] Widipe engine failed:', err.message);
            }
        }

        // ============================================================
        // RESPONSE DISPATCHER (Handles both Video and Images)
        // ============================================================
        if (mediaType === 'video' && videoDownloadUrl) {
            return res.json({
                success: true,
                type: 'video',
                title: `Facebook_Video_${Date.now()}`,
                thumbnail: thumbnail || videoDownloadUrl,
                downloadUrl: videoDownloadUrl,
                formats: [{
                    quality: 'HD/SD Video (MP4)',
                    downloadUrl: videoDownloadUrl,
                    extension: 'mp4',
                    type: 'video'
                }]
            });
        }

        if (mediaType === 'image' && images.length > 0) {
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
            error: 'Facebook media (video/photo) could not be extracted. Make sure the post is public.'
        });

    } catch (err) {
        console.error('[Facebook] Fatal Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
