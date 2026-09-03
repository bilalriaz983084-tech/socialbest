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
        let cleanUrl = url.trim().split('?')[0];
        const match = cleanUrl.match(/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
        if (!match) return res.status(400).json({ success: false, error: 'Invalid Instagram URL format' });
        
        const shortcode = match[1];

        // 🌟 GATEWAY 1: Instagram Mobile Android Internal Endpoint
        try {
            const mobileRes = await axios.get(`https://www.instagram.com/p/${shortcode}/?__a=1&__d=dis`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Linux; Android 14; SM-S928B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.6261.64 Mobile Safari/537.36 Instagram 321.0.0.39.108',
                    'Accept': '*/*',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Sec-Fetch-Mode': 'cors',
                    'X-IG-App-ID': '936619743392459'
                },
                timeout: 8000
            });

            const items = mobileRes.data?.items || mobileRes.data?.graphql?.shortcode_media;
            if (items) {
                const item = Array.isArray(items) ? items[0] : items;
                const formats = [];

                // 1. Check Carousels / Slideshow
                const carouselMedia = item.carousel_media || item.edge_sidecar_to_children?.edges;
                if (carouselMedia && carouselMedia.length > 0) {
                    carouselMedia.forEach((cItem, idx) => {
                        const node = cItem.node || cItem;
                        const isVid = node.video_versions?.length > 0 || node.is_video;
                        const dlUrl = isVid 
                            ? (node.video_versions ? node.video_versions[0].url : node.video_url)
                            : (node.image_versions2 ? node.image_versions2.candidates[0].url : node.display_url);

                        formats.push({
                            quality: `Item ${idx + 1} (${isVid ? 'Video' : 'Photo'})`,
                            downloadUrl: dlUrl,
                            extension: isVid ? 'mp4' : 'jpg',
                            type: isVid ? 'video' : 'photo'
                        });
                    });
                }
                // 2. Single Video / Reel
                else if (item.video_versions?.length > 0 || item.video_url) {
                    const vidUrl = item.video_versions ? item.video_versions[0].url : item.video_url;
                    formats.push({
                        quality: 'HD Video (MP4)',
                        downloadUrl: vidUrl,
                        extension: 'mp4',
                        type: 'video'
                    });
                }
                // 3. Single Photo
                else if (item.image_versions2?.candidates?.length > 0 || item.display_url) {
                    const imgUrl = item.image_versions2 ? item.image_versions2.candidates[0].url : item.display_url;
                    formats.push({
                        quality: 'HD Photo (JPG)',
                        downloadUrl: imgUrl,
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

        // 🌟 GATEWAY 2: Cobalt V10 Stream Aggregator (Bypasses Datacenter Blocks)
        const cobaltMirrors = [
            'https://cobalt-api.kwiatekm.tokyo',
            'https://api.wuk.sh'
        ];

        for (const mirror of cobaltMirrors) {
            try {
                const cobRes = await axios.post(`${mirror}/`, {
                    url: `https://www.instagram.com/p/${shortcode}/`,
                    videoQuality: 'max'
                }, {
                    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                    timeout: 8000
                });

                if (cobRes.data && cobRes.data.url) {
                    return res.json({
                        success: true,
                        title: `Instagram_${shortcode}`,
                        thumbnail: cobRes.data.url,
                        downloadUrl: cobRes.data.url,
                        formats: [{
                            quality: 'HD Quality (MP4)',
                            downloadUrl: cobRes.data.url,
                            extension: 'mp4',
                            type: 'video'
                        }]
                    });
                } else if (cobRes.data && cobRes.data.picker) {
                    const formats = cobRes.data.picker.map((p, idx) => ({
                        quality: `Item ${idx + 1} (${p.type === 'photo' ? 'Photo' : 'Video'})`,
                        downloadUrl: p.url,
                        extension: p.type === 'photo' ? 'jpg' : 'mp4',
                        type: p.type === 'photo' ? 'photo' : 'video'
                    }));

                    return res.json({
                        success: true,
                        title: `Instagram_${shortcode}`,
                        thumbnail: formats[0].downloadUrl,
                        downloadUrl: formats[0].downloadUrl,
                        formats: formats
                    });
                }
            } catch (_) {
                continue;
            }
        }

        // 🌟 GATEWAY 3: SnapInsta Web Form Gateway
        try {
            const snapRes = await axios.post('https://snapinsta.app/action.php',
                new URLSearchParams({ url: `https://www.instagram.com/reel/${shortcode}/`, action: 'post' }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
                    },
                    timeout: 8000
                }
            );

            if (snapRes.data) {
                const vidMatch = snapRes.data.match(/href="([^"]+)" class="btn download-media/);
                if (vidMatch && vidMatch[1]) {
                    const dlUrl = vidMatch[1].replace(/&amp;/g, '&');
                    return res.json({
                        success: true,
                        title: `Instagram_${shortcode}`,
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

        return res.status(400).json({
            success: false,
            error: 'Instagram link could not be parsed. Verify the reel is public.'
        });

    } catch (err) {
        console.error('Instagram Route Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
