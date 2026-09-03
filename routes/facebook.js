const express = require('express');
const router = express.Router();
const { ApifyClient } = require('apify-client');
const axios = require('axios');

const APIFY_TOKEN = process.env.APIFY_API_TOKEN || 'apify_api_QigZyIwNVCerPEctLzFxffpTXt6jnF48DGlI';

const apifyClient = new ApifyClient({
    token: APIFY_TOKEN,
});

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

// Helper: Short links expand karein aur clean URL banayein
async function cleanAndExpandFacebookUrl(rawUrl) {
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
                timeout: 3500
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
        const targetUrl = await cleanAndExpandFacebookUrl(url);

        // ============================================================
        // 🌟 METHOD 1: Direct SnapSave Form API (< 2s - High Success)
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
                    timeout: 4000
                }
            );

            const html = snapRes.data;
            if (typeof html === 'string') {
                const matches = [...html.matchAll(/href="([^"]+)"[^>]*class="button is-success[^"]*"[^>]*>([^<]+)/gi)];
                const formats = [];

                matches.forEach((m, idx) => {
                    const dlLink = m[1].replace(/&amp;/g, '&');
                    const label = m[2].trim();
                    if (dlLink.startsWith('http')) {
                        formats.push({
                            quality: label || (idx === 0 ? 'HD Quality (MP4)' : 'SD Quality (MP4)'),
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
        // 🌟 METHOD 2: FastDL Gateway (< 2.5s)
        // ============================================================
        try {
            const fdlRes = await axios.post('https://api.fastdl.app/api/convert', {
                url: targetUrl
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Origin': 'https://fastdl.app',
                    'Referer': 'https://fastdl.app/'
                },
                timeout: 3500
            });

            if (fdlRes.data && fdlRes.data.url) {
                const results = Array.isArray(fdlRes.data.url) ? fdlRes.data.url : [fdlRes.data.url];
                const formats = [];

                results.forEach((entry, idx) => {
                    const dl = entry.url || entry;
                    if (dl && typeof dl === 'string') {
                        const isHd = entry.name?.toLowerCase().includes('hd') || dl.includes('_hd');
                        formats.push({
                            quality: isHd ? 'HD Quality (MP4)' : `SD Quality (MP4) ${idx > 0 ? idx + 1 : ''}`.trim(),
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

        // ============================================================
        // 🌟 METHOD 3: FDownloader Media Ajax (< 3s)
        // ============================================================
        try {
            const fdRes = await axios.post('https://fdownloader.net/api/ajaxSearch', 
                new URLSearchParams({ k_exp: '', k_token: '', q: targetUrl }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    },
                    timeout: 4000
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
            error: 'Facebook video could not be parsed. Verify the video/reel is public.'
        });

    } catch (err) {
        console.error('Facebook Route Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
