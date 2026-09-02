const express = require('express');
const router = express.Router();
const youtubedl = require('yt-dlp-exec');
const path = require('path');
const fs = require('fs');

router.post('/download', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: 'URL is required' });
    }

    try {
        const cookiesPath = path.resolve(__dirname, '../cookies.txt');
        const hasCookies = fs.existsSync(cookiesPath);

        const options = {
            dumpSingleJson: true,
            noWarnings: true,
            noCheckCertificates: true,
            preferFreeFormats: true,
            // Instagram block bypass karne ke flags
            addHeader: [
                'User-Agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept-Language:en-US,en;q=0.9',
                'Sec-Fetch-Mode:navigate'
            ]
        };

        // Agar cookies file banayi ho to include karein
        if (hasCookies) {
            options.cookies = cookiesPath;
        }

        // Globally installed yt-dlp use karein
        const info = await youtubedl(url, options);

        // Best URL nikaalna
        const downloadUrl = info.url || (info.formats && info.formats.length > 0 
            ? info.formats[info.formats.length - 1].url 
            : null);

        let downloadUrls = [];
        if (info.entries && Array.isArray(info.entries)) {
            downloadUrls = info.entries.map(e => e.url).filter(Boolean);
        }

        return res.json({
            success: true,
            title: info.title || 'Instagram_Media',
            thumbnail: info.thumbnail || '',
            downloadUrl: downloadUrl,
            downloadUrls: downloadUrls.length > 0 ? downloadUrls : undefined
        });

    } catch (error) {
        console.error('Extraction Error:', error.stderr || error.message);
        return res.status(500).json({
            success: false,
            error: error.stderr || error.message
        });
    }
});

module.exports = router;
