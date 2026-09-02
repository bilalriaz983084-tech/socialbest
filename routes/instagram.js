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
        // Clean URL to base post/reel path
        let cleanUrl = url.split('?')[0].trim();
        if (!cleanUrl.endsWith('/')) cleanUrl += '/';

        const match = cleanUrl.match(/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
        if (!match) {
            return res.status(400).json({ success: false, error: 'Invalid Instagram URL format' });
        }
        const shortcode = match[1];

        // METHOD 1: Fast Unblocked Gateway (DDInstagram JSON API)
        try {
            const ddApi = `https://api.ddinstagram.com/videos/${shortcode}`;
            const ddRes = await axios.get(ddApi, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                timeout: 8000
            });

            if (ddRes.data && ddRes.data.direct_url) {
                return res.json({
                    success: true,
                    title: `Instagram_${shortcode}`,
                    thumbnail: ddRes.data.direct_url,
                    downloadUrl: ddRes.data.direct_url,
                    formats: [{
                        quality: 'HD Video',
                        downloadUrl: ddRes.data.direct_url,
                        extension: 'mp4',
                        type: 'video'
                    }]
                });
            }
        } catch (e) {
            // Fall through to next method
        }

        // METHOD 2: Multi-Mirror Engine
        const mirrors = [
            'https://cobalt-api.kwiatekm.tokyo',
            'https://api.wuk.sh',
            'https://api.cobalt.tools'
        ];

        for (const mirror of mirrors) {
            try {
                const mirrorRes = await axios.post(`${mirror}/`, {
                    url: cleanUrl,
                    videoQuality: 'max'
                }, {
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json'
                    },
                    timeout: 8000
                });

                if (mirrorRes.data) {
                    // Carousel / Multi-photos
                    if (mirrorRes.data.picker && Array.isArray(mirrorRes.data.picker)) {
                        const formats = mirrorRes.data.picker.map((item, idx) => ({
                            quality: `Item ${idx + 1}`,
                            downloadUrl: item.url,
                            extension: item.type === 'video' ? 'mp4' : 'jpg',
                            type: item.type === 'video' ? 'video' : 'photo'
                        }));

                        return res.json({
                            success: true,
                            title: `Instagram_${shortcode}`,
                            thumbnail: formats[0].downloadUrl,
                            downloadUrl: formats[0].downloadUrl,
                            formats: formats
                        });
                    }

                    // Single Media
                    if (mirrorRes.data.url) {
                        const isPhoto = mirrorRes.data.url.includes('.jpg') || mirrorRes.data.url.includes('.webp');
                        return res.json({
                            success: true,
                            title: `Instagram_${shortcode}`,
                            thumbnail: mirrorRes.data.url,
                            downloadUrl: mirrorRes.data.url,
                            formats: [{
                                quality: isPhoto ? 'HD Photo' : 'HD Video',
                                downloadUrl: mirrorRes.data.url,
                                extension: isPhoto ? 'jpg' : 'mp4',
                                type: isPhoto ? 'photo' : 'video'
                            }]
                        });
                    }
                }
            } catch (e) {
                continue;
            }
        }

        // METHOD 3: Public Graph Fallback
        const graphUrl = `https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`;
        const graphRes = await axios.get(graphUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
                'Accept': 'application/json'
            },
            timeout: 6000
        }).catch(() => null);

        if (graphRes && graphRes.data) {
            const item = graphRes.data.items ? graphRes.data.items[0] : (graphRes.data.graphql ? graphRes.data.graphql.shortcode_media : null);
            if (item) {
                const vid = item.video_versions ? item.video_versions[0].url : (item.video_url || null);
                const pic = item.image_versions2 ? item.image_versions2.candidates[0].url : (item.display_url || null);
                const finalUrl = vid || pic;

                if (finalUrl) {
                    return res.json({
                        success: true,
                        title: `Instagram_${shortcode}`,
                        thumbnail: finalUrl,
                        downloadUrl: finalUrl,
                        formats: [{
                            quality: vid ? 'HD Video' : 'HD Photo',
                            downloadUrl: finalUrl,
                            extension: vid ? 'mp4' : 'jpg',
                            type: vid ? 'video' : 'photo'
                        }]
                    });
                }
            }
        }

        return res.status(400).json({
            success: false,
            error: 'Instagram link could not be parsed. Make sure the profile is not private.'
        });

    } catch (err) {
        console.error('Instagram Route Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
