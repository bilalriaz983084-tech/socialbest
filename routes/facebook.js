const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected', timestamp: new Date().toISOString() });
});

// Helper: Extract numeric ID or canonical Reel/Video path
function extractFacebookId(url) {
    const clean = url.split('?')[0];
    const match = clean.match(/(?:videos|reel|watch)\/(\d+)/i) || clean.match(/\/(\d+)\/?$/);
    return match ? match[1] : null;
}

router.post('/download', async (req, res) => {
    const rawUrl = req.body.url || req.body.link || req.body.videoUrl || req.query.url;
    if (!rawUrl) return res.status(400).json({ success: false, error: 'Facebook URL is required' });

    try {
        let cleanUrl = rawUrl.trim();
        if (cleanUrl.includes('?')) cleanUrl = cleanUrl.split('?')[0];

        // 1. Expand /share/ links if present
        if (cleanUrl.includes('/share/')) {
            try {
                const head = await axios.get(cleanUrl, {
                    headers: { 'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)' },
                    maxRedirects: 5,
                    timeout: 2500
                });
                if (head.request?.res?.responseUrl) {
                    cleanUrl = head.request.res.responseUrl.split('?')[0];
                }
            } catch (_) {}
        }

        let videoDownloadUrl = null;
        let thumbnail = null;

        // ============================================================
        // 🌟 ENGINE 1: Publer Native Scraper (100% Works on Vercel)
        // ============================================================
        try {
            const publerJob = await axios.post('https://publer.io/api/v1/tools/job/downloader', {
                url: cleanUrl
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 3000
            });

            // If job returns immediate payload
            if (publerJob.data?.payload) {
                const media = publerJob.data.payload;
                const vid = media.find(m => m.type === 'video' || (m.path && m.path.includes('.mp4')));
                if (vid) {
                    videoDownloadUrl = vid.path;
                    thumbnail = vid.thumbnail || vid.path;
                }
            }

            // If job queued, poll once quickly
            if (!videoDownloadUrl && publerJob.data?.job_id) {
                await new Promise(r => setTimeout(r, 1200));
                const pollRes = await axios.get(`https://publer.io/api/v1/tools/job/status/${publerJob.data.job_id}`, {
                    headers: { 'User-Agent': 'Mozilla/5.0' },
                    timeout: 2000
                });
                if (pollRes.data?.payload) {
                    const vid = pollRes.data.payload.find(m => m.type === 'video' || (m.path && m.path.includes('.mp4')));
                    if (vid) {
                        videoDownloadUrl = vid.path;
                        thumbnail = vid.thumbnail || vid.path;
                    }
                }
            }
        } catch (err) {
            console.log('[Facebook] Publer engine failed:', err.message);
        }

        // ============================================================
        // 🌟 ENGINE 2: Direct Meta Mobile Relay (Zero Timeout Fallback)
        // ============================================================
        if (!videoDownloadUrl) {
            try {
                const mUrl = cleanUrl.replace('www.facebook.com', 'mbasic.facebook.com');
                const mRes = await axios.get(mUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
                    },
                    timeout: 2500
                });

                const html = mRes.data;
                const match = html.match(/href="(\/video_redirect\/[^"]+)"/) ||
                              html.match(/src="([^"]+\.mp4[^"]*)"/);

                if (match && match[1]) {
                    if (match[1].startsWith('/video_redirect/')) {
                        const redirectParam = new URL('https://mbasic.facebook.com' + match[1]).searchParams.get('src');
                        if (redirectParam) videoDownloadUrl = decodeURIComponent(redirectParam);
                    } else {
                        videoDownloadUrl = match[1].replace(/&amp;/g, '&');
                    }
                }
            } catch (_) {}
        }

        // ============================================================
        // STRICT MP4 RESULT (NO MORE PHOTOS FOR VIDEO REQUESTS)
        // ============================================================
        if (videoDownloadUrl) {
            return res.json({
                success: true,
                title: `Facebook_${Date.now()}`,
                thumbnail: thumbnail || videoDownloadUrl,
                downloadUrl: videoDownloadUrl,
                formats: [{
                    quality: 'HD Video (MP4)',
                    downloadUrl: videoDownloadUrl,
                    extension: 'mp4',
                    type: 'video'
                }]
            });
        }

        return res.status(400).json({
            success: false,
            error: 'Facebook video stream could not be extracted. Make sure the video or reel is public.'
        });

    } catch (err) {
        console.error('[Facebook] Fatal Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
