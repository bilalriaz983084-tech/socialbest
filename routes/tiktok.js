const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const axios = require('axios');

function extractTikTokId(url) {
    const match = url.match(/\/video\/(\d+)/) || url.match(/\/photo\/(\d+)/) || url.match(/tiktok\.com\/@[\w.-]+\/(?:video|photo)\/(\d+)/);
    return match ? match[1] : `tt_${Date.now()}`;
}

router.get('/status', (req, res) => {
    res.json({ platform: 'TikTok', status: 'Connected successfully', timestamp: new Date().toISOString() });
});

// TikTok Metadata Endpoint
router.post('/info', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'TikTok URL is required' });

    try {
        const response = await axios.post('https://www.tikwm.com/api/', { url: url, hd: 1 });
        if (response.data.code !== 0) throw new Error('Failed to fetch from TikTok API');
        
        const data = response.data.data;
        return res.json({
            success: true,
            title: data.title,
            creator: data.author?.unique_id,
            duration: data.duration,
            cover: data.cover,
            playCount: data.play_count,
            likeCount: data.digg_count,
            isPhoto: !!data.images
        });
    } catch (error) {
        console.error('TikTok info error:', error.message);
        res.status(500).json({ success: false, error: 'Could not fetch TikTok metadata' });
    }
});

// TikTok Download Endpoint
router.post('/download', async (req, res) => {
    const { url, formatType = 'video' } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'TikTok URL is required' });
    }

    const outputDir = path.join(__dirname, '../downloads');
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    const ttId = extractTikTokId(url);

    try {
        console.log(`Fetching direct media links for TikTok URL: ${url}`);
        
        // Use TikWM API to bypass Captchas and HTML layout changes
        const apiRes = await axios.post('https://www.tikwm.com/api/', { url: url, hd: 1 });
        
        if (apiRes.data.code !== 0 || !apiRes.data.data) {
            return res.status(404).json({ success: false, error: 'Failed to extract media. The post might be private or deleted.' });
        }

        const ttData = apiRes.data.data;
        const savedFiles = [];

        // ==========================================
        // 1. TIKTOK PHOTO SLIDES / CAROUSEL
        // ==========================================
        if (ttData.images && (formatType === 'image' || formatType === 'photo' || formatType === 'video')) {
            console.log(`Found ${ttData.images.length} photo slide(s). Downloading...`);

            for (let i = 0; i < ttData.images.length; i++) {
                try {
                    const imgRes = await axios.get(ttData.images[i], { responseType: 'arraybuffer' });
                    const fileName = `tt_photo_${ttId}_${i + 1}.jpg`;
                    const filePath = path.join(outputDir, fileName);
                    fs.writeFileSync(filePath, imgRes.data);
                    savedFiles.push(fileName);
                } catch (err) {
                    console.error(`Failed to download slide ${i + 1}:`, err.message);
                }
            }

            return res.json({
                success: true,
                message: `Successfully downloaded ${savedFiles.length} TikTok photo slide(s)!`,
                files: savedFiles,
                folder: outputDir
            });
        }

        // ==========================================
        // 2. AUDIO EXTRACTION (MP3)
        // ==========================================
        if (formatType === 'audio' || formatType === 'mp3') {
            console.log('Downloading TikTok original audio...');
            const audioUrl = ttData.music || ttData.play;
            
            const audioRes = await axios.get(audioUrl, { responseType: 'arraybuffer' });
            const fileName = `tt_audio_${ttId}.mp3`;
            fs.writeFileSync(path.join(outputDir, fileName), audioRes.data);
            
            return res.json({
                success: true,
                message: 'TikTok audio downloaded successfully!',
                files: [fileName],
                folder: outputDir
            });
        }

        // ==========================================
        // 3. NO-WATERMARK VIDEO
        // ==========================================
        console.log('Downloading TikTok HD video (No Watermark)...');
        const videoUrl = ttData.hdplay || ttData.play;

        const videoRes = await axios.get(videoUrl, { responseType: 'arraybuffer' });
        const fileName = `tt_video_${ttId}.mp4`;
        fs.writeFileSync(path.join(outputDir, fileName), videoRes.data);

        return res.json({
            success: true,
            message: 'TikTok video downloaded successfully!',
            files: [fileName],
            folder: outputDir
        });

    } catch (error) {
        console.error('TikTok download error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;