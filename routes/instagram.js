const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'Instagram', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

router.post('/download', async (req, res) => {
    let { url } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: 'Instagram URL is required' });
    }

    try {
        const cleanUrl = url.trim().split('?')[0];
        const match = cleanUrl.match(/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
        if (!match) {
            return res.status(400).json({ success: false, error: 'Invalid Instagram URL format' });
        }
        const shortcode = match[1];

        // =======================================================
        // METHOD 1: Direct Instagram GraphQL Mobile App Query
        // (Uses Meta App-ID header to prevent Vercel IP rate limits)
        // =======================================================
        try {
            const gqlRes = await axios.get(`https://www.instagram.com/graphql/query/?query_hash=b3055c01b4b222b8a47dc12b090e4e64&variables=${encodeURIComponent(JSON.stringify({ shortcode }))}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 324.0.0.33.111',
                    'X-IG-App-ID': '936619743392459',
                    'X-ASBD-ID': '129477',
                    'X-IG-WWW-Claim': '0',
                    'Accept': '*/*',
                    'Sec-Fetch-Site': 'same-origin'
                },
                timeout: 7000
            });

            if (gqlRes.data && gqlRes.data.data && gqlRes.data.data.shortcode_media) {
                const media = gqlRes.data.data.shortcode_media;
                const formats = [];

                // 1. Carousel / Multi-slide Post
                if (media.edge_sidecar_to_children && media.edge_sidecar_to_children.edges) {
                    media.edge_sidecar_to_children.edges.forEach((edge, idx) => {
                        const node = edge.node;
                        const isVid = node.is_video;
                        const dl = isVid ? node.video_url : node.display_url;
                        formats.push({
                            quality: `Item ${idx + 1} (${isVid ? 'Video' : 'Photo'})`,
                            downloadUrl: dl,
                            extension: isVid ? 'mp4' : 'jpg',
                            type: isVid ? 'video' : 'photo'
                        });
                    });
                } 
                // 2. Single Reel / Video
                else if (media.is_video && media.video_url) {
                    formats.push({
                        quality: 'HD Quality (MP4)',
                        downloadUrl: media.video_url,
                        extension: 'mp4',
                        type: 'video'
                    });
                } 
                // 3. Single High-Res Photo
                else if (media.display_url) {
                    formats.push({
                        quality: 'HD Photo',
                        downloadUrl: media.display_url,
                        extension: 'jpg',
                        type: 'photo'
                    });
                }

                if (formats.length > 0) {
                    return res.json({
                        success: true,
                        title: `Instagram_${shortcode}`,
                        thumbnail: formats[0].downloadUrl,
                        downloadUrl: formats[0].downloadUrl,
                        formats: formats
                    });
                }
            }
        } catch (_) {}

        // =======================================================
        // METHOD 2: Instagram Internal Web Payload API
        // =======================================================
        try {
            const webRes = await axios.get(`https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                    'X-IG-App-ID': '936619743392459',
                    'Accept': 'application/json'
                },
                timeout: 7000
            });

            if (webRes.data && (webRes.data.items || webRes.data.graphql)) {
                const item = webRes.data.items ? webRes.data.items[0] : webRes.data.graphql.shortcode_media;
                const isVid = item.video_versions || item.is_video;
                const dlUrl = isVid 
                    ? (item.video_versions ? item.video_versions[0].url : item.video_url)
                    : (item.image_versions2 ? item.image_versions2.candidates[0].url : item.display_url);

                if (dlUrl) {
                    return res.json({
                        success: true,
                        title: `Instagram_${shortcode}`,
                        thumbnail: dlUrl,
                        downloadUrl: dlUrl,
                        formats: [{
                            quality: isVid ? 'HD Video' : 'HD Photo',
                            downloadUrl: dlUrl,
                            extension: isVid ? 'mp4' : 'jpg',
                            type: isVid ? 'video' : 'photo'
                        }]
                    });
                }
            }
        } catch (_) {}

        // =======================================================
        // METHOD 3: Reliable Unthrottled Gateway Fallback
        // =======================================================
        try {
            const mirrorUrl = `https://instagram-media-downloader.deno.dev/media?url=https://www.instagram.com/p/${shortcode}/`;
            const mirrorRes = await axios.get(mirrorUrl, { timeout: 8000 });

            if (mirrorRes.data && mirrorRes.data.url) {
                const isVid = mirrorRes.data.type === 'video' || mirrorRes.data.url.includes('.mp4');
                return res.json({
                    success: true,
                    title: `Instagram_${shortcode}`,
                    thumbnail: mirrorRes.data.url,
                    downloadUrl: mirrorRes.data.url,
                    formats: [{
                        quality: isVid ? 'HD Video' : 'HD Photo',
                        downloadUrl: mirrorRes.data.url,
                        extension: isVid ? 'mp4' : 'jpg',
                        type: isVid ? 'video' : 'photo'
                    }]
                });
            }
        } catch (_) {}

        return res.status(400).json({
            success: false,
            error: 'Instagram link could not be parsed. Ensure the reel is public.'
        });

    } catch (err) {
        console.error('Instagram Route Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
