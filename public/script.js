/* Face Attendance - Fixed showStatus + Location Restriction (500m office) */

// LOCATION CONSTANTS - 10.81036, 7.54929 ±500m
const OFFICE_CENTER = { lat: 10.81036, lng: 7.54929 };
const MAX_DISTANCE_METERS = 500;

// === GLOBAL UTILITIES - NO HOISTING ISSUES ===
function getErrorMessage(e) {
  if (!e) return 'An unexpected error occurred';
  if (typeof e === 'string') return e;
  return e.message || 'An unexpected error occurred';
}
function showStatus(msg, type = 'info') {
  const selectors = ['#status', '.status-card', '#adminStatus', '#matchCard'];
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) {
      el.textContent = msg;
      el.style.color = {
        error: '#ff6b6b',
        success: '#2E8B57',
        info: '#C8A646'
      }[type] || '#C8A646';
      return;
    }
  }
  console.log(`[Status ${type.toUpperCase()}]: ${msg}`);
}

// Haversine distance calculation
function getDistanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Location permission check
async function verifyOfficeLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject('Geolocation unavailable');
    
    navigator.geolocation.getCurrentPosition(
      position => {
        const { latitude: lat, longitude: lng, accuracy } = position.coords;
        const distance = getDistanceMeters(OFFICE_CENTER.lat, OFFICE_CENTER.lng, lat, lng);
        
        currentLocation = { lat, lng, accuracy, distance };
        console.log(`GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)} | Distance: ${distance.toFixed(0)}m | Allowed: ${distance <= MAX_DISTANCE_METERS}`);
        
        if (distance <= MAX_DISTANCE_METERS) {
          showStatus(`✅ Office OK (${distance.toFixed(0)}m)`, 'success');
          resolve(currentLocation);
        } else {
          const distanceKm = (distance / 1000).toFixed(1);
          const msg = `⚠️ Outside office (${distanceKm} km). Attendance blocked.`;
          console.log(`GPS: ${lat.toFixed(5)}, ${lng.toFixed(5)} | Distance: ${distance.toFixed(0)}m | Allowed: ${distance <= MAX_DISTANCE_METERS}`);
          showStatus(msg, 'error');
          reject(msg);
        }
      },
      error => {
        showStatus('GPS access denied - attendance blocked', 'error');
        reject(error.message);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  });
}

// Global vars
let firebaseApp, auth, db, video, canvas, displaySize, currentLocation;
let isAdminSignedIn = false;
let isScanning = false;
let cachedUsers = null;
let usersCacheTimestamp = 0;
const USERS_CACHE_TTL_MS = 5 * 60 * 1000;

// ADMIN FUNCTIONS (bridge compatible)
async function adminSignIn() {
  const emailEl = document.getElementById('adminEmail');
  const passEl = document.getElementById('adminPassword');
  if (!emailEl?.value || !passEl?.value) return showStatus('Enter email/password', 'error');
  
  try {
    showStatus('Signing in...', 'info');
    const result = await auth.signInWithEmailAndPassword(emailEl.value, passEl.value);
    console.log('Sign in success:', result.user.email);
    showStatus('Signed in successfully! Panel loading...', 'success');
  } catch (e) {
    console.error('Sign in error:', e.code, e.message);
    let errorMsg = 'Login failed';
    if (e.code === 'auth/user-not-found') errorMsg = 'No admin account found - create one in Firebase Console';
    else if (e.code === 'auth/wrong-password') errorMsg = 'Wrong password';
    else if (e.code === 'auth/invalid-email') errorMsg = 'Invalid email format';
    else errorMsg = e.message;
    showStatus(errorMsg, 'error');
  }
}

async function adminSignOut() {
  try {
    showStatus('Signing out...', 'info');
    await auth.signOut();
  } catch (e) {
    showStatus('Logout failed', 'error');
  }
}

let reportMode = false; // Global toggle for daily report vs records

