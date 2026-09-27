const admin = require('firebase-admin');

// Roles that are never part of the student population.
// Single source of truth, mirroring isStudentUser() in public/admin-dashboard.js.
const NON_STUDENT_ROLES = ['superAdmin', 'divisionAdmin', 'so1', 'chiefClerk', 'staff'];

function getUserRoleValue(user) {
  if (!user) return null;
  return user['role '] || user.role || null;
}

function isNonStudentRole(role) {
  return !!role && NON_STUDENT_ROLES.includes(role);
}

function isStudentDocument(user) {
  if (!user) return false;
  if (user.personType === 'staff') return false;
  return !isNonStudentRole(getUserRoleValue(user));
}

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

  // so1 and chiefClerk are Staff managers with read-only access to Students:
  // they are deliberately NOT granted access to any student endpoint.
  // Do not add them here. Their Student read access comes from the dashboard's
  // own scoped users read, and all student writes stay forbidden.
  return { error: 'Forbidden', status: 403 };
}

function buildStudentQuery(scope, options = {}) {
  const { searchTerm, termFilter, syndicateFilter, statusFilter } = options;
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

  if (termFilter) {
    query = query.where('term', '==', termFilter);
  }
  if (syndicateFilter) {
    query = query.where('syndicate', '==', syndicateFilter);
  }
  if (statusFilter) {
    query = query.where('appointment', '==', statusFilter);
  }

  return query;
}

function matchesSearch(user, searchTerm) {
  if (!searchTerm) return true;
  const term = searchTerm.toLowerCase();
  const name = (user['name '] || user.name || '').toLowerCase();
  const userId = (user.userId || user.id || '').toLowerCase();
  const rank = (user.rank || '').toLowerCase();
  const phone = (user.phone || '').toLowerCase();
  return name.includes(term) || userId.includes(term) || rank.includes(term) || phone.includes(term);
}

