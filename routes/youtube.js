const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const youtubedl = require('yt-dlp-exec');

function extractVideoId(url) {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=|shorts\/))([\w-]{11})/);
    return match ? match[1] : `yt_${Date.now()}`;
}

router.get('/status', (req, res) => {
    res.json({ platform: 'YouTube', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

// Endpoint to fetch available formats and video metadata
router.post('/info', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'YouTube URL is required' });

    const cookiesPath = path.join(__dirname, '../cookies.txt');

    try {
        const dumpArgs = {
            dumpSingleJson: true,
            noWarnings: true,
            noCallHome: true
        };
        if (fs.existsSync(cookiesPath)) dumpArgs.cookies = cookiesPath;

        const info = await youtubedl(url, dumpArgs);

        return res.json({
            success: true,
            title: info.title,
            duration: info.duration_string || info.duration,
            thumbnail: info.thumbnail,
            channel: info.uploader || info.channel,
            viewCount: info.view_count,
            formats: info.formats?.map(f => ({
                format_id: f.format_id,
                resolution: f.resolution || `${f.width}x${f.height}`,
                ext: f.ext,
                filesize: f.filesize || f.filesize_approx,
                hasVideo: f.vcodec !== 'none',
                hasAudio: f.acodec !== 'none'
            })).filter(f => f.hasVideo || f.hasAudio)
        });
    } catch (error) {
        console.error('YouTube info extraction error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// Endpoint to download Video / Audio
router.post('/download', async (req, res) => {
    const { url, formatType = 'video', quality = 'best' } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'YouTube URL is required' });
    }

    const outputDir = path.join(__dirname, '../downloads');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const cookiesPath = path.join(__dirname, '../cookies.txt');
    const videoId = extractVideoId(url);

    try {
        console.log(`Processing YouTube URL: ${url} [Format: ${formatType}, Quality: ${quality}]`);

        // ==========================================
        // 1. AUDIO-ONLY DOWNLOAD (MP3 / M4A)
        // ==========================================
        if (formatType === 'audio' || formatType === 'mp3') {
            console.log('Extracting high-quality audio...');
            const outputTemplate = path.join(outputDir, `yt_audio_${videoId}.%(ext)s`);

            const downloadArgs = [
                url,
                '--output', outputTemplate,
                '--extract-audio',
                '--audio-format', 'mp3',
                '--audio-quality', '0',
                '--no-playlist'
            ];

            if (fs.existsSync(cookiesPath)) downloadArgs.push('--cookies', cookiesPath);
            await youtubedl(downloadArgs);

            const outputFileName = `yt_audio_${videoId}.mp3`;
            return res.json({
                success: true,
                message: 'YouTube audio downloaded successfully!',
                file: outputFileName,
                folder: outputDir
            });
        }

        // ==========================================
        // 2. VIDEO DOWNLOAD (Merged MP4 up to 4K/1080p)
        // ==========================================
        console.log('Downloading best quality video stream...');
        const outputTemplate = path.join(outputDir, `yt_video_${videoId}.%(ext)s`);

        let formatSelector = 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/bestvideo+bestaudio/best[ext=mp4]/best';
        if (quality === '1080p') {
            formatSelector = 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best';
        } else if (quality === '720p') {
            formatSelector = 'bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best';
        }

        const downloadArgs = [
            url,
            '--output', outputTemplate,
            '--format', formatSelector,
            '--merge-output-format', 'mp4',
            '--no-playlist'
        ];

        if (fs.existsSync(cookiesPath)) downloadArgs.push('--cookies', cookiesPath);
        await youtubedl(downloadArgs);

        const outputFileName = `yt_video_${videoId}.mp4`;
        return res.json({
            success: true,
            message: 'YouTube video downloaded successfully!',
            file: outputFileName,
            folder: outputDir
        });

    } catch (error) {
        console.error('YouTube handler error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;