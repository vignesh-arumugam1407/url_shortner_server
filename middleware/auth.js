const https = require('https');

/**
 * Verifies a Firebase ID token using the Firebase REST API.
 * This approach does NOT require firebase-admin or serviceAccountKey.json.
 * It hits Firebase's public token introspection endpoint.
 */
const verifyFirebaseToken = (idToken) => {
  return new Promise((resolve, reject) => {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId) {
      return reject(new Error('FIREBASE_PROJECT_ID is not set in server/.env'));
    }

    const url = `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${process.env.FIREBASE_WEB_API_KEY}`;

    const postData = JSON.stringify({ idToken });

    const options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    // Parse url for hostname and path
    const parsedUrl = new URL(url);
    options.hostname = parsedUrl.hostname;
    options.path = parsedUrl.pathname + parsedUrl.search;
    options.port = 443;

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            return reject(new Error(parsed.error.message));
          }
          const user = parsed.users && parsed.users[0];
          if (!user) {
            return reject(new Error('User not found'));
          }
          resolve(user);
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
};

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const user = await verifyFirebaseToken(token);
    req.user = {
      uid: user.localId,
      email: user.email,
      name: user.displayName,
    };
    next();
  } catch (error) {
    console.error('Token Verification Error:', error.message);
    return res.status(403).json({ error: 'Unauthorized: ' + error.message });
  }
};

module.exports = { verifyToken };
