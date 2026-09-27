const admin = require('firebase-admin');

function cleanEnv(value) {
  return (value || '').replace(/^"|"$/g, '').replace(/\\n/g, '\n');
}

const projectId = cleanEnv(process.env.FIREBASE_PROJECT_ID);
const clientEmail = cleanEnv(process.env.FIREBASE_CLIENT_EMAIL);
const privateKey = cleanEnv(process.env.FIREBASE_PRIVATE_KEY);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey
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
    syndicates: ['Syndicate 1', 'Syndicate 2', 'Syndicate 3', 'Syndicate 4', 'Syndicate 5', 'Syndicate 6', 'Syndicate 7', 'Syndicate 8'],
    terms: ['Term 1', 'Term 2', 'Term 3', 'Term 4', 'Term 5']
  },
  'Junior Course': {
    divisions: ['Alpha Div', 'Bravo Div', 'Charlie Div'],
    syndicates: ['Syndicate 1', 'Syndicate 2', 'Syndicate 3', 'Syndicate 4', 'Syndicate 5', 'Syndicate 6'],
    terms: ['Term 1', 'Term 2']
  }
};

async function getCallerScope(authHeader) {
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
  if (!callerDoc.exists) {
    return { error: 'Forbidden', status: 403 };
  }

  const callerData = callerDoc.data();
  const callerRole = (callerData && (callerData['role '] || callerData.role)) || null;

  if (callerRole === 'divisionAdmin') {
    return {
      role: 'divisionAdmin',
      uid: decodedToken.uid,
      department: callerData.dept || '',
      course: callerData.course || '',
      division: callerData.division || ''
    };
  }

  if (callerRole === 'superAdmin') {
    return { role: 'superAdmin', uid: decodedToken.uid };
  }

  // Student registration is Super Admin / Division Admin only.
  // so1 and chiefClerk are Staff managers and must never create student
  // records. Do not add them here.
  return { error: 'Forbidden', status: 403 };
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authResult = await getCallerScope(req.headers.authorization);
  if (authResult.error) {
    return res.status(authResult.status).json({ error: authResult.error });
  }

  const {
    userId,
    name,
    rank,
    term,
    division,
    syndicate,
    appointment,
    phone,
    faceDescriptor,
    faceImage,
    registeredLocation
  } = req.body || {};

  if (!userId || !name) {
    return res.status(400).json({ error: 'Service No. and Name are required.' });
  }

  if (!faceDescriptor || !Array.isArray(faceDescriptor) || faceDescriptor.length === 0) {
    return res.status(400).json({ error: 'Face descriptor is required.' });
  }

  let department = '';
  let course = '';
  let finalDivision = '';
  let finalTerm = '';
  let finalSyndicate = '';

  if (authResult.role === 'divisionAdmin') {
    department = authResult.department;
    course = authResult.course;
    finalDivision = authResult.division;

    if (!department || !course || !finalDivision) {
      return res.status(400).json({ error: 'Division Admin scope is incomplete. Contact Super Admin.' });
    }

    const courseData = COURSE_RULES[course];
    if (!courseData) {
      return res.status(400).json({ error: 'Invalid course in Division Admin scope.' });
    }

    if (!courseData.divisions.includes(finalDivision)) {
      return res.status(400).json({ error: 'Invalid division in Division Admin scope.' });
    }

    if (!term || !courseData.terms.includes(term)) {
      return res.status(400).json({ error: 'Invalid Term for your course scope.' });
    }
    finalTerm = term;

    if (!syndicate || !courseData.syndicates.includes(syndicate)) {
      return res.status(400).json({ error: 'Invalid Syndicate for your course scope.' });
    }
    finalSyndicate = syndicate;
  } else {
    department = (req.body.dept || '').trim();
    course = (req.body.course || '').trim();
    finalDivision = (req.body.division || '').trim();
    finalTerm = (req.body.term || '').trim();
    finalSyndicate = (req.body.syndicate || '').trim();

    if (!department || !course || !finalDivision || !finalTerm || !finalSyndicate) {
      return res.status(400).json({ error: 'Department, Course, Division, Term, and Syndicate are required for Super Admin.' });
    }

    if (!ALLOWED_DEPARTMENTS.includes(department)) {
      return res.status(400).json({ error: 'Invalid department.' });
    }

    const courseData = COURSE_RULES[course];
    if (!courseData) {
      return res.status(400).json({ error: 'Invalid course.' });
    }

    if (!courseData.divisions.includes(finalDivision)) {
      return res.status(400).json({ error: 'Invalid division for selected course.' });
    }

    if (!courseData.terms.includes(finalTerm)) {
      return res.status(400).json({ error: 'Invalid term for selected course.' });
    }

    if (!courseData.syndicates.includes(finalSyndicate)) {
      return res.status(400).json({ error: 'Invalid syndicate for selected course.' });
    }
  }

  try {
    const existing = await db.collection('users').doc(userId).get();
    if (existing.exists) {
      return res.status(409).json({ error: 'Service No. already registered.' });
    }

    const studentData = {
      userId,
      name,
      dept: department,
      course,
      term: finalTerm,
      division: finalDivision,
      syndicate: finalSyndicate,
      appointment: appointment || 'Student',
      phone: phone || '',
      rank: rank || '',
      faceDescriptor,
      faceImage: faceImage || null,
      registeredLocation: registeredLocation || null,
      registeredAt: admin.firestore.FieldValue.serverTimestamp(),
      role: 'student',
      status: 'Active'
    };

    await db.collection('users').doc(userId).set(studentData);

    return res.status(201).json({
      userId,
      name,
      dept: department,
      course,
      term: finalTerm,
      division: finalDivision,
      syndicate: finalSyndicate
    });
  } catch (error) {
    console.error('Register student failed:', error);
    return res.status(500).json({ error: 'Failed to register student.' });
  }
};