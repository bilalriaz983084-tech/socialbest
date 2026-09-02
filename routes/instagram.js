const express = require('express');
const router = express.Router();
const { exec } = require('child_process');

router.post('/download', (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: 'URL is required' });
    }

    // Instagram Shortcode extract karein (e.g. reel/C12345/ se code)
    const match = url.match(/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
    if (!match) {
        return res.status(400).json({ success: false, error: 'Invalid Instagram URL' });
    }

    const shortcode = match[1];

    // Python instaloader script direct execute karein JSON output ke liye
    const pythonCmd = `python3 -c "import instaloader, json; L = instaloader.Instaloader(); post = instaloader.Post.from_shortcode(L.context, '${shortcode}'); print(json.dumps({'title': post.caption[:50] if post.caption else 'Instagram_Post', 'thumbnail': post.url, 'downloadUrl': post.video_url if post.is_video else post.url}))"`;

    exec(pythonCmd, (error, stdout, stderr) => {
        if (error) {
            console.error('Instaloader error:', stderr);
            return res.status(500).json({
                success: false,
                error: 'Instaloader extraction failed. Instagram rate-limited the IP.',
                detail: stderr
            });
        }

        try {
            const data = JSON.parse(stdout.trim());
            return res.json({
                success: true,
                ...data
            });
        } catch (e) {
            return res.status(500).json({ success: false, error: 'Failed to parse media data' });
        }
    });
});

module.exports = router;