async function loadAttendanceRecords(dateStr) {
  const table = document.getElementById('attendanceTable');
  const dateInput = document.getElementById('attendanceDate');
  if (!table) return;

  const date = dateStr || (dateInput ? dateInput.value : new Date().toISOString().split('T')[0]);
  
  if (reportMode) {
    await loadDailyReport(date);
    return;
  }
  
  showStatus('Loading records for ' + date + '...', 'info');
  
  try {
    const snapshot = await db.collection('attendance').where('date', '==', date).get();
    snapshot.docs.sort((a, b) => (b.data().timestamp?.toMillis() || 0) - (a.data().timestamp?.toMillis() || 0));

    let html = '<table><thead><tr><th>Photo</th><th>ID</th><th>Name</th><th>Dept</th><th>Appt</th><th>GPS</th><th>Time</th></tr></thead><tbody>';
    if (snapshot.empty) {
      html += '<tr><td colspan="7">No records</td></tr>';
    } else {
      snapshot.forEach(doc => {
        const d = doc.data();
        const photoHtml = d.faceImage ? `<img src="${d.faceImage}" style="width:50px;height:50px;border-radius:4px;object-fit:cover;" alt="Face" onerror="this.style.display=\'none\'">` : 'No photo';
        html += `<tr class="present-row">
          <td>${photoHtml}</td>
          <td>${d.userId||'N/A'}</td>
          <td>${d.name||'N/A'}</td>
          <td>${d.dept||'N/A'}</td>
          <td>${d.appointment||'N/A'}</td>
          <td>${d.location ? d.location.lat.toFixed(4) + ',' + d.location.lng.toFixed(4) : 'N/A'}</td>
          <td>${d.timestamp ? d.timestamp.toDate().toLocaleTimeString() : 'N/A'}</td>
        </tr>`;
      });
    }
    html += '</tbody></table>';
    table.innerHTML = html;
    showStatus(`Loaded ${snapshot.size} records`, 'success');
  } catch (e) {
    showStatus('Load failed: ' + getErrorMessage(e), 'error');
  }
}

async function loadDailyReport(dateStr) {
  const table = document.getElementById('attendanceTable');
  const statsDiv = document.getElementById('absenceStats');
  if (!table || !statsDiv || !db) {
    showStatus('Database not ready', 'error');
    return;
  }
  
  const date = dateStr || document.getElementById('attendanceDate')?.value || new Date().toISOString().split('T')[0];
  showStatus('Generating daily report for ' + date + '...', 'info');
  
  try {
    const usersSnapshot = await db.collection('users').get();
    const presentSnapshot = await db.collection('attendance')
      .where('date', '==', date)
      .get();
    
    const allUsers = Array.from(usersSnapshot.docs).map(doc => doc.data().userId || doc.id);
    const presentUsers = new Set(presentSnapshot.docs.map(doc => doc.data().userId));
    const absentUsers = allUsers.filter(id => !presentUsers.has(id));
    
    const total = allUsers.length;
    const present = presentUsers.size;
    const absent = absentUsers.length;
    const rate = total > 0 ? Math.round((present / total) * 100) : 0;
    
    statsDiv.innerHTML = `
      <div class="absence-total"><strong>Total Staff:</strong> ${total}</div>
      <div class="absence-present">Present: ${present}</div>
      <div class="absence-absent">Absent: ${absent}</div>
      <div class="absence-rate">Rate: ${rate}%</div>
    `;
    statsDiv.style.display = 'grid';
    
    let html = '<table><thead><tr><th>Status</th><th>ID</th><th>Name</th><th>Dept</th><th>Appt</th></tr></thead><tbody>';
    
    presentSnapshot.forEach(doc => {
      const d = doc.data();
      html += `<tr class="present-row">
        <td>✅</td><td>${d.userId}</td><td>${d.name}</td><td>${d.dept}</td><td>${d.appointment}</td>
      </tr>`;
    });
    
    absentUsers.forEach(userId => {
      const userDoc = usersSnapshot.docs.find(doc => (doc.data().userId || doc.id) === userId);
      const userData = userDoc ? userDoc.data() : {};
      html += `<tr class="absent-row">
        <td>❌</td><td>${userId}</td><td>${userData.name || 'N/A'}</td><td>${userData.dept || 'N/A'}</td><td>${userData.appointment || 'N/A'}</td>
      </tr>`;
    });
    
    html += '</tbody></table>';
    table.innerHTML = html;
    
    showStatus(`Daily Report: ${present}/${total} (${rate}%)`, 'success');
  } catch (e) {
    showStatus('Report failed: ' + getErrorMessage(e), 'error');
  }
}




