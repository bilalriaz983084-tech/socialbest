const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'YouTube', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

// Helper: Video ID extraction
function extractYouTubeId(url) {
    const clean = (url || '').trim();
    const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|shorts\/)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = clean.match(regExp);
    return match ? match[1] : null;
}

router.post('/download', async (req, res) => {
    const rawUrl = req.body?.url || req.body?.link || req.body?.videoUrl || req.query?.url;
    const formatType = (req.body?.formatType || 'video').toLowerCase();

    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
        return res.status(400).json({ success: false, error: 'YouTube URL is required' });
    }

    const videoId = extractYouTubeId(rawUrl);
    if (!videoId) {
        return res.status(400).json({ success: false, error: 'Invalid YouTube URL or Shorts link' });
    }

    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const defaultThumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    const isAudio = formatType === 'audio';

    console.log(`[YouTube] Processing Video ID: ${videoId} (Format: ${formatType})`);

    try {
        let streamUrl = null;
        let videoTitle = `YouTube_${videoId}`;

        // ============================================================
        // 🌟 ENGINE 1: Multi-Instance Cobalt Nodes (Strict 3.5s Cap)
        // ============================================================
        const cobaltNodes = [
            'https://cobalt-api.kwiatekm.tokyo',
            'https://api.wuk.sh',
            'https://co.wuk.sh'
        ];

        for (const node of cobaltNodes) {
            try {
                const response = await axios.post(`${node}/`, {
                    url: canonicalUrl,
                    downloadMode: isAudio ? 'audio' : 'auto',
                    videoQuality: '720',
                    audioFormat: 'mp3'
                }, {
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    timeout: 3500
                });

                if (response.data && response.data.url) {
                    streamUrl = response.data.url;
                    if (response.data.filename) {
                        videoTitle = response.data.filename.replace(/\.[^/.]+$/, '');
                    }
                    break;
                }
            } catch (_) {
                continue;
            }
        }

        // ============================================================
        // 🌟 ENGINE 2: Siputzx Fast Cluster Fallback (< 3.5s)
        // ============================================================
        if (!streamUrl) {
            try {
                const sipRes = await axios.get(`https://api.siputzx.my.id/api/d/youtube?url=${encodeURIComponent(canonicalUrl)}`, {
                    timeout: 3500
                });

                if (sipRes.data?.status && sipRes.data?.data) {
                    const data = sipRes.data.data;
                    streamUrl = isAudio ? (data.audio || data.mp3) : (data.video || data.mp4 || data.url);
                    if (data.title) videoTitle = data.title;
                }
            } catch (sipErr) {
                console.log('[YouTube] Siputzx engine skipped:', sipErr.message);
            }
        }

        // ============================================================
        // RESPONSE (Matches Android App Spec)
        // ============================================================
        if (streamUrl) {
            return res.json({
                success: true,
                type: isAudio ? 'audio' : 'video',
                title: videoTitle,
                thumbnail: defaultThumbnail,
                downloadUrl: streamUrl,
                formats: [{
                    quality: isAudio ? 'Audio Only (MP3)' : 'HD Video (MP4)',
                    downloadUrl: streamUrl,
                    extension: isAudio ? 'mp3' : 'mp4',
                    type: isAudio ? 'audio' : 'video'
                }]
            });
        }

        return res.status(400).json({
            success: false,
            error: 'YouTube stream could not be extracted. Ensure the video is public and not age-restricted.'
        });

    } catch (err) {
        console.error('[YouTube Route Error]:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
