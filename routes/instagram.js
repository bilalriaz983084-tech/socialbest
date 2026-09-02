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
        // Fallback 1: Multi-Instance Modern API Provider
        const instances = [
            'https://api.cobalt.tools',
            'https://cobalt-api.kwiatekm.tokyo',
            'https://api.wuk.sh'
        ];

        let streamData = null;

        for (const instance of instances) {
            try {
                const response = await axios.post(`${instance}/`, {
                    url: url.trim(),
                    videoQuality: 'max'
                }, {
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                    },
                    timeout: 8000
                });

                if (response.data && (response.data.url || response.data.picker)) {
                    streamData = response.data;
                    break;
                }
            } catch (e) {
                // Continue to next mirror if one fails
                continue;
            }
        }

        // Agar modern provider se response mil jaye
        if (streamData) {
            const formats = [];

            // Case A: Multi-item Carousel / Picker
            if (streamData.picker && Array.isArray(streamData.picker)) {
                streamData.picker.forEach((item, index) => {
                    const isVid = item.type === 'video';
                    formats.push({
                        quality: `Item ${index + 1} (${isVid ? 'Video' : 'Photo'})`,
                        downloadUrl: item.url,
                        extension: isVid ? 'mp4' : 'jpg',
                        type: isVid ? 'video' : 'photo'
                    });
                });
            } 
            // Case B: Single Video / Photo
            else if (streamData.url) {
                const isPhoto = streamData.url.includes('.jpg') || streamData.url.includes('.webp') || streamData.url.includes('.png');
                formats.push({
                    quality: isPhoto ? 'HD Photo' : 'HD Video',
                    downloadUrl: streamData.url,
                    extension: isPhoto ? 'jpg' : 'mp4',
                    type: isPhoto ? 'photo' : 'video'
                });
            }

            if (formats.length > 0) {
                return res.json({
                    success: true,
                    title: `Instagram_${Date.now()}`,
                    thumbnail: formats[0].downloadUrl,
                    downloadUrl: formats[0].downloadUrl,
                    formats: formats
                });
            }
        }

        // Fallback 2: Direct Graph / Embed Scraper
        const match = url.match(/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
        if (match) {
            const shortcode = match[1];
            const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/`;
            
            const htmlRes = await axios.get(embedUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 8000
            });

            const html = htmlRes.data;
            const videoMatch = html.match(/"video_url":"([^"]+)"/);
            const imageMatch = html.match(/class="EmbeddedMediaImage" src="([^"]+)"/);

            if (videoMatch) {
                const cleanVideo = JSON.parse(`"${videoMatch[1]}"`);
                return res.json({
                    success: true,
                    title: `Instagram_Reel_${shortcode}`,
                    thumbnail: cleanVideo,
                    downloadUrl: cleanVideo,
                    formats: [{
                        quality: 'HD Video',
                        downloadUrl: cleanVideo,
                        extension: 'mp4',
                        type: 'video'
                    }]
                });
            }

            if (imageMatch) {
                const cleanImage = imageMatch[1].replace(/&amp;/g, '&');
                return res.json({
                    success: true,
                    title: `Instagram_Photo_${shortcode}`,
                    thumbnail: cleanImage,
                    downloadUrl: cleanImage,
                    formats: [{
                        quality: 'HD Photo',
                        downloadUrl: cleanImage,
                        extension: 'jpg',
                        type: 'photo'
                    }]
                });
            }
        }

        return res.status(400).json({
            success: false,
            error: 'Instagram link could not be parsed. Post might be private.'
        });

    } catch (err) {
        console.error('Instagram Route Handler Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
