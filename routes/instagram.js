const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'Instagram', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

router.post('/download', async (req, res) => {
    let { url } = req.body;
    if (!url) return res.status(400).json({ success: false, error: 'Instagram URL is required' });

    try {
        const cleanUrl = url.trim().split('?')[0];
        const match = cleanUrl.match(/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
        if (!match) return res.status(400).json({ success: false, error: 'Invalid Instagram URL format' });
        const shortcode = match[1];

        // ENGINE 1: GraphQL Multi-Item Parser (Carousel / Multi-Video / Multi-Photo)
        try {
            const gqlRes = await axios.get(`https://www.instagram.com/graphql/query/?query_hash=b3055c01b4b222b8a47dc12b090e4e64&variables=${encodeURIComponent(JSON.stringify({ shortcode }))}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)',
                    'X-IG-App-ID': '936619743392459'
                },
                timeout: 8000
            });

            if (gqlRes.data && gqlRes.data.data && gqlRes.data.data.shortcode_media) {
                const media = gqlRes.data.data.shortcode_media;
                const formats = [];

                // Multi-Items (Carousel / Slideshow)
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
                // Single Video
                else if (media.is_video && media.video_url) {
                    formats.push({
                        quality: 'HD Video (MP4)',
                        downloadUrl: media.video_url,
                        extension: 'mp4',
                        type: 'video'
                    });
                } 
                // Single Image
                else if (media.display_url) {
                    formats.push({
                        quality: 'HD Photo (JPG)',
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

        // ENGINE 2: FastDL Direct Fallback
        const apiRes = await axios.post('https://api.fastdl.app/api/convert', {
            url: `https://www.instagram.com/reel/${shortcode}/`
        }, {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            },
            timeout: 8000
        }).catch(() => null);

        if (apiRes && apiRes.data && apiRes.data.url) {
            const results = Array.isArray(apiRes.data.url) ? apiRes.data.url : [apiRes.data.url];
            const formats = results.map((item, idx) => {
                const dl = item.url || item;
                const isVid = dl.includes('.mp4') || (item.type && item.type === 'video');
                return {
                    quality: results.length > 1 ? `Item ${idx + 1} (${isVid ? 'Video' : 'Photo'})` : (isVid ? 'HD Video' : 'HD Photo'),
                    downloadUrl: dl,
                    extension: isVid ? 'mp4' : 'jpg',
                    type: isVid ? 'video' : 'photo'
                };
            });

            return res.json({
                success: true,
                title: `Instagram_${shortcode}`,
                thumbnail: formats[0].downloadUrl,
                downloadUrl: formats[0].downloadUrl,
                formats: formats
            });
        }

        return res.status(400).json({ success: false, error: 'Instagram link could not be parsed. Verify the reel is public.' });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