function clearRegisterForm() {
  ['regUserId','regName','regDept','regAppointment','regPhone'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  showStatus('Form cleared', 'info');
}

// EXPORT FUNCTIONS
function getRestrictedExcelBrandingRows(title) {
  var reportTitle = title || 'Attendance Report';
  return [
    ['RESTRICTED'],
    [],
    [reportTitle],
    [],
    ['Unauthorized disclosure, transmission, reproduction or retention of information on this sheet violates the Official CAP 03 (LFN) 2004.']
  ];
}

function configureRestrictedExcelPrintSettings(wb, ws) {
  if (!ws || !wb) return;
  ws['!header'] = '&C&"Arial,bold"RESTRICTED';
  ws['!footer'] = '&CPage &P of &N';
  ws['!pageSetup'] = ws['!pageSetup'] || {};
  ws['!pageSetup'].orientation = 'landscape';
  ws['!pageSetup'].fitToPage = true;
  ws['!pageSetup'].fitToWidth = 1;
  ws['!pageSetup'].fitToHeight = 0;
  ws['!pageSetup'].paperSize = 9;
}

function drawRestrictedPdfPageHeader(doc, reportTitle) {
  var pageWidth = doc.internal.pageSize.width ? doc.internal.pageSize.width : 210;

  doc.setFillColor(180, 30, 30);
  doc.rect(14, 6, pageWidth - 28, 7, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('RESTRICTED', pageWidth / 2, 11, { align: 'center' });

  try {
    doc.addImage('assets/afcsc logo.png', 'PNG', 14, 15, 16, 16);
    doc.addImage('assets/army logo.png', 'PNG', pageWidth - 30, 15, 16, 16);
  } catch (e) {
    // Logo loading failed
  }

  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'bold');
  doc.text('BioTrack', 14, 36);

  if (reportTitle) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(reportTitle, 14, 42);
  }
}

function drawRestrictedPdfPageFooter(doc, pageNum, totalPages) {
  var pageHeight = doc.internal.pageSize.height ? doc.internal.pageSize.height : 297;
  var pageWidth = doc.internal.pageSize.width ? doc.internal.pageSize.width : 210;

  doc.setFontSize(6);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  var disclaimer = 'Unauthorized disclosure, transmission, reproduction or retention of information on this sheet violates the Official CAP 03 (LFN) 2004.';
  doc.text(disclaimer, pageWidth / 2, pageHeight - 28, { align: 'center', maxWidth: pageWidth - 28 });

  doc.setFillColor(180, 30, 30);
  doc.rect(14, pageHeight - 18, pageWidth - 28, 7, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('RESTRICTED', pageWidth / 2, pageHeight - 13, { align: 'center' });

  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text('Page ' + pageNum + ' of ' + totalPages, pageWidth / 2, pageHeight - 5, { align: 'center' });
}

async function exportExcel() {
  const dateInput = document.getElementById('attendanceDate');
  const date = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
  
  showStatus('Generating Excel...', 'info');
  
  try {
    const snapshot = await db.collection('attendance')
      .where('date', '==', date)
      .get();
    
    const data = [];
    snapshot.forEach(doc => {
      const d = doc.data();
      data.push({
        'User ID': d.userId || '',
        'Name': d.name || '',
        'Department': d.dept || '',
        'Appointment': d.appointment || '',
        'GPS Lat': d.location?.lat || '',
        'GPS Lng': d.location?.lng || '',
        'Time': d.timestamp?.toDate ? d.timestamp.toDate().toLocaleString() : '',
        'Action': d.action || 'check-in'
      });
    });
    
    const wb = XLSX.utils.book_new();
    const brandingRows = getRestrictedExcelBrandingRows('Daily Attendance');
    const wsData = brandingRows.concat(data.map(function(d) {
      return [
        d['User ID'] || '',
        d['Name'] || '',
        d['Department'] || '',
        d['Appointment'] || '',
        d['GPS Lat'] || '',
        d['GPS Lng'] || '',
        d['Time'] || '',
        d['Action'] || ''
      ];
    }));
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, `${date} Attendance`);
    configureRestrictedExcelPrintSettings(wb, ws);
    XLSX.writeFile(wb, `Attendance_${date}.xlsx`);
    showStatus('Excel exported! Check downloads', 'success');
  } catch (e) {
    showStatus('Excel export failed: ' + getErrorMessage(e), 'error');
  }
}

