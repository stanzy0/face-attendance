const admin = require('firebase-admin');

function cleanEnv(value) {
  return (value || '').replace(/^"|"$/g, '').replace(/\\n/g, '\n');
}

const projectId = cleanEnv(process.env.FIREBASE_PROJECT_ID);
const clientEmail = cleanEnv(process.env.FIREBASE_CLIENT_EMAIL);
const privateKey = cleanEnv(process.env.FIREBASE_PRIVATE_KEY);

// Initialised once at module load. A missing or malformed service account
// throws here, which Vercel reports only as FUNCTION_INVOCATION_FAILED, so the
// failure is captured and surfaced per request instead.
let FIREBASE_INIT_ERROR = null;
let db = null;

try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey
      })
    });
  }
  db = admin.firestore();
} catch (e) {
  FIREBASE_INIT_ERROR = (e && e.message) || String(e);
  console.error('[BioTrack] Firebase Admin init failed:', FIREBASE_INIT_ERROR);
}

const ALLOWED_DEPARTMENTS = [
  'Department of Land Warfare',
  'Department of Maritime Warfare',
  'Department of Air Warfare'
];

const STAFF_APPOINTMENTS = [
  'Cleaner',
  'Receptionist',
  'ITC',
  'Gardener',
  'Electrician',
  'Clerk',
  'Carpenter',
  'Plumber',
  'Kitchen',
  'Office Assistant',
  'Office Clerk',
  'Computer Operator',
  'Cook',
  'Driver',
  'Mechanic',
  'Secretary'
];

const STAFF_STATUSES = ['Staff'];

const STAFF_MANAGER_ROLES = ['superAdmin', 'so1', 'chiefClerk'];

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

  return { role: callerRole, uid: decodedToken.uid };
}

function isStaffManager(role) {
  return STAFF_MANAGER_ROLES.includes(role);
}

// Removes the Firebase Authentication account for a deleted user, if one exists.
// Staff are keyed by employee ID rather than an Auth UID, so a missing account
// is the normal case and is not an error. Any other failure is rethrown so the
// caller never reports a successful deletion.
async function deleteAuthAccount(uid) {
  if (!uid) return false;
  try {
    await admin.auth().deleteUser(uid);
    return true;
  } catch (e) {
    if (e && e.code === 'auth/user-not-found') return false;
    throw e;
  }
}

