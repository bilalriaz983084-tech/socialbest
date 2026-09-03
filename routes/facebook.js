const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected', timestamp: new Date().toISOString() });
});

// Helper: Decode packed JavaScript returned by scraper engines
function decodePacked(p, a, c, k) {
    while (c--) {
        if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
    }
    return p;
}

router.post('/download', async (req, res) => {
    const rawUrl = req.body.url || req.body.link || req.body.videoUrl || req.query.url;
    if (!rawUrl) return res.status(400).json({ success: false, error: 'Facebook URL is required' });

    let targetUrl = rawUrl.trim();
    if (targetUrl.includes('?')) targetUrl = targetUrl.split('?')[0];

    try {
        // ============================================================
        // 🌟 ENGINE 1: SnapSave Production Form Resolver
        // ============================================================
        try {
            const formData = new URLSearchParams();
            formData.append('url', targetUrl);

            const snap = await axios.post('https://snapsave.app/action.php', formData.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Referer': 'https://snapsave.app/'
                },
                timeout: 5000
            });

            let data = snap.data;
            if (typeof data === 'string' && data.includes('eval(function(')) {
                const match = data.match(/\}\s*\(\s*"([^"]+)"\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*"([^"]+)"\.split\('\|'\)/);
                if (match) {
                    data = decodePacked(match[1], parseInt(match[2]), parseInt(match[3]), match[4].split('|'));
                }
            }

            if (typeof data === 'string') {
                // Sirf MP4 video link pakdo
                const videoMatch = data.match(/href="([^"]+)"[^>]*class="button is-success/i) ||
                                   data.match(/href="([^"]+)"[^>]*>Download<\/a>/i);

                if (videoMatch && videoMatch[1]) {
                    const cleanVideoUrl = videoMatch[1].replace(/&amp;/g, '&');
                    return res.json({
                        success: true,
                        title: `Facebook_${Date.now()}`,
                        thumbnail: cleanVideoUrl,
                        downloadUrl: cleanVideoUrl,
                        formats: [{
                            quality: 'HD Video (MP4)',
                            downloadUrl: cleanVideoUrl,
                            extension: 'mp4',
                            type: 'video'
                        }]
                    });
                }
            }
        } catch (e) {
            console.log('SnapSave failed:', e.message);
        }

        // ============================================================
        // 🌟 ENGINE 2: Publer Direct Social Media Fetcher
        // ============================================================
        try {
            const publerRes = await axios.post('https://publer.io/api/v1/tools/job/downloader', {
                url: targetUrl
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 4000
            });

            if (publerRes.data && publerRes.data.payload) {
                const media = publerRes.data.payload;
                const videoItem = media.find(m => m.type === 'video' || m.path.includes('.mp4'));

                if (videoItem) {
                    return res.json({
                        success: true,
                        title: `Facebook_${Date.now()}`,
                        thumbnail: videoItem.thumbnail || videoItem.path,
                        downloadUrl: videoItem.path,
                        formats: [{
                            quality: 'HD Video (MP4)',
                            downloadUrl: videoItem.path,
                            extension: 'mp4',
                            type: 'video'
                        }]
                    });
                }
            }
        } catch (e) {
            console.log('Publer failed:', e.message);
        }

        return res.status(400).json({
            success: false,
            error: 'Unable to extract video stream. Facebook has blocked this specific link from datacenter IPs.'
        });

    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
