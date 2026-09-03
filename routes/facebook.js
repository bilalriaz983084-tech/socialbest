const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

// Helper: Safely resolve and clean Facebook URLs
async function cleanUrl(rawUrl) {
    let clean = (rawUrl || '').trim();

    // Mobile / Share redirect handle karein
    if (clean.includes('fb.watch') || clean.includes('/share/')) {
        try {
            const head = await axios.get(clean, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                maxRedirects: 5,
                timeout: 3500
            });
            if (head.request?.res?.responseUrl) {
                clean = head.request.res.responseUrl;
            }
        } catch (_) {}
    }

    if (clean.includes('facebook.com') && clean.includes('?')) {
        clean = clean.split('?')[0];
    }

    return clean;
}

router.post('/download', async (req, res) => {
    const rawUrl = req.body.url || req.body.link || req.body.videoUrl || req.query.url;
    if (!rawUrl) return res.status(400).json({ success: false, error: 'Facebook URL is required' });

    try {
        const targetUrl = await cleanUrl(rawUrl);

        // ============================================================
        // 🌟 GATEWAY 1: Direct FDownloader Ajax Engine (Video + Photo)
        // ============================================================
        try {
            const fdRes = await axios.post('https://fdownloader.net/api/ajaxSearch',
                new URLSearchParams({ k_exp: '', k_token: '', q: targetUrl }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': 'https://fdownloader.net/'
                    },
                    timeout: 4000
                }
            );

            if (fdRes.data && fdRes.data.data) {
                const html = fdRes.data.data;
                const videoLinks = [...html.matchAll(/href="([^"]+)"[^>]*class="download-link[^"]*"/gi)];
                const photoLinks = [...html.matchAll(/href="([^"]+)"[^>]*class="image-link[^"]*"/gi)];

                if (videoLinks.length > 0) {
                    const bestVideo = videoLinks[0][1].replace(/&amp;/g, '&');
                    return res.json({
                        success: true,
                        title: `Facebook_${Date.now()}`,
                        thumbnail: bestVideo,
                        downloadUrl: bestVideo,
                        formats: [{
                            quality: 'HD Video (MP4)',
                            downloadUrl: bestVideo,
                            extension: 'mp4',
                            type: 'video'
                        }]
                    });
                }

                if (photoLinks.length > 0) {
                    const formats = photoLinks.map((p, i) => ({
                        quality: `HD Photo ${i + 1} (JPG)`,
                        downloadUrl: p[1].replace(/&amp;/g, '&'),
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
        } catch (_) {}

        // ============================================================
        // 🌟 GATEWAY 2: SnapSave Public Direct Form
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
                    timeout: 4000
                }
            );

            const rawData = snapRes.data;
            if (typeof rawData === 'string') {
                const vMatch = rawData.match(/href="([^"]+)"[^>]*class="button is-success/i) ||
                               rawData.match(/href="([^"]+)"[^>]*>Download<\/a>/i);

                if (vMatch && vMatch[1]) {
                    const dl = vMatch[1].replace(/&amp;/g, '&');
                    return res.json({
                        success: true,
                        title: `Facebook_${Date.now()}`,
                        thumbnail: dl,
                        downloadUrl: dl,
                        formats: [{
                            quality: 'HD Video (MP4)',
                            downloadUrl: dl,
                            extension: 'mp4',
                            type: 'video'
                        }]
                    });
                }
            }
        } catch (_) {}

        // ============================================================
        // 🌟 GATEWAY 3: Cobalt Stream Engine
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
            error: 'Unable to resolve Facebook media. Please ensure the link is public.'
        });

    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
