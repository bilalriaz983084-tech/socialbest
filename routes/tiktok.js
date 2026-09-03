const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'TikTok', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

router.post('/download', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'TikTok URL is required' });

    try {
        const response = await axios.post(
            'https://www.tikwm.com/api/',
            new URLSearchParams({ url: url.trim(), hd: '1' }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                },
                timeout: 10000
            }
        );

        if (response.data && response.data.data) {
            const data = response.data.data;
            const formats = [];

            // 1. Agar MULTIPLE IMAGES / PHOTOS hain (Saari images nikalna)
            if (data.images && Array.isArray(data.images) && data.images.length > 0) {
                data.images.forEach((imgUrl, idx) => {
                    const fullImg = imgUrl.startsWith('http') ? imgUrl : `https://www.tikwm.com${imgUrl}`;
                    formats.push({
                        quality: `Photo ${idx + 1} (HD)`,
                        downloadUrl: fullImg,
                        extension: 'jpg',
                        type: 'photo'
                    });
                });

                return res.json({
                    success: true,
                    title: data.title ? `TikTok_${data.title.substring(0, 20)}` : `TikTok_Photos_${Date.now()}`,
                    thumbnail: formats[0].downloadUrl,
                    downloadUrl: formats[0].downloadUrl,
                    formats: formats
                });
            }

            // 2. Agar VIDEO hai (Strictly 1 No-Watermark HD video)
            let cleanVideo = data.play || data.hdplay;
            if (cleanVideo) {
                if (!cleanVideo.startsWith('http')) {
                    cleanVideo = `https://www.tikwm.com${cleanVideo}`;
                }

                formats.push({
                    quality: 'HD Video (No Watermark)',
                    downloadUrl: cleanVideo,
                    extension: 'mp4',
                    type: 'video'
                });

                return res.json({
                    success: true,
                    title: data.title ? `TikTok_${data.title.substring(0, 20)}` : `TikTok_Video_${Date.now()}`,
                    thumbnail: data.cover || cleanVideo,
                    downloadUrl: cleanVideo,
                    formats: formats
                });
            }
        }

        return res.status(400).json({ success: false, error: 'Could not extract media from TikTok.' });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
