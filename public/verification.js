/* ============================================
   BioTrack Verification Experience
   Phase 3 — UI State Layer
   ============================================ */

(function () {
  'use strict';

  // === DOM Elements ===
  const statusEl = document.getElementById('status');
  const systemStatus = document.getElementById('systemStatus');
  const systemStatusText = document.getElementById('systemStatusText');
  const cameraContainer = document.getElementById('cameraContainer');
  const cameraPlaceholder = document.getElementById('cameraPlaceholder');
  const scanLine = document.getElementById('scanLine');
  const verifyBadge = document.getElementById('verifyBadge');
  const verificationResult = document.getElementById('verificationResult');
  const verificationResultIcon = document.getElementById('verificationResultIcon');
  const verificationResultTitle = document.getElementById('verificationResultTitle');
  const verificationDetails = document.getElementById('verificationDetails');
  const locationBadge = document.getElementById('locationBadge');
  const locationDetails = document.getElementById('locationDetails');
  const locationDistance = document.getElementById('locationDistance');
  const locationState = document.getElementById('locationState');
  const locationAttendance = document.getElementById('locationAttendance');
  const lastVerificationContent = document.getElementById('lastVerificationContent');
  const lastVerificationName = document.getElementById('lastVerificationName');
  const lastVerificationId = document.getElementById('lastVerificationId');
  const lastVerificationDept = document.getElementById('lastVerificationDept');
  const lastVerificationConfidence = document.getElementById('lastVerificationConfidence');
  const lastVerificationTime = document.getElementById('lastVerificationTime');

  // === Helpers ===
  function setSystemStatus(state, text) {
    if (!systemStatus || !systemStatusText) return;
    systemStatus.className = 'system-status ' + state;
    systemStatusText.textContent = text;
  }

  function setBadge(el, state, text) {
    if (!el) return;
    el.className = 'info-card-badge ' + state;
    el.textContent = text;
  }

  function setStatusClass(el, type) {
    if (!el) return;
    el.className = 'status-chip';
    if (type) el.classList.add(type);
  }

  function parseStatus(text) {
    if (!text) return { type: 'info', message: '' };

    const t = text.toLowerCase();

    // Actual system/app errors first
    const actualError =
      t.includes('error:') ||
      t.includes('denied') ||
      (t.includes('failed') && !t.includes('already scanned')) ||
      t.includes('models failed') ||
      t.includes('camera permission denied') ||
      t.includes('camera/face-api not ready') ||
      t.includes('wait for camera preview') ||
      t.includes('load failed') ||
      t.includes('export failed') ||
      t.includes('no admin account found') ||
      t.includes('wrong-password') ||
      t.includes('invalid-email') ||
      t.includes('login failed') ||
      t.includes('unable to sign in') ||
      t.includes('geolocation unavailable') ||
      t.includes('gps access denied') ||
      t.includes('no match');

    if (actualError) {
      return { type: 'error', message: text };
    }

    // Location/office boundary issues are operational warnings, not system errors
    const locationWarning =
      t.includes('outside office') ||
      t.includes('outside') ||
      t.includes('blocked') ||
      t.includes('500m');

    if (locationWarning) {
      return { type: 'location', message: text };
    }

    if (t.includes('success') || t.includes('verified') || t.includes('ready') || t.includes('logged in') || t.includes('recorded')) {
      return { type: 'success', message: text };
    }

    if (t.includes('warning') || t.includes('already scanned')) {
      return { type: 'warning', message: text };
    }

    return { type: 'info', message: text };
  }

  function safeText(value) {
    if (value === null || value === undefined) return '';
    const text = String(value);
    if (!text || text === 'undefined' || text === 'null') return '';
    return text;
  }

  function escapeHtml(value) {
    return safeText(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function updateRegisteredPhotoCard(user) {
    const card = document.getElementById('registeredPhotoCard');
    const img = document.getElementById('registeredPhotoImg');
    const placeholder = document.getElementById('registeredPhotoPlaceholder');
    const badge = document.getElementById('registeredPhotoBadge');
    const status = document.getElementById('registeredPhotoStatus');

    if (!card) return;

    if (user && user.faceImage) {
      card.style.display = 'block';
      if (img) {
        img.src = user.faceImage;
        img.style.display = 'block';
      }
      if (placeholder) placeholder.style.display = 'none';
      if (badge) {
        badge.textContent = 'Matched';
        badge.className = 'info-card-badge success';
      }
      if (status) {
        status.innerHTML = '<span class="status-dot registered"></span> FACE REGISTERED';
        status.style.color = 'var(--color-success)';
      }
    } else if (user) {
      card.style.display = 'block';
      if (img) img.style.display = 'none';
      if (placeholder) {
        placeholder.style.display = 'flex';
        const span = placeholder.querySelector('span');
        if (span) span.textContent = 'REGISTERED PHOTO UNAVAILABLE';
      }
      if (badge) {
        badge.textContent = 'Face Registered';
        badge.className = 'info-card-badge success';
      }
      if (status) {
        status.innerHTML = '<span class="status-dot" style="background-color:var(--text-muted);box-shadow:none;"></span> FACE REGISTERED';
        status.style.color = 'var(--text-muted)';
      }
    } else {
      card.style.display = 'none';
    }
  }

  // === Override showStatus to update premium UI ===
  const originalShowStatus = window.showStatus;
  window.showStatus = function(msg, type) {
    const safeMsg = safeText(msg);

    if (originalShowStatus) {
      try {
        originalShowStatus(safeMsg || '', type);
      } catch (e) {
        // Do not break the UI if original showStatus throws
      }
    }

    if (!statusEl) return;

    let displayMsg = safeMsg;
    if (!displayMsg) {
      displayMsg = 'An unexpected error occurred. Please try again.';
    } else if (/^error:\s*(undefined|null|)$/i.test(displayMsg)) {
      displayMsg = 'An unexpected error occurred. Please try again.';
    }

    const parsed = parseStatus(displayMsg);

    setStatusClass(statusEl, parsed.type === 'location' ? 'warning' : parsed.type);

    if (parsed.type === 'success') {
      setSystemStatus('success', 'System Ready');
    } else if (parsed.type === 'error') {
      setSystemStatus('error', 'System Error');
    } else if (parsed.type === 'location') {
      setSystemStatus('ready', 'Location Checked');
    } else if (parsed.type === 'warning') {
      setSystemStatus('checking', 'Processing');
    } else if (safeMsg.includes('Looking for face') || safeMsg.includes('Scanning')) {
      setSystemStatus('checking', 'Scanning');
    } else if (safeMsg.includes('Camera ready') || safeMsg.includes('Ready')) {
      setSystemStatus('ready', 'System Ready');
    } else {
      setSystemStatus('ready', 'System Ready');
    }

    if (parsed.type === 'success' && safeMsg.includes('logged in')) {
      setBadge(verifyBadge, 'success', 'Verified');
      const match = safeMsg.match(/✅\s(.+?)\s\((.+?)\)\slogged\sin!/);
      const matchData = window.lastMatchDetails;
      if (match) {
        verificationResultTitle.textContent = 'IDENTITY VERIFIED';
        verificationResultIcon.innerHTML = '<polyline points="20 6 9 17 4 12"/>';
        verificationResultIcon.classList.add('success');
        verificationResultIcon.classList.remove('error');

        const confidence = matchData ? matchData.confidence : '--';
        const empId = matchData ? matchData.id : '--';
        const dept = matchData ? matchData.dept : '--';
        const locDist = matchData && matchData.location && matchData.location.distance != null ? matchData.location.distance : null;
        const locStatus = locDist !== null ? (locDist <= 500 ? 'Inside office premises' : 'Outside office premises') : '--';
        const attendance = locDist !== null ? (locDist <= 500 ? 'Verified' : 'Blocked') : '--';

        verificationDetails.innerHTML = `
          <div class="verification-detail">
            <span class="verification-detail-label">Name</span>
            <span class="verification-detail-value success">${escapeHtml(match[1])}</span>
          </div>
          <div class="verification-detail">
            <span class="verification-detail-label">Employee ID</span>
            <span class="verification-detail-value">${escapeHtml(empId)}</span>
          </div>
          <div class="verification-detail">
            <span class="verification-detail-label">Department</span>
            <span class="verification-detail-value">${escapeHtml(dept)}</span>
          </div>
          <div class="verification-detail">
            <span class="verification-detail-label">Appointment</span>
            <span class="verification-detail-value">${escapeHtml(match[2])}</span>
          </div>
          <div class="verification-detail">
            <span class="verification-detail-label">Match Confidence</span>
            <span class="verification-detail-value success">${confidence}%</span>
          </div>
          <div class="verification-detail">
            <span class="verification-detail-label">Location</span>
            <span class="verification-detail-value ${locDist !== null && locDist <= 500 ? 'inside' : 'outside'}">${escapeHtml(locStatus)}</span>
          </div>
          <div class="verification-detail">
            <span class="verification-detail-label">Attendance</span>
            <span class="verification-detail-value ${attendance === 'Verified' ? 'inside' : 'blocked'}">${escapeHtml(attendance)}</span>
          </div>
        `;
        verificationResult.classList.add('visible');
        if (matchData) updateRegisteredPhotoCard(matchData);
      }
    } else if (parsed.type === 'error' && safeMsg.includes('No match')) {
      setBadge(verifyBadge, 'error', 'Failed');
      verificationResultTitle.textContent = 'IDENTITY NOT VERIFIED';
      verificationResultIcon.innerHTML = '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>';
      verificationResultIcon.classList.remove('success');
      verificationResultIcon.classList.add('error');
      verificationDetails.innerHTML = `
        <div class="verification-detail">
          <span class="verification-detail-label">Status</span>
          <span class="verification-detail-value" style="color: var(--color-danger-light)">No matching employee found</span>
        </div>
        <div class="verification-detail">
          <span class="verification-detail-label">Action</span>
          <span class="verification-detail-value">Register first</span>
        </div>
      `;
      verificationResult.classList.add('visible');
      updateRegisteredPhotoCard(null);
    } else if (parsed.type === 'warning' && safeMsg.includes('already scanned')) {
      setBadge(verifyBadge, 'warning', 'Duplicate');
      const match = safeMsg.match(/⚠️\s(.+?)\salready\sscanned/);
      const matchData = window.lastMatchDetails;
      verificationResultTitle.textContent = 'Already Scanned Today';
      verificationResultIcon.innerHTML = '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';
      verificationResultIcon.classList.remove('success', 'error');
      verificationResultIcon.style.color = 'var(--color-warning)';

      const empId = matchData ? matchData.id : '--';
      const dept = matchData ? matchData.dept : '--';

      verificationDetails.innerHTML = `
        <div class="verification-detail">
          <span class="verification-detail-label">Name</span>
          <span class="verification-detail-value">${match ? escapeHtml(match[1]) : '--'}</span>
        </div>
        <div class="verification-detail">
          <span class="verification-detail-label">Employee ID</span>
          <span class="verification-detail-value">${escapeHtml(empId)}</span>
        </div>
        <div class="verification-detail">
          <span class="verification-detail-label">Department</span>
          <span class="verification-detail-value">${escapeHtml(dept)}</span>
        </div>
        <div class="verification-detail">
          <span class="verification-detail-label">Status</span>
          <span class="verification-detail-value" style="color: var(--color-warning)">Already recorded</span>
        </div>
      `;
      verificationResult.classList.add('visible');
      if (matchData) updateRegisteredPhotoCard(matchData);
    } else if (parsed.type === 'location') {
      setBadge(verifyBadge, 'warning', 'Location Blocked');
      const matchData = window.lastMatchDetails;
      const empId = matchData ? matchData.id : '--';
      const name = matchData ? matchData.name : '--';
      const dept = matchData ? matchData.dept : '--';
      verificationResultTitle.textContent = 'Attendance Blocked';
      verificationResultIcon.innerHTML = '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>';
      verificationResultIcon.classList.remove('success', 'error');
      verificationResultIcon.style.color = 'var(--color-warning)';

      verificationDetails.innerHTML = `
        <div class="verification-detail">
          <span class="verification-detail-label">Name</span>
          <span class="verification-detail-value">${escapeHtml(name)}</span>
        </div>
        <div class="verification-detail">
          <span class="verification-detail-label">Employee ID</span>
          <span class="verification-detail-value">${escapeHtml(empId)}</span>
        </div>
        <div class="verification-detail">
          <span class="verification-detail-label">Department</span>
          <span class="verification-detail-value">${escapeHtml(dept)}</span>
        </div>
        <div class="verification-detail">
          <span class="verification-detail-label">Status</span>
          <span class="verification-detail-value" style="color: var(--color-warning)">Outside office premises</span>
        </div>
        <div class="verification-detail">
          <span class="verification-detail-label">Action</span>
          <span class="verification-detail-value">Move within approved area</span>
        </div>
      `;
      verificationResult.classList.add('visible');
      if (matchData) updateRegisteredPhotoCard(matchData);
    } else {
      verificationResult.classList.remove('visible');
      updateRegisteredPhotoCard(null);
    }
  };

  // === Camera State Tracking ===
  function updateCameraState() {
    if (!cameraContainer || !cameraPlaceholder) return;
    const video = document.getElementById('video');
    if (!video) return;

    if (video.srcObject) {
      cameraContainer.classList.add('active');
    } else {
      cameraContainer.classList.remove('active');
    }
  }

  function updateScanningState(isScanning) {
    if (!cameraContainer) return;
    if (isScanning) {
      cameraContainer.classList.add('scanning');
    } else {
      cameraContainer.classList.remove('scanning');
    }
  }

  // === Location Tracking ===
  function resetLocationUI() {
    if (!locationBadge) return;
    setBadge(locationBadge, 'checking', 'Checking');
    if (locationDetails) locationDetails.classList.remove('visible');
    if (locationState) locationState.textContent = 'Checking...';
    if (locationAttendance) locationAttendance.textContent = 'Pending';
  }

  function updateLocationUI() {
    // Access currentLocation from the global scope declared in script.js
    let loc;
    try {
      loc = typeof currentLocation !== 'undefined' ? currentLocation : window.currentLocation;
    } catch (e) {
      loc = null;
    }

    if (!loc) {
      setBadge(locationBadge, 'checking', 'Checking');
      locationDetails.classList.remove('visible');
      return;
    }

    const inside = loc.distance <= 500;
    const distanceKm = (loc.distance / 1000).toFixed(3);
    const distanceFormatted = distanceKm + ' km';

    setBadge(locationBadge, inside ? 'success' : 'error', inside ? 'Inside' : 'Outside');
    locationDistance.textContent = distanceFormatted;
    locationState.textContent = inside ? 'Inside office premises' : 'Outside office premises';
    locationState.className = 'location-detail-value ' + (inside ? 'inside' : 'outside');
    locationAttendance.textContent = inside ? 'Verified' : 'Blocked';
    locationAttendance.className = 'location-detail-value ' + (inside ? 'inside' : 'blocked');
    locationDetails.classList.add('visible');
  }

  // === Last Verification (read-only Firestore query) ===
  async function loadLastVerification() {
    let dbRef;
    try {
      dbRef = typeof db !== 'undefined' ? db : window.db;
    } catch (e) {
      return;
    }

    if (!dbRef) return;

    try {
      const snapshot = await dbRef.collection('attendance')
        .orderBy('timestamp', 'desc')
        .limit(1)
        .get();

      if (!snapshot.empty) {
        const doc = snapshot.docs[0];
        const data = doc.data();
        lastVerificationName.textContent = data.name || '--';
        lastVerificationId.textContent = data.userId || '--';
        lastVerificationDept.textContent = data.dept || '--';
        if (data.distance !== undefined) {
          lastVerificationConfidence.textContent = data.distance.toFixed(1) + '%';
        }
        if (data.timestamp && data.timestamp.toDate) {
          lastVerificationTime.textContent = data.timestamp.toDate().toLocaleString();
        }
        lastVerificationContent.classList.add('visible');
      }
    } catch (e) {
      // Silently fail - last verification is optional
    }
  }

  // === Initialize ===
  function init() {
    // Track camera and scanning state via polling
    setInterval(() => {
      const video = document.getElementById('video');
      if (!video) return;

      // Camera state
      if (video.srcObject) {
        cameraContainer.classList.add('active');
      } else {
        cameraContainer.classList.remove('active');
      }

      // Scanning state
      if (statusEl) {
        const text = statusEl.textContent || '';
        const isScanning = text.includes('Looking for face') || text.includes('Scanning');
        updateScanningState(isScanning);
      }
    }, 200);

    // Track location state
    const locationInterval = setInterval(() => {
      updateLocationUI();
    }, 1000);
    updateLocationUI();

    // Load last verification
    loadLastVerification();
  }

  // Run after DOM is ready and script.js has executed
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
