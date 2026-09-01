const express = require('express');
const cors = require('cors');
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

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});