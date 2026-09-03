const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'YouTube', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

router.post('/download', async (req, res) => {
    const { url, formatType = 'video' } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: 'YouTube URL is required' });
    }

    try {
        let cleanUrl = url.trim();

        // Active Cobalt V10 API Instances (Public Endpoints)
        const instances = [
            'https://cobalt-api.kwiatekm.tokyo',
            'https://api.wuk.sh',
            'https://api.cobalt.tools'
        ];

        let streamData = null;

        for (const instance of instances) {
            try {
                const response = await axios.post(`${instance}/`, {
                    url: cleanUrl,
                    downloadMode: formatType === 'audio' ? 'audio' : 'auto',
                    videoQuality: '1080',
                    audioFormat: 'mp3'
                }, {
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    timeout: 9000
                });

                if (response.data && response.data.url) {
                    streamData = response.data;
                    break;
                }
            } catch (_) {
                continue; // Next mirror try karein agar ek busy ho
            }
        }

        if (streamData && streamData.url) {
            const isAudio = formatType === 'audio';

            return res.json({
                success: true,
                title: `YouTube_${Date.now()}`,
                thumbnail: streamData.url,
                downloadUrl: streamData.url,
                formats: [{
                    quality: isAudio ? 'Audio MP3 (320kbps)' : 'HD Video (MP4)',
                    downloadUrl: streamData.url,
                    extension: isAudio ? 'mp3' : 'mp4',
                    type: isAudio ? 'audio' : 'video'
                }]
            });
        }

        return res.status(400).json({
            success: false,
            error: 'YouTube media could not be resolved. Video might be age-restricted or private.'
        });

    } catch (err) {
        console.error('YouTube Route Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
