const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
require('dotenv').config();

const app = express();

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

// Direct Mobile Stream Download Route
app.get('/api/download-stream', (req, res) => {
    const mediaUrl = req.query.url;
    const isAudio = req.query.isAudio === 'true';

    if (!mediaUrl) {
        return res.status(400).json({ error: 'Media URL is required' });
    }

    const filename = `media_${Date.now()}.${isAudio ? 'mp3' : 'mp4'}`;

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', isAudio ? 'audio/mpeg' : 'video/mp4');

    const formatArgs = isAudio
        ? ['-x', '--audio-format', 'mp3', '-o', '-']
        : ['-f', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best', '-o', '-'];

    const ytdlp = spawn('yt-dlp', [...formatArgs, mediaUrl]);

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

    req.on('close', () => {
        ytdlp.kill();
    });
});

// Local development ke liye port listen, Vercel ke liye bypass
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

// Vercel Serverless Function Export
module.exports = app;
