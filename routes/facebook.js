const express = require('express');
const router = express.Router();
const { ApifyClient } = require('apify-client');
const axios = require('axios');

const APIFY_TOKEN = process.env.APIFY_API_TOKEN || 'apify_api_QigZyIwNVCerPEctLzFxffpTXt6jnF48DGlI';

const apifyClient = new ApifyClient({
    token: APIFY_TOKEN,
});

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

// Helper: Short links expand karein aur tracking query parameters remove karein
async function cleanAndExpandFacebookUrl(rawUrl) {
    let clean = rawUrl.trim();

    if (clean.includes('facebook.com') && clean.includes('?')) {
        clean = clean.split('?')[0];
    }

    if (clean.includes('fb.watch') || clean.includes('/share/')) {
        try {
            const headRes = await axios.get(clean, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                maxRedirects: 5,
                timeout: 4000
            });
            const redirected = headRes.request?.res?.responseUrl;
            if (redirected) {
                clean = redirected.split('?')[0];
            }
        } catch (_) {}
    }

    return clean;
}

router.post('/download', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'Facebook URL is required' });

    try {
        const targetUrl = await cleanAndExpandFacebookUrl(url);

        // ============================================================
        // 🌟 METHOD 1: FastDL Gateway (Instant Sub-2s Response)
        // ============================================================
        try {
            const fdlRes = await axios.post('https://api.fastdl.app/api/convert', {
                url: targetUrl
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Origin': 'https://fastdl.app',
                    'Referer': 'https://fastdl.app/'
                },
                timeout: 4500
            });

            if (fdlRes.data && fdlRes.data.url) {
                const results = Array.isArray(fdlRes.data.url) ? fdlRes.data.url : [fdlRes.data.url];
                const formats = [];

                results.forEach((entry, idx) => {
                    const dl = entry.url || entry;
                    if (dl) {
                        const isHd = entry.name?.toLowerCase().includes('hd') || dl.includes('_hd');
                        formats.push({
                            quality: isHd ? 'HD Quality (MP4)' : `SD Quality (MP4) ${idx > 0 ? idx + 1 : ''}`.trim(),
                            downloadUrl: dl,
                            extension: 'mp4',
                            type: 'video'
                        });
                    }
                });

                if (formats.length > 0) {
                    return res.json({
                        success: true,
                        title: `Facebook_${Date.now()}`,
                        thumbnail: formats[0].downloadUrl,
                        downloadUrl: formats[0].downloadUrl,
                        formats: formats
                    });
                }
            }
        } catch (_) {}

        // ============================================================
        // 🌟 METHOD 2: SnapSave Public Form Resolver (< 3s)
        // ============================================================
        try {
            const snapRes = await axios.post('https://snapsave.app/action.php',
                new URLSearchParams({ url: targetUrl }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36'
                    },
                    timeout: 4500
                }
            );

            const html = snapRes.data;
            if (typeof html === 'string') {
                const hdMatch = html.match(/href="([^"]+)"[^>]*>Render/i) || 
                                html.match(/href="([^"]+)"[^>]*>Download<\/a>/i) ||
                                html.match(/href="([^"]+)" class="button is-success/i);

                if (hdMatch && hdMatch[1]) {
                    const dlUrl = hdMatch[1].replace(/&amp;/g, '&');
                    return res.json({
                        success: true,
                        title: `Facebook_${Date.now()}`,
                        thumbnail: dlUrl,
                        downloadUrl: dlUrl,
                        formats: [{
                            quality: 'HD Video (MP4)',
                            downloadUrl: dlUrl,
                            extension: 'mp4',
                            type: 'video'
                        }]
                    });
                }
            }
        } catch (_) {}

        // ============================================================
        // 🌟 METHOD 3: Verified Apify Actor (ID: AtBpiepuIUNs2k2ku)
        // ============================================================
        if (APIFY_TOKEN) {
            try {
                const input = {
                    "startUrls": [{ "url": targetUrl }],
                    "scrapePhotos": false,
                    "sortType": "new_posts",
                    "cursors": [],
                    "outputFormat": "raw",
                    "minDelay": 1,
                    "maxDelay": 5,
                    "proxy": {
                        "useApifyProxy": true
                    }
                };

                const run = await apifyClient.actor("AtBpiepuIUNs2k2ku").call(input, {
                    waitSecs: 7
                });

                const { items } = await apifyClient.dataset(run.defaultDatasetId).listItems();

                if (items && items.length > 0) {
                    const post = items[0];
                    const videoUrl = post.videoUrl || 
                                     post.media?.[0]?.videoUrl || 
                                     post.attachments?.[0]?.url || 
                                     post.attachments?.[0]?.playable_url;

                    if (videoUrl) {
                        return res.json({
                            success: true,
                            title: `Facebook_${Date.now()}`,
                            thumbnail: videoUrl,
                            downloadUrl: videoUrl,
                            formats: [{
                                quality: 'HD Video (MP4)',
                                downloadUrl: videoUrl,
                                extension: 'mp4',
                                type: 'video'
                            }]
                        });
                    }
                }
            } catch (apifyErr) {
                console.error('Apify Facebook Error:', apifyErr.message);
            }
        }

        return res.status(400).json({
            success: false,
            error: 'Facebook video could not be parsed. Verify the video is public.'
        });

    } catch (err) {
        console.error('Facebook Route Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
