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
            new URLSearchParams({ url: url.trim() }),
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

            // ============================================================
            // 1. AGAR PHOTOS HAIN TO SIRF PHOTOS (JPG) AAYENGI
            // ============================================================
            if (data.images && Array.isArray(data.images) && data.images.length > 0) {
                const formats = data.images.map((imgUrl, idx) => {
                    const cleanImg = imgUrl.startsWith('http') ? imgUrl : `https://www.tikwm.com${imgUrl}`;
                    return {
                        quality: data.images.length === 1 ? 'HD Photo (JPG)' : `Photo ${idx + 1} (HD)`,
                        downloadUrl: cleanImg,
                        extension: 'jpg',
                        type: 'photo'
                    };
                });

                return res.json({
                    success: true,
                    title: `TikTok_Photo_${Date.now()}`,
                    thumbnail: formats[0].downloadUrl,
                    downloadUrl: formats[0].downloadUrl,
                    formats: formats
                });
            }

            // ============================================================
            // 2. SIRF AIK SINGLE REGULAR VIDEO (NO WATERMARK WALI KHATAM)
            // ============================================================
            let standardVideo = data.wmplay || data.play;
            if (standardVideo) {
                if (!standardVideo.startsWith('http')) {
                    standardVideo = `https://www.tikwm.com${standardVideo}`;
                }

                return res.json({
                    success: true,
                    title: `TikTok_Video_${Date.now()}`,
                    thumbnail: data.cover || standardVideo,
                    downloadUrl: standardVideo,
                    formats: [{
                        quality: 'Standard Video (MP4)',
                        downloadUrl: standardVideo,
                        extension: 'mp4',
                        type: 'video'
                    }]
                });
            }
        }

        return res.status(400).json({ success: false, error: 'Could not extract TikTok media.' });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
