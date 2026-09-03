const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'YouTube', status: 'Connected', timestamp: new Date().toISOString() });
});

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

    const defaultThumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    const isAudio = formatType === 'audio';

    console.log(`[YouTube InnerTube] Processing Video ID: ${videoId}`);

    try {
        let videoStreamUrl = null;
        let audioStreamUrl = null;
        let videoTitle = `YouTube_${videoId}`;

        // ============================================================
        // 🌟 ENGINE 1: Invidious Open Federation Cluster (< 2.5s)
        // ============================================================
        const invidiousNodes = [
            'https://invidious.nerdvpn.de',
            'https://inv.nadeko.net',
            'https://invidious.jing.rocks',
            'https://yt.artemislena.eu'
        ];

        for (const node of invidiousNodes) {
            try {
                const invRes = await axios.get(`${node}/api/v1/videos/${videoId}`, {
                    headers: { 'Accept': 'application/json' },
                    timeout: 3500
                });

                if (invRes.data && invRes.data.formatStreams) {
                    const streams = invRes.data.formatStreams;
                    videoTitle = invRes.data.title || videoTitle;

                    // 720p or highest progressive MP4
                    const vid = streams.find(s => s.resolution === '720p' && s.container === 'mp4') ||
                                streams.find(s => s.container === 'mp4');

                    if (vid && vid.url) {
                        videoStreamUrl = vid.url;
                    }

                    // Audio only stream
                    if (invRes.data.adaptiveFormats) {
                        const aud = invRes.data.adaptiveFormats.find(a => a.type && a.type.includes('audio/mp4'));
                        if (aud && aud.url) {
                            audioStreamUrl = aud.url;
                        }
                    }

                    if (videoStreamUrl) break;
                }
            } catch (_) {
                continue;
            }
        }

        // ============================================================
        // 🌟 ENGINE 2: Piped API High-Speed CDN Relay Fallback (< 2.5s)
        // ============================================================
        if (!videoStreamUrl) {
            const pipedNodes = [
                'https://pipedapi.kavin.rocks',
                'https://api.piped.privacydev.net'
            ];

            for (const pNode of pipedNodes) {
                try {
                    const pRes = await axios.get(`${pNode}/streams/${videoId}`, {
                        timeout: 3500
                    });

                    if (pRes.data) {
                        videoTitle = pRes.data.title || videoTitle;
                        const vStreams = pRes.data.videoStreams || [];
                        const aStreams = pRes.data.audioStreams || [];

                        const vid = vStreams.find(s => s.quality === '720p' && s.format === 'MPEG_4') ||
                                    vStreams.find(s => s.format === 'MPEG_4');

                        if (vid && vid.url) videoStreamUrl = vid.url;
                        if (aStreams.length > 0 && aStreams[0].url) audioStreamUrl = aStreams[0].url;

                        if (videoStreamUrl) break;
                    }
                } catch (_) {}
            }
        }

        // ============================================================
        // Response Dispatcher
        // ============================================================
        if (videoStreamUrl || audioStreamUrl) {
            const formats = [];

            if (videoStreamUrl) {
                formats.push({
                    quality: 'HD Video 720p (MP4)',
                    downloadUrl: videoStreamUrl,
                    extension: 'mp4',
                    type: 'video'
                });
            }

            if (audioStreamUrl) {
                formats.push({
                    quality: 'Audio Only (M4A/MP3)',
                    downloadUrl: audioStreamUrl,
                    extension: isAudio ? 'mp3' : 'm4a',
                    type: 'audio'
                });
            }

            const primaryUrl = (isAudio && audioStreamUrl) ? audioStreamUrl : (videoStreamUrl || audioStreamUrl);

            return res.json({
                success: true,
                type: isAudio ? 'audio' : 'video',
                title: videoTitle,
                thumbnail: defaultThumbnail,
                downloadUrl: primaryUrl,
                formats: formats
            });
        }

        return res.status(400).json({
            success: false,
            error: 'YouTube stream could not be reached. Ensure video is public and not age-restricted.'
        });

    } catch (err) {
        console.error('[YouTube Error]:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
