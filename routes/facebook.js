const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const os = require('os');
const youtubedl = require('yt-dlp-exec');

function parseNetscapeCookiesForPuppeteer(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    const cookies = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const parts = trimmed.split('\t');
        if (parts.length >= 7) {
            cookies.push({
                name: parts[5],
                value: parts[6],
                domain: parts[0].startsWith('.') ? parts[0].substring(1) : parts[0],
                path: parts[2],
                secure: parts[3] === 'TRUE',
                httpOnly: false
            });
        }
    }
    return cookies;
}

router.get('/status', (req, res) => {
    res.json({ platform: 'Facebook', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

router.post('/download', async (req, res) => {
    let { url, formatType = 'video' } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'Facebook URL is missing' });
    }

    // Vercel serverless environment mein sirf /tmp directory writable hoti hai
    const outputDir = path.join(os.tmpdir(), 'downloads');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const cookiesPath = path.join(__dirname, '../cookies.txt');

    try {
        console.log(`Processing URL: ${url} [Mode: ${formatType}]`);

        // ==========================================
        // 1. HIGH-RES POST ALBUM EXTRACTOR
        // ==========================================
        if (formatType === 'image' || formatType === 'photo') {
            console.log('Resolving Puppeteer module...');

            // Dynamic import to eliminate ERR_REQUIRE_ESM crash
            const puppeteerModule = await import('puppeteer');
            const puppeteer = puppeteerModule.default || puppeteerModule;

            const browser = await puppeteer.launch({
                headless: 'new',
                pipe: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-notifications'
                ]
            });

            const page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36');
            await page.setViewport({ width: 1440, height: 900 });

            const cookies = parseNetscapeCookiesForPuppeteer(cookiesPath);
            if (cookies.length > 0) {
                await page.setCookie(...cookies);
            }

            console.log('Navigating to post...');
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
            await new Promise((r) => setTimeout(r, 3000));

            // Click into the photo grid to trigger Theater Mode
            await page.evaluate(() => {
                const targets = [
                    'div[role="main"] a[href*="/photo"]',
                    'div[role="main"] a[href*="fbid="]',
                    'div[role="main"] a[role="link"] img',
                    'img[src*="scontent"]'
                ];
                for (const selector of targets) {
                    const el = document.querySelector(selector);
                    if (el) {
                        el.click();
                        break;
                    }
                }
            });

            await new Promise((r) => setTimeout(r, 2000));

            const verifiedPhotoUrls = new Set();

            for (let step = 0; step < 15; step++) {
                const activePhotoUrl = await page.evaluate(() => {
                    const stageSelectors = [
                        'div[data-pagelet*="PhotoViewer"] img[data-visualcompletion="media-vc-image"]',
                        'div[role="dialog"] img[data-visualcompletion="media-vc-image"]',
                        'img.spotlight',
                        'div[role="dialog"] div[data-pagelet*="MediaViewer"] img',
                        'div[role="dialog"] img[src*="scontent"]'
                    ];

                    for (const sel of stageSelectors) {
                        const imgs = document.querySelectorAll(sel);
                        for (const img of imgs) {
                            if (img.closest('div[aria-label*="Comment"]') || img.closest('ul') || img.closest('form')) {
                                continue;
                            }
                            const rect = img.getBoundingClientRect();
                            if (rect.width >= 250 && rect.height >= 250 && img.src && img.src.includes('scontent')) {
                                return img.src;
                            }
                        }
                    }
                    return null;
                });

                if (activePhotoUrl) {
                    verifiedPhotoUrls.add(activePhotoUrl);
                }

                await page.evaluate(() => {
                    const nextBtn = document.querySelector('div[aria-label="Next photo"], div[aria-label="Next"], div[role="button"][aria-label*="Next"]');
                    if (nextBtn) nextBtn.click();
                });
                await page.keyboard.press('ArrowRight');
                await new Promise((r) => setTimeout(r, 700));
            }

            await browser.close();

            const seenKeys = new Set();
            const finalImageUrls = [];

            for (let rawUrl of Array.from(verifiedPhotoUrls)) {
                const isCommentNoise = 
                    rawUrl.includes('/t39.1997-6/') ||
                    rawUrl.includes('/t39.2365-6/') ||
                    rawUrl.includes('rsrc.php') ||
                    rawUrl.includes('emoji.php') ||
                    rawUrl.includes('safe_image.php') ||
                    rawUrl.includes('p50x50') ||
                    rawUrl.includes('p100x100') ||
                    rawUrl.includes('/t15.');

                if (isCommentNoise) continue;

                const cleanBaseUrl = rawUrl.split('?')[0];
                const matchId = cleanBaseUrl.match(/([0-9]+_[0-9]+_[0-9]+_[a-z0-9]+)/i);
                const uniqueKey = matchId ? matchId[1] : cleanBaseUrl.substring(cleanBaseUrl.lastIndexOf('/') + 1);

                if (uniqueKey && !seenKeys.has(uniqueKey)) {
                    seenKeys.add(uniqueKey);
                    finalImageUrls.push(rawUrl);
                }
            }

            if (finalImageUrls.length === 0) {
                return res.status(404).json({ success: false, error: 'Could not isolate authentic post photos.' });
            }

            console.log(`Isolated exactly ${finalImageUrls.length} authentic album photo(s). Downloading...`);

            const savedFiles = [];
            let savedCount = 0;

            for (let i = 0; i < finalImageUrls.length; i++) {
                try {
                    const imgRes = await axios.get(finalImageUrls[i], { responseType: 'arraybuffer' });
                    const fileName = `fb_album_${Date.now()}_${savedCount + 1}.jpg`;
                    const filePath = path.join(outputDir, fileName);
                    fs.writeFileSync(filePath, imgRes.data);
                    savedFiles.push(fileName);
                    savedCount++;
                } catch (err) {
                    console.error(`Failed downloading photo index ${i + 1}:`, err.message);
                }
            }

            return res.json({
                success: true,
                message: `Successfully downloaded all ${savedCount} authentic album photo(s)!`,
                files: savedFiles,
                folder: outputDir
            });
        }

        // ==========================================
        // 2. VIDEO DOWNLOAD
        // ==========================================
        else {
            const outputTemplate = path.join(outputDir, 'fb_video_%(id)s.%(ext)s');
            const downloadArgs = [
                url,
                '--output', outputTemplate,
                '--format', 'bv*+ba/b',
                '--merge-output-format', 'mp4'
            ];

            if (fs.existsSync(cookiesPath)) {
                downloadArgs.push('--cookies', cookiesPath);
            }

            await youtubedl(downloadArgs);

            return res.json({
                success: true,
                message: 'Facebook video downloaded successfully!',
                folder: outputDir
            });
        }

    } catch (error) {
        console.error('Download handler error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