async function exportAbsentExcel() {
  const dateInput = document.getElementById('attendanceDate');
  const date = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];
  
  showStatus('Generating Absent Staff Excel...', 'info');
  
  try {
    const usersSnapshot = await db.collection('users').get();
    const presentSnapshot = await db.collection('attendance').where('date', '==', date).get();
    
    const allUsers = Array.from(usersSnapshot.docs).map(doc => doc.data());
    const presentUsers = new Set(presentSnapshot.docs.map(doc => doc.data().userId));
    
    const absentData = allUsers
      .filter(user => !presentUsers.has(user.userId || user.id))
      .map(user => ({
        'User ID': user.userId || user.id,
        'Name': user.name || '',
        'Department': user.dept || '',
        'Appointment': user.appointment || '',
        'Status': 'ABSENT',
        'Report Date': date
      }));
    
    if (absentData.length === 0) {
      showStatus('No absent staff found for ' + date, 'info');
      return;
    }
    
    const wb = XLSX.utils.book_new();
    const brandingRows = getRestrictedExcelBrandingRows('Absent Staff Report');
    const wsData = brandingRows.concat(absentData.map(function(user) {
      return [
        user['User ID'] || '',
        user['Name'] || '',
        user['Department'] || '',
        user['Appointment'] || '',
        user['Status'] || 'ABSENT',
        user['Report Date'] || date
      ];
    }));
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    XLSX.utils.book_append_sheet(wb, ws, `${date} Absent Staff`);
    configureRestrictedExcelPrintSettings(wb, ws);
    XLSX.writeFile(wb, `Absent_Staff_${date}.xlsx`);
    showStatus(`Absent Excel exported (${absentData.length} staff)!`, 'success');
  } catch (e) {
    showStatus('Absent export failed: ' + getErrorMessage(e), 'error');
  }
}

function exportPdf() {
  // Wait for libraries with timeout
  return new Promise((resolve) => {
    const checkAutoTable = () => {
      if (window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.prototype.autoTable) {
        const doc = new window.jspdf.jsPDF();
        if (doc.autoTable) {
          generatePdf(doc);
          resolve();
        } else {
          setTimeout(checkAutoTable, 100);
        }
      } else {
        setTimeout(checkAutoTable, 100);
      }
    };
    checkAutoTable();
  });
}

function generatePdf(doc) {
  const dateInput = document.getElementById('attendanceDate');
  const date = dateInput ? dateInput.value : new Date().toISOString().split('T')[0];

  showStatus('Generating PDF...', 'info');

  drawRestrictedPdfPageHeader(doc, 'Daily Attendance Report');

  db.collection('attendance')
    .where('date', '==', date)
    .get()
    .then(snapshot => {
      const tableData = [];
      snapshot.forEach(doc => {
        const d = doc.data();
        tableData.push([
          d.userId || '',
          d.name || '',
          d.dept || '',
          d.appointment || '',
          d.location ? `${d.location.lat?.toFixed(4)},${d.location.lng?.toFixed(4)}` : '',
          d.timestamp?.toDate ? d.timestamp.toDate().toLocaleString() : ''
        ]);
      });

      doc.setFontSize(16);
      doc.text(`Attendance Report - ${date}`, 14, 52);

      doc.autoTable({
        head: [['User ID', 'Name', 'Dept', 'Appt', 'GPS', 'Time']],
        body: tableData,
        startY: 58,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2 },
        headStyles: { fillColor: [75, 83, 32] }
      });

      var totalPages = doc.internal.getNumberOfPages();
      for (var p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        drawRestrictedPdfPageFooter(doc, p, totalPages);
      }

      doc.save(`Attendance_${date}.pdf`);
      showStatus('PDF exported! Check downloads', 'success');
    })
    .catch(e => {
      showStatus('PDF export failed: ' + getErrorMessage(e), 'error');
      console.error('PDF error:', e);
    });
}

