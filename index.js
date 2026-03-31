require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ─── Simple File-Based Storage ──────────────────────────────────────────────
// This is a local JSON store that works WITHOUT any database.
// No Supabase, no Prisma, no firebase-admin needed.
const DB_PATH = path.join(__dirname, 'data', 'links.json');

const ensureDbFile = () => {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) fs.writeFileSync(DB_PATH, JSON.stringify({ links: [], users: [] }));
};

const readDb = () => {
  ensureDbFile();
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
};

const writeDb = (data) => {
  ensureDbFile();
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
};

// ─── Firebase Token Verification (REST, no Admin SDK needed) ────────────────
const verifyFirebaseToken = (idToken) => {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.FIREBASE_WEB_API_KEY;
    if (!apiKey) return reject(new Error('FIREBASE_WEB_API_KEY not set in server/.env'));

    const postData = JSON.stringify({ idToken });
    const req = https.request({
      hostname: 'identitytoolkit.googleapis.com',
      path: `/v1/accounts:lookup?key=${apiKey}`,
      method: 'POST',
      port: 443,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) return reject(new Error(parsed.error.message));
          const user = parsed.users && parsed.users[0];
          if (!user) return reject(new Error('User not found in Firebase'));
          resolve({ uid: user.localId, email: user.email, name: user.displayName });
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
};

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    req.user = await verifyFirebaseToken(authHeader.split('Bearer ')[1]);
    next();
  } catch (e) {
    console.error('Auth error:', e.message);
    return res.status(403).json({ error: 'Invalid token: ' + e.message });
  }
};

// ─── Helper ─────────────────────────────────────────────────────────────────
const generateShortCode = () => crypto.randomBytes(3).toString('hex'); // 6 chars

// ─── Routes ──────────────────────────────────────────────────────────────────

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Sync user (called by frontend after login)
app.post('/api/auth/sync', authMiddleware, (req, res) => {
  const db = readDb();
  const existing = db.users.find(u => u.uid === req.user.uid);
  if (!existing) {
    db.users.push({ id: crypto.randomUUID(), uid: req.user.uid, email: req.user.email, name: req.user.name || req.user.email?.split('@')[0], createdAt: new Date().toISOString() });
    writeDb(db);
  }
  res.json({ message: 'User synced', uid: req.user.uid });
});

// Shorten URL
app.post('/api/url/shorten', authMiddleware, (req, res) => {
  let { originalUrl } = req.body;
  if (!originalUrl || typeof originalUrl !== 'string') {
    return res.status(400).json({ error: 'Please provide a valid URL' });
  }
  originalUrl = originalUrl.trim();
  if (!/^https?:\/\//i.test(originalUrl)) originalUrl = 'https://' + originalUrl;

  const db = readDb();
  let shortCode;
  do { shortCode = generateShortCode(); } while (db.links.find(l => l.shortCode === shortCode));

  const newLink = {
    id: crypto.randomUUID(),
    originalUrl,
    shortCode,
    userId: req.user.uid,
    clicks: 0,
    createdAt: new Date().toISOString()
  };
  db.links.push(newLink);
  writeDb(db);

  const appUrl = process.env.APP_URL || 'http://localhost:5000';
  res.json({
    message: 'URL shortened successfully!',
    shortUrl: `${appUrl}/${shortCode}`,
    url: newLink
  });
});

// Get user's link history
app.get('/api/url/history', authMiddleware, (req, res) => {
  const db = readDb();
  const userLinks = db.links
    .filter(l => l.userId === req.user.uid)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(userLinks);
});

// ─── Short URL Redirect ───────────────────────────────────────────────────────
app.get('/:shortCode', (req, res) => {
  const { shortCode } = req.params;
  // Skip API routes
  if (shortCode.startsWith('api')) return res.status(404).json({ error: 'Not found' });

  const db = readDb();
  const link = db.links.find(l => l.shortCode === shortCode);

  if (link) {
    // Increment click count
    link.clicks++;
    writeDb(db);
    return res.redirect(link.originalUrl);
  }
  res.status(404).send('<h2 style="font-family:sans-serif;text-align:center;margin-top:100px">404 — Link Not Found</h2>');
});

app.listen(PORT, () => {
  ensureDbFile();
  console.log(`\n✅ Server running on http://localhost:${PORT}`);
  console.log(`   Storage: ${DB_PATH}`);
});
