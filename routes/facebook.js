const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

// Helper: Redirects resolve karein aur tracking parameters strip karein
async function cleanAndResolveFacebookUrl(rawUrl) {
    let clean = rawUrl.trim();

    if (clean.includes('facebook.com') && clean.includes('?')) {
        clean = clean.split('?')[0];
    }

    if (clean.includes('fb.watch') || clean.includes('/share/')) {
        try {
            const headRes = await axios.get(clean, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                maxRedirects: 5,
                timeout: 3000
            });
            const redirected = headRes.request?.res?.responseUrl;
            if (redirected) {
                clean = redirected.split('?')[0];
            }
        } catch (_) {}
    }

    return clean;
}

router.post('/download', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'Facebook URL is required' });

    try {
        const targetUrl = await cleanAndResolveFacebookUrl(url);

        // ============================================================
        // 🌟 GATEWAY 1: Cobalt Direct Stream Instances (< 1.8s)
        // ============================================================
        const cobaltMirrors = [
            'https://cobalt-api.kwiatekm.tokyo',
            'https://api.wuk.sh',
            'https://co.wuk.sh'
        ];

        for (const mirror of cobaltMirrors) {
            try {
                const cRes = await axios.post(`${mirror}/`, {
                    url: targetUrl,
                    videoQuality: '1080'
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
            } catch (_) {
                continue;
            }
        }

        // ============================================================
        // 🌟 GATEWAY 2: SnapSave Public Form Resolver (< 2s)
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
                    timeout: 3500
                }
            );

            const html = snapRes.data;
            if (typeof html === 'string') {
                const matches = [...html.matchAll(/href="([^"]+)"[^>]*class="button is-success[^"]*"[^>]*>([^<]+)/gi)];
                const formats = [];

                matches.forEach((m, idx) => {
                    const dlLink = m[1].replace(/&amp;/g, '&');
                    if (dlLink.startsWith('http')) {
                        formats.push({
                            quality: idx === 0 ? 'HD Video (MP4)' : 'SD Video (MP4)',
                            downloadUrl: dlLink,
                            extension: 'mp4',
                            type: 'video'
                        });
                    }
                });

                if (formats.length > 0) {
                    return res.json({
                        success: true,
                        title: `Facebook_${Date.now()}`,
                        thumbnail: formats[0].downloadUrl,
                        downloadUrl: formats[0].downloadUrl,
                        formats: formats
                    });
                }
            }
        } catch (_) {}

        // ============================================================
        // 🌟 GATEWAY 3: FDownloader Media Ajax Resolver (< 2.5s)
        // ============================================================
        try {
            const fdRes = await axios.post('https://fdownloader.net/api/ajaxSearch', 
                new URLSearchParams({ k_exp: '', k_token: '', q: targetUrl }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 3500
                }
            );

            if (fdRes.data && fdRes.data.data) {
                const rawHtml = fdRes.data.data;
                const links = [...rawHtml.matchAll(/href="([^"]+)"[^>]*class="download-link[^"]*"[^>]*data-quality="([^"]*)"/gi)];
                const formats = [];

                links.forEach(l => {
                    const dl = l[1].replace(/&amp;/g, '&');
                    const q = l[2] || 'HD';
                    if (dl.startsWith('http')) {
                        formats.push({
                            quality: `${q} Quality (MP4)`,
                            downloadUrl: dl,
                            extension: 'mp4',
                            type: 'video'
                        });
                    }
                });

                if (formats.length > 0) {
                    return res.json({
                        success: true,
                        title: `Facebook_${Date.now()}`,
                        thumbnail: formats[0].downloadUrl,
                        downloadUrl: formats[0].downloadUrl,
                        formats: formats
                    });
                }
            }
        } catch (_) {}

        return res.status(400).json({
            success: false,
            error: 'Facebook video could not be parsed. Verify the reel/video is public.'
        });

    } catch (err) {
        console.error('Facebook Route Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
