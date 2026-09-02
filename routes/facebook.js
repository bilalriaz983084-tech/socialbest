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
        let targetUrl = url.trim();

        // 🌟 Step 1: Resolve /share/ redirects to get direct video page
        if (targetUrl.includes('/share/') || targetUrl.includes('fb.watch')) {
            try {
                const headRes = await axios.get(targetUrl, {
                    maxRedirects: 5,
                    validateStatus: null,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
                    },
                    timeout: 6000
                });
                if (headRes.request && headRes.request.res && headRes.request.res.responseUrl) {
                    targetUrl = headRes.request.res.responseUrl;
                }
            } catch (_) {}
        }

        // 🌟 Step 2: Native HTML Parser with clean desktop headers
        const pageRes = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Sec-Fetch-Site': 'none',
                'Accept-Language': 'en-US,en;q=0.9'
            },
            timeout: 9000
        }).catch(() => null);

        if (pageRes && pageRes.data) {
            const html = pageRes.data;

            // Handle Photo Requests
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

            // Extract HD & SD Video streams
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

        // 🌟 Step 3: Rapid API Gateway Fallback
        const rapidScraper = await axios.get(`https://api.v2.emreakdas.com/api/facebook?url=${encodeURIComponent(targetUrl)}`, {
            timeout: 6000
        }).catch(() => null);

        if (rapidScraper && rapidScraper.data && rapidScraper.data.video) {
            const videoUrl = rapidScraper.data.video;
            return res.json({
                success: true,
                title: `Facebook_Video_${Date.now()}`,
                thumbnail: videoUrl,
                downloadUrl: videoUrl,
                formats: [{
                    quality: 'HD Video',
                    downloadUrl: videoUrl,
                    extension: 'mp4',
                    type: 'video'
                }]
            });
        }

        return res.status(400).json({
            success: false,
            error: 'Facebook media could not be resolved. Ensure the link is public.'
        });

    } catch (err) {
        console.error('Facebook Route Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
