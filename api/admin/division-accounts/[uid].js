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

  const authResult = await verifySuperAdmin(req.headers.authorization);
  if (authResult.error) {
    return res.status(authResult.status).json({ error: authResult.error });
  }

  const { uid } = req.query;

  if (!uid || typeof uid !== 'string') {
    return res.status(400).json({ error: 'Target uid is required.' });
  }

  if (req.method === 'PATCH') {
    const { accountName, department, course, division } = req.body || {};

    if (!department || !course || !division) {
      return res.status(400).json({ error: 'department, course, and division are required.' });
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

    try {
      const targetDoc = await db.collection('users').doc(uid).get();
      if (!targetDoc.exists) {
        return res.status(404).json({ error: 'Division Admin account not found.' });
      }

      const updateData = {
        dept: department,
        course,
        division,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (accountName) {
        updateData.name = accountName;
      }

      await db.collection('users').doc(uid).update(updateData);

      return res.status(200).json({
        uid,
        accountName: accountName || targetDoc.data().name,
        department,
        course,
        division
      });
    } catch (error) {
      console.error('Update division admin scope failed:', error);
      return res.status(500).json({ error: 'Failed to update Division Admin scope.' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const targetDoc = await db.collection('users').doc(uid).get();
      if (!targetDoc.exists) {
        return res.status(404).json({ error: 'Division Admin account not found.' });
      }

      const targetData = targetDoc.data();
      if (targetData.role !== 'divisionAdmin') {
        return res.status(400).json({ error: 'Target user is not a Division Admin.' });
      }

      await db.collection('users').doc(uid).delete();
      await admin.auth().deleteUser(uid);

      return res.status(200).json({ uid });
    } catch (error) {
      console.error('Delete division admin failed:', error);
      return res.status(500).json({ error: 'Failed to delete Division Admin account.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
