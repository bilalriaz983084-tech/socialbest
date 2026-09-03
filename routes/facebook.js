const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

// Helper: Redirects resolve aur tracking queries clean
async function resolveFacebookUrl(rawUrl) {
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
                timeout: 3000
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
        const targetUrl = await resolveFacebookUrl(url);
        let bestVideoUrl = null;
        let thumbnail = null;
        const photos = new Set();

        // ============================================================
        // 🌟 METHOD 1: Native Cheerio (Extracts Videos & Photos)
        // ============================================================
        try {
            const fbRes = await axios.get(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Sec-Fetch-Mode': 'navigate'
                },
                timeout: 4000
            });

            const html = fbRes.data;
            const $ = cheerio.load(html);

            // 1. Check for Video Streams
            const hdMatch = html.match(/"browser_native_hd_url":"([^"]+)"/) || 
                            html.match(/"playable_url_quality_hd":"([^"]+)"/);
            const sdMatch = html.match(/"browser_native_sd_url":"([^"]+)"/) || 
                            html.match(/"playable_url":"([^"]+)"/);
            const ogVideo = $('meta[property="og:video"]').attr('content') || 
                            $('meta[property="og:video:secure_url"]').attr('content');

            if (hdMatch && hdMatch[1]) {
                bestVideoUrl = JSON.parse(`"${hdMatch[1]}"`);
            } else if (sdMatch && sdMatch[1]) {
                bestVideoUrl = JSON.parse(`"${sdMatch[1]}"`);
            } else if (ogVideo) {
                bestVideoUrl = ogVideo;
            }

            // Thumbnail agar available ho
            thumbnail = $('meta[property="og:image"]').attr('content') || null;

            // 2. Agar video nahi hai, to Photos extract karein
            if (!bestVideoUrl) {
                // OpenGraph Main Photo
                if (thumbnail && !thumbnail.includes('static.xx.fbcdn.net')) {
                    photos.add(thumbnail);
                }

                // Scan embedded JSON blocks for High-Res Post Photos
                const imgRegex = /"image":\{"uri":"([^"]+)"\}/g;
                let match;
                while ((match = imgRegex.exec(html)) !== null) {
                    try {
                        const cleanImg = JSON.parse(`"${match[1]}"`).replace(/&amp;/g, '&');
                        if (cleanImg.includes('fbcdn.net') && !cleanImg.includes('/rsrc.php/')) {
                            photos.add(cleanImg);
                        }
                    } catch (_) {}
                }
            }
        } catch (_) {}

        // ============================================================
        // 🌟 METHOD 2: Cobalt Fallback (Sirf Video ke liye)
        // ============================================================
        if (!bestVideoUrl && photos.size === 0) {
            const cobaltServers = [
                'https://cobalt-api.kwiatekm.tokyo',
                'https://api.wuk.sh',
                'https://co.wuk.sh'
            ];

            for (const server of cobaltServers) {
                try {
                    const cRes = await axios.post(`${server}/`, {
                        url: targetUrl,
                        videoQuality: '720'
                    }, {
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json'
                        },
                        timeout: 3000
                    });

                    if (cRes.data && cRes.data.url) {
                        bestVideoUrl = cRes.data.url;
                        thumbnail = thumbnail || cRes.data.url;
                        break;
                    }
                } catch (_) {}
            }
        }

        // ============================================================
        // Response Formatting
        // ============================================================
        // Case A: Video Post
        if (bestVideoUrl) {
            return res.json({
                success: true,
                title: `Facebook_${Date.now()}`,
                thumbnail: thumbnail || bestVideoUrl,
                downloadUrl: bestVideoUrl,
                formats: [
                    {
                        quality: 'HD Video (MP4)',
                        downloadUrl: bestVideoUrl,
                        extension: 'mp4',
                        type: 'video'
                    }
                ]
            });
        }

        // Case B: Photo / Carousel Post
        if (photos.size > 0) {
            const photoList = Array.from(photos);
            const formats = photoList.map((imgUrl, idx) => ({
                quality: `HD Photo ${idx + 1} (JPG)`,
                downloadUrl: imgUrl,
                extension: 'jpg',
                type: 'photo'
            }));

            return res.json({
                success: true,
                title: `Facebook_${Date.now()}`,
                thumbnail: photoList[0],
                downloadUrl: photoList[0],
                formats: formats
            });
        }

        return res.status(400).json({
            success: false,
            error: 'Facebook media could not be parsed. Verify the post/reel is public.'
        });

    } catch (err) {
        console.error('Facebook Direct Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
