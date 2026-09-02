const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

router.post('/download', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: 'Facebook URL is required' });
    }

    try {
        // Step 1: Direct Facebook Web Scrape (Fastest & Native)
        const targetUrl = url.replace('m.facebook.com', 'www.facebook.com');
        const pageRes = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Sec-Fetch-Site': 'none'
            },
            timeout: 9000
        }).catch(() => null);

        if (pageRes && pageRes.data) {
            const html = pageRes.data;

            // HD aur SD video links dhoondna
            const hdMatch = html.match(/playable_url_quality_hd":"([^"]+)"/) || html.match(/"browser_native_hd_url":"([^"]+)"/);
            const sdMatch = html.match(/playable_url":"([^"]+)"/) || html.match(/"browser_native_sd_url":"([^"]+)"/);

            const formats = [];

            if (hdMatch) {
                const hdUrl = JSON.parse(`"${hdMatch[1]}"`);
                formats.push({
                    quality: 'HD Video',
                    downloadUrl: hdUrl,
                    extension: 'mp4',
                    type: 'video'
                });
            }

            if (sdMatch) {
                const sdUrl = JSON.parse(`"${sdMatch[1]}"`);
                formats.push({
                    quality: 'SD Video',
                    downloadUrl: sdUrl,
                    extension: 'mp4',
                    type: 'video'
                });
            }

            if (formats.length > 0) {
                return res.json({
                    success: true,
                    title: `Facebook_Video_${Date.now()}`,
                    thumbnail: formats[0].downloadUrl,
                    downloadUrl: formats[0].downloadUrl,
                    formats: formats
                });
            }
        }

        // Step 2: Fallback Mirror APIs (Agar direct HTML mein video na miley)
        const mirrors = [
            'https://api.cobalt.tools',
            'https://cobalt-api.kwiatekm.tokyo',
            'https://api.wuk.sh'
        ];

        for (const mirror of mirrors) {
            try {
                const mirrorRes = await axios.post(`${mirror}/`, {
                    url: url.trim(),
                    videoQuality: 'max'
                }, {
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    timeout: 8000
                });

                if (mirrorRes.data && mirrorRes.data.url) {
                    return res.json({
                        success: true,
                        title: `Facebook_Video_${Date.now()}`,
                        thumbnail: mirrorRes.data.url,
                        downloadUrl: mirrorRes.data.url,
                        formats: [{
                            quality: 'HD Video',
                            downloadUrl: mirrorRes.data.url,
                            extension: 'mp4',
                            type: 'video'
                        }]
                    });
                }
            } catch (e) {
                continue;
            }
        }

        return res.status(400).json({
            success: false,
            error: 'Facebook video could not be extracted. Post might be private or from a closed group.'
        });

    } catch (err) {
        console.error('Facebook Route Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