async function registerFace() {
  const formData = {
    userId: document.getElementById('regUserId')?.value.trim(),
    name: document.getElementById('regName')?.value.trim(),
    dept: document.getElementById('regDept')?.value.trim(),
    appointment: document.getElementById('regAppointment')?.value.trim() || '',
    phone: document.getElementById('regPhone')?.value.trim() || ''
  };
  
  if (!formData.userId || !formData.name || !formData.dept) {
    return showStatus('Fill User ID, Name, Department', 'error');
  }
  
  // REQUIRE CAMERA STARTED FIRST
  if (!video || !video.srcObject) {
    return showStatus('Start Camera first, then Register', 'error');
  }
  
   try {
    await verifyOfficeLocation();
    showStatus('Scanning face...', 'info');
    
    const detections = await detectSingleFace();
    if (!detections?.length) return showStatus('No face detected - try again', 'error');

    const existing = await db.collection('users').doc(formData.userId).get();
    if (existing.exists) {
      return showStatus('Employee ID already registered. Choose a different ID or contact an administrator.', 'error');
    }

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = 200;
    tempCanvas.height = 200;
    tempCtx.drawImage(video, 0, 0, 200, 200);
    const faceImageDataUrl = tempCanvas.toDataURL('image/jpeg', 0.8);
    
     await db.collection('users').doc(formData.userId).set({
       ...formData,
       faceDescriptor: Array.from(detections[0].descriptor),
       faceImage: faceImageDataUrl,
       registeredLocation: currentLocation,
       registeredAt: firebase.firestore.FieldValue.serverTimestamp()
     });

     invalidateUsersCache();

    var statusEl = document.getElementById('status');
    if (statusEl) {
      statusEl.innerHTML = '<div style="display:flex;flex-direction:column;gap:var(--space-2);text-align:center;">' +
        '<div style="display:flex;align-items:center;justify-content:center;gap:var(--space-2);font-weight:600;">' +
        '<span style="color:var(--color-success);">✓</span> Employee Registered Successfully' +
        '</div>' +
        '<div style="font-size:var(--font-size-sm);color:var(--text-secondary);margin-top:var(--space-1);">' +
        'ID: ' + formData.userId + ' | Name: ' + formData.name + ' | Dept: ' + formData.dept +
        '</div>' +
        '<div style="display:flex;gap:var(--space-2);justify-content:center;margin-top:var(--space-3);flex-wrap:wrap;">' +
        '<button onclick="clearRegisterForm()" class="btn btn-sm btn-outline">Register Another</button>' +
        '<button onclick="goToEmployeesSection()" class="btn btn-sm btn-primary">View Employees</button>' +
        '</div>' +
        '</div>';
      statusEl.style.color = '#2E8B57';
    }
    clearRegisterForm();
  } catch (e) {
    var errMsg = getErrorMessage(e);
    showStatus(errMsg, 'error');
  }
}

function goToEmployeesSection() {
  var navItem = document.querySelector('.admin-nav-item[data-section="employees"]');
  if (navItem) {
    navItem.click();
  }
}

// === USER CACHE FOR FASTER SCANNING ===
async function getCachedUsers() {
  const now = Date.now();
  if (cachedUsers && (now - usersCacheTimestamp) < USERS_CACHE_TTL_MS) {
    return cachedUsers;
  }
  if (!db) return [];
  const snapshot = await db.collection('users').get();
  cachedUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  usersCacheTimestamp = now;
  return cachedUsers;
}

function invalidateUsersCache() {
  cachedUsers = null;
  usersCacheTimestamp = 0;
}

