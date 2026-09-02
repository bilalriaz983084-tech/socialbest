const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

router.post('/download', async (req, res) => {
    let { url, formatType = 'video' } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: 'Facebook URL is required' });
    }

    try {
        let cleanUrl = url.trim();

        // 🌟 Engine 1: Dedicated FB Stream Resolver (Handles Reels, Videos & Watch links)
        try {
            const apiRes = await axios.post('https://api.v2.emreakdas.com/api/facebook', {
                url: cleanUrl
            }, {
                headers: { 'Content-Type': 'application/json' },
                timeout: 8000
            });

            if (apiRes.data && (apiRes.data.video || apiRes.data.url)) {
                const streamUrl = apiRes.data.video || apiRes.data.url;
                return res.json({
                    success: true,
                    title: `Facebook_${Date.now()}`,
                    thumbnail: streamUrl,
                    downloadUrl: streamUrl,
                    formats: [{
                        quality: 'HD Quality (MP4)',
                        downloadUrl: streamUrl,
                        extension: 'mp4',
                        type: 'video'
                    }]
                });
            }
        } catch (_) {}

        // 🌟 Engine 2: Pure Serverless HTML Scraper (Zero Puppeteer)
        const targetUrl = cleanUrl.replace('m.facebook.com', 'www.facebook.com');
        const pageRes = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: 8000
        }).catch(() => null);

        if (pageRes && pageRes.data) {
            const html = pageRes.data;

            // Photo Extraction
            if (formatType === 'image' || formatType === 'photo') {
                const photoMatch = html.match(/property="og:image"\s+content="([^"]+)"/) || html.match(/"image":\{"uri":"([^"]+)"\}/);
                if (photoMatch && photoMatch[1]) {
                    const cleanPhoto = photoMatch[1].replace(/&amp;/g, '&').replace(/\\/g, '');
                    return res.json({
                        success: true,
                        title: `Facebook_Photo_${Date.now()}`,
                        thumbnail: cleanPhoto,
                        downloadUrl: cleanPhoto,
                        formats: [{
                            quality: 'HD Photo',
                            downloadUrl: cleanPhoto,
                            extension: 'jpg',
                            type: 'photo'
                        }]
                    });
                }
            }

            // Video Extraction (Strict Single Quality Filter)
            const hdMatch = html.match(/playable_url_quality_hd":"([^"]+)"/);
            const sdMatch = html.match(/playable_url":"([^"]+)"/);

            const chosen = hdMatch ? JSON.parse(`"${hdMatch[1]}"`) : (sdMatch ? JSON.parse(`"${sdMatch[1]}"`) : null);

            if (chosen) {
                return res.json({
                    success: true,
                    title: `Facebook_Video_${Date.now()}`,
                    thumbnail: chosen,
                    downloadUrl: chosen,
                    formats: [{
                        quality: hdMatch ? 'HD Quality (MP4)' : 'SD Quality (MP4)',
                        downloadUrl: chosen,
                        extension: 'mp4',
                        type: 'video'
                    }]
                });
            }
        }

        return res.status(400).json({
            success: false,
            error: 'Facebook media could not be resolved. Ensure post is public.'
        });

    } catch (err) {
        console.error('Facebook Route Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
