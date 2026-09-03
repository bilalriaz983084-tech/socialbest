const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

// Helper: SnapSave packed JS decoder
function decodeSnapSave(p, a, c, k, e, d) {
    while (c--) {
        if (k[c]) {
            p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
        }
    }
    return p;
}

// Clean and expand redirects
async function resolveFacebookUrl(rawUrl) {
    let clean = (rawUrl || '').trim();

    if (clean.includes('facebook.com/share/')) {
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
        console.log('[Facebook] Target Process URL:', targetUrl);

        let resolvedVideoUrl = null;
        let thumbnail = null;

        // ============================================================
        // 🌟 GATEWAY 1: Direct Meta Page Native HD/SD Parser (< 1.5s)
        // ============================================================
        try {
            const pageRes = await axios.get(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9'
                },
                timeout: 3000
            });

            const html = pageRes.data;
            if (typeof html === 'string') {
                const hdMatch = html.match(/"browser_native_hd_url":"([^"]+)"/) || html.match(/"playable_url_quality_hd":"([^"]+)"/);
                const sdMatch = html.match(/"browser_native_sd_url":"([^"]+)"/) || html.match(/"playable_url":"([^"]+)"/);
                const ogVideo = html.match(/property="og:video" content="([^"]+)"/) || html.match(/property="og:video:secure_url" content="([^"]+)"/);

                if (hdMatch && hdMatch[1]) {
                    resolvedVideoUrl = JSON.parse(`"${hdMatch[1]}"`);
                } else if (sdMatch && sdMatch[1]) {
                    resolvedVideoUrl = JSON.parse(`"${sdMatch[1]}"`);
                } else if (ogVideo && ogVideo[1]) {
                    resolvedVideoUrl = ogVideo[1].replace(/&amp;/g, '&');
                }

                const imgMatch = html.match(/property="og:image" content="([^"]+)"/);
                if (imgMatch && imgMatch[1]) {
                    thumbnail = imgMatch[1].replace(/&amp;/g, '&');
                }
            }
        } catch (e) {
            console.log('[Facebook] Meta page parse skipped:', e.message);
        }

        // ============================================================
        // 🌟 GATEWAY 2: SnapSave Dedicated Engine (< 2.5s)
        // ============================================================
        if (!resolvedVideoUrl) {
            try {
                const snapRes = await axios.post('https://snapsave.app/action.php',
                    new URLSearchParams({ url: targetUrl }).toString(),
                    {
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                            'Referer': 'https://snapsave.app/'
                        },
                        timeout: 3000
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

                    if (videoMatches.length > 0) {
                        resolvedVideoUrl = videoMatches[0][1].replace(/&amp;/g, '&');
                    }
                }
            } catch (snapErr) {
                console.log('[Facebook] SnapSave attempt skipped:', snapErr.message);
            }
        }

        // ============================================================
        // 🌟 GATEWAY 3: Cobalt Stream Fast Node (< 2.5s)
        // ============================================================
        if (!resolvedVideoUrl) {
            const cobaltNodes = [
                'https://cobalt-api.kwiatekm.tokyo',
                'https://api.wuk.sh'
            ];

            for (const node of cobaltNodes) {
                try {
                    const cRes = await axios.post(`${node}/`, {
                        url: targetUrl,
                        videoQuality: '720'
                    }, {
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json'
                        },
                        timeout: 2500
                    });

                    if (cRes.data && cRes.data.url) {
                        resolvedVideoUrl = cRes.data.url;
                        thumbnail = thumbnail || cRes.data.url;
                        break;
                    }
                } catch (_) {}
            }
        }

        // Return verified video result
        if (resolvedVideoUrl) {
            console.log('[Facebook] Video Resolved Successfully!');
            return res.json({
                success: true,
                title: `Facebook_${Date.now()}`,
                thumbnail: thumbnail || resolvedVideoUrl,
                downloadUrl: resolvedVideoUrl,
                formats: [{
                    quality: 'HD Video (MP4)',
                    downloadUrl: resolvedVideoUrl,
                    extension: 'mp4',
                    type: 'video'
                }]
            });
        }

        return res.status(400).json({
            success: false,
            error: 'Facebook video stream could not be extracted. Please ensure the reel or video is public.'
        });

    } catch (err) {
        console.error('[Facebook] General Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