// CAMERA + SCAN
async function startCamera() {
  try {
    video = document.getElementById('video');
    if (!video || !faceapi) return showStatus('Camera/Face-api not ready', 'error');
    
    video.srcObject = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640 } });
    
    video.onloadedmetadata = () => {
      canvas = faceapi.createCanvasFromMedia(video);
      video.parentNode.append(canvas);
      faceapi.matchDimensions(canvas, { width: video.videoWidth, height: video.videoHeight });
      
      const scanBtn = document.getElementById('scanBtn');
      if (scanBtn) scanBtn.disabled = false;
      
      showStatus('Camera ready - Scan Face', 'success');
    };
  } catch (e) {
    showStatus('Camera permission denied', 'error');
  }
}

async function scanFace() {
  if (!video?.srcObject) return showStatus('Start camera first', 'error');
  if (!video.videoWidth || video.readyState < 2) return showStatus('Wait for camera preview...', 'error');
  if (isScanning) return;

  isScanning = true;
  const scanBtn = document.getElementById('scanBtn');
  if (scanBtn) scanBtn.disabled = true;

  try {
    showStatus('Verifying...', 'info');

    let gpsOk = false;
    let detection = null;

    const gpsPromise = verifyOfficeLocation()
      .then(() => { gpsOk = true; })
      .catch(err => { console.log('GPS check failed during scan:', err); });

    const facePromise = (async () => {
      showStatus('Looking for face...', 'info');
      return await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();
    })();

    const [, detectionResult] = await Promise.all([gpsPromise, facePromise]);
    detection = detectionResult;

    if (!detection) {
      showStatus('No face detected - try closer/better light', 'error');
      return;
    }

    const displaySize = { width: video.videoWidth, height: video.videoHeight };
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const resized = faceapi.resizeResults(detection, displaySize);
      faceapi.draw.drawDetections(canvas, resized);
      faceapi.draw.drawFaceLandmarks(canvas, resized);
    }

    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCanvas.width = 200;
    tempCanvas.height = 200;
    tempCtx.drawImage(video, 0, 0, 200, 200);
    const faceImageDataUrl = tempCanvas.toDataURL('image/jpeg', 0.8);

    const users = await getCachedUsers();
    let match = null, minDistance = Infinity;

    users.forEach(user => {
      if (user.faceDescriptor) {
        const distance = faceapi.euclideanDistance(
          Array.from(detection.descriptor),
          new Float32Array(user.faceDescriptor)
        );
        if (distance < 0.6 && distance < minDistance) {
          match = { 
            id: user.id, 
            name: user.name, 
            dept: user.dept, 
            appointment: user.appointment,
            faceImage: user.faceImage || null
          };
          minDistance = distance;
        }
      }
    });

    const confidence = match ? Math.max(0, Math.min(100, Math.round((1 - minDistance) * 100))) : 0;
    window.lastMatchDetails = match ? {
      ...match,
      confidence: confidence,
      distance: minDistance,
      location: currentLocation,
      timestamp: new Date()
    } : null;

    if (!match) {
      showStatus('No match (distance > 0.6). Register first.', 'error');
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const existing = await db.collection('attendance')
      .where('userId', '==', match.id)
      .where('date', '==', today)
      .limit(1)
      .get();

    if (!existing.empty) {
      const existingDoc = existing.docs[0];
      const existingTime = existingDoc.data().timestamp.toDate().toLocaleTimeString();
      showStatus(`⚠️ ${match.name} already scanned at ${existingTime}`, 'warning');
      return;
    }

    if (!gpsOk) {
      const dist = currentLocation ? (currentLocation.distance / 1000).toFixed(1) + ' km' : 'unknown distance';
      showStatus(`⚠️ ${match.name} (${match.appointment}) - Outside office (${dist}). Attendance blocked.`, 'warning');
      return;
    }

    showStatus(`✅ ${match.name} (${match.appointment}) logged in! Confidence: ${confidence}%`, 'success');

    await db.collection('attendance').add({
      userId: match.id,
      name: match.name,
      dept: match.dept,
      appointment: match.appointment,
      location: currentLocation,
      faceImage: faceImageDataUrl,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      date: today,
      action: 'check-in'
    });

    if (isAdminSignedIn) loadAttendanceRecords();
  } catch (e) {
    const message = (e && e.message) ? e.message : (typeof e === 'string' ? e : 'An unexpected error occurred');
    showStatus('Error: ' + message, 'error');
  } finally {
    isScanning = false;
    const scanBtn = document.getElementById('scanBtn');
    if (scanBtn) scanBtn.disabled = false;
  }
}

