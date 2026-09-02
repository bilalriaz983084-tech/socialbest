const express = require('express');
const router = express.Router();
const { exec } = require('child_process');

router.post('/download', (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ success: false, error: 'URL is required' });
    }

    // Instagram Shortcode extract karein (p/..., reel/..., tv/...)
    const match = url.match(/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/);
    if (!match) {
        return res.status(400).json({ success: false, error: 'Invalid Instagram URL' });
    }

    const shortcode = match[1];

    // Python script jo photo ko photo aur video ko video treat karega
    const pythonScript = `
import instaloader, json

L = instaloader.Instaloader()
try:
    post = instaloader.Post.from_shortcode(L.context, '${shortcode}')
    
    media_list = []
    
    # Case 1: Carousel / Multiple photos & videos in one post
    if post.typename == 'GraphSidecar':
        for idx, node in enumerate(post.get_sidecar_nodes()):
            media_list.append({
                'quality': f'Item {idx + 1} (' + ('Video' if node.is_video else 'Photo') + ')',
                'downloadUrl': node.video_url if node.is_video else node.display_url,
                'extension': 'mp4' if node.is_video else 'jpg',
                'type': 'video' if node.is_video else 'photo'
            })
    # Case 2: Single Video / Reel
    elif post.is_video:
        media_list.append({
            'quality': 'HD Video',
            'downloadUrl': post.video_url,
            'extension': 'mp4',
            'type': 'video'
        })
    # Case 3: Single Photo
    else:
        media_list.append({
            'quality': 'HD Photo',
            'downloadUrl': post.url,
            'extension': 'jpg',
            'type': 'photo'
        })

    result = {
        'success': True,
        'title': (post.caption[:50] + '...') if post.caption else 'Instagram_Media',
        'thumbnail': post.url,
        'formats': media_list,
        'downloadUrl': media_list[0]['downloadUrl'] if len(media_list) == 1 else None
    }
    print(json.dumps(result))
except Exception as e:
    print(json.dumps({'success': False, 'error': str(e)}))
`;

    exec(`python3 -c "${pythonScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, { maxBuffer: 1024 * 1024 * 5 }, (error, stdout, stderr) => {
        if (error) {
            console.error('Instaloader exec error:', stderr || error.message);
            return res.status(500).json({
                success: false,
                error: 'Instagram extraction failed.',
                detail: stderr || error.message
            });
        }

        try {
            const data = JSON.parse(stdout.trim());
            if (!data.success) {
                return res.status(400).json(data);
            }
            return res.json(data);
        } catch (e) {
            console.error('JSON parse error:', stdout);
            return res.status(500).json({ success: false, error: 'Failed to parse media structure' });
        }
    });
});

module.exports = router;
