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

// Expand /share/ links to canonical video URL
async function resolveFacebookUrl(rawUrl) {
    let clean = (rawUrl || '').trim();

    if (clean.includes('facebook.com/share/')) {
        try {
            const head = await axios.get(clean, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                maxRedirects: 5,
                timeout: 3500
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
    const formatType = (req.body.formatType || '').toLowerCase(); // e.g. "video"

    if (!rawUrl) return res.status(400).json({ success: false, error: 'Facebook URL is required' });

    try {
        const targetUrl = await resolveFacebookUrl(rawUrl);
        console.log('[Facebook] Resolving video for URL:', targetUrl);

        let resolvedVideoUrl = null;
        let thumbnail = null;

        // ============================================================
        // 🌟 GATEWAY 1: SnapSave Dedicated Video Parser (< 2s)
        // ============================================================
        try {
            const snapRes = await axios.post('https://snapsave.app/action.php',
                new URLSearchParams({ url: targetUrl }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
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

                if (videoMatches.length > 0) {
                    resolvedVideoUrl = videoMatches[0][1].replace(/&amp;/g, '&');
                }
            }
        } catch (snapErr) {
            console.log('[Facebook] SnapSave gateway failed:', snapErr.message);
        }

        // ============================================================
        // 🌟 GATEWAY 2: Cobalt Stream Direct Resolver (< 2s)
        // ============================================================
        if (!resolvedVideoUrl) {
            const cobaltNodes = [
                'https://cobalt-api.kwiatekm.tokyo',
                'https://api.wuk.sh',
                'https://co.wuk.sh'
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
                        timeout: 3000
                    });

                    if (cRes.data && cRes.data.url) {
                        resolvedVideoUrl = cRes.data.url;
                        thumbnail = cRes.data.url;
                        break;
                    }
                } catch (_) {}
            }
        }

        // ============================================================
        // 🌟 GATEWAY 3: Direct Meta Relay CDN Search
        // ============================================================
        if (!resolvedVideoUrl) {
            try {
                const pageRes = await axios.get(targetUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    },
                    timeout: 3500
                });

                const html = pageRes.data;
                const hdMatch = html.match(/"browser_native_hd_url":"([^"]+)"/) || html.match(/"playable_url_quality_hd":"([^"]+)"/);
                const sdMatch = html.match(/"browser_native_sd_url":"([^"]+)"/) || html.match(/"playable_url":"([^"]+)"/);

                if (hdMatch && hdMatch[1]) resolvedVideoUrl = JSON.parse(`"${hdMatch[1]}"`);
                else if (sdMatch && sdMatch[1]) resolvedVideoUrl = JSON.parse(`"${sdMatch[1]}"`);

                const $ = cheerio.load(html);
                thumbnail = $('meta[property="og:image"]').attr('content') || null;
            } catch (_) {}
        }

        // ============================================================
        // Final Response Validation
        // ============================================================
        if (resolvedVideoUrl) {
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
