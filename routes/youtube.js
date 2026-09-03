const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'YouTube', status: 'Connected', timestamp: new Date().toISOString() });
});

// Helper: Extract Clean YouTube Video ID
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
        // 🌟 ENGINE 1: Siputzx Real Direct Endpoints (ytmp4 & ytmp3)
        // ============================================================
        try {
            const sipEndpoint = isAudio 
                ? `https://api.siputzx.my.id/api/d/ytmp3?url=${encodeURIComponent(canonicalUrl)}`
                : `https://api.siputzx.my.id/api/d/ytmp4?url=${encodeURIComponent(canonicalUrl)}`;

            const sipRes = await axios.get(sipEndpoint, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 5000
            });

            if (sipRes.data?.status && sipRes.data?.data) {
                const d = sipRes.data.data;
                streamUrl = d.dl || d.url || d.download || d.link;
                videoTitle = d.title || videoTitle;
            }
        } catch (sipErr) {
            console.log('[YouTube] Siputzx engine failed:', sipErr.message);
        }

        // ============================================================
        // 🌟 ENGINE 2: Fast Invidious Open Federation Cluster (< 3s)
        // ============================================================
        if (!streamUrl) {
            const invidiousNodes = [
                'https://inv.nadeko.net',
                'https://invidious.nerdvpn.de',
                'https://yt.artemislena.eu'
            ];

            for (const node of invidiousNodes) {
                try {
                    const invRes = await axios.get(`${node}/api/v1/videos/${videoId}`, {
                        headers: { 'Accept': 'application/json' },
                        timeout: 3000
                    });

                    if (invRes.data) {
                        videoTitle = invRes.data.title || videoTitle;

                        if (isAudio && invRes.data.adaptiveFormats) {
                            const aud = invRes.data.adaptiveFormats.find(a => a.type && a.type.includes('audio/mp4'));
                            if (aud?.url) streamUrl = aud.url;
                        }

                        if (!isAudio && invRes.data.formatStreams) {
                            const vid = invRes.data.formatStreams.find(s => s.resolution === '720p' && s.container === 'mp4') ||
                                        invRes.data.formatStreams.find(s => s.container === 'mp4');
                            if (vid?.url) streamUrl = vid.url;
                        }

                        if (streamUrl) break;
                    }
                } catch (_) {
                    continue;
                }
            }
        }

        // ============================================================
        // RESPONSE (Valid Streams)
        // ============================================================
        if (streamUrl) {
            return res.json({
                success: true,
                type: isAudio ? 'audio' : 'video',
                title: videoTitle,
                thumbnail: defaultThumbnail,
                downloadUrl: streamUrl,
                formats: [{
                    quality: isAudio ? 'Audio Only (MP3)' : 'HD Video 720p (MP4)',
                    downloadUrl: streamUrl,
                    extension: isAudio ? 'mp3' : 'mp4',
                    type: isAudio ? 'audio' : 'video'
                }]
            });
        }

        return res.status(400).json({
            success: false,
            error: 'YouTube stream could not be reached. Ensure video is public and accessible.'
        });

    } catch (err) {
        console.error('[YouTube Fatal Error]:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
