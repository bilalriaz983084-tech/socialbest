const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(cors());

// Import routes
const facebookRoutes = require('./routes/facebook');
const instagramRoutes = require('./routes/instagram');
const youtubeRoutes = require('./routes/youtube');
const tiktokRoutes = require('./routes/tiktok');

// Mount routes
app.use('/api/facebook', facebookRoutes);
app.use('/api/instagram', instagramRoutes);
app.use('/api/youtube', youtubeRoutes);
app.use('/api/tiktok', tiktokRoutes);

// Root health check
app.get('/', (req, res) => {
    res.json({ status: 'Social media backend server is running!' });
});

// 🌟 Direct Mobile Stream Download Route (Saves directly to user's device)
app.get('/api/download-stream', (req, res) => {
    const mediaUrl = req.query.url;
    const isAudio = req.query.isAudio === 'true';

    if (!mediaUrl) {
        return res.status(400).json({ error: 'Media URL is required' });
    }

    const filename = `media_${Date.now()}.${isAudio ? 'mp3' : 'mp4'}`;

    // Force browser/Android to trigger file download
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', isAudio ? 'audio/mpeg' : 'video/mp4');

    // yt-dlp arguments for piping directly to response stream
    const formatArgs = isAudio
        ? ['-x', '--audio-format', 'mp3', '-o', '-']
        : ['-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best', '-o', '-'];

    const ytdlp = spawn('yt-dlp', [...formatArgs, mediaUrl]);

    // Pipe directly to user's response
    ytdlp.stdout.pipe(res);

    ytdlp.stderr.on('data', (data) => {
        console.error(`yt-dlp log: ${data}`);
    });

    ytdlp.on('error', (err) => {
        console.error('Process error:', err);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Download stream failed' });
        }
    });

    // Cleanup if mobile app cancels the download
    req.on('close', () => {
        ytdlp.kill();
    });
});

// Cloud environments require listening on 0.0.0.0
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});
