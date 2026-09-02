const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

router.post('/download', async (req, res) => {
    const { url, formatType = 'video' } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: 'Facebook URL is required' });
    }

    try {
        const cleanUrl = url.replace('m.facebook.com', 'www.facebook.com').split('?')[0];

        // 1. Direct Facebook Page Fetch
        const pageRes = await axios.get(cleanUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Sec-Fetch-Site': 'none'
            },
            timeout: 9000
        }).catch(() => null);

        if (pageRes && pageRes.data) {
            const html = pageRes.data;

            // Agar user Photo download kar raha hai:
            if (formatType === 'image' || formatType === 'photo') {
                const ogImageMatch = html.match(/property="og:image"\s+content="([^"]+)"/) || 
                                     html.match(/content="([^"]+)"\s+property="og:image"/);

                if (ogImageMatch) {
                    const rawPhotoUrl = ogImageMatch[1].replace(/&amp;/g, '&');
                    return res.json({
                        success: true,
                        title: `Facebook_Photo_${Date.now()}`,
                        thumbnail: rawPhotoUrl,
                        downloadUrl: rawPhotoUrl,
                        formats: [{
                            quality: 'Original HD Photo',
                            downloadUrl: rawPhotoUrl,
                            extension: 'jpg',
                            type: 'photo'
                        }]
                    });
                }
            }

            // Agar Video/Reel download kar raha hai (Only pick 1 Best HD, duplicates eliminated)
            const hdMatch = html.match(/playable_url_quality_hd":"([^"]+)"/) || html.match(/"browser_native_hd_url":"([^"]+)"/);
            const sdMatch = html.match(/playable_url":"([^"]+)"/) || html.match(/"browser_native_sd_url":"([^"]+)"/);

            const selectedVideo = hdMatch ? JSON.parse(`"${hdMatch[1]}"`) : (sdMatch ? JSON.parse(`"${sdMatch[1]}"`) : null);

            if (selectedVideo) {
                return res.json({
                    success: true,
                    title: `Facebook_Video_${Date.now()}`,
                    thumbnail: selectedVideo,
                    downloadUrl: selectedVideo,
                    formats: [{
                        quality: hdMatch ? 'HD Quality (MP4)' : 'SD Quality (MP4)',
                        downloadUrl: selectedVideo,
                        extension: 'mp4',
                        type: 'video'
                    }]
                });
            }
        }

        // 2. Fallback Mirror (Fast Gateway)
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
                    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                    timeout: 7000
                });

                if (mirrorRes.data && mirrorRes.data.url) {
                    return res.json({
                        success: true,
                        title: `Facebook_Media_${Date.now()}`,
                        thumbnail: mirrorRes.data.url,
                        downloadUrl: mirrorRes.data.url,
                        formats: [{
                            quality: 'High Quality (MP4)',
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
            error: 'Facebook media could not be resolved. Ensure post is completely public.'
        });

    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
