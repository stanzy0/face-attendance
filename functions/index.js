const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.createDivisionAdmin = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Request requires authentication.');
  }

  const callerDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data().role !== 'superAdmin') {
    throw new functions.https.HttpsError('permission-denied', 'Only Super Admin can create Division Admin accounts.');
  }

  const email = String(data.email || '').trim();
  const password = String(data.password || '');
  const accountName = String(data.accountName || '').trim();
  const department = String(data.department || '').trim();
  const course = String(data.course || '').trim();
  const division = String(data.division || '').trim();

  if (!email || !password || !accountName || !department || !course || !division) {
    throw new functions.https.HttpsError('invalid-argument', 'All account fields are required.');
  }

  if (password.length < 6) {
    throw new functions.https.HttpsError('invalid-argument', 'Password must be at least 6 characters.');
  }

  try {
    const userRecord = await admin.auth().createUser({ email, password, displayName: accountName });
    await admin.firestore().collection('users').doc(userRecord.uid).set({
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

    return { uid: userRecord.uid, email, accountName, department, course, division };
  } catch (error) {
    throw new functions.https.HttpsError('internal', error.message || 'Failed to create Division Admin account.');
  }
});

exports.updateDivisionAdminScope = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Request requires authentication.');
  }

  const callerDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data().role !== 'superAdmin') {
    throw new functions.https.HttpsError('permission-denied', 'Only Super Admin can update Division Admin accounts.');
  }

  const targetUid = String(data.uid || '').trim();
  const department = String(data.department || '').trim();
  const course = String(data.course || '').trim();
  const division = String(data.division || '').trim();

  if (!targetUid || !department || !course || !division) {
    throw new functions.https.HttpsError('invalid-argument', 'Target uid and scope fields are required.');
  }

  const targetDoc = await admin.firestore().collection('users').doc(targetUid).get();
  if (!targetDoc.exists) {
    throw new functions.https.HttpsError('not-found', 'Division Admin account not found.');
  }

  await admin.firestore().collection('users').doc(targetUid).update({
    dept: department,
    course,
    division,
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { uid: targetUid, department, course, division };
});

exports.deleteDivisionAdmin = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Request requires authentication.');
  }

  const callerDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data().role !== 'superAdmin') {
    throw new functions.https.HttpsError('permission-denied', 'Only Super Admin can delete Division Admin accounts.');
  }

  const targetUid = String(data.uid || '').trim();
  if (!targetUid) {
    throw new functions.https.HttpsError('invalid-argument', 'Target uid is required.');
  }

  await admin.firestore().collection('users').doc(targetUid).delete();
  await admin.auth().deleteUser(targetUid);

  return { uid: targetUid };
});
