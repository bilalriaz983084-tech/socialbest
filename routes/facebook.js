const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

async function resolveUrl(rawUrl) {
    let clean = (rawUrl || '').trim();
    if (clean.includes('facebook.com') && clean.includes('?')) {
        clean = clean.split('?')[0];
    }
    if (clean.includes('fb.watch') || clean.includes('/share/')) {
        try {
            const head = await axios.get(clean, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
                maxRedirects: 5,
                timeout: 3000
            });
            if (head.request?.res?.responseUrl) {
                clean = head.request.res.responseUrl.split('?')[0];
            }
        } catch (_) {}
    }
    return clean;
}

router.post('/download', async (req, res) => {
    const rawUrl = req.body.url || req.body.link || req.body.videoUrl || req.query.url;
    if (!rawUrl) return res.status(400).json({ success: false, error: 'Facebook URL is required' });

    try {
        const targetUrl = await resolveUrl(rawUrl);

        // ============================================================
        // 🌟 METHOD 1: Direct FDownloader Ajax Gateway (MP4 & Photos)
        // ============================================================
        try {
            const fdRes = await axios.post('https://fdownloader.net/api/ajaxSearch',
                new URLSearchParams({ k_exp: '', k_token: '', q: targetUrl }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Referer': 'https://fdownloader.net/'
                    },
                    timeout: 4000
                }
            );

            if (fdRes.data && fdRes.data.data) {
                const html = fdRes.data.data;
                const videoMatches = [...html.matchAll(/href="([^"]+)"[^>]*class="download-link[^"]*"/gi)];
                const photoMatches = [...html.matchAll(/href="([^"]+)"[^>]*class="image-link[^"]*"/gi)];

                if (videoMatches.length > 0) {
                    const dlUrl = videoMatches[0][1].replace(/&amp;/g, '&');
                    return res.json({
                        success: true,
                        title: `Facebook_${Date.now()}`,
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

                if (photoMatches.length > 0) {
                    const formats = photoMatches.map((m, idx) => ({
                        quality: `HD Photo ${idx + 1} (JPG)`,
                        downloadUrl: m[1].replace(/&amp;/g, '&'),
                        extension: 'jpg',
                        type: 'photo'
                    }));

                    return res.json({
                        success: true,
                        title: `Facebook_${Date.now()}`,
                        thumbnail: formats[0].downloadUrl,
                        downloadUrl: formats[0].downloadUrl,
                        formats: formats
                    });
                }
            }
        } catch (_) {}

        // ============================================================
        // 🌟 METHOD 2: Cheerio Native Meta & Script Parser (< 1.5s)
        // ============================================================
        try {
            const fbRes = await axios.get(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9'
                },
                timeout: 3500
            });

            const html = fbRes.data;
            const $ = cheerio.load(html);

            // Check Native HD/SD
            const hdMatch = html.match(/"browser_native_hd_url":"([^"]+)"/) || html.match(/"playable_url_quality_hd":"([^"]+)"/);
            const sdMatch = html.match(/"browser_native_sd_url":"([^"]+)"/) || html.match(/"playable_url":"([^"]+)"/);
            const ogVideo = $('meta[property="og:video"]').attr('content') || $('meta[property="og:video:secure_url"]').attr('content');

            let videoUrl = null;
            if (hdMatch && hdMatch[1]) videoUrl = JSON.parse(`"${hdMatch[1]}"`);
            else if (sdMatch && sdMatch[1]) videoUrl = JSON.parse(`"${sdMatch[1]}"`);
            else if (ogVideo) videoUrl = ogVideo;

            if (videoUrl) {
                return res.json({
                    success: true,
                    title: `Facebook_${Date.now()}`,
                    thumbnail: $('meta[property="og:image"]').attr('content') || videoUrl,
                    downloadUrl: videoUrl,
                    formats: [{
                        quality: 'HD Video (MP4)',
                        downloadUrl: videoUrl,
                        extension: 'mp4',
                        type: 'video'
                    }]
                });
            }

            // Photos parsing
            const photos = new Set();
            const ogImg = $('meta[property="og:image"]').attr('content');
            if (ogImg && !ogImg.includes('static.xx.fbcdn.net')) photos.add(ogImg);

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

            if (photos.size > 0) {
                const photoList = Array.from(photos);
                const formats = photoList.map((img, i) => ({
                    quality: `HD Photo ${i + 1} (JPG)`,
                    downloadUrl: img,
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
        } catch (_) {}

        return res.status(400).json({
            success: false,
            error: 'Unable to extract Facebook media. Please ensure the link is public.'
        });

    } catch (err) {
        console.error('Facebook Route Error:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
