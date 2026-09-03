const express = require('express');
const router = express.Router();
const { ApifyClient } = require('apify-client');
const axios = require('axios');

const APIFY_TOKEN = process.env.APIFY_TOKEN || process.env.APIFY_API_TOKEN || '';

const client = new ApifyClient({
    token: APIFY_TOKEN,
});

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook (Apify Safe)', status: 'Connected', timestamp: new Date().toISOString() });
});

// Helper: Canonical resolver
async function resolveFacebookUrl(inputUrl) {
    try {
        let clean = inputUrl.trim();
        const res = await axios.get(clean, {
            headers: {
                'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            maxRedirects: 10,
            timeout: 3000,
            validateStatus: (status) => status >= 200 && status < 400
        });

        const html = typeof res.data === 'string' ? res.data : '';
        const ogMatch = html.match(/property="og:url"\s+content="([^"]+)"/i) || 
                        html.match(/content="([^"]+)"\s+property="og:url"/i);

        if (ogMatch && ogMatch[1] && !ogMatch[1].includes('/share/')) {
            return ogMatch[1].split('?')[0];
        }

        if (res.request?.res?.responseUrl && !res.request.res.responseUrl.includes('/share/')) {
            return res.request.res.responseUrl.split('?')[0];
        }
    } catch (_) {}
    return inputUrl.split('?')[0];
}

router.post('/download', async (req, res) => {
    const rawUrl = req.body?.url || req.body?.link || req.body?.videoUrl || req.query?.url;
    
    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
        return res.status(400).json({ 
            success: false, 
            error: 'Facebook URL is required and must be a valid string.' 
        });
    }

    try {
        let targetUrl = rawUrl.trim();
        if (targetUrl.includes('/share/') || targetUrl.includes('fb.watch')) {
            targetUrl = await resolveFacebookUrl(targetUrl);
        } else {
            targetUrl = targetUrl.split('?')[0];
        }

        console.log(`[Facebook] Target Clean URL: ${targetUrl}`);

        let videoDownloadUrl = null;
        let thumbnail = null;

        // ============================================================
        // 🌟 ENGINE 1: Apify Fast Execution (Strict 7s Timeout to beat Vercel kill)
        // ============================================================
        if (APIFY_TOKEN) {
            try {
                // Call actor with max 8 seconds runtime
                const run = await client.actor("KoJrdxJCTtpon81KY").call({
                    startUrls: [{ url: targetUrl }],
                    resultsLimit: 1,
                    captionText: false
                }, {
                    timeoutSecs: 8,
                    waitSecs: 7
                });

                if (run && run.defaultDatasetId) {
                    const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: 1 });
                    if (items && items.length > 0) {
                        const post = items[0];
                        videoDownloadUrl = post.videoUrl || post.video_url || post.media?.find(m => m.type === 'video')?.url;
                        thumbnail = post.thumbnail || post.thumbnailUrl || post.image || null;
                    }
                }
            } catch (apifyErr) {
                console.log('[Facebook] Apify run timeout or skipped:', apifyErr.message);
            }
        }

        // ============================================================
        // 🌟 ENGINE 2: Direct High-Speed Video Extractor (< 2s)
        // ============================================================
        if (!videoDownloadUrl) {
            try {
                const headRes = await axios.get(targetUrl, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
                        'Accept-Language': 'en-US,en;q=0.9'
                    },
                    timeout: 2500
                });

                const html = headRes.data;
                const hdMatch = html.match(/"browser_native_hd_url":"([^"]+)"/) || html.match(/"playable_url_quality_hd":"([^"]+)"/);
                const sdMatch = html.match(/"browser_native_sd_url":"([^"]+)"/) || html.match(/"playable_url":"([^"]+)"/);
                const thumbMatch = html.match(/"preferred_thumbnail":{"image":{"uri":"([^"]+)"/);

                const chosen = hdMatch ? hdMatch[1] : (sdMatch ? sdMatch[1] : null);
                if (chosen) {
                    videoDownloadUrl = JSON.parse(`"${chosen}"`);
                    if (thumbMatch && thumbMatch[1]) {
                        thumbnail = JSON.parse(`"${thumbMatch[1]}"`);
                    }
                }
            } catch (_) {}
        }

        // ============================================================
        // STRICT MP4 RESPONSE (Guarantees no 500 error)
        // ============================================================
        if (videoDownloadUrl) {
            return res.json({
                success: true,
                type: 'video',
                title: `Facebook_Video_${Date.now()}`,
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
            error: 'Facebook video extraction timed out or link is private. Please try again.'
        });

    } catch (err) {
        console.error('[Facebook Final Error]:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
