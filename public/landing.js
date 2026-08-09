/* ============================================
   BioTrack Premium Landing Page Interactions
   Phase 2 — Military-Grade Biometric Platform
   ============================================ */

(function () {
  'use strict';

  // === DOM Elements ===
  const nav = document.getElementById('nav');
  const navToggle = document.getElementById('navToggle');
  const navMobile = document.getElementById('navMobile');
  const navMobileClose = document.getElementById('navMobileClose');
  const navMobileLinks = document.querySelectorAll('.nav-mobile-link');
  const biometricTime = document.getElementById('biometricTime');

  // === Navigation Scroll Effect ===
  function updateNavOnScroll() {
    if (window.scrollY > 50) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', updateNavOnScroll, { passive: true });
  updateNavOnScroll();

  // === Mobile Menu ===
  function openMobileMenu() {
    navMobile.classList.add('active');
    navToggle.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeMobileMenu() {
    navMobile.classList.remove('active');
    navToggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  navToggle.addEventListener('click', function () {
    if (navMobile.classList.contains('active')) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  });

  navMobileClose.addEventListener('click', closeMobileMenu);

  navMobileLinks.forEach(function (link) {
    link.addEventListener('click', function () {
      closeMobileMenu();
    });
  });

  // Close mobile menu on Escape key
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && navMobile.classList.contains('active')) {
      closeMobileMenu();
    }
  });

  // === Smooth Scroll for Anchor Links ===
  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;

      const target = document.querySelector(targetId);
      if (target) {
        e.preventDefault();
        const navHeight = nav.offsetHeight;
        const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - navHeight - 20;
        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  });

  // === Fade-Up on Scroll ===
  function handleFadeUp() {
    const elements = document.querySelectorAll('.fade-up');
    const windowHeight = window.innerHeight;
    const scrollTop = window.pageYOffset;

    elements.forEach(function (el) {
      const elementTop = el.getBoundingClientRect().top + scrollTop;
      const elementVisible = 100;

      if (scrollTop + windowHeight - elementVisible > elementTop) {
        el.classList.add('visible');
      }
    });
  }

  window.addEventListener('scroll', handleFadeUp, { passive: true });
  window.addEventListener('resize', handleFadeUp, { passive: true });
  handleFadeUp();

  // === Biometric Time Update ===
  function updateBiometricTime() {
    if (!biometricTime) return;
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    biometricTime.textContent = hours + ':' + minutes + ':' + seconds;
  }

  setInterval(updateBiometricTime, 1000);
  updateBiometricTime();

  // === Respect prefers-reduced-motion ===
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (motionQuery.matches) {
    document.querySelectorAll('.fade-up').forEach(function (el) {
      el.classList.add('visible');
    });
  }

})();
