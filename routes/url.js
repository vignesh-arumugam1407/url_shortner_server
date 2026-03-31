const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/auth');
const prisma = require('../lib/prisma');

// Optional library for generating unique IDs, but we can also use Math.random for simplicity 
// or NanoID as it's typically standard for URL shorteners.
const generateShortCode = () => Math.random().toString(36).substring(2, 8);

// @route   POST /api/url/shorten
// @desc    Create a new shortened URL (Protected Route)
router.post('/shorten', verifyToken, async (req, res) => {
    let { originalUrl } = req.body;

    if (!originalUrl || typeof originalUrl !== 'string') {
        return res.status(400).json({ error: 'Please provide a valid URL' });
    }
    
    originalUrl = originalUrl.trim();

    // Basic URL validation
    let validUrl = originalUrl;
    if (!/^https?:\/\//i.test(originalUrl)) {
        validUrl = 'http://' + originalUrl;
    }

    try {
        let shortCode;
        let isUnique = false;
        
        // Generate a unique short code
        while (!isUnique) {
            shortCode = generateShortCode();
            const existing = await prisma.url.findUnique({ where: { shortCode } });
            if (!existing) isUnique = true;
        }

        // Fetch actual postgres user UUID using firebase auth email
        const dbUser = await prisma.user.findUnique({
            where: { email: req.user.email }
        });

        const newUrl = await prisma.url.create({
            data: {
                originalUrl: validUrl,
                shortCode,
                userId: dbUser ? dbUser.id : null,
            }
        });

        // The URL will route natively from localhost for now 
        res.json({
            message: 'URL shortened successfully',
            shortUrl: `${process.env.APP_URL || 'http://localhost:5000'}/${shortCode}`,
            url: newUrl
        });

    } catch (error) {
        console.error('Error shortening URL:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// @route   GET /api/url/history
// @desc    Get all URLs for a user
router.get('/history', verifyToken, async (req, res) => {
    try {
        const dbUser = await prisma.user.findUnique({
            where: { email: req.user.email }
        });

        if (!dbUser) {
            return res.json([]);
        }

        const urls = await prisma.url.findMany({
            where: { userId: dbUser.id },
            orderBy: { createdAt: 'desc' }
        });
        res.json(urls);
    } catch (error) {
        console.error('Error fetching history:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;
