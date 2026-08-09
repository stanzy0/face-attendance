// Admin onclick bridges - LOOK UP functions at CALL TIME, not capture time
// This fixes the issue where functions weren't defined when this script ran

window.adminSignIn = function() {
  if (typeof window._adminSignInImpl === 'function') {
    window._adminSignInImpl();
  } else {
    console.error('adminSignIn not loaded yet. Retrying...');
    // Retry once after a short delay
    setTimeout(() => {
      if (typeof window._adminSignInImpl === 'function') {
        window._adminSignInImpl();
      } else {
        alert('Admin sign-in function not loaded. Please refresh the page.');
      }
    }, 100);
  }
};

window.adminSignOut = function() {
  if (typeof window._adminSignOutImpl === 'function') {
    window._adminSignOutImpl();
  } else {
    console.error('adminSignOut not loaded');
  }
};

window.loadAttendanceRecords = function(date) {
  if (typeof window._loadAttendanceRecordsImpl === 'function') {
    window._loadAttendanceRecordsImpl(date);
  } else {
    console.error('loadAttendanceRecords not loaded');
  }
};

window.clearRegisterForm = function() {
  ['regUserId', 'regName', 'regDept', 'regPhone'].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  if (typeof window.setStatusImpl === 'function') window.setStatusImpl('Form cleared');
};

window.registerFace = function() {
  if (typeof window._registerFaceImpl === 'function') {
    window._registerFaceImpl();
  } else {
    console.error('registerFace not loaded');
  }
};

// Wrapper for setStatus that works on both pages
window.setStatus = function(msg, type) {
  // Try to find status element on admin page first
  var adminStatusEl = document.getElementById('adminStatus');
  var statusEl = document.getElementById('status');
  var targetEl = adminStatusEl || statusEl || document.querySelector('.status-card');
  
  if (targetEl) {
    targetEl.textContent = msg;
    var color = '#C8A646'; // default info color
    if (type === 'error') color = '#ff6b6b';
    else if (type === 'success') color = '#2E8B57';
    targetEl.style.color = color;
  }
  console.log('[Status ' + (type || 'INFO').toUpperCase() + ']: ' + msg);
};
