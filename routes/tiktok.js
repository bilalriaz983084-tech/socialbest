const express = require('express');
const router = express.Router();
const axios = require('axios');

router.post('/download', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'TikTok URL is required' });

    try {
        // TikWM Public API (100% Serverless Friendly, Zero yt-dlp)
        const response = await axios.post('https://www.tikwm.com/api/', new URLSearchParams({ url: url.trim() }), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            timeout: 10000
        });

        if (response.data && response.data.data) {
            const data = response.data.data;
            const videoUrl = data.play || data.wmplay;

            return res.json({
                success: true,
                title: data.title || `TikTok_${Date.now()}`,
                thumbnail: data.cover,
                downloadUrl: videoUrl,
                formats: [{
                    quality: 'HD No Watermark (MP4)',
                    downloadUrl: videoUrl,
                    extension: 'mp4',
                    type: 'video'
                }]
            });
        }

        return res.status(400).json({ success: false, error: 'Failed to extract TikTok video' });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
