const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

// SnapSave eval unpacker
function decodeSnapSave(p, a, c, k, e, d) {
    while (c--) {
        if (k[c]) {
            p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
        }
    }
    return p;
}

// Expand share links and get real Facebook video destination
async function unwrapFacebookUrl(rawUrl) {
    let clean = (rawUrl || '').trim();

    if (clean.includes('facebook.com/share/')) {
        try {
            const res = await axios.get(clean, {
                headers: {
                    'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                maxRedirects: 5,
                timeout: 3500
            });

            // Canonical link Facebook khud response mein deta hai
            const $ = cheerio.load(res.data);
            const canonical = $('link[rel="canonical"]').attr('href') || $('meta[property="og:url"]').attr('content');
            if (canonical && !canonical.includes('/share/')) {
                clean = canonical;
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
        const targetUrl = await unwrapFacebookUrl(rawUrl);
        console.log('[Facebook] Processing Target URL:', targetUrl);

        // ============================================================
        // 🌟 GATEWAY 1: Direct SnapSave API with Unpacker (< 2s)
        // ============================================================
        try {
            const snapRes = await axios.post('https://snapsave.app/action.php',
                new URLSearchParams({ url: targetUrl }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                        'Referer': 'https://snapsave.app/'
                    },
                    timeout: 4500
                }
            );

            let html = snapRes.data;
            if (typeof html === 'string' && html.includes('eval(function(')) {
                const evalArgs = html.match(/\}\s*\(\s*"([^"]+)"\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*"([^"]+)"\.split\('\|'\)/);
                if (evalArgs) {
                    const [, p, a, c, kStr] = evalArgs;
                    html = decodeSnapSave(p, parseInt(a), parseInt(c), kStr.split('|'), 0, {});
                }
            }

            if (typeof html === 'string') {
                const videoMatches = [...html.matchAll(/href="([^"]+)"[^>]*class="button is-success/gi)]
                    .concat([...html.matchAll(/href="([^"]+)"[^>]*>Download<\/a>/gi)]);
                const photoMatches = [...html.matchAll(/href="([^"]+)"[^>]*class="button is-download/gi)];

                if (videoMatches.length > 0) {
                    const dlUrl = videoMatches[0][1].replace(/&amp;/g, '&');
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
        } catch (snapErr) {
            console.log('[Facebook] SnapSave gateway failed:', snapErr.message);
        }

        // ============================================================
        // 🌟 GATEWAY 2: Meta OpenGraph Bot Emulation (< 1.5s)
        // ============================================================
        try {
            const fbRes = await axios.get(targetUrl, {
                headers: {
                    'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                },
                timeout: 3500
            });

            const html = fbRes.data;
            const $ = cheerio.load(html);

            const ogVideo = $('meta[property="og:video"]').attr('content') ||
                            $('meta[property="og:video:secure_url"]').attr('content');
            const ogImage = $('meta[property="og:image"]').attr('content');

            if (ogVideo) {
                return res.json({
                    success: true,
                    title: `Facebook_${Date.now()}`,
                    thumbnail: ogImage || ogVideo,
                    downloadUrl: ogVideo,
                    formats: [{
                        quality: 'HD Video (MP4)',
                        downloadUrl: ogVideo,
                        extension: 'mp4',
                        type: 'video'
                    }]
                });
            }

            if (ogImage && !ogImage.includes('static.xx.fbcdn.net')) {
                return res.json({
                    success: true,
                    title: `Facebook_${Date.now()}`,
                    thumbnail: ogImage,
                    downloadUrl: ogImage,
                    formats: [{
                        quality: 'HD Photo (JPG)',
                        downloadUrl: ogImage,
                        extension: 'jpg',
                        type: 'photo'
                    }]
                });
            }
        } catch (botErr) {
            console.log('[Facebook] OpenGraph bot emulation failed:', botErr.message);
        }

        // ============================================================
        // 🌟 GATEWAY 3: Cobalt Stream Fallback (< 2s)
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
            error: 'Unable to extract Facebook media. Please ensure the link is public.'
        });

    } catch (err) {
        console.error('[Facebook] Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
