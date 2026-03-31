const admin = require("firebase-admin");

try {
  // Assuming the user places serviceAccountKey.json in the server/ directory
  const serviceAccount = require("../serviceAccountKey.json");
  
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
  console.log("Firebase Admin initialized successfully.");
} catch (error) {
  console.warn("Firebase Admin init warning: serviceAccountKey.json not found in server/ directory.");
  console.warn("Please add serviceAccountKey.json to the server/ directory to test backend auth functions.");
}

module.exports = admin;