function filterAndSortStudents(users, searchTerm) {
  let filtered = users.filter(u => isStudentDocument(u));

  if (searchTerm) {
    filtered = filtered.filter(u => matchesSearch(u, searchTerm));
  }

  filtered.sort((a, b) => {
    const nameA = (a['name '] || a.name || '').toLowerCase();
    const nameB = (b['name '] || b.name || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  return filtered;
}

function validateStudentUpdate(authResult, body) {
  const { term, syndicate, division, course, department } = body;

  if (authResult.role === 'divisionAdmin') {
    if (department && department !== authResult.department) {
      return { error: 'Cannot change department. Division Admin is restricted to their own department.' };
    }
    if (course && course !== authResult.course) {
      return { error: 'Cannot change course. Division Admin is restricted to their own course.' };
    }
    if (division && division !== authResult.division) {
      return { error: 'Cannot change division. Division Admin is restricted to their own division.' };
    }

    const courseData = COURSE_RULES[authResult.course];
    if (!courseData) {
      return { error: 'Invalid course in Division Admin scope.' };
    }

    if (term && !courseData.terms.includes(term)) {
      return { error: 'Invalid Term for your course scope.' };
    }
    if (syndicate && !courseData.syndicates.includes(syndicate)) {
      return { error: 'Invalid Syndicate for your course scope.' };
    }
  } else {
    if (department && !ALLOWED_DEPARTMENTS.includes(department)) {
      return { error: 'Invalid department.' };
    }
    if (course && !ALLOWED_COURSES.includes(course)) {
      return { error: 'Invalid course.' };
    }
    if (division) {
      const courseToCheck = course || (authResult.role === 'divisionAdmin' ? authResult.course : null);
      if (!courseToCheck) {
        return { error: 'Course is required to validate division.' };
      }
      const courseData = COURSE_RULES[courseToCheck];
      if (!courseData || !courseData.divisions.includes(division)) {
        return { error: 'Invalid division for selected course.' };
      }
    }
    if (term) {
      const courseToCheck = course || (authResult.role === 'divisionAdmin' ? authResult.course : null);
      if (!courseToCheck) {
        return { error: 'Course is required to validate term.' };
      }
      const courseData = COURSE_RULES[courseToCheck];
      if (!courseData || !courseData.terms.includes(term)) {
        return { error: 'Invalid term for selected course.' };
      }
    }
    if (syndicate) {
      const courseToCheck = course || (authResult.role === 'divisionAdmin' ? authResult.course : null);
      if (!courseToCheck) {
        return { error: 'Course is required to validate syndicate.' };
      }
      const courseData = COURSE_RULES[courseToCheck];
      if (!courseData || !courseData.syndicates.includes(syndicate)) {
        return { error: 'Invalid syndicate for selected course.' };
      }
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

  const { uid } = req.query;

  if (req.method === 'GET') {
    if (uid) {
      try {
        const studentDoc = await db.collection('users').doc(uid).get();
        if (!studentDoc.exists) {
          return res.status(404).json({ error: 'Student not found.' });
        }

        const studentData = studentDoc.data();
        const studentRole = getUserRoleValue(studentData);

        if (isNonStudentRole(studentRole) || studentData.personType === 'staff') {
          return res.status(404).json({ error: 'Student not found.' });
        }

        if (authResult.role === 'divisionAdmin') {
          if (studentData.dept !== authResult.department ||
              studentData.course !== authResult.course ||
              studentData.division !== authResult.division) {
            return res.status(403).json({ error: 'Access denied. Student is outside your division scope.' });
          }
        }

        return res.status(200).json({ id: studentDoc.id, ...studentData });
      } catch (error) {
        console.error('Get student failed:', error);
        return res.status(500).json({ error: 'Failed to retrieve student.' });
      }
    }

    try {
      const { searchTerm, termFilter, syndicateFilter, statusFilter } = req.query;
      const query = buildStudentQuery(authResult, { searchTerm, termFilter, syndicateFilter, statusFilter });

      const snapshot = await query.get();
      const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      const filtered = filterAndSortStudents(users, searchTerm);

      return res.status(200).json({ students: filtered });
    } catch (error) {
      console.error('List students failed:', error);
      return res.status(500).json({ error: error.message || 'Failed to list students.' });
    }
  }

  if (req.method === 'PATCH') {
    if (!uid) {
      return res.status(400).json({ error: 'Student UID is required.' });
    }

    try {
      const studentDoc = await db.collection('users').doc(uid).get();
      if (!studentDoc.exists) {
        return res.status(404).json({ error: 'Student not found.' });
      }

      const studentData = studentDoc.data();
      const studentRole = getUserRoleValue(studentData);

      if (isNonStudentRole(studentRole) || studentData.personType === 'staff') {
        return res.status(404).json({ error: 'Student not found.' });
      }

      if (authResult.role === 'divisionAdmin') {
        if (studentData.dept !== authResult.department ||
            studentData.course !== authResult.course ||
            studentData.division !== authResult.division) {
          return res.status(403).json({ error: 'Access denied. Student is outside your division scope.' });
        }
      }

      const validationError = validateStudentUpdate(authResult, req.body);
      if (validationError) {
        return res.status(400).json(validationError);
      }

      const allowedFields = ['name', 'rank', 'term', 'syndicate', 'appointment', 'phone', 'status'];
      const updateData = {};

      allowedFields.forEach(field => {
        if (req.body[field] !== undefined) {
          updateData[field] = req.body[field];
        }
      });

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'No valid fields to update.' });
      }

      updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();

      await db.collection('users').doc(uid).update(updateData);

      return res.status(200).json({ uid, ...updateData });
    } catch (error) {
      console.error('Update student failed:', error);
      return res.status(500).json({ error: 'Failed to update student.' });
    }
  }

  if (req.method === 'DELETE') {
    if (!uid) {
      return res.status(400).json({ error: 'Student UID is required.' });
    }

    try {
      const studentDoc = await db.collection('users').doc(uid).get();
      if (!studentDoc.exists) {
        return res.status(404).json({ error: 'Student not found.' });
      }

      const studentData = studentDoc.data();
      const studentRole = getUserRoleValue(studentData);

      if (isNonStudentRole(studentRole) || studentData.personType === 'staff') {
        return res.status(404).json({ error: 'Student not found.' });
      }

      if (authResult.role === 'divisionAdmin') {
        if (studentData.dept !== authResult.department ||
            studentData.course !== authResult.course ||
            studentData.division !== authResult.division) {
          return res.status(403).json({ error: 'Access denied. Student is outside your division scope.' });
        }
      }

      const employeeUserId = studentData.userId || uid;

      const attendanceQuery = await db.collection('attendance')
        .where('userId', '==', employeeUserId)
        .get();

      if (!attendanceQuery.empty) {
        const attendanceDocs = attendanceQuery.docs;
        const batchSize = 450;
        for (let i = 0; i < attendanceDocs.length; i += batchSize) {
          const batch = db.batch();
          const chunk = attendanceDocs.slice(i, i + batchSize);
          chunk.forEach(doc => {
            batch.delete(doc.ref);
          });
          await batch.commit();
        }
      }

      await db.collection('users').doc(uid).delete();

      return res.status(200).json({ uid });
    } catch (error) {
      console.error('Delete student failed:', error);
      return res.status(500).json({ error: 'Failed to delete student.' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};