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

  // === Authoritative Location State ===
  // Single source of truth for location verification status
  let locationVerificationState = 'checking';
  let lastLocationDistance = null;

  function setLocationState(state, distance) {
    locationVerificationState = state;
    if (distance != null) {
      lastLocationDistance = distance;
    }
    renderLocationUI();
  }

  function getLocationState() {
    return locationVerificationState;
  }

  function renderLocationUI() {
    if (!locationBadge) return;

    if (locationVerificationState === 'verified') {
      setBadge(locationBadge, 'success', 'Verified');
      if (locationDistance) {
        locationDistance.textContent = lastLocationDistance != null ? (lastLocationDistance / 1000).toFixed(3) + ' km' : '--';
      }
      if (locationState) {
        locationState.textContent = 'Inside office premises';
        locationState.className = 'location-detail-value inside';
      }
      if (locationAttendance) {
        locationAttendance.textContent = 'Verified';
        locationAttendance.className = 'location-detail-value inside';
      }
      if (locationDetails) {
        locationDetails.classList.add('visible');
      }
    } else if (locationVerificationState === 'blocked') {
      setBadge(locationBadge, 'error', 'Blocked');
      if (locationDistance) {
        locationDistance.textContent = lastLocationDistance != null ? (lastLocationDistance / 1000).toFixed(3) + ' km' : '--';
      }
      if (locationState) {
        locationState.textContent = 'Outside office premises';
        locationState.className = 'location-detail-value outside';
      }
      if (locationAttendance) {
        locationAttendance.textContent = 'Blocked';
        locationAttendance.className = 'location-detail-value blocked';
      }
      if (locationDetails) {
        locationDetails.classList.add('visible');
      }
    } else {
      // checking or error
      setBadge(locationBadge, 'checking', 'Checking');
      if (locationDetails) {
        locationDetails.classList.remove('visible');
      }
      if (locationState) {
        locationState.textContent = 'Checking...';
      }
      if (locationAttendance) {
        locationAttendance.textContent = 'Pending';
      }
    }
  }

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
        // Do not break the UI if originalShowStatus throws
      }
    }

    if (!statusEl) return;

    let displayMsg = safeMsg;
    if (!displayMsg) {
      displayMsg = 'An unexpected error occurred. Please try again.';
    } else if (/^error:\s*(undefined|null|)$/i.test(displayMsg)) {
      displayMsg = 'An unexpected error occurred. Please try again.';
    }

    // Update system status based on message type
    const t = displayMsg.toLowerCase();
    if (t.includes('office ok') || t.includes('verified')) {
      setSystemStatus('success', 'Location Verified');
    } else if (t.includes('outside office') || t.includes('blocked')) {
      setSystemStatus('warning', 'Location Blocked');
    } else if (t.includes('looking for face') || t.includes('scanning')) {
      setSystemStatus('checking', 'Scanning');
    } else if (t.includes('camera ready') || t.includes('ready')) {
      setSystemStatus('ready', 'System Ready');
    } else if (t.includes('logged in')) {
      setSystemStatus('success', 'Verified');
    } else if (t.includes('no match') || t.includes('error')) {
      setSystemStatus('error', 'Verification Failed');
    }

    // Handle successful verification result
    if (safeMsg.includes('logged in')) {
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
        const locDist = lastLocationDistance;
        const isInside = locationVerificationState === 'verified';
        const locStatus = isInside ? 'Inside office premises' : 'Outside office premises';
        const attendance = isInside ? 'Verified' : 'Blocked';

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
            <span class="verification-detail-value ${isInside ? 'inside' : 'outside'}">${escapeHtml(locStatus)}</span>
          </div>
          <div class="verification-detail">
            <span class="verification-detail-label">Attendance</span>
            <span class="verification-detail-value ${attendance === 'Verified' ? 'inside' : 'blocked'}">${escapeHtml(attendance)}</span>
          </div>
        `;
        verificationResult.classList.add('visible');
        if (matchData) updateRegisteredPhotoCard(matchData);
      }
    } else if (safeMsg.includes('No match')) {
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
    } else if (safeMsg.includes('already scanned')) {
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

    // Load last verification
    loadLastVerification();
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

  // Run after DOM is ready and script.js has executed
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // === Expose location state functions for script.js ===
  window.setLocationState = setLocationState;
  window.getLocationState = getLocationState;
})();
