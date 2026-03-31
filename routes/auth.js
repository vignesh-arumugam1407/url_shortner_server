const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { verifyToken } = require('../middleware/auth');
const prisma = require('../lib/prisma');

// @route   POST /api/auth/sync
// @desc    Sync Firebase user to Postgres DB
// This endpoint is called from the frontend once Firebase logs in natively
router.post('/sync', verifyToken, async (req, res) => {
  const { name } = req.body;
  const email = req.user.email;
  const firebaseUid = req.user.uid;

  if (!email) {
    return res.status(400).json({ error: 'Email is required for syncing' });
  }

  try {
    // Generate an ID for new users, mapped locally since Postgres expects UUID
    const randomUuid = crypto.randomUUID();

    // Upsert uses unique email to find the existing user
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        // If they sign in via Google, Firebase provides a displayName.
        // We might want to selectively update name if it differs, or leave it.
      },
      create: {
        id: randomUuid,
        email: email,
        name: name || email.split('@')[0], 
        password: '', // Password is managed fully by Firebase now
      }
    });

    res.json({ message: 'User synced successfully', id: user.id });
  } catch (error) {
    console.error('Error syncing user:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

router.get('/me', verifyToken, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { email: req.user.email } });
    if (!user) {
      return res.status(404).json({ error: 'User does not exist in our database' });
    }
    // Remove password hash from response
    delete user.password;
    res.json(user);
  } catch (error) {
    console.error("Error fetching user", error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;
