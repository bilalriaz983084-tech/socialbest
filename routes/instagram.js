const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const youtubedl = require('yt-dlp-exec');

function extractShortcode(url) {
    const match = url.match(/\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
    return match ? match[1] : null;
}

router.get('/status', (req, res) => {
    res.json({ platform: 'Instagram', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

router.post('/download', async (req, res) => {
    let { url, formatType = 'auto' } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'Instagram URL is missing' });
    }

    const outputDir = path.join(__dirname, '../downloads');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const cookiesPath = path.join(__dirname, '../cookies.txt');
    const shortcode = extractShortcode(url);

    if (!shortcode) {
        return res.status(400).json({ error: 'Invalid Instagram URL' });
    }

    try {
        console.log(`Processing Instagram URL: ${url} [Mode: ${formatType}]`);

        const isReel = url.includes('/reel/') || formatType === 'video';

        // ==========================================
        // 1. VIDEOS / REELS (yt-dlp)
        // ==========================================
        if (isReel && formatType !== 'image') {
            console.log('Downloading video via yt-dlp...');
            const outputTemplate = path.join(outputDir, `ig_video_${shortcode}.mp4`);
            const downloadArgs = [
                url,
                '--output', outputTemplate,
                '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
                '--merge-output-format', 'mp4',
                '--no-playlist'
            ];
            if (fs.existsSync(cookiesPath)) downloadArgs.push('--cookies', cookiesPath);
            await youtubedl(downloadArgs);

            return res.json({
                success: true,
                message: 'Instagram video downloaded successfully!',
                files: [`ig_video_${shortcode}.mp4`],
                folder: outputDir
            });
        }

        // ==========================================
        // 2. AUTHENTIC PHOTOS / CAROUSEL (Instaloader via Python)
        // ==========================================
        console.log(`Extracting authentic post media using python -m instaloader for: ${shortcode}...`);

        const tempDir = path.join(outputDir, `temp_${shortcode}`);
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }

        // Target exact shortcode using python module
        const cmd = `python -m instaloader --dirname-pattern="${tempDir}" --no-video-thumbnails --no-captions --no-metadata-json -- -${shortcode}`;
        
        await execPromise(cmd);

        // Move JPG/PNG images from temp to main downloads folder
        const tempFiles = fs.readdirSync(tempDir);
        const savedFiles = [];

        tempFiles.forEach(file => {
            if (file.endsWith('.jpg') || file.endsWith('.png') || file.endsWith('.webp') || file.endsWith('.mp4')) {
                const newFileName = `ig_${shortcode}_${file}`;
                fs.renameSync(path.join(tempDir, file), path.join(outputDir, newFileName));
                savedFiles.push(newFileName);
            }
        });

        // Cleanup temp directory
        fs.rmSync(tempDir, { recursive: true, force: true });

        if (savedFiles.length === 0) {
            return res.status(404).json({ success: false, error: 'No media extracted from post.' });
        }

        return res.json({
            success: true,
            message: `Successfully downloaded ${savedFiles.length} authentic media item(s) for post ${shortcode}!`,
            files: savedFiles,
            folder: outputDir
        });

    } catch (error) {
        console.error('Instagram handler error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;