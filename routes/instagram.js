const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'Instagram', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

router.post('/download', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: 'Instagram URL is required' });
    }

    try {
        // Shortcode nikalna: /p/CODE/ ya /reel/CODE/ ya /tv/CODE/
        const match = url.match(/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
        if (!match) {
            return res.status(400).json({ success: false, error: 'Invalid Instagram URL format' });
        }
        const shortcode = match[1];

        // Instagram public embed & direct query request
        const queryUrl = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
        
        const response = await axios.get(queryUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                'Accept': 'application/json, text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Sec-Fetch-Site': 'same-origin',
                'X-Requested-With': 'XMLHttpRequest'
            },
            timeout: 10000
        }).catch(() => null);

        let formats = [];
        let title = `Instagram_${shortcode}`;
        let thumbnail = '';

        if (response && response.data) {
            const items = response.data.graphql ? response.data.graphql.shortcode_media : (response.data.items ? response.data.items[0] : null);

            if (items) {
                // Caption / Title
                if (items.caption) {
                    title = items.caption.text || title;
                } else if (items.edge_media_to_caption && items.edge_media_to_caption.edges.length > 0) {
                    title = items.edge_media_to_caption.edges[0].node.text;
                }

                // Carousel Handling
                if (items.carousel_media || (items.edge_sidecar_to_children && items.edge_sidecar_to_children.edges)) {
                    const sidecar = items.carousel_media || items.edge_sidecar_to_children.edges.map(e => e.node);
                    sidecar.forEach((node, idx) => {
                        const isVid = node.video_versions || node.is_video;
                        const dl = isVid 
                            ? (node.video_versions ? node.video_versions[0].url : node.video_url)
                            : (node.image_versions2 ? node.image_versions2.candidates[0].url : node.display_url);
                        
                        formats.push({
                            quality: `Item ${idx + 1} (${isVid ? 'Video' : 'Photo'})`,
                            downloadUrl: dl,
                            extension: isVid ? 'mp4' : 'jpg',
                            type: isVid ? 'video' : 'photo'
                        });
                    });
                } 
                // Single Video / Reel
                else if (items.is_video || items.video_versions) {
                    const dl = items.video_versions ? items.video_versions[0].url : items.video_url;
                    thumbnail = items.image_versions2 ? items.image_versions2.candidates[0].url : items.display_url;
                    formats.push({
                        quality: 'HD Video',
                        downloadUrl: dl,
                        extension: 'mp4',
                        type: 'video'
                    });
                } 
                // Single Photo
                else {
                    const dl = items.image_versions2 ? items.image_versions2.candidates[0].url : items.display_url;
                    thumbnail = dl;
                    formats.push({
                        quality: 'HD Photo',
                        downloadUrl: dl,
                        extension: 'jpg',
                        type: 'photo'
                    });
                }
            }
        }

        // Fallback: Public Media Proxy Endpoint
        if (formats.length === 0) {
            const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
            const embedRes = await axios.get(embedUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 10000
            });

            const html = embedRes.data;
            const videoMatch = html.match(/"video_url":"([^"]+)"/);
            const imageMatch = html.match(/"display_url":"([^"]+)"/);

            if (videoMatch) {
                const videoUrl = JSON.parse(`"${videoMatch[1]}"`);
                formats.push({
                    quality: 'HD Video',
                    downloadUrl: videoUrl,
                    extension: 'mp4',
                    type: 'video'
                });
            } else if (imageMatch) {
                const imageUrl = JSON.parse(`"${imageMatch[1]}"`);
                formats.push({
                    quality: 'HD Photo',
                    downloadUrl: imageUrl,
                    extension: 'jpg',
                    type: 'photo'
                });
            }
        }

        if (formats.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Could not extract direct media. Post may be private or restricted.'
            });
        }

        return res.json({
            success: true,
            title: title.length > 60 ? title.substring(0, 60) + '...' : title,
            thumbnail: thumbnail || formats[0].downloadUrl,
            downloadUrl: formats[0].downloadUrl,
            formats: formats
        });

    } catch (err) {
        console.error('Instagram Route Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
