const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'TikTok', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

router.post('/download', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ success: false, error: 'TikTok URL is required' });
    }

    try {
        const response = await axios.post(
            'https://www.tikwm.com/api/',
            new URLSearchParams({ url: url.trim(), hd: '1' }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                timeout: 10000
            }
        );

        if (response.data && response.data.data) {
            const data = response.data.data;
            const formats = [];

            // CASE 1: Photo Slideshow / Album Posts
            if (data.images && Array.isArray(data.images) && data.images.length > 0) {
                data.images.forEach((imgUrl, idx) => {
                    formats.push({
                        quality: `Photo ${idx + 1} (HD)`,
                        downloadUrl: imgUrl,
                        extension: 'jpg',
                        type: 'photo'
                    });
                });

                return res.json({
                    success: true,
                    title: data.title || `TikTok_Photos_${Date.now()}`,
                    thumbnail: data.images[0],
                    downloadUrl: data.images[0],
                    formats: formats
                });
            }

            // CASE 2: Single Video Post (Strictly 1 No-Watermark HD Video)
            const cleanVideoUrl = data.hdplay || data.play;

            if (cleanVideoUrl) {
                formats.push({
                    quality: 'HD Video (No Watermark)',
                    downloadUrl: cleanVideoUrl,
                    extension: 'mp4',
                    type: 'video'
                });

                return res.json({
                    success: true,
                    title: data.title || `TikTok_Video_${Date.now()}`,
                    thumbnail: data.cover || cleanVideoUrl,
                    downloadUrl: cleanVideoUrl,
                    formats: formats
                });
            }
        }

        return res.status(400).json({
            success: false,
            error: 'Could not resolve TikTok media. Post might be private or removed.'
        });

    } catch (err) {
        console.error('TikTok Route Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
