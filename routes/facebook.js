const express = require('express');
const router = express.Router();
const axios = require('axios');

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

router.post('/download', async (req, res) => {
    let { url } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: 'Facebook URL is required' });
    }

    try {
        let targetUrl = url.trim();

        // 🌟 Step 1: Follow /share/ and fb.watch redirects to get actual post ID
        if (targetUrl.includes('/share/') || targetUrl.includes('fb.watch')) {
            try {
                const headRes = await axios.get(targetUrl, {
                    maxRedirects: 5,
                    validateStatus: null,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
                    },
                    timeout: 6000
                });
                if (headRes.request && headRes.request.res && headRes.request.res.responseUrl) {
                    targetUrl = headRes.request.res.responseUrl;
                }
            } catch (_) {}
        }

        // Detect if link is a Photo/Post
        const isPhotoUrl = targetUrl.includes('/photo') || targetUrl.includes('/posts/') || targetUrl.includes('fbid=');

        // 🌟 Step 2: Native HTML Scrape
        const pageRes = await axios.get(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Sec-Fetch-Site': 'none'
            },
            timeout: 9000
        }).catch(() => null);

        if (pageRes && pageRes.data) {
            const html = pageRes.data;

            // CASE A: PHOTO EXTRACTION
            if (isPhotoUrl) {
                // Check multiple high-res image patterns in HTML
                const imageMatches = [
                    html.match(/property="og:image"\s+content="([^"]+)"/),
                    html.match(/content="([^"]+)"\s+property="og:image"/),
                    html.match(/"image":\{"uri":"([^"]+)"\}/),
                    html.match(/data-visualcompletion="media-vc-image"\s+src="([^"]+)"/)
                ];

                for (const match of imageMatches) {
                    if (match && match[1]) {
                        let cleanPhoto = match[1].replace(/&amp;/g, '&');
                        if (cleanPhoto.startsWith('http')) {
                            cleanPhoto = cleanPhoto.replace(/\\/g, '');
                            return res.json({
                                success: true,
                                title: `Facebook_Photo_${Date.now()}`,
                                thumbnail: cleanPhoto,
                                downloadUrl: cleanPhoto,
                                formats: [{
                                    quality: 'HD Photo',
                                    downloadUrl: cleanPhoto,
                                    extension: 'jpg',
                                    type: 'photo'
                                }]
                            });
                        }
                    }
                }
            }

            // CASE B: VIDEO EXTRACTION (Zero duplicates - strict single selection)
            const hdMatch = html.match(/playable_url_quality_hd":"([^"]+)"/);
            const sdMatch = html.match(/playable_url":"([^"]+)"/);

            let videoUrl = null;
            let qualityLabel = 'HD Video';

            if (hdMatch) {
                videoUrl = JSON.parse(`"${hdMatch[1]}"`);
                qualityLabel = 'HD Quality (MP4)';
            } else if (sdMatch) {
                videoUrl = JSON.parse(`"${sdMatch[1]}"`);
                qualityLabel = 'SD Quality (MP4)';
            }

            if (videoUrl) {
                return res.json({
                    success: true,
                    title: `Facebook_Video_${Date.now()}`,
                    thumbnail: videoUrl,
                    downloadUrl: videoUrl,
                    formats: [{
                        quality: qualityLabel,
                        downloadUrl: videoUrl,
                        extension: 'mp4',
                        type: 'video'
                    }]
                });
            }
        }

        // 🌟 Step 3: Mirror Fallback (Used only if native scraping fails)
        const mirrors = [
            'https://cobalt-api.kwiatekm.tokyo',
            'https://api.wuk.sh'
        ];

        for (const mirror of mirrors) {
            try {
                const mirrorRes = await axios.post(`${mirror}/`, {
                    url: targetUrl,
                    videoQuality: 'max'
                }, {
                    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                    timeout: 7000
                });

                if (mirrorRes.data && mirrorRes.data.url) {
                    const isPhoto = mirrorRes.data.url.includes('.jpg') || mirrorRes.data.url.includes('.webp');
                    return res.json({
                        success: true,
                        title: `Facebook_Media_${Date.now()}`,
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
            } catch (_) {
                continue;
            }
        }

        return res.status(400).json({
            success: false,
            error: 'Could not extract Facebook media. Ensure the post is set to public.'
        });

    } catch (err) {
        console.error('Facebook Route Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
