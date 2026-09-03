/* ============================================
   BioTrack Admin Login Interactions
   ============================================ */

(function () {
  'use strict';

  // === DOM Elements ===
  const adminEmail = document.getElementById('adminEmail');
  const adminPassword = document.getElementById('adminPassword');
  const adminSignInBtn = document.getElementById('adminSignInBtn');
  const adminStatus = document.getElementById('adminStatus');
  const passwordToggle = document.getElementById('passwordToggle');
  const loginForm = document.getElementById('adminLoginForm');

  // === Password Visibility Toggle ===
  function setupPasswordToggle() {
    if (!passwordToggle || !adminPassword) return;

    passwordToggle.addEventListener('click', function () {
      const isPassword = adminPassword.type === 'password';
      adminPassword.type = isPassword ? 'text' : 'password';

      const eyeIcon = passwordToggle.querySelector('.eye-icon');
      const eyeOffIcon = passwordToggle.querySelector('.eye-off-icon');

      if (isPassword) {
        if (eyeIcon) eyeIcon.style.display = 'none';
        if (eyeOffIcon) eyeOffIcon.style.display = 'block';
        passwordToggle.setAttribute('aria-label', 'Hide password');
        passwordToggle.setAttribute('title', 'Hide password');
      } else {
        if (eyeIcon) eyeIcon.style.display = 'block';
        if (eyeOffIcon) eyeOffIcon.style.display = 'none';
        passwordToggle.setAttribute('aria-label', 'Show password');
        passwordToggle.setAttribute('title', 'Show password');
      }
    });
  }

  // === Form Submission ===
  function setupFormSubmission() {
    if (!loginForm) return;

    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();

      clearErrors();

      let hasError = false;

      if (!adminEmail || !adminEmail.value.trim()) {
        showFieldError('adminEmail', 'Email is required');
        hasError = true;
      } else if (!isValidEmail(adminEmail.value.trim())) {
        showFieldError('adminEmail', 'Please enter a valid email address');
        hasError = true;
      }

      if (!adminPassword || !adminPassword.value) {
        showFieldError('adminPassword', 'Password is required');
        hasError = true;
      }

      if (hasError) return;

      setLoading(true);

      // Call existing adminSignIn function from script.js
      if (typeof window.adminSignIn === 'function') {
        window.adminSignIn();
      } else if (typeof adminSignIn === 'function') {
        adminSignIn();
      } else {
        showStatus('Authentication system not ready. Please refresh.', 'error');
        setLoading(false);
      }
    });
  }

  // === Loading State ===
  function setLoading(isLoading) {
    if (!adminSignInBtn) return;

    if (isLoading) {
      adminSignInBtn.disabled = true;
      const originalText = adminSignInBtn.textContent || 'Sign In';
      adminSignInBtn.setAttribute('data-original-text', originalText);
      adminSignInBtn.innerHTML = '<span class="spinner"></span> Signing in...';
    } else {
      adminSignInBtn.disabled = false;
      const originalText = adminSignInBtn.getAttribute('data-original-text') || 'Sign In';
      adminSignInBtn.textContent = originalText;
    }
  }

  function resetAdminLoginButton() {
    if (!adminSignInBtn) return;
    adminSignInBtn.removeAttribute('data-original-text');
    adminSignInBtn.textContent = 'Sign In';
    adminSignInBtn.removeAttribute('aria-busy');
    adminSignInBtn.disabled = false;
  }

  window.resetAdminLoginButton = resetAdminLoginButton;

  // === Error Handling ===
  function showFieldError(fieldId, message) {
    const field = document.getElementById(fieldId);
    if (!field) return;

    field.classList.add('error');

    const errorEl = field.parentElement.querySelector('.form-field-error');
    if (errorEl) {
      errorEl.textContent = message;
      errorEl.classList.add('visible');
    }
  }

  function clearErrors() {
    ['adminEmail', 'adminPassword'].forEach(function (fieldId) {
      const field = document.getElementById(fieldId);
      if (!field) return;
      field.classList.remove('error');
      const errorEl = field.parentElement.querySelector('.form-field-error');
      if (errorEl) {
        errorEl.classList.remove('visible');
        errorEl.textContent = '';
      }
    });
  }

  function showStatus(message, type) {
    if (!adminStatus) return;

    const cleanMsg = typeof message === 'string' ? message : String(message || '');
    if (!cleanMsg) return;

    adminStatus.textContent = cleanMsg;
    adminStatus.className = 'admin-login-status visible ' + (type || '');

    // Auto-hide success messages after 5 seconds
    if (type === 'success') {
      setTimeout(function () {
        adminStatus.classList.remove('visible');
      }, 5000);
    }
  }

  // === Email Validation ===
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // === Listen for status updates from script.js ===
  function setupStatusListener() {
    if (!adminStatus) return;

    const originalSetStatus = window.setStatus;

    window.setStatus = function (msg, type) {
      if (originalSetStatus) {
        originalSetStatus(msg, type);
      }

      // Update our custom status element
      const cleanMsg = typeof msg === 'string' ? msg : String(msg || '');
      if (cleanMsg) {
        showStatus(cleanMsg, type);
      }
    };
  }

  // === Auth State Bridge (single source of truth for login/dashboard visibility) ===
  function waitForAuth() {
    return new Promise(function(resolve) {
      if (window.auth) {
        resolve(true);
        return;
      }
      var attempts = 0;
      var maxAttempts = 100;
      var interval = setInterval(function() {
        attempts++;
        if (window.auth) {
          clearInterval(interval);
          resolve(true);
        } else if (attempts >= maxAttempts) {
          clearInterval(interval);
          resolve(false);
        }
      }, 100);
    });
  }

  // === Auth State Handler ===
  function setupAuthBridge() {
    // Wait for Firebase auth to be ready before registering listener
    waitForAuth().then(function(firebaseReady) {
      if (!firebaseReady) {
        console.error('Auth bridge: Firebase not ready');
        return;
      }

      var auth = window.auth;
      if (!auth) return;

      auth.onAuthStateChanged(function (user) {
        if (user) {
          if (window.__adminShowDashboard) {
            window.__adminShowDashboard();
          }
        } else {
          if (window.__adminShowLogin) {
            window.__adminShowLogin();
          }
        }
      });
    });
  }

  // === Initialize ===
  function init() {
    setupPasswordToggle();
    setupFormSubmission();
    setupStatusListener();
    setupAuthBridge();

    // Enable/disable submit button based on field values
    function updateButtonState() {
      if (!adminSignInBtn) return;
      const hasEmail = adminEmail && adminEmail.value.trim();
      const hasPassword = adminPassword && adminPassword.value;
      adminSignInBtn.disabled = !hasEmail || !hasPassword;
    }

    if (adminEmail) {
      adminEmail.addEventListener('input', updateButtonState);
    }
    if (adminPassword) {
      adminPassword.addEventListener('input', updateButtonState);
    }

    // Initial button state
    updateButtonState();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
