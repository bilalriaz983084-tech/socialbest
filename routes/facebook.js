const express = require('express');
const router = express.Router();
const { ApifyClient } = require('apify-client');
const axios = require('axios');

// Apify Client setup (Wohi token jo Instagram ke liye chal raha hai)
const client = new ApifyClient({
    token: process.env.APIFY_TOKEN || 'YOUR_APIFY_API_TOKEN_HERE',
});

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook (Apify)', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

// Helper: Resolve Facebook share/short URLs
async function resolveFacebookUrl(inputUrl) {
    try {
        let clean = inputUrl.trim();
        const res = await axios.get(clean, {
            headers: {
                'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            maxRedirects: 10,
            timeout: 4500,
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
        }

        console.log(`[Facebook Apify] Processing URL: ${targetUrl}`);

        // Actor configuration optimized for instant single-post extraction
        const input = {
            startUrls: [{ url: targetUrl }],
            resultsLimit: 1,
            captionText: false
        };

        // Run Facebook Posts Scraper Actor (KoJrdxJCTtpon81KY)
        const run = await client.actor("KoJrdxJCTtpon81KY").call(input, {
            timeoutSecs: 25
        });

        const { items } = await client.dataset(run.defaultDatasetId).listItems();

        if (!items || items.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Could not fetch media. Please make sure the Facebook post is public.'
            });
        }

        const post = items[0];

        // 🌟 1. Video Check (Reels / Watch / Post Videos)
        const videoUrl = post.videoUrl || post.video_url || post.media?.find(m => m.type === 'video')?.url;
        const thumbnail = post.thumbnail || post.thumbnailUrl || post.image || null;

        if (videoUrl) {
            console.log('[Facebook Apify] Video extracted successfully');
            return res.json({
                success: true,
                type: 'video',
                title: post.text ? post.text.slice(0, 40) : `Facebook_Video_${Date.now()}`,
                thumbnail: thumbnail || videoUrl,
                downloadUrl: videoUrl,
                formats: [{
                    quality: 'HD Video (MP4)',
                    downloadUrl: videoUrl,
                    extension: 'mp4',
                    type: 'video'
                }]
            });
        }

        // 🌟 2. Photo / Album Check (Images Only)
        let images = [];
        if (post.imageUrl) images.push(post.imageUrl);
        if (post.images && Array.isArray(post.images)) {
            images.push(...post.images.map(img => typeof img === 'string' ? img : img.url));
        }
        if (post.media && Array.isArray(post.media)) {
            const mediaImgs = post.media.filter(m => m.type === 'photo' || m.type === 'image').map(m => m.url);
            images.push(...mediaImgs);
        }

        // Remove duplicates
        images = [...new Set(images.filter(Boolean))];

        if (images.length > 0) {
            console.log(`[Facebook Apify] Extracted ${images.length} photos successfully`);
            return res.json({
                success: true,
                type: 'image',
                title: post.text ? post.text.slice(0, 40) : `Facebook_Photo_${Date.now()}`,
                thumbnail: images[0],
                downloadUrl: images[0],
                images: images,
                formats: images.map((imgUrl, index) => ({
                    quality: `HD Photo ${index + 1} (JPG)`,
                    downloadUrl: imgUrl,
                    extension: 'jpg',
                    type: 'photo'
                }))
            });
        }

        return res.status(400).json({
            success: false,
            error: 'No downloadable video or photo stream found in this post.'
        });

    } catch (err) {
        console.error('[Facebook Apify Fatal Error]:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
