const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());

// Import routes (Instagram & TikTok only)
const instagramRoutes = require('./routes/instagram');
const tiktokRoutes = require('./routes/tiktok');

// Mount routes
app.use('/api/instagram', instagramRoutes);
app.use('/api/tiktok', tiktokRoutes);

// Root health check
app.get('/', (req, res) => {
    res.json({ 
        status: 'online',
        service: 'Social Media Light Backend (Instagram & TikTok)',
        timestamp: new Date().toISOString()
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
