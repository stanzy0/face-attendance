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

  return { error: 'Forbidden', status: 403 };
}

function buildAttendanceQuery(scope, options = {}) {
  const { startDate, endDate, userId, termFilter, syndicateFilter, statusFilter, locationFilter } = options;
  let query = db.collection('attendance');

  if (startDate && endDate) {
    query = query.where('date', '>=', startDate).where('date', '<=', endDate);
  } else if (startDate) {
    query = query.where('date', '>=', startDate);
  } else if (endDate) {
    query = query.where('date', '<=', endDate);
  }

  if (scope.role === 'divisionAdmin') {
    if (!scope.department || !scope.course || !scope.division) {
      throw new Error('Division Admin scope is incomplete. Contact Super Admin.');
    }
    query = query
      .where('dept', '==', scope.department)
      .where('course', '==', scope.course)
      .where('division', '==', scope.division);
  }

  if (userId) {
    query = query.where('userId', '==', userId);
  }

  if (termFilter) {
    query = query.where('term', '==', termFilter);
  }

  if (syndicateFilter) {
    query = query.where('syndicate', '==', syndicateFilter);
  }

  return query;
}

function buildUsersQuery(scope, options = {}) {
  let query = db.collection('users');

  if (scope.role === 'divisionAdmin') {
    if (!scope.department || !scope.course || !scope.division) {
      throw new Error('Division Admin scope is incomplete. Contact Super Admin.');
    }
    query = query
      .where('dept', '==', scope.department)
      .where('course', '==', scope.course)
      .where('division', '==', scope.division);
  }

  query = query.where('role', '!=', 'superAdmin').where('role', '!=', 'divisionAdmin');

  if (options.termFilter) {
    query = query.where('term', '==', options.termFilter);
  }
  if (options.syndicateFilter) {
    query = query.where('syndicate', '==', options.syndicateFilter);
  }
  if (options.statusFilter) {
    query = query.where('appointment', '==', options.statusFilter);
  }

  return query;
}

function validateReportFilters(scope, filters) {
  if (scope.role === 'divisionAdmin') {
    if (filters.department && filters.department !== scope.department) {
      return { error: 'Cannot filter by another department.' };
    }
    if (filters.course && filters.course !== scope.course) {
      return { error: 'Cannot filter by another course.' };
    }
    if (filters.division && filters.division !== scope.division) {
      return { error: 'Cannot filter by another division.' };
    }
    if (filters.term) {
      const courseData = COURSE_RULES[scope.course];
      if (!courseData || !courseData.terms.includes(filters.term)) {
        return { error: 'Invalid term for your course scope.' };
      }
    }
    if (filters.syndicate) {
      const courseData = COURSE_RULES[scope.course];
      if (!courseData || !courseData.syndicates.includes(filters.syndicate)) {
        return { error: 'Invalid syndicate for your course scope.' };
      }
    }
  } else {
    if (filters.department && !ALLOWED_DEPARTMENTS.includes(filters.department)) {
      return { error: 'Invalid department.' };
    }
    if (filters.course && !ALLOWED_COURSES.includes(filters.course)) {
      return { error: 'Invalid course.' };
    }
  }
  return null;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const authResult = await getCallerScope(req.headers.authorization);
  if (authResult.error) {
    return res.status(authResult.status).json({ error: authResult.error });
  }

  const reportType = req.query.type || 'attendance';

  if (req.method === 'GET') {
    try {
      const { 
        startDate, 
        endDate, 
        userId, 
        term, 
        syndicate, 
        status, 
        location,
        department,
        course,
        division
      } = req.query;

      const filters = {
        department: department || '',
        course: course || '',
        division: division || '',
        term: term || '',
        syndicate: syndicate || '',
        status: status || '',
        location: location || ''
      };

      const validationError = validateReportFilters(authResult, filters);
      if (validationError) {
        return res.status(400).json(validationError);
      }

      if (reportType === 'attendance') {
        const query = buildAttendanceQuery(authResult, { 
          startDate, 
          endDate, 
          userId,
          termFilter: term || null,
          syndicateFilter: syndicate || null,
          statusFilter: status || null
        });

        const snapshot = await query.get();
        const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        return res.status(200).json({ 
          records, 
          count: records.length,
          scope: authResult.role === 'divisionAdmin' ? {
            department: authResult.department,
            course: authResult.course,
            division: authResult.division
          } : null
        });
      }

      if (reportType === 'students') {
        const query = buildUsersQuery(authResult, {
          termFilter: term || null,
          syndicateFilter: syndicate || null,
          statusFilter: status || null
        });

        const snapshot = await query.get();
        const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        return res.status(200).json({ 
          students: users, 
          count: users.length,
          scope: authResult.role === 'divisionAdmin' ? {
            department: authResult.department,
            course: authResult.course,
            division: authResult.division
          } : null
        });
      }

      if (reportType === 'analytics') {
        const attendanceQuery = buildAttendanceQuery(authResult, { 
          startDate, 
          endDate,
          userId,
          termFilter: term || null,
          syndicateFilter: syndicate || null,
          statusFilter: status || null
        });
        const attendanceSnapshot = await attendanceQuery.get();
        const attendanceRecords = attendanceSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        const usersQuery = buildUsersQuery(authResult, {
          termFilter: term || null,
          syndicateFilter: syndicate || null,
          statusFilter: status || null
        });
        const usersSnapshot = await usersQuery.get();
        const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        return res.status(200).json({ 
          attendance: attendanceRecords,
          students: users,
          scope: authResult.role === 'divisionAdmin' ? {
            department: authResult.department,
            course: authResult.course,
            division: authResult.division
          } : null
        });
      }

      return res.status(400).json({ error: 'Invalid report type.' });
    } catch (error) {
      console.error('Reports API error:', error);
      return res.status(500).json({ error: error.message || 'Failed to generate report.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};