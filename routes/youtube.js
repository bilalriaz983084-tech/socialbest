const express = require('express');
const router = express.Router();
const axios = require('axios');

router.post('/download', async (req, res) => {
    const { url, formatType = 'video' } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'YouTube URL required' });

    try {
        const mirrors = [
            'https://cobalt-api.kwiatekm.tokyo',
            'https://api.wuk.sh'
        ];

        for (const mirror of mirrors) {
            try {
                const response = await axios.post(`${mirror}/`, {
                    url: url.trim(),
                    downloadMode: formatType === 'audio' ? 'audio' : 'auto',
                    videoQuality: '720'
                }, {
                    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                    timeout: 9000
                });

                if (response.data && response.data.url) {
                    return res.json({
                        success: true,
                        title: `YouTube_${Date.now()}`,
                        thumbnail: response.data.url,
                        downloadUrl: response.data.url,
                        formats: [{
                            quality: formatType === 'audio' ? 'Audio (MP3)' : '720p HD (MP4)',
                            downloadUrl: response.data.url,
                            extension: formatType === 'audio' ? 'mp3' : 'mp4'
                        }]
                    });
                }
            } catch (_) {
                continue;
            }
        }

        return res.status(400).json({ success: false, error: 'YouTube extraction failed on Vercel' });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
