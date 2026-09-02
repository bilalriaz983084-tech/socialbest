const express = require('express');
const router = express.Router();

router.post('/download', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: 'URL is required' });
    }

    try {
        // Cobalt public instance se direct fetch (Instagram block bypass)
        const response = await fetch('https://api.cobalt.tools/api/json', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                url: url
            })
        });

        const data = await response.json();

        if (data.status === 'error') {
            throw new Error(data.text || 'Cobalt extraction failed');
        }

        // Case 1: Picker / Carousel (Multiple photos and videos)
        if (data.status === 'picker' && Array.isArray(data.picker)) {
            const formats = data.picker.map((item, index) => {
                const isVideo = item.type === 'video';
                return {
                    quality: `Item ${index + 1} (${isVideo ? 'Video' : 'Photo'})`,
                    downloadUrl: item.url,
                    extension: isVideo ? 'mp4' : 'jpg',
                    type: isVideo ? 'video' : 'photo'
                };
            });

            return res.json({
                success: true,
                title: `Instagram_Carousel_${Date.now()}`,
                formats: formats
            });
        }

        // Case 2: Single Video / Photo stream
        if (data.url) {
            const isVideo = !data.url.includes('.jpg') && !data.url.includes('.png');
            return res.json({
                success: true,
                title: `Instagram_${Date.now()}`,
                downloadUrl: data.url,
                formats: [
                    {
                        quality: isVideo ? 'HD Video' : 'HD Photo',
                        downloadUrl: data.url,
                        extension: isVideo ? 'mp4' : 'jpg',
                        type: isVideo ? 'video' : 'photo'
                    }
                ]
            });
        }

        throw new Error('No downloadable URL found in response');

    } catch (err) {
        console.error('Instagram Route Error:', err.message);
        return res.status(500).json({
            success: false,
            error: 'Instagram extraction failed: ' + err.message
        });
    }
});

module.exports = router;
