# BioTrack

Biometric Face Verification & Attendance System

This project is a military-grade browser-based face-recognition attendance system using face-api.js and Firebase Firestore.

Quick setup:

1. Serve the `public/` directory (e.g., with `firebase serve` or a static server).
2. Fill your Firebase config in `public/firebase-config.js` by setting `window.firebaseConfig`.
3. Open the page, click `Start Camera`.
4. Use `Register User` to capture a staff member's face and store descriptors in Firestore.
5. Use `Scan Face` to check-in; attendance records are written to the `attendance` collection.

Firestore expectations:
- Collection `users`: documents keyed by user ID with fields `name` (string), `department` (string), `descriptors` (array of descriptor arrays).
- Collection `attendance`: automatically written entries with `userId`, `name`, `department`, `timestamp`.

Security:
- Current `firestore.rules` allow open read/write. Lock this down before deploying publicly.

Notes:
- Face recognition accuracy depends on the quality and variety of registered face images.
- You can register multiple descriptors per user by running registration multiple times and updating the `descriptors` array in their `users` document.

Commands (example using Python's simple HTTP server):

```bash
# from the project root
cd public
python3 -m http.server 8080
# then open http://localhost:8080 in your browser
```
