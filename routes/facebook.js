const express = require('express');
const router = express.Router();
const axios = require('axios');
const cheerio = require('cheerio');

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

// Helper: Decode SnapSave JavaScript packer (eval unpacker)
function decodeSnapSave(p, a, c, k, e, d) {
    while (c--) {
        if (k[c]) {
            p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
        }
    }
    return p;
}

// Helper: URL normalization & expansion
async function cleanUrl(rawUrl) {
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
    console.log('[Facebook] Incoming Request Body:', JSON.stringify(req.body));
    const rawUrl = req.body.url || req.body.link || req.body.videoUrl || req.query.url;

    if (!rawUrl) {
        console.log('[Facebook] No URL provided in request');
        return res.status(400).json({ success: false, error: 'Facebook URL is required' });
    }

    try {
        const targetUrl = await cleanUrl(rawUrl);
        console.log('[Facebook] Target Clean URL:', targetUrl);

        // ============================================================
        // 🌟 METHOD 1: SnapSave Dedicated Engine with JS Unpacker
        // ============================================================
        try {
            const snapRes = await axios.post('https://snapsave.app/action.php',
                new URLSearchParams({ url: targetUrl }).toString(),
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                        'Referer': 'https://snapsave.app/'
                    },
                    timeout: 4500
                }
            );

            let html = snapRes.data;
            if (typeof html === 'string' && html.includes('eval(function(')) {
                // Extract arguments from eval(function(p,a,c,k,e,d){...}("...",a,c,"...".split("|")))
                const evalArgs = html.match(/\}\s*\(\s*"([^"]+)"\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*"([^"]+)"\.split\('\|'\)/);
                if (evalArgs) {
                    const [, p, a, c, kStr] = evalArgs;
                    html = decodeSnapSave(p, parseInt(a), parseInt(c), kStr.split('|'), 0, {});
                }
            }

            if (typeof html === 'string') {
                const videoMatches = [...html.matchAll(/href="([^"]+)"[^>]*class="button is-success/gi)]
                    .concat([...html.matchAll(/href="([^"]+)"[^>]*>Download<\/a>/gi)]);
                const photoMatches = [...html.matchAll(/href="([^"]+)"[^>]*class="button is-download/gi)];

                if (videoMatches.length > 0) {
                    const dlUrl = videoMatches[0][1].replace(/&amp;/g, '&');
                    console.log('[Facebook] Successfully resolved via SnapSave Video');
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

                    console.log('[Facebook] Successfully resolved via SnapSave Photos');
                    return res.json({
                        success: true,
                        title: `Facebook_${Date.now()}`,
                        thumbnail: formats[0].downloadUrl,
                        downloadUrl: formats[0].downloadUrl,
                        formats: formats
                    });
                }
            }
        } catch (err) {
            console.log('[Facebook] SnapSave attempt failed:', err.message);
        }

        // ============================================================
        // 🌟 METHOD 2: Cobalt Stream Cluster
        // ============================================================
        const cobaltNodes = [
            'https://cobalt-api.kwiatekm.tokyo',
            'https://api.wuk.sh',
            'https://co.wuk.sh'
        ];

        for (const node of cobaltNodes) {
            try {
                const cRes = await axios.post(`${node}/`, {
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
                    console.log('[Facebook] Successfully resolved via Cobalt:', node);
                    return res.json({
                        success: true,
                        title: `Facebook_${Date.now()}`,
                        thumbnail: cRes.data.url,
                        downloadUrl: cRes.data.url,
                        formats: [{
                            quality: 'HD Video (MP4)',
                            downloadUrl: cRes.data.url,
                            extension: 'mp4',
                            type: 'video'
                        }]
                    });
                }
            } catch (_) {}
        }

        // ============================================================
        // 🌟 METHOD 3: OpenGraph & Relay Extraction (Cheerio)
        // ============================================================
        try {
            const pageRes = await axios.get(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.9'
                },
                timeout: 3500
            });

            const html = pageRes.data;
            const $ = cheerio.load(html);

            const hdMatch = html.match(/"browser_native_hd_url":"([^"]+)"/) || html.match(/"playable_url_quality_hd":"([^"]+)"/);
            const sdMatch = html.match(/"browser_native_sd_url":"([^"]+)"/) || html.match(/"playable_url":"([^"]+)"/);
            const ogVideo = $('meta[property="og:video"]').attr('content') || $('meta[property="og:video:secure_url"]').attr('content');

            let vUrl = null;
            if (hdMatch && hdMatch[1]) vUrl = JSON.parse(`"${hdMatch[1]}"`);
            else if (sdMatch && sdMatch[1]) vUrl = JSON.parse(`"${sdMatch[1]}"`);
            else if (ogVideo) vUrl = ogVideo;

            if (vUrl) {
                console.log('[Facebook] Successfully resolved via Meta OpenGraph/Relay');
                return res.json({
                    success: true,
                    title: `Facebook_${Date.now()}`,
                    thumbnail: $('meta[property="og:image"]').attr('content') || vUrl,
                    downloadUrl: vUrl,
                    formats: [{
                        quality: 'HD Video (MP4)',
                        downloadUrl: vUrl,
                        extension: 'mp4',
                        type: 'video'
                    }]
                });
            }

            // Photos extraction
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
                console.log(`[Facebook] Successfully resolved ${photoList.length} photos via Cheerio`);
                return res.json({
                    success: true,
                    title: `Facebook_${Date.now()}`,
                    thumbnail: photoList[0],
                    downloadUrl: photoList[0],
                    formats: photoList.map((img, i) => ({
                        quality: `HD Photo ${i + 1} (JPG)`,
                        downloadUrl: img,
                        extension: 'jpg',
                        type: 'photo'
                    }))
                });
            }
        } catch (err) {
            console.log('[Facebook] Cheerio parse failed:', err.message);
        }

        console.log('[Facebook] All extraction engines exhausted');
        return res.status(400).json({
            success: false,
            error: 'Unable to extract Facebook media. Please verify the post or reel is public.'
        });

    } catch (err) {
        console.error('[Facebook] Critical Route Exception:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