// Deletes every attendance record for a user in bounded batches, so a user with
// a long history cannot exceed Firestore's 500-operation batch limit.
async function deleteAttendanceForUser(userId) {
  const attendanceQuery = await db.collection('attendance')
    .where('userId', '==', userId)
    .get();

  const docs = attendanceQuery.docs;
  const batchSize = 450;
  for (let i = 0; i < docs.length; i += batchSize) {
    const batch = db.batch();
    docs.slice(i, i + batchSize).forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();
  }
  return docs.length;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (!db) {
    return res.status(500).json({
      error: 'Server not configured: Firebase Admin credentials are missing or invalid.',
      detail: FIREBASE_INIT_ERROR,
      hint: 'Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in the Vercel project environment variables, then redeploy.'
    });
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const authResult = await getCallerScope(req.headers.authorization);
  if (authResult.error) {
    return res.status(authResult.status).json({ error: authResult.error });
  }

  const { uid } = req.query;

  if (req.method === 'GET') {
    if (uid) {
      try {
        const staffDoc = await db.collection('users').doc(uid).get();
        if (!staffDoc.exists) {
          return res.status(404).json({ error: 'Staff member not found.' });
        }

        const staffData = staffDoc.data();
        const staffRole = staffData['role '] || staffData.role || null;
        const staffPersonType = staffData.personType || 'student';

        if (staffRole !== 'staff' || staffPersonType !== 'staff') {
          return res.status(404).json({ error: 'Staff member not found.' });
        }

        return res.status(200).json({ id: staffDoc.id, ...staffData });
      } catch (error) {
        console.error('Get staff failed:', error);
        return res.status(500).json({ error: 'Failed to retrieve staff.' });
      }
    }

    if (!isStaffManager(authResult.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions.' });
    }

    try {
      const snapshot = await db.collection('users')
        .where('personType', '==', 'staff')
        .get();

      const staff = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(s => s.personType === 'staff');

      return res.status(200).json({ staff, count: staff.length });
    } catch (error) {
      console.error('List staff failed:', error);
      return res.status(500).json({ error: 'Failed to list staff.' });
    }
  }

  if (req.method === 'POST') {
    if (!isStaffManager(authResult.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions to create staff.' });
    }

    const {
      userId,
      name,
      dept,
      appointment,
      status,
      phone,
      faceDescriptor,
      faceImage,
      registeredLocation
    } = req.body || {};

    if (!userId || !name) {
      return res.status(400).json({ error: 'Employee ID and Name are required.' });
    }

    if (!dept) {
      return res.status(400).json({ error: 'Department is required.' });
    }

    if (!ALLOWED_DEPARTMENTS.includes(dept)) {
      return res.status(400).json({ error: 'Invalid department.' });
    }

    if (!appointment) {
      return res.status(400).json({ error: 'Appointment is required.' });
    }

    if (!STAFF_APPOINTMENTS.includes(appointment)) {
      return res.status(400).json({ error: 'Invalid appointment.' });
    }

    if (!status) {
      return res.status(400).json({ error: 'Status is required.' });
    }

    if (!STAFF_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status.' });
    }

    if (!faceDescriptor || !Array.isArray(faceDescriptor) || faceDescriptor.length === 0) {
      return res.status(400).json({ error: 'Face descriptor is required.' });
    }

    try {
      const existing = await db.collection('users').doc(userId).get();
      if (existing.exists) {
        return res.status(409).json({ error: 'Employee ID already registered.' });
      }

      const staffData = {
        userId,
        name,
        dept,
        appointment,
        status,
        phone: phone || '',
        faceDescriptor,
        faceImage: faceImage || null,
        registeredLocation: registeredLocation || null,
        registeredAt: admin.firestore.FieldValue.serverTimestamp(),
        role: 'staff',
        personType: 'staff',
        person_type: 'staff'
      };

      await db.collection('users').doc(userId).set(staffData);

      return res.status(201).json({
        userId,
        name,
        dept,
        appointment,
        status
      });
    } catch (error) {
      console.error('Register staff failed:', error);
      return res.status(500).json({ error: 'Failed to register staff.' });
    }
  }

  if (req.method === 'PATCH') {
    if (!uid) {
      return res.status(400).json({ error: 'Staff UID is required.' });
    }

    if (!isStaffManager(authResult.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions to edit staff.' });
    }

    try {
      const staffDoc = await db.collection('users').doc(uid).get();
      if (!staffDoc.exists) {
        return res.status(404).json({ error: 'Staff member not found.' });
      }

      const staffData = staffDoc.data();
      const staffRole = staffData['role '] || staffData.role || null;
      const staffPersonType = staffData.personType || 'student';

      if (staffRole !== 'staff' || staffPersonType !== 'staff') {
        return res.status(404).json({ error: 'Staff member not found.' });
      }

      const {
        name,
        dept,
        appointment,
        status,
        phone
      } = req.body || {};

      const allowedFields = ['name', 'dept', 'appointment', 'status', 'phone'];
      const updateData = {};

      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update.' });
      }

      if (updateData.dept && !ALLOWED_DEPARTMENTS.includes(updateData.dept)) {
        return res.status(400).json({ error: 'Invalid department.' });
      }

      if (updateData.appointment && !STAFF_APPOINTMENTS.includes(updateData.appointment)) {
        return res.status(400).json({ error: 'Invalid appointment.' });
      }

      if (updateData.status && !STAFF_STATUSES.includes(updateData.status)) {
        return res.status(400).json({ error: 'Invalid status.' });
      }

      updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();

      await db.collection('users').doc(uid).update(updateData);

      return res.status(200).json({ uid, ...updateData });
    } catch (error) {
      console.error('Update staff failed:', error);
      return res.status(500).json({ error: 'Failed to update staff.' });
    }
  }

  if (req.method === 'DELETE') {
    if (!uid) {
      return res.status(400).json({ error: 'Staff UID is required.' });
    }

    if (!isStaffManager(authResult.role)) {
      return res.status(403).json({ error: 'Access denied. Insufficient permissions to delete staff.' });
    }

    try {
      const staffDoc = await db.collection('users').doc(uid).get();
      if (!staffDoc.exists) {
        return res.status(404).json({ error: 'Staff member not found.' });
      }

      const staffData = staffDoc.data();
      const staffRole = staffData['role '] || staffData.role || null;
      const staffPersonType = staffData.personType || 'student';

      if (staffRole !== 'staff' || staffPersonType !== 'staff') {
        return res.status(404).json({ error: 'Staff member not found.' });
      }

      const employeeUserId = staffData.userId || uid;

      // Auth accounts are removed first: if this fails we abort before the
      // Firestore document is touched, so nothing is half-deleted.
      const authCandidates = Array.from(new Set([uid, employeeUserId].filter(Boolean)));
      let authDeleted = 0;
      for (const candidate of authCandidates) {
        if (await deleteAuthAccount(candidate)) authDeleted++;
      }

      const attendanceDeleted = await deleteAttendanceForUser(employeeUserId);

      await db.collection('users').doc(uid).delete();

      return res.status(200).json({
        uid,
        attendanceDeleted,
        authDeleted,
        userDeleted: true
      });
    } catch (error) {
      console.error('Delete staff failed:', error);
      return res.status(500).json({ error: 'Failed to delete staff.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};