async function detectSingleFace() {
  if (!video || !video.videoWidth || video.readyState < 2) {
    throw new Error('Video not ready - click Start Camera first');
  }
  const detection = await faceapi
    .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
    .withFaceLandmarks()
    .withFaceDescriptor();
  return detection ? [detection] : [];
}

// MAIN INIT
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Face Attendance System Starting...');
  
  // Firebase
  if (window.firebaseConfig) {
    firebaseApp = firebase.initializeApp(window.firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();

    // Expose to global scope for admin dashboard and other modules
    window.firebaseApp = firebaseApp;
    window.auth = auth;
    window.db = db;

    // Preload users cache for faster face matching
    getCachedUsers().catch(() => {});

    auth.onAuthStateChanged(user => {
    isAdminSignedIn = !!user;
    const signOutBtn = document.getElementById('adminSignOutBtn');
    const panel = document.getElementById('attendanceAdminPanel');
    const regBtn = document.getElementById('regBtn');
    const adminStatus = document.getElementById('adminStatus');

    console.log('Auth state:', user ? user.email : 'signed out');

    if (user) {
      showStatus('Admin signed in ✓ Panel ready', 'success');
      if (signOutBtn) signOutBtn.style.display = 'inline-block';
      if (panel) panel.style.display = 'block';
      if (regBtn) regBtn.disabled = false;
      if (adminStatus) adminStatus.textContent = 'Signed in - Dashboard active';
      loadAttendanceRecords();
    } else {
      showStatus('Not signed in - Login required', 'info');
      if (signOutBtn) signOutBtn.style.display = 'none';
      if (panel) panel.style.display = 'none';
      if (regBtn) regBtn.disabled = true;
      if (adminStatus) adminStatus.textContent = 'Not signed in';
     }

    });
   }
  
  // Face-api models
  if (faceapi?.nets) {
    try {
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri('./models'),
        faceapi.nets.faceLandmark68Net.loadFromUri('./models'),
        faceapi.nets.faceRecognitionNet.loadFromUri('./models')
      ]);
      showStatus('Ready! Office GPS required (500m)', 'success');
    } catch (e) {
      showStatus('Models failed: ' + getErrorMessage(e), 'error');
    }
  }
  


  // Universal button binding + Date filter + Export + ABSENCE TRACKING
  document.querySelectorAll('button[id]').forEach(btn => {
    const fnMap = {
      startBtn: startCamera,
      scanBtn: scanFace,
      adminSignInBtn: adminSignIn,
      adminSignOutBtn: adminSignOut,
      clearBtn: clearRegisterForm,
      regBtn: registerFace,
refreshBtn: () => {
  reportMode = false;
  document.getElementById('dailyReportBtn')?.classList.remove('active');
  document.getElementById('absenceStats') && (document.getElementById('absenceStats').style.display = 'none');
  loadAttendanceRecords(document.getElementById('attendanceDate')?.value);
},
      dailyReportBtn: () => {
  const btn = document.getElementById('dailyReportBtn');
  reportMode = !reportMode;
  btn.classList.toggle('active', reportMode);
  loadAttendanceRecords(document.getElementById('attendanceDate')?.value);
},
      exportExcelBtn: exportExcel,
      exportAbsentBtn: exportAbsentExcel,
      exportPdfBtn: exportPdf
    };
    btn.onclick = () => fnMap[btn.id]?.();
  });

  
  // Date filter + auto-load
  const dateInput = document.getElementById('attendanceDate');
  if (dateInput) {
    dateInput.onchange = () => loadAttendanceRecords(dateInput.value);
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
    // Load today's records automatically
    loadAttendanceRecords(today);
  }
  
  console.log('500m Office Restriction ACTIVE');
});
