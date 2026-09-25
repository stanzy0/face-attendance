const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
    })
  });
}

const db = admin.firestore();

const ALLOWED_DEPARTMENTS = [
  'Department of Land Warfare',
  'Department of Maritime Warfare',
  'Department of Air Warfare'
];

const ALLOWED_COURSES = ['Senior Course', 'Junior Course'];

const COURSE_RULES = {
  'Senior Course': {
    divisions: ['Alpha Div', 'Bravo Div', 'Charlie Div', 'Delta Div'],
    syndicates: ['Syndicate 1', 'Syndicate 2', 'Syndicate 3', 'Syndicate 4', 'Syndicate 5', 'Syndicate 6', 'Syndicate 7', 'Syndicate 8']
  },
  'Junior Course': {
    divisions: ['Alpha Div', 'Bravo Div', 'Charlie Div'],
    syndicates: ['Syndicate 1', 'Syndicate 2', 'Syndicate 3', 'Syndicate 4', 'Syndicate 5', 'Syndicate 6']
  }
};

async function verifySuperAdmin(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'Unauthorized', status: 401 };
  }

  const idToken = authHeader.split('Bearer ')[1];
  if (!idToken) {
    return { error: 'Unauthorized', status: 401 };
  }

  let decodedToken;
  try {
    decodedToken = await admin.auth().verifyIdToken(idToken);
  } catch (e) {
    return { error: 'Invalid token', status: 401 };
  }

  const callerDoc = await db.collection('users').doc(decodedToken.uid).get();
  if (!callerDoc.exists || callerDoc.data().role !== 'superAdmin') {
    return { error: 'Forbidden', status: 403 };
  }

  return { uid: decodedToken.uid };
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authResult = await verifySuperAdmin(req.headers.authorization);
  if (authResult.error) {
    return res.status(authResult.status).json({ error: authResult.error });
  }

  const {
    accountName,
    email,
    password,
    department,
    course,
    division
  } = req.body || {};

  if (!accountName || !email || !password || !department || !course || !division) {
    return res.status(400).json({ error: 'All account fields are required.' });
  }

  if (!ALLOWED_DEPARTMENTS.includes(department)) {
    return res.status(400).json({ error: 'Invalid department.' });
  }

  if (!ALLOWED_COURSES.includes(course)) {
    return res.status(400).json({ error: 'Invalid course.' });
  }

  const courseRules = COURSE_RULES[course];
  if (!courseRules || !courseRules.divisions.includes(division)) {
    return res.status(400).json({ error: 'Invalid division for selected course.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }

  try {
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: accountName
    });

    await db.collection('users').doc(userRecord.uid).set({
      userId: userRecord.uid,
      email,
      name: accountName,
      dept: department,
      course,
      division,
      role: 'divisionAdmin',
      status: 'Active',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.status(201).json({
      uid: userRecord.uid,
      email,
      accountName,
      department,
      course,
      division
    });
  } catch (error) {
    console.error('Create division admin failed:', error);
    return res.status(500).json({ error: 'Failed to create Division Admin account.' });
  }
};
