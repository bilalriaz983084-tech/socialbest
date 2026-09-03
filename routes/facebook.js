const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

router.post('/download', async (req, res) => {
    let { url, formatType = 'video' } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'Facebook URL is required' });

    try {
        let cleanUrl = url.trim();

        // Step 1: Follow /share/ redirect if present
        if (cleanUrl.includes('/share/') || cleanUrl.includes('fb.watch')) {
            try {
                const headRes = await axios.get(cleanUrl, {
                    maxRedirects: 5,
                    validateStatus: null,
                    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                    timeout: 6000
                });
                if (headRes.request && headRes.request.res && headRes.request.res.responseUrl) {
                    cleanUrl = headRes.request.res.responseUrl;
                }
            } catch (_) {}
        }

        const targetUrl = cleanUrl.replace('m.facebook.com', 'www.facebook.com');

        // Step 2: Pure HTML Extraction
        const pageRes = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: 9000
        }).catch(() => null);

        if (pageRes && pageRes.data) {
            const html = pageRes.data;

            // Agar PHOTO Post hai
            if (formatType === 'image' || formatType === 'photo' || targetUrl.includes('/photo')) {
                const photoMatches = [
                    html.match(/property="og:image"\s+content="([^"]+)"/),
                    html.match(/"image":\{"uri":"([^"]+)"\}/)
                ];

                for (const match of photoMatches) {
                    if (match && match[1]) {
                        const directPhoto = match[1].replace(/&amp;/g, '&').replace(/\\/g, '');
                        return res.json({
                            success: true,
                            title: `Facebook_Photo_${Date.now()}`,
                            thumbnail: directPhoto,
                            downloadUrl: directPhoto,
                            formats: [{
                                quality: 'HD Photo',
                                downloadUrl: directPhoto,
                                extension: 'jpg',
                                type: 'photo'
                            }]
                        });
                    }
                }
            }

            // Agar VIDEO Post hai (Strict Single Video Selection: No Duplicates)
            const hdMatch = html.match(/playable_url_quality_hd":"([^"]+)"/);
            const sdMatch = html.match(/playable_url":"([^"]+)"/);

            const videoUrl = hdMatch ? JSON.parse(`"${hdMatch[1]}"`) : (sdMatch ? JSON.parse(`"${sdMatch[1]}"`) : null);

            if (videoUrl) {
                return res.json({
                    success: true,
                    title: `Facebook_Video_${Date.now()}`,
                    thumbnail: videoUrl,
                    downloadUrl: videoUrl,
                    formats: [{
                        quality: hdMatch ? 'HD Quality (MP4)' : 'SD Quality (MP4)',
                        downloadUrl: videoUrl,
                        extension: 'mp4',
                        type: 'video'
                    }]
                });
            }
        }

        return res.status(400).json({ success: false, error: 'Facebook media could not be resolved. Ensure post is public.' });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
