const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

// Helper: Clean tracking queries & resolve short redirects
async function resolveFacebookUrl(rawUrl) {
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
        const targetUrl = await resolveFacebookUrl(url);

        // ============================================================
        // 🌟 METHOD 1: Native Cheerio Script & DOM Parser (< 1.5s)
        // Scrapes Meta's embedded relay data & raw video tags
        // ============================================================
        try {
            const fbRes = await axios.get(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none'
                },
                timeout: 4000
            });

            const html = fbRes.data;
            const $ = cheerio.load(html);
            const formats = [];

            // 1. Check OpenGraph Meta Tags via Cheerio
            const ogVideo = $('meta[property="og:video"]').attr('content') || 
                            $('meta[property="og:video:secure_url"]').attr('content') ||
                            $('meta[property="og:video:url"]').attr('content');
            const ogImage = $('meta[property="og:image"]').attr('content');

            // 2. Check JSON Relay / GraphQL scripts inside HTML
            const hdMatch = html.match(/"browser_native_hd_url":"([^"]+)"/) || 
                            html.match(/"playable_url_quality_hd":"([^"]+)"/);
            const sdMatch = html.match(/"browser_native_sd_url":"([^"]+)"/) || 
                            html.match(/"playable_url":"([^"]+)"/);

            if (hdMatch && hdMatch[1]) {
                try {
                    const cleanHd = JSON.parse(`"${hdMatch[1]}"`);
                    formats.push({
                        quality: 'HD Quality (MP4)',
                        downloadUrl: cleanHd,
                        extension: 'mp4',
                        type: 'video'
                    });
                } catch (_) {}
            }

            if (sdMatch && sdMatch[1]) {
                try {
                    const cleanSd = JSON.parse(`"${sdMatch[1]}"`);
                    formats.push({
                        quality: 'SD Quality (MP4)',
                        downloadUrl: cleanSd,
                        extension: 'mp4',
                        type: 'video'
                    });
                } catch (_) {}
            }

            // Fallback to og:video if script regex was obfuscated
            if (formats.length === 0 && ogVideo) {
                formats.push({
                    quality: 'HD Video (MP4)',
                    downloadUrl: ogVideo,
                    extension: 'mp4',
                    type: 'video'
                });
            }

            if (formats.length > 0) {
                return res.json({
                    success: true,
                    title: `Facebook_${Date.now()}`,
                    thumbnail: ogImage || formats[0].downloadUrl,
                    downloadUrl: formats[0].downloadUrl,
                    formats: formats
                });
            }
        } catch (_) {}

        // ============================================================
        // 🌟 METHOD 2: Cobalt Stream Mirror Fallback (< 2s)
        // ============================================================
        const cobaltServers = [
            'https://cobalt-api.kwiatekm.tokyo',
            'https://api.wuk.sh',
            'https://co.wuk.sh'
        ];

        for (const server of cobaltServers) {
            try {
                const cRes = await axios.post(`${server}/`, {
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
        }

        return res.status(400).json({
            success: false,
            error: 'Facebook video could not be parsed. Verify the post/reel is public.'
        });

    } catch (err) {
        console.error('Facebook Route Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
