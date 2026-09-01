(function() {
  'use strict';

  // ============================================
  // STATE
  // ============================================
  const state = {
    currentUser: null,
    currentDate: null,
    currentPeriod: 'today',
    customDateRange: null,
    attendanceData: [],
    usersData: [],
     realtimeUnsubscribe: null,
    unsubscribeUsers: null,
    unsubscribeAnalyticsAttendance: null,
    analyticsAttendanceData: [],
    isLoading: false,
    initialized: false,
    dashboardEl: null
  };

  // ============================================
  // UTILITIES
  // ============================================
  function getDb() {
    return window.db || null;
  }

   function getAuth() {
     return window.auth || null;
   }

  // ============================================
  // REAL-TIME LISTENERS
  // ============================================
    function unsubscribeAllRealTime() {
    if (state.unsubscribeUsers) {
      state.unsubscribeUsers();
      state.unsubscribeUsers = null;
    }
    if (state.unsubscribeAnalyticsAttendance) {
      state.unsubscribeAnalyticsAttendance();
      state.unsubscribeAnalyticsAttendance = null;
    }
    if (state.realtimeUnsubscribe) {
      state.realtimeUnsubscribe();
      state.realtimeUnsubscribe = null;
    }
    if (attendanceState && attendanceState.realtimeUnsubscribe) {
      try {
        attendanceState.realtimeUnsubscribe();
      } catch (e) { /* ignore */ }
      attendanceState.realtimeUnsubscribe = null;
    }
  }

  function subscribeToUsersRealtime() {
    if (state.unsubscribeUsers) {
      state.unsubscribeUsers();
    }
    var db = getDb();
    if (!db) return;

    state.unsubscribeUsers = db.collection('users').onSnapshot(function(snapshot) {
      var users = snapshot.docs.map(function(doc) {
        return { id: doc.id, ...doc.data() };
      });
      state.usersData = users;

      // Update dashboard if visible
      if (isDashboardSectionVisible()) {
        updateDashboard();
      }

      // Update employees section if visible
      if (isEmployeesSectionVisible()) {
        var countEl = document.getElementById('employeeCount');
        if (countEl) {
          countEl.innerHTML = '<span class="employee-count-badge">' + users.length + ' Personnel</span>';
        }
        populateEmployeeDeptFilter(users);
        renderEmployeeTable(users);
      }
    }, function(error) {
      console.error('Realtime users listener error:', error);
    });
  }

  function isDashboardSectionVisible() {
    var el = typeof document !== 'undefined' ? document.getElementById('section-dashboard') : null;
    return !!(el && !el.classList.contains('hidden') && !el.hasAttribute('hidden'));
  }

   function isEmployeesSectionVisible() {
     var el = typeof document !== 'undefined' ? document.getElementById('section-employees') : null;
     return !!(el && !el.classList.contains('hidden') && !el.hasAttribute('hidden'));
   }

  function subscribeToAnalyticsAttendance(startDate, endDate) {
    if (state.unsubscribeAnalyticsAttendance) {
      state.unsubscribeAnalyticsAttendance();
    }
    var db = getDb();
    if (!db) return;

    // Query attendance for current analytics period
    state.unsubscribeAnalyticsAttendance = db.collection('attendance')
      .where('date', '>=', formatDate(startDate))
      .where('date', '<=', formatDate(endDate))
      .onSnapshot(function(snapshot) {
        var records = snapshot.docs.map(function(doc) {
          return { id: doc.id, ...doc.data() };
        });
        records.sort(function(a, b) {
          return (b.timestamp && b.timestamp.toMillis ? b.timestamp.toMillis() : 0) - (a.timestamp && a.timestamp.toMillis ? a.timestamp.toMillis() : 0);
        });
        analyticsState.attendance = records;
        state.analyticsAttendanceData = records;

        // Update analytics if visible
        if (isAnalyticsSectionVisible()) {
          renderAnalytics();
        }
      }, function(error) {
        console.error('Realtime analytics attendance listener error:', error);
      });
  }

  function isAnalyticsSectionVisible() {
    var el = typeof document !== 'undefined' ? document.getElementById('section-analytics') : null;
    return !!(el && !el.classList.contains('hidden') && !el.hasAttribute('hidden'));
  }

  function subscribeToAttendanceForRangeRealtime(startDate, endDate) {
    if (state.realtimeUnsubscribe) {
      state.realtimeUnsubscribe();
      state.realtimeUnsubscribe = null;
    }
    var db = getDb();
    if (!db) return;

    state.realtimeUnsubscribe = db.collection('attendance')
      .where('date', '>=', formatDate(startDate))
      .where('date', '<=', formatDate(endDate))
      .onSnapshot(function(snapshot) {
        var records = snapshot.docs.map(function(doc) {
          return { id: doc.id, ...doc.data() };
        });
        records.sort(function(a, b) {
          return (b.timestamp && b.timestamp.toMillis ? b.timestamp.toMillis() : 0) - (a.timestamp && a.timestamp.toMillis ? a.timestamp.toMillis() : 0);
        });
        state.attendanceData = records;

        if (isDashboardSectionVisible()) {
          updateDashboard();
        }
      }, function(error) {
        console.error('Realtime attendance range listener error:', error);
      });
  }

  function formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function getDateRange(period, customRange) {
    const now = new Date();
    const end = new Date(now);
    const start = new Date(now);

    if (period === 'custom' && customRange && customRange.start && customRange.end) {
      const s = new Date(customRange.start);
      const e = new Date(customRange.end);
      s.setHours(0, 0, 0, 0);
      e.setHours(23, 59, 59, 999);
      return { start: s, end: e };
    }

    switch (period) {
      case 'yesterday':
        start.setDate(now.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end.setDate(now.getDate() - 1);
        end.setHours(23, 59, 59, 999);
        break;
      case '7days':
        start.setDate(now.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        break;
      case '30days':
        start.setDate(now.getDate() - 29);
        start.setHours(0, 0, 0, 0);
        break;
      case '90days':
        start.setDate(now.getDate() - 89);
        start.setHours(0, 0, 0, 0);
        break;
      case 'today':
      default:
        start.setHours(0, 0, 0, 0);
        break;
    }

    return { start: start, end: end };
  }

  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    const s = String(str);
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function showError(containerId, message) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<div style="color:#ff6b6b;text-align:center;padding:20px;font-size:0.875rem;">' + escapeHtml(message) + '</div>';
  }

  function showLoading(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;padding:40px;"><div class="spinner"></div></div>';
  }

  function showEmpty(containerId, message) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px;font-size:0.875rem;">' + escapeHtml(message) + '</div>';
  }

  function hideAllStates(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const existing = container.querySelector('.dashboard-error, .dashboard-loading, .dashboard-empty');
    if (existing) existing.remove();
  }

  function resetLoginForm() {
    var emailEl = document.getElementById('adminEmail');
    var passEl = document.getElementById('adminPassword');
    if (emailEl) emailEl.value = '';
    if (passEl) passEl.value = '';
  }

  // ============================================
  // STYLES
  // ============================================
   function injectDashboardStyles() {
     if (document.getElementById('dashboard-styles')) return;

      const style = document.createElement('style');
      style.id = 'dashboard-styles';
      style.textContent = [
        '.skeleton-shimmer { animation: skeleton-shimmer 1.5s ease-in-out infinite; }',
        '@keyframes skeleton-shimmer { 0% { background-position: 200%; } 100% { background-position: -200%; } }'
      ].join('\n');
      document.head.appendChild(style);
   }

  // ============================================
  // HTML CREATION
  // ============================================
  function createDashboardHTML() {
    const container = document.createElement('div');
    container.id = 'adminDashboard';
    container.className = 'dashboard-content';

    container.innerHTML = [
      '<div class="card-header" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--space-4);">',
      '  <h4 class="card-title">Dashboard Overview</h4>',
      '  <span id="dashLastUpdated" class="text-muted" style="font-size:var(--font-size-sm);"></span>',
      '</div>',
      '<div class="dashboard-controls">',
      '  <div style="display:flex;gap:var(--space-2);flex-wrap:wrap;">',
      '    <button data-period="today" class="btn btn-sm btn-outline period-btn active">Today</button>',
      '    <button data-period="yesterday" class="btn btn-sm btn-outline period-btn">Yesterday</button>',
      '    <button data-period="7days" class="btn btn-sm btn-outline period-btn">Last 7 Days</button>',
      '    <button data-period="30days" class="btn btn-sm btn-outline period-btn">Last 30 Days</button>',
      '    <button data-period="custom" class="btn btn-sm btn-outline period-btn">Custom</button>',
      '  </div>',
      '  <div id="customDateRange" class="hidden" style="display:flex;gap:var(--space-2);align-items:center;">',
      '    <input type="date" id="dashStartDate" class="form-input" style="width:auto;">',
      '    <span class="text-muted">to</span>',
      '    <input type="date" id="dashEndDate" class="form-input" style="width:auto;">',
      '    <button id="dashApplyCustom" class="btn btn-sm btn-primary">Apply</button>',
      '  </div>',
      '  <div style="display:flex;gap:var(--space-2);margin-left:auto;flex-wrap:wrap;">',
      '    <input type="text" id="dashSearch" placeholder="Search name/ID..." class="form-input" style="width:160px;">',
      '    <select id="dashDeptFilter" class="form-input" style="width:auto;"><option value="">All Depts</option></select>',
      '    <select id="dashStatusFilter" class="form-input" style="width:auto;">',
      '      <option value="">All Status</option>',
      '      <option value="verified">Verified</option>',
      '      <option value="late">Late</option>',
      '      <option value="blocked">Blocked</option>',
      '    </select>',
      '    <select id="dashLocationFilter" class="form-input" style="width:auto;">',
      '      <option value="">All Locations</option>',
      '      <option value="inside">Inside</option>',
      '      <option value="outside">Outside</option>',
      '    </select>',
      '  </div>',
      '</div>',
      '<div id="dashKpiCards" class="kpi-grid"></div>',
      '<div class="charts-grid">',
      '  <div class="chart-card">',
      '    <h5 class="chart-title">Attendance Trend</h5>',
      '    <div id="dashTrendChart" style="min-height:200px;"></div>',
      '  </div>',
      '  <div class="chart-card">',
      '    <h5 class="chart-title">Department Breakdown</h5>',
      '    <div id="dashDeptChart" style="min-height:200px;"></div>',
      '  </div>',
      '</div>',
      '<div class="analytics-grid">',
      '  <div class="analytics-card">',
      '    <h5 class="chart-title">Attendance Rate</h5>',
      '    <div id="dashRateRing"></div>',
      '  </div>',
      '  <div class="analytics-card">',
      '    <h5 class="chart-title">Location Analytics</h5>',
      '    <div id="dashLocationAnalytics"></div>',
      '  </div>',
      '</div>',
      '<div class="activity-card">',
      '  <h5 class="chart-title">Recent Verification Activity</h5>',
      '  <div id="dashActivityList" class="activity-list"></div>',
      '</div>',
      '<div class="dashboard-table-header">',
      '  <h5 class="chart-title" style="margin:0;">Attendance Records</h5>',
      '  <span id="dashRecordCount" class="text-muted" style="font-size:var(--font-size-sm);"></span>',
      '</div>',
      '<div id="dashAttendanceTable" class="table-container"></div>'
    ].join('\n');

    return container;
  }

  // ============================================
  // FIRESTORE QUERIES
  // ============================================
  async function loadUsers() {
    const db = getDb();
    if (!db) return [];
    try {
      const snapshot = await db.collection('users').get();
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (e) {
      console.error('Dashboard: Failed to load users', e);
      return [];
    }
  }

  async function loadAttendanceForDate(date) {
    const db = getDb();
    if (!db) return [];
    try {
      const snapshot = await db.collection('attendance').where('date', '==', date).get();
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      docs.sort((a, b) => (b.timestamp && b.timestamp.toMillis ? b.timestamp.toMillis() : 0) - (a.timestamp && a.timestamp.toMillis ? a.timestamp.toMillis() : 0));
      return docs;
    } catch (e) {
      console.error('Dashboard: Failed to load attendance for date', e);
      return [];
    }
  }

  async function loadAttendanceForRange(startDate, endDate) {
    const db = getDb();
    if (!db) return [];
    try {
      const snapshot = await db.collection('attendance')
        .where('date', '>=', formatDate(startDate))
        .where('date', '<=', formatDate(endDate))
        .get();
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      docs.sort((a, b) => (b.timestamp && b.timestamp.toMillis ? b.timestamp.toMillis() : 0) - (a.timestamp && a.timestamp.toMillis ? a.timestamp.toMillis() : 0));
      return docs;
    } catch (e) {
      console.error('Dashboard: Failed to load attendance range', e);
      return [];
    }
  }

  function subscribeToAttendance(date) {
    const db = getDb();
    if (!db) return null;
    unsubscribeFromAttendance();

    try {
      const unsubscribe = db.collection('attendance')
        .where('date', '==', date)
        .onSnapshot(function(snapshot) {
          const docs = snapshot.docs.map(function(doc) { return { id: doc.id, ...doc.data() }; });
          docs.sort(function(a, b) { return (b.timestamp && b.timestamp.toMillis ? b.timestamp.toMillis() : 0) - (a.timestamp && a.timestamp.toMillis ? a.timestamp.toMillis() : 0); });
          state.attendanceData = docs;
          updateDashboard();
        }, function(error) {
          console.error('Dashboard: Realtime listener error', error);
        });

      state.realtimeUnsubscribe = unsubscribe;
      return unsubscribe;
    } catch (e) {
      console.error('Dashboard: Failed to subscribe to attendance', e);
      return null;
    }
  }

  function unsubscribeFromAttendance() {
    if (state.realtimeUnsubscribe) {
      try {
        state.realtimeUnsubscribe();
      } catch (e) {
        // ignore
      }
      state.realtimeUnsubscribe = null;
    }
  }

  // ============================================
  // CALCULATIONS
  // ============================================
  function getStatus(record) {
    if (!record.timestamp) return 'Failed';
    try {
      const date = record.timestamp.toDate();
      const timeInMinutes = date.getHours() * 60 + date.getMinutes();
      const dist = record.location && record.location.distance != null ? record.location.distance : null;

      if (dist !== null && dist > 500) return 'Blocked';
      if (timeInMinutes > 9 * 60) return 'Late';
      return 'Verified';
    } catch (e) {
      return 'Failed';
    }
  }

  function calculateKPIs(attendanceRecords, users, period) {
    const safeRecords = Array.isArray(attendanceRecords) ? attendanceRecords : [];
    const totalStaff = users.length;
    const range = getDateRange(period, state.customDateRange);
    const startDateStr = formatDate(range.start);
    const endDateStr = formatDate(range.end);

    const periodRecords = safeRecords.filter(function(r) {
      return r.date >= startDateStr && r.date <= endDateStr;
    });

    const uniqueUserIds = new Set(periodRecords.map(function(r) { return r.userId; }));
    const presentCount = uniqueUserIds.size;
    const absentCount = Math.max(0, totalStaff - presentCount);

    const lateThreshold = 9 * 60;
    const lateCount = periodRecords.filter(function(r) {
      if (!r.timestamp) return false;
      try {
        const d = r.timestamp.toDate();
        return (d.getHours() * 60 + d.getMinutes()) > lateThreshold;
      } catch (e) {
        return false;
      }
    }).length;

    const blockedCount = periodRecords.filter(function(r) {
      const dist = r.location && r.location.distance != null ? r.location.distance : null;
      return dist !== null && dist > 500;
    }).length;

    const verificationsCount = periodRecords.length;

    return {
      totalStaff: totalStaff,
      present: presentCount,
      absent: absentCount,
      late: lateCount,
      blocked: blockedCount,
      verifications: verificationsCount
    };
  }

  function calculateTrendData(attendanceRecords, users, startDate, endDate) {
    const safeRecords = Array.isArray(attendanceRecords) ? attendanceRecords : [];
    const dates = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
      dates.push(formatDate(current));
      current.setDate(current.getDate() + 1);
    }

    const recordsByDate = {};
    safeRecords.forEach(function(r) {
      if (!recordsByDate[r.date]) recordsByDate[r.date] = [];
      recordsByDate[r.date].push(r);
    });

    const lateThreshold = 9 * 60;
    const totalStaff = users.length;

    return dates.map(function(dateStr) {
      const dayRecords = recordsByDate[dateStr] || [];
      const present = new Set(dayRecords.map(function(r) { return r.userId; })).size;
      const late = dayRecords.filter(function(r) {
        if (!r.timestamp) return false;
        try {
          const d = r.timestamp.toDate();
          return (d.getHours() * 60 + d.getMinutes()) > lateThreshold;
        } catch (e) {
          return false;
        }
      }).length;
      const absent = Math.max(0, totalStaff - present);

      return { date: dateStr, present: present, absent: absent, late: late };
    });
  }

  function calculateDepartmentData(attendanceRecords) {
    const safeRecords = Array.isArray(attendanceRecords) ? attendanceRecords : [];
    const deptMap = {};
    safeRecords.forEach(function(r) {
      const dept = r.dept || 'Unknown';
      if (!deptMap[dept]) deptMap[dept] = 0;
      deptMap[dept]++;
    });

    const total = attendanceRecords.length || 1;
    return Object.keys(deptMap).map(function(dept) {
      return { dept: dept, count: deptMap[dept], percentage: Math.round((deptMap[dept] / total) * 100) };
    }).sort(function(a, b) { return b.count - a.count; });
  }

  function calculateAttendanceRate(present, total) {
    if (total === 0) return 0;
    return Math.round((present / total) * 100);
  }

  function calculateLocationAnalytics(records) {
    const safeRecords = Array.isArray(records) ? records : [];
    let inside = 0, outside = 0, blocked = 0;
    safeRecords.forEach(function(r) {
      const dist = r.location && r.location.distance != null ? r.location.distance : null;
      if (dist === null) {
        blocked++;
      } else if (dist <= 500) {
        inside++;
      } else {
        outside++;
      }
    });
    const total = safeRecords.length || 1;
    return {
      inside: inside,
      outside: outside,
      blocked: blocked,
      total: total,
      insidePercent: Math.round((inside / total) * 100),
      outsidePercent: Math.round((outside / total) * 100),
      blockedPercent: Math.round((blocked / total) * 100)
    };
  }

  // ============================================
  // RENDERERS
  // ============================================
  function renderSkeletonKpis() {
    return '<div class="kpi-grid">' + Array(6).fill('<div class="skeleton-kpi"></div>').join('') + '</div>';
  }

  function renderSkeletonTable() {
    var rows = '';
    for (var i = 0; i < 5; i++) {
      rows += '<tr>' +
        '<td><div class="skeleton" style="height:14px;width:70%;"></div></td>' +
        '<td><div class="skeleton" style="height:14px;width:60%;"></div></td>' +
        '<td><div class="skeleton" style="height:14px;width:50%;"></div></td>' +
        '<td><div class="skeleton" style="height:14px;width:40%;"></div></td>' +
        '<td><div class="skeleton" style="height:14px;width:50%;"></div></td>' +
        '<td><div class="skeleton" style="height:14px;width:30%;"></div></td>' +
        '<td><div class="skeleton" style="height:14px;width:60%;"></div></td>' +
        '<td><div class="skeleton" style="height:14px;width:40%;"></div></td>' +
        '</tr>';
    }
    return '<table class="table"><tbody>' + rows + '</tbody></table>';
  }

  function renderSkeletonCharts() {
    return '<div style="display:grid;grid-template-columns:1fr;gap:var(--space-4);">' +
      '<div class="skeleton" style="height:220px;"></div>' +
      '<div class="skeleton" style="height:220px;"></div>' +
      '</div>';
  }

  function renderKpiCards(kpis, period) {
    const container = document.getElementById('dashKpiCards');
    if (!container) return;

    var labelSuffix = period === 'today' ? '' : ' (' + period + ')';
    var cards = [
      { icon: '👥', label: 'Total Staff', value: kpis.totalStaff, color: 'var(--text-primary)' },
      { icon: '✅', label: 'Present' + labelSuffix, value: kpis.present, color: '#2E8B57' },
      { icon: '❌', label: 'Absent' + labelSuffix, value: kpis.absent, color: '#ff6b6b' },
      { icon: '⏰', label: 'Late' + labelSuffix, value: kpis.late, color: '#D4A017' },
      { icon: '🚫', label: 'Blocked' + labelSuffix, value: kpis.blocked, color: '#8B1E1E' },
      { icon: '🔍', label: 'Verifications' + labelSuffix, value: kpis.verifications, color: '#C8A646' }
    ];

    var html = '';
    cards.forEach(function(card) {
      html += '<div class="kpi-card">' +
        '<div class="kpi-icon">' + escapeHtml(card.icon) + '</div>' +
        '<div class="kpi-value" style="color:' + card.color + ';">' + card.value + '</div>' +
        '<div class="kpi-label">' + escapeHtml(card.label) + '</div>' +
        '</div>';
    });

    container.innerHTML = html;
  }

  function renderTrendChart(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!data || data.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:40px 20px;">No data available for selected period</div>';
      return;
    }

    const width = 600;
    const height = 220;
    const padding = { top: 20, right: 20, bottom: 35, left: 35 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const allValues = [];
    data.forEach(function(d) {
      allValues.push(d.present, d.absent, d.late);
    });
    const maxVal = Math.max.apply(null, allValues);
    const yMax = maxVal > 0 ? maxVal + 1 : 5;

    const gridLines = 4;
    let svg = '<svg width="100%" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="xMidYMid meet">';

    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (chartHeight / gridLines) * i;
      const val = Math.round(yMax - (yMax / gridLines) * i);
      svg += '<line x1="' + padding.left + '" y1="' + y + '" x2="' + (width - padding.right) + '" y2="' + y + '" stroke="rgba(245,245,220,0.08)" stroke-width="1"/>';
      svg += '<text x="' + (padding.left - 5) + '" y="' + (y + 4) + '" text-anchor="end" fill="rgba(245,245,220,0.5)" font-size="9">' + val + '</text>';
    }

    const stepX = data.length > 1 ? chartWidth / (data.length - 1) : chartWidth;
    data.forEach(function(d, i) {
      const x = padding.left + stepX * i;
      svg += '<text x="' + x + '" y="' + (height - 10) + '" text-anchor="middle" fill="rgba(245,245,220,0.5)" font-size="8">' + escapeHtml(d.date.substring(5)) + '</text>';
    });

    const series = [
      { key: 'present', color: '#C8A646' },
      { key: 'absent', color: '#4B5320' },
      { key: 'late', color: '#D4A017' }
    ];

    series.forEach(function(s) {
      const points = data.map(function(d, i) {
        const x = padding.left + stepX * i;
        const y = padding.top + chartHeight - (d[s.key] / yMax) * chartHeight;
        return { x: x, y: y, val: d[s.key] };
      });

      const pathD = points.map(function(p, i) {
        return (i === 0 ? 'M' : 'L') + p.x + ',' + p.y;
      }).join(' ');

      const areaD = pathD + ' L' + (padding.left + stepX * (points.length - 1)) + ',' + (padding.top + chartHeight) + ' L' + padding.left + ',' + (padding.top + chartHeight) + ' Z';

      svg += '<path d="' + areaD + '" fill="' + s.color + '" opacity="0.08"/>';
      svg += '<path d="' + pathD + '" fill="none" stroke="' + s.color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';

      points.forEach(function(p) {
        svg += '<circle cx="' + p.x + '" cy="' + p.y + '" r="3" fill="' + s.color + '" stroke="var(--bg-surface)" stroke-width="1.5"/>';
      });
    });

    svg += '<defs><style>.legend-text { font-size: 10px; fill: var(--text-secondary); }</style></defs>';
    svg += '</svg>';

    var legend = '<div style="display:flex;gap:var(--space-4);justify-content:center;margin-top:var(--space-2);flex-wrap:wrap;">';
    series.forEach(function(s) {
      legend += '<div style="display:flex;align-items:center;gap:var(--space-1);"><span style="width:10px;height:10px;border-radius:2px;background:' + s.color + ';display:inline-block;"></span><span class="legend-text">' + s.key.charAt(0).toUpperCase() + s.key.slice(1) + '</span></div>';
    });
    legend += '</div>';

    container.innerHTML = svg + legend;
  }

  function renderDepartmentChart(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!data || data.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:40px 20px;">No department data available</div>';
      return;
    }

    const maxCount = Math.max.apply(null, data.map(function(d) { return d.count; }));
    const width = 400;
    const barHeight = 22;
    const gap = 10;
    const labelWidth = 90;
    const valueWidth = 80;
    const chartWidth = width - labelWidth - valueWidth;
    const height = Math.max(data.length * (barHeight + gap) + 20, 100);

    let svg = '<svg width="100%" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="xMidYMid meet">';

    data.forEach(function(d, i) {
      const y = 10 + i * (barHeight + gap);
      const barW = maxCount > 0 ? (d.count / maxCount) * chartWidth : 0;

      svg += '<text x="2" y="' + (y + barHeight / 2 + 4) + '" fill="var(--text-secondary)" font-size="10">' + escapeHtml(d.dept) + '</text>';
      svg += '<rect x="' + labelWidth + '" y="' + y + '" width="' + barW + '" height="' + barHeight + '" rx="4" fill="#C8A646" opacity="0.85"/>';
      svg += '<text x="' + (labelWidth + barW + 5) + '" y="' + (y + barHeight / 2 + 4) + '" fill="var(--text-primary)" font-size="10">' + d.count + ' (' + d.percentage + '%)</text>';
    });

    svg += '</svg>';
    container.innerHTML = svg;
  }

  function renderRateRing(containerId, percentage) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const size = 150;
    const strokeWidth = 10;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;

    let color = '#2E8B57';
    if (percentage < 50) color = '#8B1E1E';
    else if (percentage < 80) color = '#D4A017';

    let html = '<div style="position:relative;width:' + size + 'px;height:' + size + 'px;margin:0 auto;">';
    html += '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">';
    html += '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + radius + '" fill="none" stroke="rgba(245,245,220,0.08)" stroke-width="' + strokeWidth + '"/>';
    html += '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + radius + '" fill="none" stroke="' + color + '" stroke-width="' + strokeWidth + '" stroke-dasharray="' + circumference + '" stroke-dashoffset="' + offset + '" stroke-linecap="round" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')" style="transition:stroke-dashoffset 0.6s ease;"/>';
    html += '</svg>';
    html += '<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;">';
    html += '<span style="font-size:1.75rem;font-weight:700;color:' + color + ';">' + percentage + '%</span>';
    html += '<span style="font-size:0.7rem;color:var(--text-muted);">Attendance</span>';
    html += '</div>';
    html += '</div>';

    container.innerHTML = html;
  }

  function renderAttendanceTable(containerId, records) {
    const container = document.getElementById(containerId);
    if (!container) return;

    var html = '<table class="table"><thead><tr>' +
      '<th>Employee ID</th><th>Name</th><th>Department</th><th>Time</th><th>Status</th><th>Confidence</th><th>Location</th><th>Distance</th>' +
      '</tr></thead><tbody>';

    if (!records || records.length === 0) {
      html += '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:20px;">No records found</td></tr>';
    } else {
      records.forEach(function(r) {
        var status = getStatus(r);
        var statusClass = 'badge-neutral';
        if (status === 'Verified') statusClass = 'badge-success';
        else if (status === 'Late') statusClass = 'badge-warning';
        else if (status === 'Blocked') statusClass = 'badge-danger';
        else if (status === 'Failed') statusClass = 'badge-neutral';

        var timeStr = '--:--';
        if (r.timestamp) {
          try {
            timeStr = r.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          } catch (e) {
            timeStr = '--:--';
          }
        }

        var dist = r.location && r.location.distance != null ? r.location.distance : null;
        var locStatus = 'Unknown';
        if (dist !== null) {
          locStatus = dist <= 500 ? 'Inside' : 'Outside';
        }
        var distStr = dist !== null ? (dist / 1000).toFixed(2) + ' km' : '--';

        html += '<tr>' +
          '<td>' + escapeHtml(r.userId || '') + '</td>' +
          '<td>' + escapeHtml(r.name || '') + '</td>' +
          '<td>' + escapeHtml(r.dept || '') + '</td>' +
          '<td>' + escapeHtml(timeStr) + '</td>' +
          '<td><span class="badge ' + statusClass + '">' + escapeHtml(status) + '</span></td>' +
          '<td>--</td>' +
          '<td>' + escapeHtml(locStatus) + '</td>' +
          '<td>' + escapeHtml(distStr) + '</td>' +
          '</tr>';
      });
    }

    html += '</tbody></table>';
    container.innerHTML = html;
  }

  function renderActivity(containerId, records) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!records || records.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px;">No recent activity</div>';
      return;
    }

    var recent = records.slice(0, 10);
    var html = '';

    recent.forEach(function(r) {
      var timeStr = '--:--';
      if (r.timestamp) {
        try {
          timeStr = r.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
          timeStr = '--:--';
        }
      }

      var status = getStatus(r);
      var dotColor = '#2E8B57';
      if (status === 'Late') dotColor = '#D4A017';
      else if (status === 'Blocked') dotColor = '#8B1E1E';
      else if (status === 'Failed') dotColor = '#ff6b6b';

      html += '<div class="activity-item">' +
        '<div class="activity-dot" style="background:' + dotColor + ';box-shadow:0 0 6px ' + dotColor + ';"></div>' +
        '<div class="activity-info">' +
          '<div class="activity-name">' + escapeHtml(r.name || 'Unknown') + '</div>' +
          '<div class="activity-dept">' + escapeHtml(r.dept || '') + '</div>' +
        '</div>' +
        '<div class="activity-time">' + escapeHtml(timeStr) + '</div>' +
        '</div>';
    });

    container.innerHTML = html;
  }

  function renderLocationAnalytics(containerId, records) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const safeRecords = Array.isArray(records) ? records : [];
    var analytics = calculateLocationAnalytics(safeRecords);
    var total = analytics.total || 1;

    if (safeRecords.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px;">No attendance data available.</div>';
      return;
    }

    var html = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-3);">';

    var insideColor = '#2E8B57';
    var outsideColor = '#D4A017';
    var blockedColor = '#8B1E1E';

    html += '<div class="location-stat">' +
      '<div class="location-value" style="color:' + insideColor + ';">' + analytics.inside + '</div>' +
      '<div class="location-label">Inside (' + analytics.insidePercent + '%)</div>' +
      '</div>';

    html += '<div class="location-stat">' +
      '<div class="location-value" style="color:' + outsideColor + ';">' + analytics.outside + '</div>' +
      '<div class="location-label">Outside (' + analytics.outsidePercent + '%)</div>' +
      '</div>';

    html += '<div class="location-stat">' +
      '<div class="location-value" style="color:' + blockedColor + ';">' + analytics.blocked + '</div>' +
      '<div class="location-label">Blocked (' + analytics.blockedPercent + '%)</div>' +
      '</div>';

    html += '</div>';
    container.innerHTML = html;
  }

  // ============================================
  // FILTERS
  // ============================================
  function filterRecords(records, filters) {
    if (!records) return [];
    return records.filter(function(r) {
      if (filters.search) {
        var term = filters.search.toLowerCase();
        var match = (r.userId || '').toLowerCase().indexOf(term) !== -1 ||
                    (r.name || '').toLowerCase().indexOf(term) !== -1 ||
                    (r.dept || '').toLowerCase().indexOf(term) !== -1;
        if (!match) return false;
      }

      if (filters.department && r.dept !== filters.department) return false;

      if (filters.status) {
        var status = getStatus(r);
        if (status.toLowerCase() !== filters.status.toLowerCase()) return false;
      }

      if (filters.location) {
        var dist = r.location && r.location.distance != null ? r.location.distance : null;
        var isInside = dist !== null && dist <= 500;
        if (filters.location === 'inside' && !isInside) return false;
        if (filters.location === 'outside' && isInside) return false;
      }

      return true;
    });
  }

  function getFilters() {
    return {
      search: document.getElementById('dashSearch') ? document.getElementById('dashSearch').value.trim() : '',
      department: document.getElementById('dashDeptFilter') ? document.getElementById('dashDeptFilter').value : '',
      status: document.getElementById('dashStatusFilter') ? document.getElementById('dashStatusFilter').value : '',
      location: document.getElementById('dashLocationFilter') ? document.getElementById('dashLocationFilter').value : ''
    };
  }

  function populateDepartmentFilter(users) {
    var select = document.getElementById('dashDeptFilter');
    if (!select) return;

    var depts = new Set();
    users.forEach(function(u) {
      if (u.dept) depts.add(u.dept);
    });

    var currentVal = select.value;
    select.innerHTML = '<option value="">All Depts</option>';
    Array.from(depts).sort().forEach(function(dept) {
      var opt = document.createElement('option');
      opt.value = dept;
      opt.textContent = dept;
      select.appendChild(opt);
    });

    select.value = currentVal;
  }

  // ============================================
  // DASHBOARD UPDATE
  // ============================================
  function updateDashboard() {
    if (!state.dashboardEl) return;
    var section = document.getElementById('section-dashboard');
    if (section && (section.hasAttribute('hidden') || section.classList.contains('hidden'))) return;

    var records = state.attendanceData || [];
    var users = state.usersData || [];
    var period = state.currentPeriod;

    var filteredRecords = filterRecords(records, getFilters());

    var range = getDateRange(period, state.customDateRange);
    var trendData = calculateTrendData(records, users, range.start, range.end);
    var deptData = calculateDepartmentData(records);
    var kpis = calculateKPIs(records, users, period);
    var rate = calculateAttendanceRate(kpis.present, kpis.totalStaff);
    var locationAnalytics = calculateLocationAnalytics(records);

    renderKpiCards(kpis, period);
    renderTrendChart('dashTrendChart', trendData);
    renderDepartmentChart('dashDeptChart', deptData);
    renderRateRing('dashRateRing', rate);
    renderLocationAnalytics('dashLocationAnalytics', records);
    renderActivity('dashActivityList', records);
    renderAttendanceTable('dashAttendanceTable', filteredRecords);

    var countEl = document.getElementById('dashRecordCount');
    if (countEl) {
      countEl.textContent = filteredRecords.length + ' record' + (filteredRecords.length !== 1 ? 's' : '');
    }

    var lastUpdatedEl = document.getElementById('dashLastUpdated');
    if (lastUpdatedEl) {
      lastUpdatedEl.textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  }

  async function loadDashboardData() {
    if (state.isLoading) return;
    state.isLoading = true;

    var db = getDb();
    if (!db) {
      state.isLoading = false;
      var kpiContainer = document.getElementById('dashKpiCards');
      if (kpiContainer) {
        kpiContainer.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px;">Connecting to Firebase...</div>';
      }
      return;
    }

    unsubscribeFromAttendance();

    var kpiContainer = document.getElementById('dashKpiCards');
    var tableContainer = document.getElementById('dashAttendanceTable');
    var trendContainer = document.getElementById('dashTrendChart');
    var deptContainer = document.getElementById('dashDeptChart');

    if (kpiContainer) kpiContainer.innerHTML = renderSkeletonKpis();
    if (tableContainer) tableContainer.innerHTML = renderSkeletonTable();
    if (trendContainer) trendContainer.innerHTML = renderSkeletonCharts();
    if (deptContainer) deptContainer.innerHTML = '<div class="skeleton" style="height:200px;"></div>';

     try {
      // Initial one-time load for users, then set up real-time listener
      state.usersData = await loadUsers();
      subscribeToUsersRealtime();

      if (state.currentPeriod === 'today') {
        state.attendanceData = await loadAttendanceForDate(state.currentDate);
        subscribeToAttendance(state.currentDate);
      } else {
        var range = getDateRange(state.currentPeriod, state.customDateRange);
        state.attendanceData = await loadAttendanceForRange(range.start, range.end);
        subscribeToAttendanceForRangeRealtime(range.start, range.end);
      }

      populateDepartmentFilter(state.usersData);
      updateDashboard();
    } catch (e) {
      console.error('Dashboard: Failed to load data', e);
      if (kpiContainer) showError('dashKpiCards', 'Failed to load dashboard data. Please refresh.');
    } finally {
      state.isLoading = false;
    }
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================
  function setupEventListeners() {
    var dashboard = document.getElementById('adminDashboard');
    if (!dashboard) return;

    dashboard.addEventListener('click', function(e) {
      var target = e.target;
      if (!target) return;

      if (target.classList.contains('period-btn')) {
        var period = target.getAttribute('data-period');
        if (period) handlePeriodChange(period);
      }

      if (target.id === 'dashApplyCustom') {
        handleCustomRangeApply();
      }
    });

    var searchInput = document.getElementById('dashSearch');
    if (searchInput) {
      var searchTimeout;
      searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(function() {
          updateDashboard();
        }, 300);
      });
    }

    var deptFilter = document.getElementById('dashDeptFilter');
    if (deptFilter) {
      deptFilter.addEventListener('change', function() {
        updateDashboard();
      });
    }

    var statusFilter = document.getElementById('dashStatusFilter');
    if (statusFilter) {
      statusFilter.addEventListener('change', function() {
        updateDashboard();
      });
    }

    var locationFilter = document.getElementById('dashLocationFilter');
    if (locationFilter) {
      locationFilter.addEventListener('change', function() {
        updateDashboard();
      });
    }
  }

  function handlePeriodChange(period) {
    state.currentPeriod = period;
    state.customDateRange = null;

    var buttons = document.querySelectorAll('.period-btn');
    buttons.forEach(function(btn) {
      btn.classList.remove('active');
      if (btn.getAttribute('data-period') === period) {
        btn.classList.add('active');
      }
    });

    var customRangeEl = document.getElementById('customDateRange');
    if (customRangeEl) {
      if (period === 'custom') {
        customRangeEl.classList.remove('hidden');
        customRangeEl.style.display = 'flex';
      } else {
        customRangeEl.classList.add('hidden');
        customRangeEl.style.display = 'none';
      }
    }

    if (period === 'today') {
      state.currentDate = formatDate(new Date());
    }

    loadDashboardData();
  }

  function handleCustomRangeApply() {
    var startInput = document.getElementById('dashStartDate');
    var endInput = document.getElementById('dashEndDate');

    if (!startInput || !endInput) return;

    var startVal = startInput.value;
    var endVal = endInput.value;

    if (!startVal || !endVal) {
      var kpiContainer = document.getElementById('dashKpiCards');
      if (kpiContainer) showError('dashKpiCards', 'Please select both start and end dates.');
      return;
    }

    if (new Date(startVal) > new Date(endVal)) {
      var kpiContainer = document.getElementById('dashKpiCards');
      if (kpiContainer) showError('dashKpiCards', 'Start date must be before end date.');
      return;
    }

    state.customDateRange = { start: startVal, end: endVal };
    state.currentPeriod = 'custom';

    var buttons = document.querySelectorAll('.period-btn');
    buttons.forEach(function(btn) {
      btn.classList.remove('active');
      if (btn.getAttribute('data-period') === 'custom') {
        btn.classList.add('active');
      }
    });

    loadDashboardData();
  }

  function updateFirebaseStatus(connected) {
    var statusEl = document.querySelector('.admin-header-status');
    if (!statusEl) return;
    var dot = statusEl.querySelector('.admin-header-status-dot');
    var text = statusEl.querySelector('.admin-header-status-text');
    if (connected) {
      if (dot) { dot.style.background = 'var(--color-success)'; dot.style.boxShadow = '0 0 8px rgba(46, 139, 87, 0.5)'; }
      if (text) text.textContent = 'System Online';
    } else {
      if (dot) { dot.style.background = 'var(--color-danger)'; dot.style.boxShadow = 'none'; }
      if (text) text.textContent = 'Offline';
    }
  }

  // ============================================
  // AUTH LISTENER
  // ============================================
  function setupAuthListener() {
    const auth = getAuth();
    if (!auth) return;

    auth.onAuthStateChanged(function(user) {
      state.currentUser = user;
      const dashboard = document.getElementById('adminDashboard');
      const section = document.getElementById('section-dashboard');
      if (!dashboard) return;

      if (user) {
        dashboard.classList.remove('hidden');
        if (section) { section.classList.remove('hidden'); section.removeAttribute('hidden'); }
        state.currentDate = formatDate(new Date());
        var contentEl = document.querySelector('.admin-content');
        if (contentEl) contentEl.scrollTop = 0;
        window.scrollTo({ top: 0, behavior: 'instant' });
        loadDashboardData();
       } else {
         dashboard.classList.add('hidden');
         if (section) { section.classList.add('hidden'); section.setAttribute('hidden', 'hidden'); }
         unsubscribeAllRealTime();
         state.attendanceData = [];
         state.usersData = [];
         attendanceState.records = [];
         resetLoginForm();
       }

    });
   }

  // ============================================
  // NAVIGATION
  // ============================================
  function showSection(sectionId) {
    var sections = document.querySelectorAll('.admin-section');
    sections.forEach(function(section) {
      if (section.id === 'section-' + sectionId) {
        section.removeAttribute('hidden');
        section.classList.remove('hidden');
      } else {
        section.setAttribute('hidden', 'hidden');
        section.classList.add('hidden');
      }
    });

    var main = document.querySelector('.admin-main');
    if (main) {
      main.scrollTop = 0;
    }
    var content = document.querySelector('.admin-content');
    if (content) {
      content.scrollTop = 0;
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function setupNavigation() {
    var navItems = document.querySelectorAll('.admin-nav-item[data-section]');

    var titles = {
      dashboard: 'Dashboard',
      analytics: 'Analytics',
      attendance: 'Attendance',
      employees: 'Employees',
      register: 'Register Employee',
      reports: 'Reports'
    };

    var subtitles = {
      dashboard: 'Overview of biometric attendance activity',
      analytics: 'Detailed attendance analytics and insights',
      attendance: 'Attendance records and management',
      employees: 'Registered personnel and staff',
      register: 'Register new personnel with biometric data',
      reports: 'Export attendance reports and data'
    };

    navItems.forEach(function(item) {
      item.addEventListener('click', function(e) {
        e.preventDefault();
        var sectionId = this.getAttribute('data-section');
        if (!sectionId) return;

        // Update nav active state
        navItems.forEach(function(nav) { nav.classList.remove('active'); });
        this.classList.add('active');

        // Show target section
        showSection(sectionId);

        // Update header
        var titleEl = document.getElementById('adminPageTitle');
        var subtitleEl = document.getElementById('adminPageSubtitle');
        if (titleEl && titles[sectionId]) titleEl.textContent = titles[sectionId];
        if (subtitleEl && subtitles[sectionId]) subtitleEl.textContent = subtitles[sectionId];

        // Close mobile drawer
        var sidebar = document.getElementById('adminSidebar');
        var overlay = document.getElementById('adminDrawerOverlay');
        var toggle = document.getElementById('adminDrawerToggle');
        if (sidebar) sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('open');
        if (toggle) toggle.setAttribute('aria-expanded', 'false');

        // Load section-specific data
        if (sectionId === 'dashboard') {
          state.currentDate = formatDate(new Date());
          loadDashboardData();
        } else if (sectionId === 'attendance') {
          loadAttendanceSection();
        } else if (sectionId === 'employees') {
          loadEmployeesSection();
        } else if (sectionId === 'reports') {
          loadReportsSection();
        }
      });
    });

    // Mobile drawer toggle
    var drawerToggle = document.getElementById('adminDrawerToggle');
    var drawerOverlay = document.getElementById('adminDrawerOverlay');
    var sidebar = document.getElementById('adminSidebar');

    if (drawerToggle && sidebar && drawerOverlay) {
      drawerToggle.addEventListener('click', function() {
        var isOpen = sidebar.classList.contains('open');
        if (isOpen) {
          sidebar.classList.remove('open');
          drawerOverlay.classList.remove('open');
          drawerToggle.setAttribute('aria-expanded', 'false');
        } else {
          sidebar.classList.add('open');
          drawerOverlay.classList.add('open');
          drawerToggle.setAttribute('aria-expanded', 'true');
        }
      });

      drawerOverlay.addEventListener('click', function() {
        sidebar.classList.remove('open');
        drawerOverlay.classList.remove('open');
        drawerToggle.setAttribute('aria-expanded', 'false');
      });
    }
  }

  function updateHeaderDate() {
    var dateEl = document.getElementById('adminHeaderDate');
    if (dateEl) {
      dateEl.textContent = new Date().toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  }

  // ============================================
  // ATTENDANCE MANAGEMENT MODULE
  // ============================================
  var attendanceState = {
    records: [],
    users: [],
    filters: {
      search: '',
      department: '',
      status: '',
      location: ''
    },
    period: 'today',
    customRange: null,
    sortField: 'timestamp',
    sortDir: 'desc',
    realtimeUnsubscribe: null,
    isLoading: false,
    initialized: false
  };

  function getAttendanceDateRange(period, customRange) {
    var now = new Date();
    var end = new Date(now);
    end.setHours(23, 59, 59, 999);
    var start = new Date(now);
    start.setHours(0, 0, 0, 0);

    if (period === 'custom' && customRange && customRange.start && customRange.end) {
      var s = new Date(customRange.start);
      var e = new Date(customRange.end);
      s.setHours(0, 0, 0, 0);
      e.setHours(23, 59, 59, 999);
      return { start: s, end: e };
    }

    switch (period) {
      case 'yesterday':
        start.setDate(now.getDate() - 1);
        start.setHours(0, 0, 0, 0);
        end.setDate(now.getDate() - 1);
        end.setHours(23, 59, 59, 999);
        break;
      case '7days':
        start.setDate(now.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        break;
      case '30days':
        start.setDate(now.getDate() - 29);
        start.setHours(0, 0, 0, 0);
        break;
      case 'today':
      default:
        break;
    }

    return { start: start, end: end };
  }

  function getAttendancePeriodLabel(period, customRange) {
    if (period === 'custom' && customRange) {
      return customRange.start + ' to ' + customRange.end;
    }
    var labels = {
      today: 'Today',
      yesterday: 'Yesterday',
      '7days': 'Last 7 Days',
      '30days': 'Last 30 Days'
    };
    return labels[period] || 'Today';
  }

  function subscribeToAttendanceRecords(dateStr) {
    var db = getDb();
    if (!db) return null;
    unsubscribeFromAttendanceRecords();

    try {
      var unsubscribe = db.collection('attendance')
        .where('date', '==', dateStr)
        .onSnapshot(function(snapshot) {
          var docs = snapshot.docs.map(function(doc) { return { id: doc.id, ...doc.data() }; });
          docs.sort(function(a, b) {
            return (b.timestamp && b.timestamp.toMillis ? b.timestamp.toMillis() : 0) - (a.timestamp && a.timestamp.toMillis ? a.timestamp.toMillis() : 0);
          });
          attendanceState.records = docs;
          refreshAttendanceView();
        }, function(error) {
          console.error('Attendance: Realtime listener error', error);
        });

      attendanceState.realtimeUnsubscribe = unsubscribe;
      return unsubscribe;
    } catch (e) {
      console.error('Attendance: Failed to subscribe', e);
      return null;
    }
  }

  function unsubscribeFromAttendanceRecords() {
    if (attendanceState.realtimeUnsubscribe) {
      try {
        attendanceState.realtimeUnsubscribe();
      } catch (e) { /* ignore */ }
      attendanceState.realtimeUnsubscribe = null;
    }
  }

  async function loadAttendanceSectionData() {
    if (attendanceState.isLoading) return;
    attendanceState.isLoading = true;

    var db = getDb();
    if (!db) {
      attendanceState.isLoading = false;
      var container = document.getElementById('attendanceRecordsContainer');
      if (container) container.innerHTML = '<div class="attendance-error-state"><div class="attendance-error-icon">&#9888;</div><h4>Unable to load attendance records.</h4><p>Firebase connection unavailable. Please check your connection and try again.</p><button id="attendanceRetryBtn" class="btn btn-sm btn-accent">Try Again</button></div>';
      return;
    }

    var container = document.getElementById('attendanceRecordsContainer');
    if (container) container.innerHTML = '<div class="skeleton-table"><table class="table"><tbody>' + Array(8).fill('<tr>' + Array(11).fill('<td><div class="skeleton" style="height:14px;width:80%;"></div></td>').join('') + '</tr>').join('') + '</tbody></table></div>';

    var kpiContainer = document.getElementById('attendanceKpiCards');
    if (kpiContainer) kpiContainer.innerHTML = Array(5).fill('<div class="skeleton-kpi"></div>').join('');

    try {
      attendanceState.users = await loadUsers();

      var range = getAttendanceDateRange(attendanceState.period, attendanceState.customRange);
      var startDateStr = formatDate(range.start);
      var endDateStr = formatDate(range.end);

      if (attendanceState.period === 'today') {
        attendanceState.records = await loadAttendanceForDate(startDateStr);
        subscribeToAttendanceRecords(startDateStr);
      } else if (attendanceState.period === 'yesterday') {
        attendanceState.records = await loadAttendanceForDate(startDateStr);
        unsubscribeFromAttendanceRecords();
      } else {
        attendanceState.records = await loadAttendanceForRange(range.start, range.end);
        unsubscribeFromAttendanceRecords();
      }

      populateAttendanceDeptFilter(attendanceState.users);
      renderAttendancePeriodSelect();
      updateAttendanceDateIndicator();
      refreshAttendanceView();
    } catch (e) {
      console.error('Attendance: Failed to load data', e);
      if (container) container.innerHTML = '<div class="attendance-error-state"><div class="attendance-error-icon">&#9888;</div><h4>Unable to load attendance records.</h4><p>Please check your connection and try again.</p><button id="attendanceRetryBtn" class="btn btn-sm btn-accent">Try Again</button></div>';
    } finally {
      attendanceState.isLoading = false;
    }
  }

  function renderAttendancePeriodSelect() {
    var select = document.getElementById('attendancePeriod');
    if (!select) return;

    var periodLabels = {
      today: 'Today',
      yesterday: 'Yesterday',
      '7days': 'Last 7 Days',
      '30days': 'Last 30 Days',
      custom: 'Custom Range'
    };

    var html = '';
    Object.keys(periodLabels).forEach(function(key) {
      html += '<option value="' + key + '" ' + (key === attendanceState.period ? 'selected' : '') + '>' + periodLabels[key] + '</option>';
    });
    select.innerHTML = html;
  }

  function updateAttendanceDateIndicator() {
    var el = document.getElementById('attendanceDateIndicator');
    if (!el) return;
    el.textContent = getAttendancePeriodLabel(attendanceState.period, attendanceState.customRange);
  }

  function populateAttendanceDeptFilter(users) {
    var select = document.getElementById('attendanceDeptFilter');
    if (!select) return;

    var depts = {};
    users.forEach(function(u) {
      var d = u.dept || 'Unknown';
      depts[d] = (depts[d] || 0) + 1;
    });

    var html = '<option value="">All Departments</option>';
    Object.keys(depts).sort().forEach(function(dept) {
      html += '<option value="' + escapeHtml(dept) + '">' + escapeHtml(dept) + ' (' + depts[dept] + ')</option>';
    });
    select.innerHTML = html;
  }

  function calculateAttendanceKPIs(records, users) {
    var safeRecords = Array.isArray(records) ? records : [];
    var totalStaff = users.length;

    var presentUserIds = new Set();
    var lateCount = 0;
    var blockedCount = 0;

    safeRecords.forEach(function(r) {
      if (r.userId) presentUserIds.add(r.userId);

      var status = getAttendanceStatus(r);
      if (status === 'Late') lateCount++;
      if (status === 'Blocked') blockedCount++;
    });

    var presentCount = presentUserIds.size;
    var lateUnique = 0;
    var blockedUserIds = new Set();

    safeRecords.forEach(function(r) {
      var status = getAttendanceStatus(r);
      if (status === 'Blocked' && r.userId) blockedUserIds.add(r.userId);
    });
    blockedCount = blockedUserIds.size;

    var lateUserIds = new Set();
    safeRecords.forEach(function(r) {
      var status = getAttendanceStatus(r);
      if (status === 'Late' && r.userId) lateUserIds.add(r.userId);
    });
    lateCount = lateUserIds.size;

    var absentCount = Math.max(0, totalStaff - presentCount);

    return {
      totalStaff: totalStaff,
      present: presentCount,
      late: lateCount,
      absent: absentCount,
      blocked: blockedCount
    };
  }

  function getAttendanceStatus(record) {
    if (!record.timestamp) return 'Failed';
    try {
      var date = record.timestamp.toDate();
      var timeInMinutes = date.getHours() * 60 + date.getMinutes();
      var dist = record.location && record.location.distance != null ? record.location.distance : null;

      if (dist !== null && dist > 500) return 'Blocked';
      if (timeInMinutes > 9 * 60) return 'Late';
      return 'Verified';
    } catch (e) {
      return 'Failed';
    }
  }

  function getAttendanceLocationStatus(record) {
    var dist = record.location && record.location.distance != null ? record.location.distance : null;
    if (dist === null) return 'Blocked';
    if (dist <= 500) return 'Inside';
    return 'Outside';
  }

  function renderAttendanceKpis(kpis) {
    var container = document.getElementById('attendanceKpiCards');
    if (!container) return;

    var cards = [
      { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>', label: 'Total Personnel', value: kpis.totalStaff, color: 'var(--text-primary)' },
      { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11h-4l-2-4h-2l-2 4H2"/>', label: 'Present', value: kpis.present, color: '#2E8B57' },
      { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 16 12 12 12 8"/><line x1="12" y1="12" x2="12.01" y2="12"/></svg>', label: 'Late', value: kpis.late, color: '#D4A017' },
      { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>', label: 'Absent', value: kpis.absent, color: '#A52A2A' },
      { icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>', label: 'Location Blocked', value: kpis.blocked, color: '#8B1E2E' }
    ];

    var html = '';
    cards.forEach(function(card) {
      html += '<div class="attendance-kpi-card">' +
        '<div class="attendance-kpi-icon" style="color:' + card.color + ';">' + card.icon + '</div>' +
        '<div class="attendance-kpi-value" style="color:' + card.color + ';">' + card.value + '</div>' +
        '<div class="attendance-kpi-label">' + card.label + '</div>' +
        '</div>';
    });
    container.innerHTML = html;
  }

  function filterAttendanceRecords(records, filters) {
    if (!records) return [];
    var safeRecords = Array.isArray(records) ? records : [];
    return safeRecords.filter(function(r) {
      if (filters.search) {
        var term = filters.search.toLowerCase();
        var match = (r.userId || '').toLowerCase().indexOf(term) !== -1 ||
                    (r.name || '').toLowerCase().indexOf(term) !== -1;
        if (!match) return false;
      }

      if (filters.department && r.dept !== filters.department) return false;

      if (filters.status) {
        var status = getAttendanceStatus(r);
        if (status.toLowerCase() !== filters.status.toLowerCase()) return false;
      }

      if (filters.location) {
        var locStatus = getAttendanceLocationStatus(r);
        if (locStatus.toLowerCase() !== filters.location.toLowerCase()) return false;
      }

      return true;
    });
  }

  function sortAttendanceRecords(records, field, dir) {
    if (!Array.isArray(records)) return [];
    var sorted = records.slice();
    sorted.sort(function(a, b) {
      var valA, valB;

      if (field === 'time' || field === 'timestamp') {
        valA = (a.timestamp && a.timestamp.toMillis) ? a.timestamp.toMillis() : 0;
        valB = (b.timestamp && b.timestamp.toMillis) ? b.timestamp.toMillis() : 0;
      } else if (field === 'status') {
        var statusOrder = { 'Blocked': 0, 'Late': 1, 'Verified': 2, 'Failed': 3, 'Absent': 4 };
        valA = statusOrder[getAttendanceStatus(a)] || 5;
        valB = statusOrder[getAttendanceStatus(b)] || 5;
      } else if (field === 'distance') {
        valA = (a.location && a.location.distance != null) ? a.location.distance : Infinity;
        valB = (b.location && b.location.distance != null) ? b.location.distance : Infinity;
      } else if (field === 'date') {
        valA = a.date || '';
        valB = b.date || '';
      } else {
        valA = a[field] || '';
        valB = b[field] || '';
      }

      if (valA < valB) return dir === 'asc' ? -1 : 1;
      if (valA > valB) return dir === 'asc' ? 1 : -1;
      return 0;
    });
    return sorted;
  }

  function getAttendanceFilters() {
    var searchEl = document.getElementById('attendanceSearch');
    var deptEl = document.getElementById('attendanceDeptFilter');
    var statusEl = document.getElementById('attendanceStatusFilter');
    var locEl = document.getElementById('attendanceLocationFilter');

    return {
      search: searchEl ? searchEl.value.trim() : '',
      department: deptEl ? deptEl.value : '',
      status: statusEl ? statusEl.value : '',
      location: locEl ? locEl.value : ''
    };
  }

  function renderAttendanceRecordsTable() {
    var container = document.getElementById('attendanceRecordsContainer');
    if (!container) return;

    var records = attendanceState.records || [];
    var users = attendanceState.users || [];
    var filters = getAttendanceFilters();
    var filtered = filterAttendanceRecords(records, filters);
    var sorted = sortAttendanceRecords(filtered, attendanceState.sortField, attendanceState.sortDir);

    var kpis = calculateAttendanceKPIs(records, users);
    renderAttendanceKpis(kpis);

    updateAttendanceDateIndicator();

    if (sorted.length === 0) {
      if (records.length === 0) {
        container.innerHTML = '<div class="attendance-empty-state"><div class="attendance-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><h4>No attendance records found</h4><p>Attendance activity for the selected period will appear here.</p></div>';
      } else {
        container.innerHTML = '<div class="attendance-empty-state"><div class="attendance-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="1" y1="1" x2="23" y2="23"/></svg></div><h4>No matching records</h4><p>Try adjusting your search or filter criteria.</p></div>';
      }
      return;
    }

    var html = '<table class="table attendance-table"><thead><tr>' +
      '<th sortable data-field="userId">Employee ID</th>' +
      '<th sortable data-field="name">Name</th>' +
      '<th sortable data-field="dept">Department</th>' +
      '<th sortable data-field="appointment">Appointment</th>' +
      '<th sortable data-field="date">Date</th>' +
      '<th sortable data-field="timestamp">Time</th>' +
      '<th sortable data-field="status">Status</th>' +
      '<th>Face Verification</th>' +
      '<th sortable data-field="location">Location</th>' +
      '<th sortable data-field="distance">Distance</th>' +
      '<th>Action</th>' +
      '</tr></thead><tbody>';

    sorted.forEach(function(r) {
      var status = getAttendanceStatus(r);
      var statusClass = 'badge-neutral';
      if (status === 'Verified') statusClass = 'badge-success';
      else if (status === 'Late') statusClass = 'badge-warning';
      else if (status === 'Blocked') statusClass = 'badge-danger';
      else if (status === 'Failed') statusClass = 'badge-neutral';
      else if (status === 'Absent') statusClass = 'badge-danger';

      var timeStr = '--:--';
      if (r.timestamp) {
        try {
          timeStr = r.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch (e) { timeStr = '--:--'; }
      }

      var dateStr = r.date || '--';
      if (r.timestamp) {
        try { dateStr = r.timestamp.toDate().toLocaleDateString(); } catch(e) {}
      }

      var faceStatus = r.faceImage ? '<span class="badge badge-success" style="font-size:0.7rem;padding:2px 8px;">VERIFIED</span>' : '<span class="badge badge-neutral" style="font-size:0.7rem;padding:2px 8px;">NOT AVAILABLE</span>';

      var locStatus = getAttendanceLocationStatus(r);
      var locBadgeClass = 'badge-info';
      if (locStatus === 'Inside') locBadgeClass = 'badge-success';
      else if (locStatus === 'Outside') locBadgeClass = 'badge-warning';
      else if (locStatus === 'Blocked') locBadgeClass = 'badge-danger';

      var dist = r.location && r.location.distance != null ? r.location.distance : null;
      var distStr = dist !== null ? dist + ' m' : '--';

      html += '<tr>' +
        '<td>' + escapeHtml(r.userId || '') + '</td>' +
        '<td>' + escapeHtml(r.name || '') + '</td>' +
        '<td>' + escapeHtml(r.dept || '') + '</td>' +
        '<td>' + escapeHtml(r.appointment || '') + '</td>' +
        '<td>' + escapeHtml(dateStr) + '</td>' +
        '<td>' + escapeHtml(timeStr) + '</td>' +
        '<td><span class="badge ' + statusClass + '">' + escapeHtml(status) + '</span></td>' +
        '<td>' + faceStatus + '</td>' +
        '<td><span class="badge ' + locBadgeClass + '">' + escapeHtml(locStatus) + '</span></td>' +
        '<td>' + escapeHtml(distStr) + '</td>' +
        '<td><button class="attendance-action-btn" data-record-id="' + r.id + '">View</button></td>' +
        '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    container.querySelectorAll('.attendance-action-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var recordId = this.getAttribute('data-record-id');
        openAttendanceDetailModal(recordId);
      });
    });

    container.querySelectorAll('th[sortable]').forEach(function(th) {
      var field = th.getAttribute('data-field');
      th.classList.remove('sort-asc', 'sort-desc');
      if (attendanceState.sortField === field) {
        th.classList.add(attendanceState.sortDir === 'asc' ? 'sort-asc' : 'sort-desc');
      }
      th.style.cursor = 'pointer';
      th.addEventListener('click', function() {
        var field = this.getAttribute('data-field');
        if (attendanceState.sortField === field) {
          attendanceState.sortDir = attendanceState.sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          attendanceState.sortField = field;
          attendanceState.sortDir = 'desc';
        }
        renderAttendanceRecordsTable();
      });
    });
  }

  function refreshAttendanceView() {
    renderAttendanceRecordsTable();
  }

  function openAttendanceDetailModal(recordId) {
    var records = attendanceState.records || [];
    var record = null;
    for (var i = 0; i < records.length; i++) {
      if (records[i].id === recordId) { record = records[i]; break; }
    }

    if (!record) {
      console.error('Attendance record not found:', recordId);
      return;
    }

    var status = getAttendanceStatus(record);
    var locStatus = getAttendanceLocationStatus(record);
    var faceStatus = record.faceImage ? 'VERIFIED' : 'NOT AVAILABLE';

    var dateStr = record.date || '--';
    var timeStr = '--:--';
    if (record.timestamp) {
      try {
        var d = record.timestamp.toDate();
        dateStr = d.toLocaleDateString();
        timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      } catch (e) {}
    }

    var latStr = '--', lngStr = '--', accStr = '--', distStr = '--';
    if (record.location) {
      if (record.location.lat != null) latStr = record.location.lat.toFixed(5);
      if (record.location.lng != null) lngStr = record.location.lng.toFixed(5);
      if (record.location.accuracy != null) accStr = Math.round(record.location.accuracy) + ' m';
      if (record.location.distance != null) distStr = record.location.distance + ' m';
    }

    document.getElementById('detailEmployeeId').textContent = escapeHtml(record.userId || '--');
    document.getElementById('detailName').textContent = escapeHtml(record.name || '--');
    document.getElementById('detailDept').textContent = escapeHtml(record.dept || '--');
    document.getElementById('detailAppointment').textContent = escapeHtml(record.appointment || '--');
    document.getElementById('detailDate').textContent = escapeHtml(dateStr);
    document.getElementById('detailTime').textContent = escapeHtml(timeStr);
    document.getElementById('detailAction').textContent = escapeHtml(record.action || 'check-in');
    document.getElementById('detailStatus').innerHTML = '<span class="badge ' + getStatusBadgeClass(status) + '">' + escapeHtml(status) + '</span>';
    document.getElementById('detailLat').textContent = escapeHtml(latStr);
    document.getElementById('detailLng').textContent = escapeHtml(lngStr);
    document.getElementById('detailAccuracy').textContent = escapeHtml(accStr);
    document.getElementById('detailDistance').textContent = escapeHtml(distStr);
    document.getElementById('detailLocationStatus').innerHTML = '<span class="badge ' + getLocationBadgeClass(locStatus) + '">' + escapeHtml(locStatus) + '</span>';
    document.getElementById('detailFaceVerification').innerHTML = '<span class="badge ' + (faceStatus === 'VERIFIED' ? 'badge-success' : 'badge-neutral') + '">' + faceStatus + '</span>';

    var faceImageEl = document.getElementById('detailFaceImage');
    if (faceImageEl) {
      if (record.faceImage) {
        faceImageEl.innerHTML = '<img src="' + escapeHtml(record.faceImage) + '" alt="Face verification" class="detail-face-image" onerror="this.style.display=\'none\'">';
      } else {
        faceImageEl.innerHTML = '<span class="attendance-face-unavailable">Verification image unavailable</span>';
      }
    }

    var modal = document.getElementById('attendanceDetailModal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.removeAttribute('hidden');
      document.body.style.overflow = 'hidden';
    }
  }

  function getStatusBadgeClass(status) {
    if (status === 'Verified') return 'badge-success';
    if (status === 'Late') return 'badge-warning';
    if (status === 'Blocked') return 'badge-danger';
    if (status === 'Failed') return 'badge-neutral';
    if (status === 'Absent') return 'badge-danger';
    return 'badge-neutral';
  }

  function getLocationBadgeClass(locStatus) {
    if (locStatus === 'Inside') return 'badge-success';
    if (locStatus === 'Outside') return 'badge-warning';
    if (locStatus === 'Blocked') return 'badge-danger';
    return 'badge-neutral';
  }

  function closeAttendanceDetailModal() {
    var modal = document.getElementById('attendanceDetailModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('hidden', 'hidden');
      document.body.style.overflow = '';
    }
  }

  function clearAttendanceFilters() {
    attendanceState.filters = {
      search: '',
      department: '',
      status: '',
      location: ''
    };

    var searchEl = document.getElementById('attendanceSearch');
    if (searchEl) searchEl.value = '';

    var deptEl = document.getElementById('attendanceDeptFilter');
    if (deptEl) deptEl.value = '';

    var statusEl = document.getElementById('attendanceStatusFilter');
    if (statusEl) statusEl.value = '';

    var locEl = document.getElementById('attendanceLocationFilter');
    if (locEl) locEl.value = '';

    attendanceState.period = 'today';
    attendanceState.customRange = null;

    var periodEl = document.getElementById('attendancePeriod');
    if (periodEl) periodEl.value = 'today';

    var customRangeEl = document.getElementById('attendanceCustomRange');
    if (customRangeEl) {
      customRangeEl.classList.add('hidden');
      customRangeEl.style.display = 'none';
    }

    refreshAttendanceView();
  }

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

  function exportAttendanceFiltered() {
    var records = attendanceState.records || [];
    var users = attendanceState.users || [];
    var filters = getAttendanceFilters();
    var filtered = filterAttendanceRecords(records, filters);

    var data = [];
    filtered.forEach(function(r) {
      var status = getAttendanceStatus(r);
      var locStatus = getAttendanceLocationStatus(r);
      var timeStr = '';
      if (r.timestamp) {
        try { timeStr = r.timestamp.toDate().toLocaleString(); } catch(e) { timeStr = ''; }
      }

      data.push({
        'Employee ID': r.userId || '',
        'Name': r.name || '',
        'Department': r.dept || '',
        'Appointment': r.appointment || '',
        'Date': r.date || '',
        'Time': timeStr,
        'Status': status,
        'Face Verification': r.faceImage ? 'VERIFIED' : 'NOT AVAILABLE',
        'Location': locStatus,
        'Distance (m)': r.location && r.location.distance != null ? r.location.distance : '',
        'Action': r.action || 'check-in'
      });
    });

    if (data.length === 0) {
      showStatus('No records to export for current filters', 'info');
      return;
    }

    if (typeof XLSX === 'undefined') {
      showStatus('XLSX library not available', 'error');
      return;
    }

    showStatus('Generating Excel...', 'info');
    try {
      var wb = XLSX.utils.book_new();
      var brandingRows = getRestrictedExcelBrandingRows('Attendance Export');
      var wsData = brandingRows.concat(data.map(function(r) {
        return [
          r['Employee ID'] || '',
          r['Name'] || '',
          r['Department'] || '',
          r['Appointment'] || '',
          r['Date'] || '',
          r['Time'] || '',
          r['Status'] || '',
          r['Face Verification'] || '',
          r['Location'] || '',
          r['Distance (m)'] || '',
          r['Action'] || ''
        ];
      }));
      var ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, 'Attendance Export');
      configureRestrictedExcelPrintSettings(wb, ws);
      XLSX.writeFile(wb, 'Attendance_Export_' + formatDate(new Date()) + '.xlsx');
      showStatus('Excel exported (' + data.length + ' records)', 'success');
    } catch (e) {
      showStatus('Export failed: ' + getErrorMessage(e), 'error');
    }
  }

  function setupAttendanceEventListeners() {
    var searchInput = document.getElementById('attendanceSearch');
    if (searchInput) {
      var searchTimeout;
      searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(function() {
          attendanceState.filters.search = searchInput.value.trim();
          renderAttendanceRecordsTable();
        }, 300);
      });
    }

    var deptFilter = document.getElementById('attendanceDeptFilter');
    if (deptFilter) {
      deptFilter.addEventListener('change', function() {
        attendanceState.filters.department = deptFilter.value;
        renderAttendanceRecordsTable();
      });
    }

    var statusFilter = document.getElementById('attendanceStatusFilter');
    if (statusFilter) {
      statusFilter.addEventListener('change', function() {
        attendanceState.filters.status = statusFilter.value;
        renderAttendanceRecordsTable();
      });
    }

    var locFilter = document.getElementById('attendanceLocationFilter');
    if (locFilter) {
      locFilter.addEventListener('change', function() {
        attendanceState.filters.location = locFilter.value;
        renderAttendanceRecordsTable();
      });
    }

    var periodSelect = document.getElementById('attendancePeriod');
    if (periodSelect) {
      periodSelect.addEventListener('change', function() {
        attendanceState.period = periodSelect.value;
        var customRangeEl = document.getElementById('attendanceCustomRange');
        if (periodSelect.value === 'custom') {
          if (customRangeEl) {
            customRangeEl.classList.remove('hidden');
            customRangeEl.style.display = 'flex';
          }
        } else {
          if (customRangeEl) {
            customRangeEl.classList.add('hidden');
            customRangeEl.style.display = 'none';
          }
        }
        loadAttendanceSectionData();
      });
    }

    var startDate = document.getElementById('attendanceStartDate');
    var endDate = document.getElementById('attendanceEndDate');
    if (startDate) {
      startDate.addEventListener('change', function() {
        if (endDate && endDate.value && startDate.value) {
          attendanceState.customRange = { start: startDate.value, end: endDate.value };
          attendanceState.period = 'custom';
          loadAttendanceSectionData();
        }
      });
    }
    if (endDate) {
      endDate.addEventListener('change', function() {
        if (startDate && startDate.value && endDate.value) {
          attendanceState.customRange = { start: startDate.value, end: endDate.value };
          attendanceState.period = 'custom';
          loadAttendanceSectionData();
        }
      });
    }

    var clearBtn = document.getElementById('attendanceClearFilters');
    if (clearBtn) {
      clearBtn.addEventListener('click', function() {
        clearAttendanceFilters();
      });
    }

    var exportBtn = document.getElementById('attendanceExportBtn');
    if (exportBtn) {
      exportBtn.addEventListener('click', function() {
        exportAttendanceFiltered();
      });
    }

    var container = document.getElementById('attendanceRecordsContainer');
    if (container) {
      container.addEventListener('click', function(e) {
        if (e.target && e.target.id === 'attendanceRetryBtn') {
          loadAttendanceSectionData();
        }
      });
    }

    var modal = document.getElementById('attendanceDetailModal');
    if (modal) {
      modal.addEventListener('click', function(e) {
        if (e.target === modal || e.target.classList.contains('modal-backdrop')) {
          closeAttendanceDetailModal();
        }
      });
    }

    var closeBtns = document.querySelectorAll('[data-close="attendanceDetailModal"]');
    closeBtns.forEach(function(btn) {
      btn.addEventListener('click', closeAttendanceDetailModal);
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        var openModal = document.getElementById('attendanceDetailModal');
        if (openModal && !openModal.classList.contains('hidden')) {
          closeAttendanceDetailModal();
        }
        var empModal = document.getElementById('employeeProfileModal');
        if (empModal && !empModal.classList.contains('hidden')) {
          closeEmployeeProfile();
        }
      }
    });
  }

  async function loadAttendanceSectionNew() {
    attendanceState.initialized = true;

    if (!getDb()) {
      var container = document.getElementById('attendanceRecordsContainer');
      if (container) container.innerHTML = '<div class="attendance-error-state"><div class="attendance-error-icon">&#9888;</div><h4>Unable to load attendance records.</h4><p>Firebase connection not established. Please sign in and try again.</p></div>';
      return;
    }

    await loadAttendanceSectionData();
  }

  function initAttendance() {
    if (attendanceState.initialized) return;
    setupAttendanceEventListeners();
    attendanceState.initialized = true;
  }

  async function showAttendanceSection() {
    if (!attendanceState.initialized) {
      initAttendance();
    }
    await loadAttendanceSectionNew();
  }

  // ============================================
  // SECTION LOADERS
  // ============================================
  async function loadAttendanceSection() {
    if (!getDb()) return;
    await showAttendanceSection();
  }

  async function loadEmployeesSection() {
    var container = document.getElementById('employeeTable');
    if (!container || !getDb()) return;

    container.innerHTML = '<div class="spinner-overlay"><div class="spinner"></div></div>';

    try {
      var users = await loadUsers();
      state.usersData = users;

      // Set up real-time listener for users
      subscribeToUsersRealtime();

      var countEl = document.getElementById('employeeCount');
      if (countEl) {
        countEl.innerHTML = '<span class="employee-count-badge">' + users.length + ' Personnel</span>';
      }

      populateEmployeeDeptFilter(users);
      renderEmployeeTable(users);
    } catch (e) {
      console.error('Failed to load employees', e);
      if (container) container.innerHTML = '<div class="empty-state"><div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:24px;height:24px;"><circle cx="9" cy="9" r="4"/><line x1="1.5" y1="1.5" x2="22.5" y2="22.5"/></svg></div><h4>Unable to load personnel</h4><p>Check Firebase connection and try again.</p></div>';
    }
  }

  function populateEmployeeDeptFilter(users) {
    var select = document.getElementById('employeeDeptFilter');
    if (!select) return;

    var depts = {};
    users.forEach(function(u) {
      var d = u.dept || 'Unknown';
      depts[d] = (depts[d] || 0) + 1;
    });

    var html = '<option value="">All Departments</option>';
    Object.keys(depts).sort().forEach(function(d) {
      html += '<option value="' + escapeHtml(d) + '">' + escapeHtml(d) + ' (' + depts[d] + ')</option>';
    });

    select.innerHTML = html;
  }

  function renderEmployeeTable(users) {
    var container = document.getElementById('employeeTable');
    if (!container) return;

    if (!users || users.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-state-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:24px;height:24px;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><h4>No employees registered</h4><p>No personnel records found in the Firestore database.</p></div>';
      return;
    }

    var html = '<table class="table"><thead><tr><th>Employee ID</th><th>Name</th><th>Department</th><th>Face Status</th><th>Registered</th><th>Actions</th></tr></thead><tbody>';

    users.forEach(function(u) {
      var regDate = u.registeredAt && u.registeredAt.toDate ? u.registeredAt.toDate().toLocaleDateString() : '--';
      var hasFace = !!(u.faceDescriptor && Array.isArray(u.faceDescriptor) && u.faceDescriptor.length > 0);
      var faceStatus = hasFace
        ? '<span class="employee-face-status registered"><span class="status-dot"></span> Face Registered</span>'
        : '<span class="employee-face-status not-registered"><span class="status-dot"></span> Not Registered</span>';

      html += '<tr>' +
        '<td>' + escapeHtml(u.userId || u.id || '') + '</td>' +
        '<td>' + escapeHtml(u.name || '') + '</td>' +
        '<td>' + escapeHtml(u.dept || '') + '</td>' +
        '<td>' + faceStatus + '</td>' +
        '<td>' + escapeHtml(regDate) + '</td>' +
        '<td><button class="employee-action-btn" data-emp-id="' + escapeHtml(u.userId || u.id || '') + '">View</button></td>' +
        '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    container.querySelectorAll('.employee-action-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var empId = this.getAttribute('data-emp-id');
        openEmployeeProfile(empId);
      });
    });
  }

  function filterEmployees(searchTerm, deptFilter) {
    if (!state.usersData) return;
    var filtered = state.usersData.filter(function(u) {
      var term = (searchTerm || '').toLowerCase();
      var matchesSearch = !term ||
        (u.userId && u.userId.toLowerCase().indexOf(term) !== -1) ||
        (u.id && u.id.toLowerCase().indexOf(term) !== -1) ||
        (u.name && u.name.toLowerCase().indexOf(term) !== -1) ||
        (u.dept && u.dept.toLowerCase().indexOf(term) !== -1);

      var matchesDept = !deptFilter || (u.dept === deptFilter);

      return matchesSearch && matchesDept;
    });

    renderEmployeeTable(filtered);
  }

  function openEmployeeProfile(empId) {
    var users = state.usersData || [];
    var user = users.find(function(u) {
      return (u.userId || u.id || '') === empId;
    });

    if (!user) {
      console.error('Employee not found:', empId);
      return;
    }

    var profileId = document.getElementById('profileEmployeeId');
    var profileName = document.getElementById('profileName');
    var profileDept = document.getElementById('profileDept');
    var profileAppt = document.getElementById('profileAppointment');
    var profilePhone = document.getElementById('profilePhone');
    var profileReg = document.getElementById('profileRegisteredAt');
    var profileFace = document.getElementById('profileFaceStatus');
    var profileLoc = document.getElementById('profileLocation');
    var profilePhotoImg = document.getElementById('profilePhotoImg');
    var profilePhotoPlaceholder = document.getElementById('profilePhotoPlaceholder');
    var profilePhotoStatus = document.getElementById('profilePhotoStatus');

    if (profileId) profileId.textContent = escapeHtml(user.userId || user.id || '--');
    if (profileName) profileName.textContent = escapeHtml(user.name || '--');
    if (profileDept) profileDept.textContent = escapeHtml(user.dept || '--');
    if (profileAppt) profileAppt.textContent = escapeHtml(user.appointment || '--');
    if (profilePhone) profilePhone.textContent = escapeHtml(user.phone || 'Not provided');

    if (profileReg) {
      var regDate = user.registeredAt && user.registeredAt.toDate ? user.registeredAt.toDate().toLocaleString() : 'Not available';
      profileReg.textContent = escapeHtml(regDate);
    }

    if (profileFace) {
      var hasFace = !!(user.faceDescriptor && Array.isArray(user.faceDescriptor) && user.faceDescriptor.length > 0);
      if (hasFace) {
        profileFace.innerHTML = '<span class="employee-face-status registered"><span class="status-dot" style="background-color:var(--color-success);"></span> Face Registered</span>';
        profileFace.className = 'profile-value face-registered';
      } else {
        profileFace.innerHTML = '<span class="employee-face-status not-registered"><span class="status-dot"></span> Face Not Registered</span>';
        profileFace.className = 'profile-value face-not-registered';
      }
    }

    if (profileLoc) {
      var loc = user.registeredLocation;
      if (loc && (loc.lat || loc.lng)) {
        var locStr = 'Lat: ' + loc.lat.toFixed(5) + ', Lng: ' + loc.lng.toFixed(5);
        if (loc.accuracy != null) locStr += ' (Accuracy: ' + Math.round(loc.accuracy) + 'm)';
        if (loc.distance != null) locStr += ' (' + loc.distance + 'm from office)';
        profileLoc.textContent = locStr;
      } else {
        profileLoc.textContent = 'Location not available';
      }
    }

    if (profilePhotoImg && profilePhotoPlaceholder && profilePhotoStatus) {
      if (user.faceImage) {
        profilePhotoImg.src = user.faceImage;
        profilePhotoImg.style.display = 'block';
        profilePhotoPlaceholder.style.display = 'none';
        profilePhotoStatus.innerHTML = '<span class="status-dot" style="background-color:var(--color-success);box-shadow:0 0 4px rgba(46,139,87,0.5);width:6px;height:6px;border-radius:50%;flex-shrink:0;"></span> FACE REGISTERED';
        profilePhotoStatus.style.color = 'var(--color-success)';
      } else {
        profilePhotoImg.style.display = 'none';
        profilePhotoPlaceholder.style.display = 'flex';
        var placeholderSpan = profilePhotoPlaceholder.querySelector('span');
        if (placeholderSpan) placeholderSpan.textContent = 'NO REGISTERED PHOTO';
        profilePhotoStatus.innerHTML = '<span class="status-dot" style="background-color:var(--text-muted);width:6px;height:6px;border-radius:50%;flex-shrink:0;"></span> NO PHOTO';
        profilePhotoStatus.style.color = 'var(--text-muted)';
      }
    }

    var modal = document.getElementById('employeeProfileModal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.removeAttribute('hidden');
      document.body.style.overflow = 'hidden';
    }
  }

  function closeEmployeeProfile() {
    var modal = document.getElementById('employeeProfileModal');
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('hidden', 'hidden');
      document.body.style.overflow = '';
    }
  }

  function setupEmployeeEventListeners() {
    var searchInput = document.getElementById('employeeSearch');
    var deptFilter = document.getElementById('employeeDeptFilter');

    if (searchInput) {
      var searchTimeout;
      searchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(function() {
          filterEmployees(searchInput.value.trim(), deptFilter ? deptFilter.value : '');
        }, 300);
      });
    }

    if (deptFilter) {
      deptFilter.addEventListener('change', function() {
        filterEmployees(searchInput ? searchInput.value.trim() : '', deptFilter.value);
      });
    }

    var modal = document.getElementById('employeeProfileModal');
    if (modal) {
      modal.addEventListener('click', function(e) {
        if (e.target === modal || e.target.classList.contains('modal-backdrop')) {
          closeEmployeeProfile();
        }
      });
    }

    var closeBtns = document.querySelectorAll('[data-close="employeeProfileModal"]');
    closeBtns.forEach(function(btn) {
      btn.addEventListener('click', closeEmployeeProfile);
    });
  }

  function setupReportButtons() {
    var exportExcelNav = document.getElementById('exportExcelBtnNav');
    var exportPdfNav = document.getElementById('exportPdfBtnNav');
    var exportAbsentNav = document.getElementById('exportAbsentBtnNav');

    if (exportExcelNav) {
      exportExcelNav.addEventListener('click', function() {
        if (typeof window.exportExcel === 'function') window.exportExcel();
      });
    }

    if (exportPdfNav) {
      exportPdfNav.addEventListener('click', function() {
        if (typeof window.exportPdf === 'function') window.exportPdf();
      });
    }

    if (exportAbsentNav) {
      exportAbsentNav.addEventListener('click', function() {
        if (typeof window.exportAbsentExcel === 'function') window.exportAbsentExcel();
      });
    }
  }

  function setupSignOutButtons() {
    var signOutBtns = [
      document.getElementById('adminSignOutBtnNav'),
      document.getElementById('adminSignOutBtnHeader')
    ];

    signOutBtns.forEach(function(btn) {
      if (btn) {
        btn.addEventListener('click', function() {
          if (typeof window.adminSignOut === 'function') {
            window.adminSignOut();
          } else if (typeof adminSignOut === 'function') {
            adminSignOut();
          }
        });
      }
    });
  }

  // ============================================
  // INITIALIZATION
  // ============================================
  function waitForFirebase() {
    return new Promise(function(resolve) {
      if (window.db && window.auth) {
        resolve(true);
        return;
      }
      var attempts = 0;
      var maxAttempts = 100;
      var interval = setInterval(function() {
        attempts++;
        if (window.db && window.auth) {
          clearInterval(interval);
          resolve(true);
        } else if (attempts >= maxAttempts) {
          clearInterval(interval);
          resolve(false);
        }
      }, 100);
    });
  }

   async function init() {
     if (state.initialized) return;
     state.initialized = true;

     injectDashboardStyles();

     var dashboard = createDashboardHTML();
     state.dashboardEl = dashboard;

     var dashboardSection = document.getElementById('section-dashboard');
     if (dashboardSection) {
       if (!document.getElementById('adminDashboard')) {
         dashboardSection.appendChild(dashboard);
       } else {
         state.dashboardEl = document.getElementById('adminDashboard');
        }
      }

      setupNavigation();
      setupEventListeners();
      setupEmployeeEventListeners();
      initAttendance();
      initReports();
      setupReportButtons();
     setupSignOutButtons();
     updateHeaderDate();

    var firebaseReady = await waitForFirebase();
    if (firebaseReady) {
      updateFirebaseStatus(true);
      setupAuthListener();
    } else {
      updateFirebaseStatus(false);
      console.error('Dashboard: Firebase not ready');
    }

    var auth = getAuth();
    if (auth && auth.currentUser) {
      state.currentUser = auth.currentUser;
       state.currentDate = formatDate(new Date());
       showSection('dashboard');
      
      if (firebaseReady) {
        loadDashboardData();
      } else {
        var kpiContainer = document.getElementById('dashKpiCards');
        if (kpiContainer) {
          kpiContainer.innerHTML = '<div style="color:var(--text-muted);text-align:center;padding:20px;">Firebase connection unavailable. Please refresh the page.</div>';
        }
      }
    }
  }

  // ============================================
  // ANALYTICS MODULE
  // ============================================
  var analyticsState = {
    period: '30days',
    customRange: null,
    department: '',
    users: [],
    attendance: [],
    isLoading: false,
    initialized: false
  };

  function getAnalyticsDateRange(period, customRange) {
    var now = new Date();
    var end = new Date(now);
    var start = new Date(now);

    if (period === 'custom' && customRange && customRange.start && customRange.end) {
      var s = new Date(customRange.start);
      var e = new Date(customRange.end);
      s.setHours(0, 0, 0, 0);
      e.setHours(23, 59, 59, 999);
      return { start: s, end: e };
    }

    switch (period) {
      case '7days':
        start.setDate(now.getDate() - 6);
        start.setHours(0, 0, 0, 0);
        break;
      case '30days':
        start.setDate(now.getDate() - 29);
        start.setHours(0, 0, 0, 0);
        break;
      case '90days':
        start.setDate(now.getDate() - 89);
        start.setHours(0, 0, 0, 0);
        break;
      case 'today':
      default:
        start.setHours(0, 0, 0, 0);
        break;
    }

    return { start: start, end: end };
  }

  function getPreviousDateRange(period, customRange) {
    var current = getAnalyticsDateRange(period, customRange);
    var start = new Date(current.start);
    var end = new Date(current.end);
    var duration = end.getTime() - start.getTime();
    start = new Date(start.getTime() - duration);
    end = new Date(end.getTime() - duration);
    return { start: start, end: end };
  }

  async function loadAnalyticsData() {
    if (analyticsState.isLoading) return;
    analyticsState.isLoading = true;

    var db = getDb();
    if (!db) {
      analyticsState.isLoading = false;
      showEmpty('analyticsKpiCards', 'Connecting to Firebase...');
      return;
    }

    showLoading('analyticsKpiCards', 'Loading analytics...');
    showEmpty('analyticsPerformanceChart', '');
    showEmpty('analyticsDeptChart', '');
    showEmpty('analyticsDailyChart', '');
    showEmpty('analyticsVerificationChart', '');
    showEmpty('analyticsLocationChart', '');
    showEmpty('analyticsPeakChart', '');
    showEmpty('analyticsTrendComparison', '');
    showEmpty('analyticsEmployeeTable', '');

    try {
      analyticsState.users = await loadUsers();
      subscribeToUsersRealtime();
      
      var range = getAnalyticsDateRange(analyticsState.period, analyticsState.customRange);
      var startDateStr = formatDate(range.start);
      var endDateStr = formatDate(range.end);

      // Subscribe to real-time attendance updates for current analytics range
      subscribeToAnalyticsAttendance(range.start, range.end);

      // Initial one-time load for immediate rendering
      var snapshot = await db.collection('attendance')
        .where('date', '>=', startDateStr)
        .where('date', '<=', endDateStr)
        .get();

      analyticsState.attendance = snapshot.docs.map(function(doc) { return { id: doc.id, ...doc.data() }; });
      analyticsState.attendance.sort(function(a, b) {
        return (b.timestamp && b.timestamp.toMillis ? b.timestamp.toMillis() : 0) - (a.timestamp && a.timestamp.toMillis ? a.timestamp.toMillis() : 0);
      });

      populateAnalyticsDeptFilter(analyticsState.users);
      renderAnalytics();
    } catch (e) {
      console.error('Analytics: Failed to load data', e);
      showError('analyticsKpiCards', 'Unable to load analytics data.');
    } finally {
      analyticsState.isLoading = false;
    }
  }

  function renderAnalytics() {
    var records = analyticsState.attendance || [];
    var users = analyticsState.users || [];
    var period = analyticsState.period;
    var range = getAnalyticsDateRange(period, analyticsState.customRange);

    var filteredRecords = filterAnalyticsRecords(records, {
      department: analyticsState.department
    });

    // Department-aware personnel denominator
    var scopedUsers = analyticsState.department
      ? users.filter(function(user) {
          return user.dept === analyticsState.department;
        })
      : users;
    var totalStaff = scopedUsers.length;

    // Status-based counts using the single source of truth
    var verifiedUserIds = new Set();
    var lateCount = 0;
    var blockedCount = 0;
    var failedCount = 0;

    filteredRecords.forEach(function(r) {
      var status = getAttendanceStatus(r);
      if (status === 'Verified' && r.userId) {
        verifiedUserIds.add(r.userId);
      } else if (status === 'Late') {
        lateCount++;
      } else if (status === 'Blocked') {
        blockedCount++;
      } else if (status === 'Failed') {
        failedCount++;
      }
    });

    var verifiedCount = verifiedUserIds.size;
    var presentCount = verifiedUserIds.size; // present = unique verified personnel
    var absentCount = Math.max(0, totalStaff - verifiedCount);

    // Punctuality is based on Verified personnel (denominator = verifiedCount)
    var punctualityRate = verifiedCount > 0 ? 100 : 0;

    // Location compliance via existing helper (500m rule lives in getAttendanceLocationStatus)
    var inside = 0, outside = 0, blocked = 0;
    filteredRecords.forEach(function(r) {
      var locStatus = getAttendanceLocationStatus(r);
      if (locStatus === 'Inside') inside++;
      else if (locStatus === 'Outside') outside++;
      else if (locStatus === 'Blocked') blocked++;
    });
    var totalLocations = filteredRecords.length || 1;
    var locationCompliance = Math.round((inside / totalLocations) * 100);

    var attendanceRate = totalStaff > 0
      ? Math.round((verifiedCount / totalStaff) * 100)
      : 0;

    renderAnalyticsKPIs({
      attendanceRate: attendanceRate,
      punctualityRate: punctualityRate,
      locationCompliance: locationCompliance,
      present: presentCount,
      absent: absentCount,
      late: lateCount,
      blocked: blockedCount,
      failed: failedCount,
      verified: verifiedCount,
      totalStaff: totalStaff,
      verifications: filteredRecords.length,
      inside: inside,
      outside: outside,
      blockedLoc: blocked
    });

    var hasRecords = filteredRecords.length > 0;

    if (!hasRecords) {
      var kpiContainer = document.getElementById('analyticsKpiCards');
      if (kpiContainer) {
        kpiContainer.innerHTML = '<div class="analytics-empty">No attendance data<br/><span style="font-size:var(--font-size-xs);color:var(--text-muted);">No attendance records were found for the selected period.</span></div>';
      }
      var emptyCharts = ['analyticsPerformanceChart', 'analyticsDeptChart', 'analyticsDailyChart', 'analyticsVerificationChart', 'analyticsLocationChart', 'analyticsPeakChart', 'analyticsTrendComparison', 'analyticsEmployeeTable'];
      emptyCharts.forEach(function(id) {
        var c = document.getElementById(id);
        if (c) c.innerHTML = '<div class="analytics-empty">No attendance data available for the selected period.</div>';
      });
      return;
    }

    renderAttendancePerformanceChart('analyticsPerformanceChart', filteredRecords, users, range.start, range.end);
    renderAnalyticsDepartmentChart('analyticsDeptChart', filteredRecords, users);
    renderDailyAttendanceChart('analyticsDailyChart', filteredRecords, users);
    renderVerificationAnalyticsChart('analyticsVerificationChart', filteredRecords);
    renderLocationIntelligenceChart('analyticsLocationChart', filteredRecords);
    renderPeakAttendanceChart('analyticsPeakChart', filteredRecords);
    renderAnalyticsTrendComparison('analyticsTrendComparison', period, range);
    renderAnalyticsEmployeeInsights('analyticsEmployeeTable', filteredRecords, users);

    // Update last updated timestamp
    var lastUpdatedEl = document.getElementById('analyticsLastUpdated');
    if (lastUpdatedEl) {
      lastUpdatedEl.textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
  }

  function filterAnalyticsRecords(records, filters) {
    if (!records) return [];
    return records.filter(function(r) {
      if (filters.department && r.dept !== filters.department) return false;
      return true;
    });
  }

  function getAnalyticsFilters() {
    return {
      department: document.getElementById('analyticsDeptFilter') ? document.getElementById('analyticsDeptFilter').value : ''
    };
  }

  function populateAnalyticsDeptFilter(users) {
    var select = document.getElementById('analyticsDeptFilter');
    var empSelect = document.getElementById('analyticsEmployeeDeptFilter');
    if (!select && !empSelect) return;

    var depts = new Set();
    users.forEach(function(u) {
      if (u.dept) depts.add(u.dept);
    });

    var sorted = Array.from(depts).sort();
    var options = '<option value="">All Departments</option>';
    sorted.forEach(function(dept) {
      options += '<option value="' + escapeHtml(dept) + '">' + escapeHtml(dept) + '</option>';
    });

    if (select) select.innerHTML = options;
    if (empSelect) empSelect.innerHTML = options;
  }

  function renderAnalyticsKPIs(metrics) {
    var container = document.getElementById('analyticsKpiCards');
    if (!container) return;

    var deptLabel = analyticsState.department
      ? ' (' + analyticsState.department + ')'
      : '';
    var periodLabel = analyticsState.period === 'custom'
      ? 'custom range'
      : analyticsState.period;

    var cards = [
      {
        title: 'Attendance Rate',
        value: metrics.attendanceRate + '%',
        desc: metrics.verified + ' of ' + metrics.totalStaff + ' personnel verified' + deptLabel,
        trend: null,
        trendLabel: ''
      },
      {
        title: 'Punctuality Rate',
        value: metrics.punctualityRate + '%',
        desc: 'All verified attendance is on time' + deptLabel,
        trend: null,
        trendLabel: ''
      },
      {
        title: 'Location Compliance',
        value: metrics.locationCompliance + '%',
        desc: 'Within approved perimeter for ' + periodLabel,
        trend: null,
        trendLabel: ''
      },
      {
        title: 'Verified',
        value: metrics.verified,
        desc: 'Unique personnel verified' + deptLabel,
        trend: null,
        trendLabel: ''
      },
      {
        title: 'Late',
        value: metrics.late,
        desc: 'Late attendance records' + deptLabel,
        trend: null,
        trendLabel: ''
      },
      {
        title: 'Blocked',
        value: metrics.blocked,
        desc: 'Location-blocked records' + deptLabel,
        trend: null,
        trendLabel: ''
      }
    ];

    var html = '';
    cards.forEach(function(card) {
      html += '<div class="analytics-kpi-card">' +
        '<div class="analytics-kpi-header">' +
          '<div class="analytics-kpi-title">' + escapeHtml(card.title) + '</div>' +
          (card.trend ? '<span class="analytics-kpi-trend ' + card.trend + '">' + escapeHtml(card.trendLabel) + '</span>' : '') +
        '</div>' +
        '<div class="analytics-kpi-value">' + escapeHtml(card.value) + '</div>' +
        '<div class="analytics-kpi-desc">' + escapeHtml(card.desc) + '</div>' +
      '</div>';
    });

    container.innerHTML = html;
  }

  function renderAttendancePerformanceChart(containerId, records, users, startDate, endDate) {
    var container = document.getElementById(containerId);
    if (!container) return;

    if (!records || records.length === 0) {
      container.innerHTML = '<div class="analytics-empty">No attendance data available for the selected period.</div>';
      return;
    }

    var dates = [];
    var current = new Date(startDate);
    var end = new Date(endDate);
    while (current <= end) {
      dates.push(formatDate(current));
      current.setDate(current.getDate() + 1);
    }

    var recordsByDate = {};
    records.forEach(function(r) {
      if (!recordsByDate[r.date]) recordsByDate[r.date] = [];
      recordsByDate[r.date].push(r);
    });

    var totalStaff = analyticsState.department
      ? users.filter(function(u) { return u.dept === analyticsState.department; }).length
      : users.length;
    var data = dates.map(function(dateStr) {
      var dayRecords = recordsByDate[dateStr] || [];
      var present = new Set(dayRecords.map(function(r) { return r.userId; })).size;
      var late = dayRecords.filter(function(r) {
        if (!r.timestamp) return false;
        try {
          var d = r.timestamp.toDate();
          return (d.getHours() * 60 + d.getMinutes()) > (9 * 60);
        } catch (e) { return false; }
      }).length;
      var absent = Math.max(0, totalStaff - present);
      return { date: dateStr, present: present, absent: absent, late: late };
    });

    var width = Math.max(dates.length * 40, 600);
    var height = 260;
    var padding = { top: 20, right: 20, bottom: 40, left: 35 };
    var chartWidth = width - padding.left - padding.right;
    var chartHeight = height - padding.top - padding.bottom;

    var allValues = [];
    data.forEach(function(d) { allValues.push(d.present, d.absent, d.late); });
    var maxVal = Math.max.apply(null, allValues);
    var yMax = maxVal > 0 ? maxVal + 1 : 5;

    var svg = '<svg width="100%" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="xMidYMid meet">';

    for (var i = 0; i <= 4; i++) {
      var y = padding.top + (chartHeight / 4) * i;
      var val = Math.round(yMax - (yMax / 4) * i);
      svg += '<line x1="' + padding.left + '" y1="' + y + '" x2="' + (width - padding.right) + '" y2="' + y + '" stroke="rgba(245,245,220,0.08)" stroke-width="1"/>';
      svg += '<text x="' + (padding.left - 5) + '" y="' + (y + 4) + '" text-anchor="end" fill="rgba(245,245,220,0.5)" font-size="9">' + val + '</text>';
    }

    var stepX = data.length > 1 ? chartWidth / (data.length - 1) : chartWidth;
    data.forEach(function(d, i) {
      var x = padding.left + stepX * i;
      svg += '<text x="' + x + '" y="' + (height - 10) + '" text-anchor="middle" fill="rgba(245,245,220,0.5)" font-size="8">' + escapeHtml(d.date.substring(5)) + '</text>';
    });

    var series = [
      { key: 'present', color: '#C8A646' },
      { key: 'absent', color: '#4B5320' },
      { key: 'late', color: '#D4A017' }
    ];

    series.forEach(function(s) {
      var points = data.map(function(d, i) {
        var x = padding.left + stepX * i;
        var y = padding.top + chartHeight - (d[s.key] / yMax) * chartHeight;
        return { x: x, y: y };
      });

      var pathD = points.map(function(p, i) {
        return (i === 0 ? 'M' : 'L') + p.x + ',' + p.y;
      }).join(' ');

      var areaD = pathD + ' L' + (padding.left + stepX * (points.length - 1)) + ',' + (padding.top + chartHeight) + ' L' + padding.left + ',' + (padding.top + chartHeight) + ' Z';

      svg += '<path d="' + areaD + '" fill="' + s.color + '" opacity="0.08"/>';
      svg += '<path d="' + pathD + '" fill="none" stroke="' + s.color + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';

      points.forEach(function(p) {
        svg += '<circle cx="' + p.x + '" cy="' + p.y + '" r="3" fill="' + s.color + '" stroke="var(--bg-surface)" stroke-width="1.5"/>';
      });
    });

    svg += '</svg>';

    var legend = '<div style="display:flex;gap:var(--space-4);justify-content:center;margin-top:var(--space-2);flex-wrap:wrap;">';
    series.forEach(function(s) {
      legend += '<div style="display:flex;align-items:center;gap:var(--space-1);"><span style="width:10px;height:10px;border-radius:2px;background:' + s.color + ';display:inline-block;"></span><span style="font-size:10px;fill:var(--text-secondary);">' + s.key.charAt(0).toUpperCase() + s.key.slice(1) + '</span></div>';
    });
    legend += '</div>';

    container.innerHTML = svg + legend;
  }

  function renderAnalyticsDepartmentChart(containerId, records, users) {
    var container = document.getElementById(containerId);
    if (!container) return;

    if (!records || records.length === 0 || !users || !users.length) {
      container.innerHTML = '<div class="analytics-empty">No department data available.</div>';
      return;
    }

    var deptData = getAnalyticsDepartmentData(records, users);

    var maxRate = 100;
    var width = 400;
    var barHeight = 24;
    var gap = 10;
    var labelWidth = 100;
    var valueWidth = 80;
    var chartWidth = width - labelWidth - valueWidth;
    var height = Math.max(deptData.length * (barHeight + gap) + 20, 100);

    var svg = '<svg width="100%" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="xMidYMid meet">';

    deptData.forEach(function(d, i) {
      var y = 10 + i * (barHeight + gap);
      var barW = (d.rate / maxRate) * chartWidth;

      svg += '<text x="2" y="' + (y + barHeight / 2 + 4) + '" fill="var(--text-secondary)" font-size="10">' + escapeHtml(d.dept) + '</text>';
      svg += '<rect x="' + labelWidth + '" y="' + y + '" width="' + barW + '" height="' + barHeight + '" rx="4" fill="#C8A646" opacity="0.85"/>';
      svg += '<text x="' + (labelWidth + barW + 5) + '" y="' + (y + barHeight / 2 + 4) + '" fill="var(--text-primary)" font-size="10">' + d.rate + '% (' + d.present + '/' + d.total + ')</text>';
    });

    svg += '</svg>';
    container.innerHTML = svg;
  }

  function renderDailyAttendanceChart(containerId, records, users) {
    var container = document.getElementById(containerId);
    if (!container) return;

    if (!records || records.length === 0) {
      container.innerHTML = '<div class="analytics-empty">No attendance data available for the selected period.</div>';
      return;
    }

    var dayStats = {};
    records.forEach(function(r) {
      if (!r.timestamp) return;
      try {
        var d = r.timestamp.toDate();
        var dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
        if (!dayStats[dayName]) dayStats[dayName] = { present: new Set(), late: 0 };
        if (r.userId && getAttendanceStatus(r) === 'Verified') dayStats[dayName].present.add(r.userId);
        if (getAttendanceStatus(r) === 'Late') dayStats[dayName].late++;
      } catch (e) { /* ignore */ }
    });

    var days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var data = days.map(function(day) {
      var stats = dayStats[day] || { present: new Set(), late: 0 };
      var present = stats.present.size;
      var late = stats.late;
      var totalStaff = analyticsState.department
        ? (users.filter(function(u) { return u.dept === analyticsState.department; }).length)
        : (users ? users.length : 0);
      var absent = Math.max(0, totalStaff - present);
      return { day: day, present: present, absent: absent, late: late };
    });

    var width = 500;
    var height = 220;
    var padding = { top: 20, right: 20, bottom: 35, left: 35 };
    var chartWidth = width - padding.left - padding.right;
    var chartHeight = height - padding.top - padding.bottom;

    var allValues = [];
    data.forEach(function(d) { allValues.push(d.present, d.absent, d.late); });
    var maxVal = Math.max.apply(null, allValues);
    var yMax = maxVal > 0 ? maxVal + 1 : 5;

    var svg = '<svg width="100%" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="xMidYMid meet">';

    for (var i = 0; i <= 4; i++) {
      var y = padding.top + (chartHeight / 4) * i;
      var val = Math.round(yMax - (yMax / 4) * i);
      svg += '<line x1="' + padding.left + '" y1="' + y + '" x2="' + (width - padding.right) + '" y2="' + y + '" stroke="rgba(245,245,220,0.08)" stroke-width="1"/>';
      svg += '<text x="' + (padding.left - 5) + '" y="' + (y + 4) + '" text-anchor="end" fill="rgba(245,245,220,0.5)" font-size="9">' + val + '</text>';
    }

    var groupWidth = chartWidth / data.length;
    var barWidth = groupWidth * 0.25;

    data.forEach(function(d, i) {
      var x = padding.left + groupWidth * i + groupWidth / 2;
      var presentY = padding.top + chartHeight - (d.present / yMax) * chartHeight;
      var absentY = padding.top + chartHeight - (d.absent / yMax) * chartHeight;
      var lateY = padding.top + chartHeight - (d.late / yMax) * chartHeight;

      svg += '<rect x="' + (x - barWidth * 1.5) + '" y="' + presentY + '" width="' + barWidth + '" height="' + (padding.top + chartHeight - presentY) + '" fill="#C8A646" opacity="0.85"/>';
      svg += '<rect x="' + (x - barWidth / 2) + '" y="' + absentY + '" width="' + barWidth + '" height="' + (padding.top + chartHeight - absentY) + '" fill="#4B5320" opacity="0.85"/>';
      svg += '<rect x="' + (x + barWidth / 2) + '" y="' + lateY + '" width="' + barWidth + '" height="' + (padding.top + chartHeight - lateY) + '" fill="#D4A017" opacity="0.85"/>';

      svg += '<text x="' + x + '" y="' + (height - 10) + '" text-anchor="middle" fill="rgba(245,245,220,0.5)" font-size="9">' + d.day + '</text>';
    });

    svg += '</svg>';

    var legend = '<div style="display:flex;gap:var(--space-4);justify-content:center;margin-top:var(--space-2);flex-wrap:wrap;">';
    legend += '<div style="display:flex;align-items:center;gap:var(--space-1);"><span style="width:10px;height:10px;border-radius:2px;background:#C8A646;display:inline-block;"></span><span style="font-size:10px;fill:var(--text-secondary);">Present</span></div>';
    legend += '<div style="display:flex;align-items:center;gap:var(--space-1);"><span style="width:10px;height:10px;border-radius:2px;background:#4B5320;display:inline-block;"></span><span style="font-size:10px;fill:var(--text-secondary);">Absent</span></div>';
    legend += '<div style="display:flex;align-items:center;gap:var(--space-1);"><span style="width:10px;height:10px;border-radius:2px;background:#D4A017;display:inline-block;"></span><span style="font-size:10px;fill:var(--text-secondary);">Late</span></div>';
    legend += '</div>';

    container.innerHTML = svg + legend;
  }

  function renderVerificationAnalyticsChart(containerId, records) {
    var container = document.getElementById(containerId);
    if (!container) return;

    if (!records || records.length === 0) {
      container.innerHTML = '<div class="analytics-empty">No attendance data available for the selected period.</div>';
      return;
    }

    var successful = records.length;
    var uniqueUsers = new Set(records.map(function(r) { return r.userId; })).size;

    var html = '<div style="display:grid;grid-template-columns:1fr;gap:var(--space-4);">';
    html += '<div style="display:flex;align-items:center;gap:var(--space-4);flex-wrap:wrap;">';
    html += '<div style="flex:1;min-width:200px;">';
    html += '<div style="font-size:var(--font-size-3xl);font-weight:700;color:var(--text-primary);">' + successful + '</div>';
    html += '<div style="font-size:var(--font-size-xs);color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Successful Verifications</div>';
    html += '</div>';
    html += '<div style="flex:1;min-width:200px;">';
    html += '<div style="font-size:var(--font-size-3xl);font-weight:700;color:var(--text-primary);">' + uniqueUsers + '</div>';
    html += '<div style="font-size:var(--font-size-xs);color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;">Unique Users Verified</div>';
    html += '</div>';
    html += '</div>';
    html += '<div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:var(--space-3);">Note: Failed verification attempts are not currently stored in the Firestore schema. Only successful attendance records are available for analysis.</div>';
    html += '</div>';

    container.innerHTML = html;
  }

  function renderLocationIntelligenceChart(containerId, records) {
    var container = document.getElementById(containerId);
    if (!container) return;

    if (!records || records.length === 0) {
      container.innerHTML = '<div class="analytics-empty">No attendance data available for the selected period.</div>';
      return;
    }

    var inside = 0, outside = 0, blocked = 0;
    records.forEach(function(r) {
      var dist = r.location && r.location.distance != null ? r.location.distance : null;
      if (dist === null) blocked++;
      else if (dist <= 500) inside++;
      else outside++;
    });
    var total = records.length || 1;

    var html = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-3);">';
    html += '<div style="text-align:center;padding:var(--space-4);background:var(--bg-glass);border-radius:var(--border-radius-md);border:1px solid var(--border-color);">';
    html += '<div style="font-size:var(--font-size-3xl);font-weight:700;color:#2E8B57;">' + inside + '</div>';
    html += '<div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:var(--space-1);">Inside (' + Math.round((inside / total) * 100) + '%)</div>';
    html += '</div>';
    html += '<div style="text-align:center;padding:var(--space-4);background:var(--bg-glass);border-radius:var(--border-radius-md);border:1px solid var(--border-color);">';
    html += '<div style="font-size:var(--font-size-3xl);font-weight:700;color:#D4A017;">' + outside + '</div>';
    html += '<div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:var(--space-1);">Outside (' + Math.round((outside / total) * 100) + '%)</div>';
    html += '</div>';
    html += '<div style="text-align:center;padding:var(--space-4);background:var(--bg-glass);border-radius:var(--border-radius-md);border:1px solid var(--border-color);">';
    html += '<div style="font-size:var(--font-size-3xl);font-weight:700;color:#8B1E1E;">' + blocked + '</div>';
    html += '<div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:var(--space-1);">Blocked (' + Math.round((blocked / total) * 100) + '%)</div>';
    html += '</div>';
    html += '</div>';

    container.innerHTML = html;
  }

  function renderPeakAttendanceChart(containerId, records) {
    var container = document.getElementById(containerId);
    if (!container) return;

    if (!records || records.length === 0) {
      container.innerHTML = '<div class="analytics-empty">No attendance data available for the selected period.</div>';
      return;
    }

    var hourCounts = {};
    records.forEach(function(r) {
      if (!r.timestamp) return;
      try {
        var d = r.timestamp.toDate();
        var hour = d.getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
      } catch (e) { /* ignore */ }
    });

    var hours = [];
    for (var h = 6; h <= 20; h++) {
      hours.push({ hour: h, count: hourCounts[h] || 0, label: (h < 10 ? '0' + h : h) + ':00' });
    }

    var maxCount = Math.max.apply(null, hours.map(function(h) { return h.count; }));
    var width = 500;
    var height = 220;
    var padding = { top: 20, right: 20, bottom: 35, left: 35 };
    var chartWidth = width - padding.left - padding.right;
    var chartHeight = height - padding.top - padding.bottom;
    var barWidth = chartWidth / hours.length * 0.7;

    var svg = '<svg width="100%" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="xMidYMid meet">';

    for (var i = 0; i <= 4; i++) {
      var y = padding.top + (chartHeight / 4) * i;
      var val = Math.round(maxCount - (maxCount / 4) * i);
      svg += '<line x1="' + padding.left + '" y1="' + y + '" x2="' + (width - padding.right) + '" y2="' + y + '" stroke="rgba(245,245,220,0.08)" stroke-width="1"/>';
      svg += '<text x="' + (padding.left - 5) + '" y="' + (y + 4) + '" text-anchor="end" fill="rgba(245,245,220,0.5)" font-size="9">' + val + '</text>';
    }

    hours.forEach(function(h, i) {
      var x = padding.left + (chartWidth / hours.length) * i + (chartWidth / hours.length - barWidth) / 2;
      var barH = maxCount > 0 ? (h.count / maxCount) * chartHeight : 0;
      var y = padding.top + chartHeight - barH;

      svg += '<rect x="' + x + '" y="' + y + '" width="' + barWidth + '" height="' + barH + '" rx="3" fill="#C8A646" opacity="0.85"/>';
      svg += '<text x="' + (x + barWidth / 2) + '" y="' + (height - 10) + '" text-anchor="middle" fill="rgba(245,245,220,0.5)" font-size="8">' + h.label + '</text>';
    });

    svg += '</svg>';
    container.innerHTML = svg;
  }

  function renderAnalyticsTrendComparison(containerId, period, currentRange) {
    var container = document.getElementById(containerId);
    if (!container) return;

    var previousRange = getPreviousDateRange(period, analyticsState.customRange);
    var previousStart = formatDate(previousRange.start);
    var previousEnd = formatDate(previousRange.end);

    var db = getDb();
    if (!db) {
      container.innerHTML = '<div class="analytics-empty">Connecting to Firebase...</div>';
      return;
    }

    db.collection('attendance')
      .where('date', '>=', previousStart)
      .where('date', '<=', previousEnd)
      .get()
      .then(function(snapshot) {
        var previousRecords = snapshot.docs.map(function(doc) { return { id: doc.id, ...doc.data() }; });
        var currentRecords = analyticsState.attendance || [];

        // Department-scoped denominator
        var scopedUsers = analyticsState.department
          ? analyticsState.users.filter(function(u) { return u.dept === analyticsState.department; })
          : analyticsState.users;
        var totalStaff = scopedUsers.length;

        var currentUsers = 0;
        var currentSeen = {};
        currentRecords.forEach(function(r) {
          if (r.userId && getAttendanceStatus(r) === 'Verified' && !currentSeen[r.userId]) {
            currentSeen[r.userId] = true;
            currentUsers++;
          }
        });

        var previousUsers = 0;
        var previousSeen = {};
        previousRecords.forEach(function(r) {
          if (r.userId && getAttendanceStatus(r) === 'Verified' && !previousSeen[r.userId]) {
            previousSeen[r.userId] = true;
            previousUsers++;
          }
        });

        var currentRate = totalStaff > 0 ? Math.round((currentUsers / totalStaff) * 100) : 0;
        var previousRate = totalStaff > 0 ? Math.round((previousUsers / totalStaff) * 100) : 0;

        var diff = currentRate - previousRate;
        var trend = diff > 0 ? 'up' : (diff < 0 ? 'down' : 'neutral');
        var trendIcon = diff > 0 ? '↑' : (diff < 0 ? '↓' : '→');
        var trendText = trendIcon + ' ' + Math.abs(diff) + '% from previous period';

        var html = '<div style="display:flex;align-items:center;gap:var(--space-6);flex-wrap:wrap;">';
        html += '<div style="flex:1;min-width:200px;">';
        html += '<div style="font-size:var(--font-size-sm);color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:var(--space-2);">Current Period</div>';
        html += '<div style="font-size:var(--font-size-3xl);font-weight:700;color:var(--text-primary);">' + currentRate + '%</div>';
        html += '<div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:var(--space-1);">' + currentUsers + ' verified of ' + totalStaff + ' staff</div>';
        html += '</div>';
        html += '<div style="flex:1;min-width:200px;">';
        html += '<div style="font-size:var(--font-size-sm);color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:var(--space-2);">Previous Period</div>';
        html += '<div style="font-size:var(--font-size-3xl);font-weight:700;color:var(--text-secondary);">' + previousRate + '%</div>';
        html += '<div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:var(--space-1);">' + previousUsers + ' verified of ' + totalStaff + ' staff</div>';
        html += '</div>';
        html += '<div style="flex:1;min-width:200px;">';
        html += '<div style="font-size:var(--font-size-sm);color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:var(--space-2);">Trend</div>';
        html += '<div style="font-size:var(--font-size-3xl);font-weight:700;" class="analytics-kpi-trend ' + trend + '">' + trendText + '</div>';
        html += '<div style="font-size:var(--font-size-xs);color:var(--text-muted);margin-top:var(--space-1);">Compared to previous ' + period + '</div>';
        html += '</div>';
        html += '</div>';

        container.innerHTML = html;
      })
      .catch(function(e) {
        console.error('Analytics: Failed to load trend comparison', e);
        container.innerHTML = '<div class="analytics-empty">Unable to load trend comparison data.</div>';
      });
  }

  function getAnalyticsDepartmentData(records, users) {
    var deptStats = {};
    users.forEach(function(u) {
      var dept = u.dept || 'Unknown';
      if (!deptStats[dept]) deptStats[dept] = { total: 0, present: new Set(), late: 0 };
      deptStats[dept].total++;
    });

    records.forEach(function(r) {
      var dept = r.dept || 'Unknown';
      if (!deptStats[dept]) deptStats[dept] = { total: 0, present: new Set(), late: 0 };
      if (r.userId && getAttendanceStatus(r) === 'Verified') deptStats[dept].present.add(r.userId);
      if (getAttendanceStatus(r) === 'Late') deptStats[dept].late++;
    });

    return Object.keys(deptStats).map(function(dept) {
      var stats = deptStats[dept];
      var present = stats.present.size;
      var absent = Math.max(0, stats.total - present);
      var rate = stats.total > 0 ? Math.round((present / stats.total) * 100) : 0;
      return { dept: dept, total: stats.total, present: present, absent: absent, late: stats.late, rate: rate };
    }).sort(function(a, b) { return b.rate - a.rate; });
  }

  function getAnalyticsEmployeeInsightsData(records, users, period, customRange) {
    var range = getAnalyticsDateRange(period, customRange);
    var allDates = [];
    var current = new Date(range.start);
    var end = new Date(range.end);
    while (current <= end) {
      allDates.push(formatDate(current));
      current.setDate(current.getDate() + 1);
    }
    var totalDaysInPeriod = allDates.length;

    var employeeStats = {};
    users.forEach(function(u) {
      var userId = u.userId || u.id;
      employeeStats[userId] = {
        userId: userId,
        name: u.name || '',
        dept: u.dept || '',
        appointment: u.appointment || '',
        totalDays: totalDaysInPeriod,
        present: 0,
        absent: 0,
        late: 0
      };
    });

    var daySet = {};
    records.forEach(function(r) {
      if (!r.date || !r.userId) return;
      var key = r.date + '_' + r.userId;
      if (!daySet[key]) {
        daySet[key] = true;
        if (employeeStats[r.userId]) {
          if (getAttendanceStatus(r) === 'Verified') employeeStats[r.userId].present++;
          if (getAttendanceStatus(r) === 'Late') employeeStats[r.userId].late++;
        }
      }
    });

    Object.keys(employeeStats).forEach(function(userId) {
      var stats = employeeStats[userId];
      stats.absent = Math.max(0, stats.totalDays - stats.present);
      stats.rate = stats.totalDays > 0 ? Math.round((stats.present / stats.totalDays) * 100) : 0;
    });

    return Object.keys(employeeStats).map(function(userId) {
      return employeeStats[userId];
    }).sort(function(a, b) { return b.rate - a.rate; });
  }

  function renderAnalyticsEmployeeInsights(containerId, records, users) {
    var container = document.getElementById(containerId);
    if (!container) return;

    if (!records || records.length === 0 || !users || users.length === 0) {
      container.innerHTML = '<div class="analytics-empty">No employee data available for the selected period.</div>';
      return;
    }

    var searchTerm = '';
    var deptFilter = '';
    var searchInput = document.getElementById('analyticsEmployeeSearch');
    var deptSelect = document.getElementById('analyticsEmployeeDeptFilter');
    if (searchInput) searchTerm = searchInput.value.trim().toLowerCase();
    if (deptSelect) deptFilter = deptSelect.value;

    var employeeData = getAnalyticsEmployeeInsightsData(records, users, analyticsState.period, analyticsState.customRange);

    if (searchTerm) {
      employeeData = employeeData.filter(function(e) {
        return (e.userId || '').toLowerCase().indexOf(searchTerm) !== -1 ||
               (e.name || '').toLowerCase().indexOf(searchTerm) !== -1 ||
               (e.dept || '').toLowerCase().indexOf(searchTerm) !== -1;
      });
    }

    if (deptFilter) {
      employeeData = employeeData.filter(function(e) { return e.dept === deptFilter; });
    }

    var html = '<table class="table"><thead><tr>' +
      '<th>Employee ID</th><th>Name</th><th>Department</th><th>Appointment</th><th>Days</th><th>Present</th><th>Absent</th><th>Late</th><th>Rate</th>' +
      '</tr></thead><tbody>';

    if (employeeData.length === 0) {
      html += '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:20px;">No employee data available</td></tr>';
    } else {
      employeeData.forEach(function(e) {
        var rateColor = e.rate >= 80 ? '#2E8B57' : (e.rate >= 50 ? '#D4A017' : '#8B1E1E');
        html += '<tr>' +
          '<td>' + escapeHtml(e.userId || '') + '</td>' +
          '<td>' + escapeHtml(e.name || '') + '</td>' +
          '<td>' + escapeHtml(e.dept || '') + '</td>' +
          '<td>' + escapeHtml(e.appointment || '') + '</td>' +
          '<td>' + escapeHtml(String(e.totalDays)) + '</td>' +
          '<td>' + escapeHtml(String(e.present)) + '</td>' +
          '<td>' + escapeHtml(String(e.absent)) + '</td>' +
          '<td>' + escapeHtml(String(e.late)) + '</td>' +
          '<td><span style="font-weight:700;color:' + rateColor + ';">' + e.rate + '%</span></td>' +
          '</tr>';
      });
    }

    html += '</tbody></table>';
    container.innerHTML = html;
  }

  function showAnalyticsLoading(containerId, message) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<div class="analytics-loading"><div class="spinner"></div></div>';
  }

  function showAnalyticsError(containerId, message) {
    var container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '<div class="analytics-error">' + escapeHtml(message) + '</div>';
  }

  function exportAnalyticsToPdf() {
    if (!analyticsState.attendance || !analyticsState.users) {
      showAnalyticsError('analyticsKpiCards', 'No analytics data available to export.');
      return;
    }

    var pdfBtn = document.getElementById('analyticsExportPdfBtn');
    if (pdfBtn) {
      pdfBtn.disabled = true;
      pdfBtn.textContent = 'Generating...';
    }

    var pdfTimeout = setTimeout(function() {
      showAnalyticsError('analyticsKpiCards', 'PDF generation timed out after 30 seconds.');
      if (pdfBtn) {
        pdfBtn.disabled = false;
        pdfBtn.textContent = 'Export PDF';
      }
    }, 30000);

    try {
      if (!window.jspdf || !window.jspdf.jsPDF) {
        throw new Error('PDF export unavailable: jsPDF library is not loaded.');
      }

      generateAnalyticsPdf();
    } catch (e) {
      console.error('Analytics: PDF export failed', e);
      showAnalyticsError('analyticsKpiCards', 'PDF export failed: ' + (e.message || e));
    } finally {
      clearTimeout(pdfTimeout);
      if (pdfBtn) {
        pdfBtn.disabled = false;
        pdfBtn.textContent = 'Export PDF';
      }
    }
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
      // Logo loading failed - continue with text branding
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

  function drawPdfTable(doc, options) {
    var headers = options.headers || [];
    var rows = options.rows || [];
    var x = options.x != null ? options.x : 14;
    var startY = options.y != null ? options.y : 58;
    var columnWidths = options.columnWidths || [];
    var rowHeight = options.rowHeight || 8;
    var fontSize = options.fontSize || 9;
    var headerFontSize = options.headerFontSize || fontSize + 1;
    var headerFillColor = options.headerFillColor || [75, 83, 32];
    var headerTextColor = options.headerTextColor || [255, 255, 255];
    var lineColor = options.lineColor || [160, 160, 160];
    var margin = options.margin != null ? options.margin : 14;
    var pageWidth = doc.internal.pageSize.width ? doc.internal.pageSize.width : 210;
    var pageHeight = doc.internal.pageSize.height ? doc.internal.pageSize.height : 297;
    var footerReserve = options.footerReserve != null ? options.footerReserve : 28;

    if (!columnWidths.length) {
      var colWidth = (pageWidth - margin * 2) / headers.length;
      for (var i = 0; i < headers.length; i++) {
        columnWidths.push(colWidth);
      }
    }

    var totalWidth = 0;
    for (var i = 0; i < columnWidths.length; i++) {
      totalWidth += columnWidths[i];
    }

    var currentY = startY;

    function ensureSpace(height) {
      if (currentY + height > pageHeight - margin - footerReserve) {
        doc.addPage();
        if (typeof options.onNewPage === 'function') {
          options.onNewPage(doc);
          currentY = 50;
        } else {
          currentY = margin;
        }
        return true;
      }
      return false;
    }

    function drawHeader() {
      doc.setFillColor(headerFillColor[0], headerFillColor[1], headerFillColor[2]);
      doc.rect(x, currentY, totalWidth, rowHeight, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(headerFontSize);
      doc.setTextColor(headerTextColor[0], headerTextColor[1], headerTextColor[2]);

      var cellX = x;
      for (var i = 0; i < headers.length; i++) {
        var colWidth = columnWidths[i];
        var text = String(headers[i] || '');
        var textWidth = doc.getTextWidth(text);
        var textX = cellX + (colWidth - textWidth) / 2;
        doc.text(text, textX, currentY + rowHeight / 2 + headerFontSize / 3);
        cellX += colWidth;
      }

      doc.setDrawColor(lineColor[0], lineColor[1], lineColor[2]);
      doc.setLineWidth(0.2);
      doc.rect(x, currentY, totalWidth, rowHeight);

      currentY += rowHeight;
    }

    function drawRow(row) {
      var rowStartY = currentY;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(fontSize);
      doc.setTextColor(30, 30, 30);

      var lineHeight = fontSize * 0.45;
      var maxLines = Math.max(1, Math.floor(rowHeight / lineHeight));

      var cellX = x;
      for (var i = 0; i < row.length; i++) {
        var colWidth = columnWidths[i] || 0;
        var text = String(row[i] || '');
        var maxTextWidth = colWidth - 2;
        var lines = doc.splitTextToSize(text, maxTextWidth);

        if (lines.length > maxLines) {
          lines = lines.slice(0, maxLines);
          var lastLine = lines[maxLines - 1];
          if (lastLine.length > 3) {
            lines[maxLines - 1] = lastLine.substring(0, lastLine.length - 2) + '..';
          }
        }

        var textY = rowStartY + rowHeight / 2 - ((lines.length - 1) * lineHeight) / 2 + lineHeight / 3;
        for (var j = 0; j < lines.length; j++) {
          doc.text(lines[j], cellX + 1, textY + j * lineHeight);
        }

        cellX += colWidth;
      }

      doc.setDrawColor(lineColor[0], lineColor[1], lineColor[2]);
      doc.setLineWidth(0.1);
      doc.rect(x, rowStartY, totalWidth, rowHeight);

      cellX = x;
      for (var i = 1; i < row.length; i++) {
        cellX += columnWidths[i - 1] || 0;
        doc.line(cellX, rowStartY, cellX, rowStartY + rowHeight);
      }

      currentY += rowHeight;
    }

    drawHeader();

    for (var r = 0; r < rows.length; r++) {
      if (ensureSpace(rowHeight)) {
        drawHeader();
      }
      drawRow(rows[r]);
    }

    return currentY;
  }

  function generateAnalyticsPdf() {
    var pdfBtn = document.getElementById('analyticsExportPdfBtn');
    try {
      var records = analyticsState.attendance || [];
      var users = analyticsState.users || [];
      var period = analyticsState.period;
      var customRange = analyticsState.customRange;
      var range = getAnalyticsDateRange(period, customRange);
      var startDateStr = formatDate(range.start);
      var endDateStr = formatDate(range.end);
      var department = analyticsState.department || '';

      var filteredRecords = filterAnalyticsRecords(records, { department: department });
      var scopedUsers = department
        ? users.filter(function(user) { return user.dept === department; })
        : users;
      var totalStaff = scopedUsers.length;

      var verifiedUserIds = new Set();
      var lateCount = 0, blockedCount = 0, failedCount = 0;

      filteredRecords.forEach(function(r) {
        var status = getAttendanceStatus(r);
        if (status === 'Verified' && r.userId) {
          verifiedUserIds.add(r.userId);
        } else if (status === 'Late') {
          lateCount++;
        } else if (status === 'Blocked') {
          blockedCount++;
        } else if (status === 'Failed') {
          failedCount++;
        }
      });

      var verifiedCount = verifiedUserIds.size;
      var absentCount = Math.max(0, totalStaff - verifiedCount);
      var punctualityRate = verifiedCount > 0 ? 100 : 0;

      var inside = 0, outside = 0, blocked = 0;
      filteredRecords.forEach(function(r) {
        var locStatus = getAttendanceLocationStatus(r);
        if (locStatus === 'Inside') inside++;
        else if (locStatus === 'Outside') outside++;
        else if (locStatus === 'Blocked') blocked++;
      });
      var totalLocations = filteredRecords.length || 1;
      var locationCompliance = Math.round((inside / totalLocations) * 100);
      var attendanceRate = totalStaff > 0 ? Math.round((verifiedCount / totalStaff) * 100) : 0;

      var doc = new window.jspdf.jsPDF();

      drawRestrictedPdfPageHeader(doc, 'Attendance Analytics Report');

      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.text('Date Range: ' + startDateStr + ' - ' + endDateStr, 14, 52);
      doc.text('Generated: ' + new Date().toLocaleString(), 14, 58);
      doc.text('Department: ' + (department || 'All Departments'), 14, 64);

      var yPos = 72;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('KPI Summary', 14, yPos);
      yPos += 6;

      var kpiData = [
        ['Total Personnel', totalStaff],
        ['Verified', verifiedCount],
        ['Late', lateCount],
        ['Blocked', blockedCount],
        ['Failed', failedCount],
        ['Attendance Rate', attendanceRate + '%'],
        ['Punctuality Rate', punctualityRate + '%'],
        ['Location Compliance', locationCompliance + '%']
      ];

      yPos = drawPdfTable(doc, {
        headers: ['Metric', 'Value'],
        rows: kpiData,
        y: yPos,
        columnWidths: [100, 80],
        rowHeight: 8,
        fontSize: 9,
        onNewPage: function(pageDoc) {
          drawRestrictedPdfPageHeader(pageDoc, 'Attendance Analytics Report');
        }
      });

      yPos += 12;

      var deptData = getAnalyticsDepartmentData(filteredRecords, users);
      if (deptData.length > 0) {
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text('Department Performance', 14, yPos);
        yPos += 6;

        var deptBody = deptData.map(function(d) {
          return [d.dept, d.total, d.present, d.late, d.absent, d.rate + '%'];
        });

        yPos = drawPdfTable(doc, {
          headers: ['Department', 'Personnel', 'Verified', 'Late', 'Absent', 'Rate'],
          rows: deptBody,
          y: yPos,
          columnWidths: [60, 35, 35, 35, 35, 30],
          rowHeight: 8,
          fontSize: 8,
          onNewPage: function(pageDoc) {
            drawRestrictedPdfPageHeader(pageDoc, 'Attendance Analytics Report');
          }
        });

        yPos += 12;
      }

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Attendance Records', 14, yPos);
      yPos += 6;

      if (filteredRecords.length > 0) {
        var recordBody = filteredRecords.map(function(r) {
          var timeStr = '--:--';
          if (r.timestamp) {
            try { timeStr = r.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch(e) { timeStr = '--:--'; }
          }
          var dateStr = r.date || '--';
          if (r.timestamp) {
            try { dateStr = r.timestamp.toDate().toLocaleDateString(); } catch(e) {}
          }
          var dist = r.location && r.location.distance != null ? r.location.distance : null;
          var distStr = dist !== null ? dist + ' m' : '--';
          var status = getAttendanceStatus(r);
          var locStatus = getAttendanceLocationStatus(r);
          return [
            r.userId || '',
            r.name || '',
            r.dept || '',
            r.appointment || '',
            dateStr,
            timeStr,
            status,
            locStatus,
            distStr
          ];
        });

        yPos = drawPdfTable(doc, {
          headers: ['Employee ID', 'Name', 'Department', 'Appointment', 'Date', 'Time', 'Status', 'Location', 'Distance'],
          rows: recordBody,
          y: yPos,
          columnWidths: [28, 32, 32, 32, 26, 24, 22, 24, 22],
          rowHeight: 7,
          fontSize: 7,
          onNewPage: function(pageDoc) {
            drawRestrictedPdfPageHeader(pageDoc, 'Attendance Analytics Report');
          }
        });
      } else {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text('No attendance records found for the selected filters.', 14, yPos);
      }

      var totalPages = doc.internal.getNumberOfPages();
      for (var p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        drawRestrictedPdfPageFooter(doc, p, totalPages);
      }

      var fileName = 'BioTrack_Analytics_' + startDateStr + '_' + endDateStr + '.pdf';
      doc.save(fileName);
      if (typeof showStatus === 'function') {
        showStatus('PDF exported: ' + fileName, 'success');
      } else {
        showAnalyticsError('analyticsKpiCards', 'PDF exported: ' + fileName);
      }
    } catch (e) {
      console.error('Analytics: PDF export failed', e);
      showAnalyticsError('analyticsKpiCards', 'PDF export failed: ' + (e.message || e));
    } finally {
      if (pdfBtn) {
        pdfBtn.disabled = false;
        pdfBtn.textContent = 'Export PDF';
      }
    }
  }

  function setupAnalyticsEventListeners() {
    var periodSelect = document.getElementById('analyticsPeriod');
    if (periodSelect) {
      periodSelect.addEventListener('change', function() {
        analyticsState.period = this.value;
        analyticsState.customRange = null;
        var customRangeEl = document.getElementById('analyticsCustomRange');
        if (customRangeEl) {
          if (this.value === 'custom') {
            customRangeEl.classList.remove('hidden');
            customRangeEl.style.display = 'flex';
          } else {
            customRangeEl.classList.add('hidden');
            customRangeEl.style.display = 'none';
          }
        }
        loadAnalyticsData();
      });
    }

    var applyCustomBtn = document.getElementById('analyticsApplyCustom');
    if (applyCustomBtn) {
      applyCustomBtn.addEventListener('click', function() {
        var startInput = document.getElementById('analyticsStartDate');
        var endInput = document.getElementById('analyticsEndDate');
        if (!startInput || !endInput || !startInput.value || !endInput.value) {
          showAnalyticsError('analyticsKpiCards', 'Please select both start and end dates.');
          return;
        }
        if (new Date(startInput.value) > new Date(endInput.value)) {
          showAnalyticsError('analyticsKpiCards', 'Start date must be before end date.');
          return;
        }
        analyticsState.customRange = { start: startInput.value, end: endInput.value };
        analyticsState.period = 'custom';
        loadAnalyticsData();
      });
    }

    var deptFilter = document.getElementById('analyticsDeptFilter');
    if (deptFilter) {
      deptFilter.addEventListener('change', function() {
        analyticsState.department = this.value;
        renderAnalytics();
      });
    }

    var resetBtn = document.getElementById('analyticsResetBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        analyticsState.period = '30days';
        analyticsState.customRange = null;
        analyticsState.department = '';
        if (periodSelect) periodSelect.value = '30days';
        var customRangeEl = document.getElementById('analyticsCustomRange');
        if (customRangeEl) {
          customRangeEl.classList.add('hidden');
          customRangeEl.style.display = 'none';
        }
        if (deptFilter) deptFilter.value = '';
        loadAnalyticsData();
      });
    }

    var exportBtn = document.getElementById('analyticsExportBtn');
    var exportMenu = document.getElementById('analyticsExportMenu');
    if (exportBtn && exportMenu) {
      exportBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        exportMenu.style.display = exportMenu.style.display === 'none' ? 'block' : 'none';
      });
    }

    var excelBtn = document.getElementById('analyticsExportExcelBtn');
    if (excelBtn) {
      excelBtn.addEventListener('click', function() {
        if (exportMenu) exportMenu.style.display = 'none';
        if (typeof window.exportExcel === 'function') {
          window.exportExcel();
        } else {
          showAnalyticsError('analyticsKpiCards', 'Export is not available.');
        }
      });
    }

    var pdfBtn = document.getElementById('analyticsExportPdfBtn');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', function() {
        if (exportMenu) exportMenu.style.display = 'none';
        exportAnalyticsToPdf();
      });
    }

    document.addEventListener('click', function() {
      if (exportMenu) exportMenu.style.display = 'none';
    });

    var empSearch = document.getElementById('analyticsEmployeeSearch');
    if (empSearch) {
      var searchTimeout;
      empSearch.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(function() {
          renderAnalyticsEmployeeInsights('analyticsEmployeeTable', analyticsState.attendance, analyticsState.users);
        }, 300);
      });
    }

    var empDeptFilter = document.getElementById('analyticsEmployeeDeptFilter');
    if (empDeptFilter) {
      empDeptFilter.addEventListener('change', function() {
        renderAnalyticsEmployeeInsights('analyticsEmployeeTable', analyticsState.attendance, analyticsState.users);
      });
    }
  }

  function initAnalytics() {
    if (analyticsState.initialized) return;
    analyticsState.initialized = true;
    setupAnalyticsEventListeners();
  }

  // ============================================
  // REPORTS WORKSPACE MODULE
  // ============================================
  var reportsState = {
    period: 'today',
    customRange: null,
    filters: {
      department: '',
      employee: '',
      status: '',
      location: ''
    },
    users: [],
    records: [],
    filteredRecords: [],
    isLoading: false,
    initialized: false,
    reportGenerated: false
  };

  function getReportsDateRange(period, customRange) {
    return getDateRange(period, customRange);
  }

  function getReportsPeriodLabel(period, customRange) {
    switch (period) {
      case 'today': return 'Today';
      case 'yesterday': return 'Yesterday';
      case '7days': return 'Last 7 Days';
      case '30days': return 'Last 30 Days';
      case '90days': return 'Last 90 Days';
      case 'custom':
        if (customRange && customRange.start && customRange.end) {
          return formatDate(new Date(customRange.start)) + ' - ' + formatDate(new Date(customRange.end));
        }
        return 'Custom Range';
      default: return 'Today';
    }
  }

  function updateReportsDateIndicator() {
    var el = document.getElementById('reportsDateIndicator');
    if (el) el.textContent = getReportsPeriodLabel(reportsState.period, reportsState.customRange);
  }

  async function loadReportsUsers() {
    var db = getDb();
    if (!db) {
      reportsState.users = [];
      return;
    }
    try {
      var snapshot = await db.collection('users').get();
      reportsState.users = snapshot.docs.map(function(doc) {
        var data = doc.data();
        return { id: doc.id, ...data };
      });
    } catch (e) {
      console.error('Reports: Failed to load users', e);
      reportsState.users = [];
    }
  }

  function populateReportsDeptFilter(users) {
    var select = document.getElementById('reportsDeptFilter');
    if (!select) return;

    var depts = {};
    users.forEach(function(u) {
      var d = u.dept || 'Unknown';
      depts[d] = (depts[d] || 0) + 1;
    });

    var html = '<option value="">All Departments</option>';
    Object.keys(depts).sort().forEach(function(d) {
      html += '<option value="' + escapeHtml(d) + '">' + escapeHtml(d) + ' (' + depts[d] + ')</option>';
    });

    select.innerHTML = html;
  }

  function populateReportsEmployeeFilter(users) {
    var select = document.getElementById('reportsEmployeeFilter');
    if (!select) return;

    var html = '<option value="">All Employees</option>';

    var sorted = users.slice().sort(function(a, b) {
      var nameA = (a.name || a.id || '').toLowerCase();
      var nameB = (b.name || b.id || '').toLowerCase();
      if (nameA < nameB) return -1;
      if (nameA > nameB) return 1;
      return 0;
    });

    sorted.forEach(function(u) {
      var empId = u.userId || u.id || '';
      var empName = u.name || '';
      var label = empId ? (empId + ' - ' + empName) : empName;
      html += '<option value="' + escapeHtml(empId) + '">' + escapeHtml(label) + '</option>';
    });

    select.innerHTML = html;
  }
  
  function getReportsFilters() {
    var periodEl = null;
    var periodBtns = document.querySelectorAll('.reports-period-btn');
    periodBtns.forEach(function(btn) {
      if (btn.classList.contains('active')) {
        periodEl = btn.getAttribute('data-period');
      }
    });

    var deptEl = document.getElementById('reportsDeptFilter');
    var empEl = document.getElementById('reportsEmployeeFilter');
    var statusEl = document.getElementById('reportsStatusFilter');
    var locEl = document.getElementById('reportsLocationFilter');

    return {
      period: periodEl || 'today',
      department: deptEl ? deptEl.value : '',
      employee: empEl ? empEl.value : '',
      status: statusEl ? statusEl.value : '',
      location: locEl ? locEl.value : ''
    };
  }

  function applyReportsFilters() {
    var filters = getReportsFilters();
    var records = reportsState.records || [];

    var filtered = records.filter(function(r) {
      if (filters.department && r.dept !== filters.department) return false;
      if (filters.employee && r.userId !== filters.employee) return false;

      if (filters.status) {
        var recordStatus = getReportsStatus(r);
        if (recordStatus.toLowerCase() !== filters.status.toLowerCase()) return false;
      }

      if (filters.location) {
        var recordLoc = getReportsLocationStatus(r);
        if (recordLoc.toLowerCase() !== filters.location.toLowerCase()) return false;
      }

      return true;
    });

    reportsState.filteredRecords = filtered;
    updateReportsFilterSummary(filters);
    renderReportsResults();
  }

  function updateReportsFilterSummary(filters) {
    var summaryText = document.getElementById('reportsFilterSummaryText');
    if (!summaryText) return;

    var labels = [];
    if (filters.department) labels.push('Department: ' + filters.department);
    if (filters.employee) {
      var empSelect = document.getElementById('reportsEmployeeFilter');
      if (empSelect) {
        var opt = empSelect.options[empSelect.selectedIndex];
        if (opt) labels.push('Employee: ' + opt.textContent);
      }
    }
    if (filters.status) labels.push('Status: ' + document.querySelector('#reportsStatusFilter option[value="' + filters.status + '"]').textContent);
    if (filters.location) labels.push('Location: ' + document.querySelector('#reportsLocationFilter option[value="' + filters.location + '"]').textContent);

    summaryText.textContent = labels.length > 0 ? labels.join(', ') : 'None';
  }

  function getReportsStatus(record) {
    return getAttendanceStatus(record);
  }
  
  function getReportsLocationStatus(record) {
    return getAttendanceLocationStatus(record);
  }


  function getReportsStatusBadgeClass(status) {
    if (status === 'Verified') return 'badge-success';
    if (status === 'Late') return 'badge-warning';
    if (status === 'Blocked') return 'badge-danger';
    if (status === 'Failed') return 'badge-neutral';
    return 'badge-neutral';
  }

  function calculateReportsKpis(records, users, filters) {
    var safeRecords = Array.isArray(records) ? records : [];
    var totalStaff = Array.isArray(users) ? users.length : 0;

    var verifiedUserIds = new Set();
    var lateUserIds = new Set();
    var blockedUserIds = new Set();
    var failedUserIds = new Set();
    var presentUserIds = new Set();

    safeRecords.forEach(function(r) {
      if (!r.userId) return;
      var status = getReportsStatus(r);

      if (status === 'Verified' || status === 'Late' || status === 'Failed') {
        presentUserIds.add(r.userId);
      }

      if (status === 'Verified') verifiedUserIds.add(r.userId);
      if (status === 'Late' && r.userId) lateUserIds.add(r.userId);
      if (status === 'Blocked' && r.userId) blockedUserIds.add(r.userId);
      if (status === 'Failed' && r.userId) failedUserIds.add(r.userId);
    });

    var presentCount = presentUserIds.size;
    var absentCount = Math.max(0, totalStaff - presentCount);
    var verifiedCount = verifiedUserIds.size;
    var lateCount = lateUserIds.size;
    var blockedCount = blockedUserIds.size;
    var failedCount = failedUserIds.size;

    var rateDenominator = totalStaff > 0 ? totalStaff : 1;
    var attendanceRate = Math.round((presentCount / rateDenominator) * 100);

    return {
      totalStaff: totalStaff,
      verified: verifiedCount,
      late: lateCount,
      blocked: blockedCount,
      failed: failedCount,
      present: presentCount,
      absent: absentCount,
      attendanceRate: attendanceRate
    };
  }

  function calculateDepartmentPerformance(records, users, filters) {
    var safeRecords = Array.isArray(records) ? records : [];
    var safeUsers = Array.isArray(users) ? users : [];

    var deptData = {};

    safeUsers.forEach(function(u) {
      var dept = u.dept || 'Unknown';
      if (!deptData[dept]) {
        deptData[dept] = { personnel: 0, verified: 0, late: 0, blocked: 0, absent: 0 };
      }
      deptData[dept].personnel++;
    });

    var presentByDept = {};
    safeRecords.forEach(function(r) {
      var dept = r.dept || 'Unknown';
      if (!deptData[dept]) {
        deptData[dept] = { personnel: 0, verified: 0, late: 0, blocked: 0, absent: 0 };
      }

      var status = getReportsStatus(r);
      if (r.userId) {
        if (status === 'Verified' || status === 'Late' || status === 'Failed') {
          if (!presentByDept[dept]) presentByDept[dept] = new Set();
          presentByDept[dept].add(r.userId);
        }
      }
      if (status === 'Verified') deptData[dept].verified++;
      else if (status === 'Late') deptData[dept].late++;
      else if (status === 'Blocked') deptData[dept].blocked++;
      else if (status === 'Failed') deptData[dept].blocked++;
    });

    Object.keys(deptData).forEach(function(dept) {
      var presentCount = presentByDept[dept] ? presentByDept[dept].size : 0;
      deptData[dept].absent = Math.max(0, deptData[dept].personnel - presentCount);
    });

    var result = Object.keys(deptData).map(function(dept) {
      var d = deptData[dept];
      var rateDenom = d.personnel > 0 ? d.personnel : 1;
      var rate = Math.round((presentByDept[dept] ? presentByDept[dept].size : 0) / rateDenom * 100);
      return {
        dept: dept,
        personnel: d.personnel,
        verified: d.verified,
        late: d.late,
        blocked: d.blocked,
        absent: d.absent,
        rate: rate
      };
    });

    return result.sort(function(a, b) { return b.personnel - a.personnel; });
  }

  function renderReportsKpis(kpis) {
    var html = '<div class="reports-kpi-grid">';

    var cards = [
      { label: 'Total Personnel', value: kpis.totalStaff, color: 'var(--text-primary)' },
      { label: 'Verified', value: kpis.verified, color: '#2E8B57' },
      { label: 'Late', value: kpis.late, color: '#D4A017' },
      { label: 'Blocked', value: kpis.blocked, color: '#8B1E2E' },
      { label: 'Failed', value: kpis.failed, color: '#ff6b6b' },
      { label: 'Attendance Rate', value: kpis.attendanceRate + '%', color: kpis.attendanceRate >= 80 ? '#2E8B57' : (kpis.attendanceRate >= 50 ? '#D4A017' : '#8B1E2E') }
    ];

    cards.forEach(function(card) {
      html += '<div class="reports-kpi-card">' +
        '<div class="reports-kpi-value" style="color:' + card.color + ';">' + card.value + '</div>' +
        '<div class="reports-kpi-label">' + card.label + '</div>' +
        '</div>';
    });

    html += '</div>';
    return html;
  }

  function renderDepartmentPerformanceTable(deptStats) {
    if (!deptStats || deptStats.length === 0) {
      return '<div class="reports-dept-empty"><p>No department data available.</p></div>';
    }

    var html = '<table class="table reports-dept-table"><thead><tr>' +
      '<th>Department</th>' +
      '<th>Personnel</th>' +
      '<th>Verified</th>' +
      '<th>Late</th>' +
      '<th>Blocked</th>' +
      '<th>Absent</th>' +
      '<th>Rate</th>' +
      '</tr></thead><tbody>';

    deptStats.forEach(function(d) {
      html += '<tr>' +
        '<td>' + escapeHtml(d.dept) + '</td>' +
        '<td>' + d.personnel + '</td>' +
        '<td><span class="badge badge-success">' + d.verified + '</span></td>' +
        '<td><span class="badge badge-warning">' + d.late + '</span></td>' +
        '<td><span class="badge badge-danger">' + d.blocked + '</span></td>' +
        '<td><span class="badge badge-neutral">' + d.absent + '</span></td>' +
        '<td>' + d.rate + '%' + '</td>' +
        '</tr>';
    });

    html += '</tbody></table>';
    return html;
  }

  function renderReportsResults() {
    var container = document.getElementById('reportsResultsContainer');
    if (!container) return;

    var filtered = reportsState.filteredRecords || [];
    var filters = getReportsFilters();

    if (filtered.length === 0) {
      var totalRecords = (reportsState.records || []).length;
      if (totalRecords === 0) {
        container.innerHTML = '<div class="reports-empty-state"><div class="reports-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><h4>No report data</h4><p>No attendance records found for the selected period.</p></div>';
      } else {
        container.innerHTML = '<div class="reports-empty-state"><div class="reports-empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="1" y1="1" x2="23" y2="23"/></svg></div><h4>No matching records</h4><p>Try adjusting your search or filter criteria.</p></div>';
      }
      return;
    }

    var range = getReportsDateRange(reportsState.period, reportsState.customRange);
    var startDateStr = formatDate(range.start);
    var endDateStr = formatDate(range.end);
    var generatedDate = new Date().toLocaleString();

    var kpis = calculateReportsKpis(filtered, reportsState.users, filters);

    var filterDesc = '';
    if (filters.department) filterDesc += ' Department: ' + escapeHtml(filters.department);
    if (filters.employee) filterDesc += ' Employee: ' + escapeHtml(filters.employee);
    if (filters.status) filterDesc += ' Status: ' + escapeHtml(filters.status);
    if (filters.location) filterDesc += ' Location: ' + escapeHtml(filters.location);

    var html = '';

    // Report Header
    html += '<div class="reports-preview-header">' +
      '<div class="reports-header-title-group">' +
        '<h3 class="reports-preview-title">BioTrack Attendance Report</h3>' +
        '<div class="reports-preview-meta">' +
          '<div class="reports-meta-row"><span class="reports-meta-label">Date Range:</span><span class="reports-meta-value">' + escapeHtml(startDateStr) + ' - ' + escapeHtml(endDateStr) + '</span></div>' +
          '<div class="reports-meta-row"><span class="reports-meta-label">Generated:</span><span class="reports-meta-value">' + escapeHtml(generatedDate) + '</span></div>' +
          '<div class="reports-meta-row"><span class="reports-meta-label">Filters:</span><span class="reports-meta-value">' + (filterDesc ? filterDesc.trim() : 'None') + '</span></div>' +
        '</div>' +
      '</div>' +
      '<div class="reports-preview-actions">' +
        '<button id="reportsExportExcelBtn" class="btn btn-sm btn-accent" disabled>Export Excel</button>' +
        '<button id="reportsExportPdfBtn" class="btn btn-sm btn-outline" disabled>Export PDF</button>' +
      '</div>' +
      '</div>';

    // KPI Summary Cards
    html += '<div class="reports-summary-section">' +
      '<h4 class="reports-section-title">Summary</h4>' +
      renderReportsKpis(kpis) +
      '</div>';

    // Department Performance
    var deptStats = calculateDepartmentPerformance(filtered, reportsState.users, filters);
    html += '<div class="reports-department-section">' +
      '<h4 class="reports-section-title">Department Performance</h4>' +
      '<div class="reports-dept-table-wrap">' +
      renderDepartmentPerformanceTable(deptStats) +
      '</div>' +
      '</div>';

    // Attendance Records Table
    html += '<div class="reports-records-section">' +
      '<h4 class="reports-section-title">Attendance Records</h4>' +
      '<div class="reports-table-container">';

    html += '<table class="table reports-table"><thead><tr>' +
      '<th>Employee ID</th>' +
      '<th>Name</th>' +
      '<th>Department</th>' +
      '<th>Appointment</th>' +
      '<th>Date</th>' +
      '<th>Time</th>' +
      '<th>Status</th>' +
      '<th>Location</th>' +
      '<th>Distance</th>' +
      '</tr></thead><tbody>';

    filtered.forEach(function(r) {
      var status = getReportsStatus(r);
      var locStatus = getReportsLocationStatus(r);

      var timeStr = '--:--';
      if (r.timestamp) {
        try { timeStr = r.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch(e) { timeStr = '--:--'; }
      }

      var dist = r.location && r.location.distance != null ? r.location.distance : null;
      var distStr = dist !== null ? dist + ' m' : '--';

      html += '<tr>' +
        '<td>' + escapeHtml(r.userId || '') + '</td>' +
        '<td>' + escapeHtml(r.name || '') + '</td>' +
        '<td>' + escapeHtml(r.dept || '') + '</td>' +
        '<td>' + escapeHtml(r.appointment || '') + '</td>' +
        '<td>' + escapeHtml(r.date || '') + '</td>' +
        '<td>' + escapeHtml(timeStr) + '</td>' +
        '<td><span class="badge ' + getReportsStatusBadgeClass(status) + '">' + escapeHtml(status) + '</span></td>' +
        '<td>' + escapeHtml(locStatus) + '</td>' +
        '<td>' + escapeHtml(distStr) + '</td>' +
        '</tr>';
    });

    html += '</tbody></table>';
    html += '</div></div>';

    container.innerHTML = html;

    reportsState.reportGenerated = true;
    setReportsExportButtonsState(true);
  }

  function resetReportsExportButtons() {
    var excelBtn = document.getElementById('reportsExportExcelBtn');
    var pdfBtn = document.getElementById('reportsExportPdfBtn');
    if (excelBtn) {
      excelBtn.disabled = true;
      excelBtn.textContent = 'Export Excel';
    }
    if (pdfBtn) {
      pdfBtn.disabled = true;
      pdfBtn.textContent = 'Export PDF';
    }
  }

  function setReportsExportButtonsState(enabled) {
    var excelBtn = document.getElementById('reportsExportExcelBtn');
    var pdfBtn = document.getElementById('reportsExportPdfBtn');
    if (excelBtn) {
      excelBtn.disabled = !enabled;
    }
    if (pdfBtn) {
      pdfBtn.disabled = !enabled;
    }
  }

  function getReportsExportData() {
    var filtered = reportsState.filteredRecords || [];
    var range = getReportsDateRange(reportsState.period, reportsState.customRange);
    var startDateStr = formatDate(range.start);
    var endDateStr = formatDate(range.end);
    var generatedDate = new Date().toLocaleString();
    var filters = getReportsFilters();

    var filterDesc = '';
    if (filters.department) filterDesc += ' Department: ' + filters.department;
    if (filters.employee) filterDesc += ' Employee: ' + filters.employee;
    if (filters.status) filterDesc += ' Status: ' + filters.status;
    if (filters.location) filterDesc += ' Location: ' + filters.location;

    return {
      rangeStart: startDateStr,
      rangeEnd: endDateStr,
      generatedDate: generatedDate,
      filters: filters,
      filterDesc: filterDesc,
      records: filtered,
      users: reportsState.users
    };
  }

  function exportReportsToExcel() {
    if (!reportsState.reportGenerated) {
      showStatus('Please generate a report before exporting.', 'error');
      return;
    }

    if (typeof XLSX === 'undefined') {
      showStatus('XLSX library not available', 'error');
      return;
    }

    var excelBtn = document.getElementById('reportsExportExcelBtn');
    if (excelBtn) {
      excelBtn.disabled = true;
      excelBtn.textContent = 'Generating...';
    }

    try {
      var data = getReportsExportData();
      var filtered = data.records;
      var kpis = calculateReportsKpis(filtered, reportsState.users, data.filters);
      var deptStats = calculateDepartmentPerformance(filtered, reportsState.users, data.filters);

      var wb = XLSX.utils.book_new();

      // Summary Sheet
      var summaryData = getRestrictedExcelBrandingRows('BioTrack Attendance Report');
      summaryData = summaryData.concat([
        [],
        ['Report Metadata'],
        ['Date Range Start', data.rangeStart],
        ['Date Range End', data.rangeEnd],
        ['Generated', data.generatedDate],
        ['Filters', data.filterDesc || 'None'],
        [],
        ['Summary KPIs'],
        ['Total Personnel', kpis.totalStaff],
        ['Verified', kpis.verified],
        ['Late', kpis.late],
        ['Blocked', kpis.blocked],
        ['Failed', kpis.failed],
        ['Present', kpis.present],
        ['Absent', kpis.absent],
        ['Attendance Rate', kpis.attendanceRate + '%']
      ]);

      var summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');
      configureRestrictedExcelPrintSettings(wb, summaryWs);

      // Department Performance Sheet
      if (deptStats && deptStats.length > 0) {
        var deptHeaderRows = getRestrictedExcelBrandingRows('Department Performance');
        var deptHeaders = [['Department', 'Personnel', 'Verified', 'Late', 'Blocked', 'Absent', 'Rate']];
        var deptRows = deptStats.map(function(d) {
          return [d.dept, d.personnel, d.verified, d.late, d.blocked, d.absent, d.rate + '%'];
        });
        var deptWs = XLSX.utils.aoa_to_sheet(deptHeaderRows.concat(deptHeaders).concat(deptRows));
        XLSX.utils.book_append_sheet(wb, deptWs, 'Department Performance');
        configureRestrictedExcelPrintSettings(wb, deptWs);
      }

      // Records Sheet
      if (filtered.length > 0) {
        var recordHeaderRows = getRestrictedExcelBrandingRows('Attendance Records');
        var recordHeaders = [{
          'Employee ID': 'Employee ID',
          'Name': 'Name',
          'Department': 'Department',
          'Appointment': 'Appointment',
          'Date': 'Date',
          'Time': 'Time',
          'Status': 'Status',
          'Location': 'Location',
          'Distance': 'Distance'
        }];

        var recordRows = filtered.map(function(r) {
          var timeStr = '--:--';
          if (r.timestamp) {
            try { timeStr = r.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch(e) { timeStr = '--:--'; }
          }
          var dist = r.location && r.location.distance != null ? r.location.distance : null;
          var distStr = dist !== null ? dist + ' m' : '--';

          return {
            'Employee ID': r.userId || '',
            'Name': r.name || '',
            'Department': r.dept || '',
            'Appointment': r.appointment || '',
            'Date': r.date || '',
            'Time': timeStr,
            'Status': getReportsStatus(r),
            'Location': getReportsLocationStatus(r),
            'Distance': distStr
          };
        });

        var recordsWs = XLSX.utils.json_to_sheet(recordHeaderRows.concat(recordRows));
        XLSX.utils.book_append_sheet(wb, recordsWs, 'Attendance Records');
        configureRestrictedExcelPrintSettings(wb, recordsWs);
      }

      var fileName = 'BioTrack_Report_' + data.rangeStart + '_' + data.rangeEnd + '.xlsx';
      XLSX.writeFile(wb, fileName);
      showStatus('Excel report exported: ' + fileName, 'success');
    } catch (e) {
      console.error('Reports: Excel export failed', e);
      showStatus('Excel export failed: ' + getErrorMessage(e), 'error');
    } finally {
      if (excelBtn) {
        excelBtn.disabled = false;
        excelBtn.textContent = 'Export Excel';
      }
    }
  }

  function exportReportsToPdf() {
    if (!reportsState.reportGenerated) {
      showStatus('Please generate a report before exporting.', 'error');
      return;
    }

    var pdfBtn = document.getElementById('reportsExportPdfBtn');
    if (pdfBtn) {
      pdfBtn.disabled = true;
      pdfBtn.textContent = 'Generating...';
    }

    var pdfTimeout = setTimeout(function() {
      showStatus('PDF generation timed out after 30 seconds.', 'error');
      if (pdfBtn) {
        pdfBtn.disabled = false;
        pdfBtn.textContent = 'Export PDF';
      }
    }, 30000);

    try {
      if (!window.jspdf || !window.jspdf.jsPDF) {
        throw new Error('PDF export unavailable: jsPDF library is not loaded.');
      }

      generateReportsPdf();
    } catch (e) {
      console.error('Reports: PDF export failed', e);
      showStatus('PDF export failed: ' + getErrorMessage(e), 'error');
    } finally {
      clearTimeout(pdfTimeout);
      if (pdfBtn) {
        pdfBtn.disabled = false;
        pdfBtn.textContent = 'Export PDF';
      }
    }
  }

  function generateReportsPdf() {
    try {
      var data = getReportsExportData();
      var filtered = data.records;
      var kpis = calculateReportsKpis(filtered, reportsState.users, data.filters);
      var deptStats = calculateDepartmentPerformance(filtered, reportsState.users, data.filters);

      var doc = new window.jspdf.jsPDF();

      drawRestrictedPdfPageHeader(doc, 'Attendance Report');

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('Date Range: ' + data.rangeStart + ' - ' + data.rangeEnd, 14, 52);
      doc.text('Generated: ' + data.generatedDate, 14, 58);
      doc.text('Filters: ' + (data.filterDesc ? data.filterDesc.trim() : 'None'), 14, 64);

      var yPos = 72;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Summary', 14, yPos);
      yPos += 5;

      var kpiData = [
        ['Total Personnel', kpis.totalStaff],
        ['Verified', kpis.verified],
        ['Late', kpis.late],
        ['Blocked', kpis.blocked],
        ['Failed', kpis.failed],
        ['Attendance Rate', kpis.attendanceRate + '%']
      ];

      yPos = drawPdfTable(doc, {
        headers: ['Metric', 'Value'],
        rows: kpiData,
        y: yPos,
        columnWidths: [80, 60],
        rowHeight: 8,
        fontSize: 8,
        onNewPage: function(pageDoc) {
          drawRestrictedPdfPageHeader(pageDoc, 'Attendance Report');
        }
      });

      yPos += 12;

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Department Performance', 14, yPos);
      yPos += 5;

      if (deptStats && deptStats.length > 0) {
        var deptBody = deptStats.map(function(d) {
          return [d.dept, d.personnel, d.verified, d.late, d.blocked, d.absent, d.rate + '%'];
        });

        yPos = drawPdfTable(doc, {
          headers: ['Department', 'Personnel', 'Verified', 'Late', 'Blocked', 'Absent', 'Rate'],
          rows: deptBody,
          y: yPos,
          columnWidths: [50, 28, 28, 28, 28, 28, 20],
          rowHeight: 7,
          fontSize: 7,
          onNewPage: function(pageDoc) {
            drawRestrictedPdfPageHeader(pageDoc, 'Attendance Report');
          }
        });

        yPos += 12;
      }

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Attendance Records', 14, yPos);
      yPos += 5;

      if (filtered.length > 0) {
        var recordBody = filtered.map(function(r) {
          var timeStr = '--:--';
          if (r.timestamp) {
            try { timeStr = r.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch(e) { timeStr = '--:--'; }
          }
          var dist = r.location && r.location.distance != null ? r.location.distance : null;
          var distStr = dist !== null ? dist + ' m' : '--';
          return [
            r.userId || '',
            r.name || '',
            r.dept || '',
            r.appointment || '',
            r.date || '',
            timeStr,
            getReportsStatus(r),
            getReportsLocationStatus(r),
            distStr
          ];
        });

        yPos = drawPdfTable(doc, {
          headers: ['Employee ID', 'Name', 'Department', 'Appointment', 'Date', 'Time', 'Status', 'Location', 'Distance'],
          rows: recordBody,
          y: yPos,
          columnWidths: [28, 30, 30, 30, 24, 22, 22, 22, 22],
          rowHeight: 6.5,
          fontSize: 6.5,
          onNewPage: function(pageDoc) {
            drawRestrictedPdfPageHeader(pageDoc, 'Attendance Report');
          }
        });
      } else {
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text('No attendance records found for the selected filters.', 14, yPos);
      }

      var totalPages = doc.internal.getNumberOfPages();
      for (var p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        drawRestrictedPdfPageFooter(doc, p, totalPages);
      }

      var fileName = 'BioTrack_Report_' + data.rangeStart + '_' + data.rangeEnd + '.pdf';
      doc.save(fileName);
      showStatus('PDF report exported: ' + fileName, 'success');
    } catch (e) {
      console.error('Reports: PDF export failed', e);
      showStatus('PDF export failed: ' + getErrorMessage(e), 'error');
    }
  }

  async function generateReportsReport() {
    var range = getReportsDateRange(reportsState.period, reportsState.customRange);
    var startDateStr = formatDate(range.start);
    var endDateStr = formatDate(range.end);

    var container = document.getElementById('reportsResultsContainer');
    if (!container) return;

    reportsState.isLoading = true;
    reportsState.reportGenerated = false;
    resetReportsExportButtons();
    container.innerHTML = '<div class="reports-skeleton" id="reportsSkeleton">' +
      '<div class="skeleton" style="height:40px;width:100%;margin-bottom:12px;"></div>' +
      '<div class="skeleton" style="height:24px;width:60%;margin-bottom:12px;"></div>' +
      '<div class="skeleton" style="height:20px;width:40%;margin-bottom:8px;"></div>' +
      '<div class="skeleton" style="height:20px;width:100%;margin-bottom:8px;"></div>' +
      '<div class="skeleton" style="height:20px;width:80%;margin-bottom:8px;"></div>' +
      '<div class="skeleton" style="height:20px;width:60%;margin-top:12px;"></div>' +
      '</div>';

    var db = getDb();
    if (!db) {
      container.innerHTML = '<div class="reports-error-state"><div class="reports-error-icon">&#9888;</div><h4>Unable to load reports.</h4><p>Firebase connection not established. Please sign in and try again.</p><button id="reportsRetryBtn" class="btn btn-sm btn-outline">Try Again</button></div>';
      return;
    }

    try {
      var snapshot = await db.collection('attendance')
        .where('date', '>=', startDateStr)
        .where('date', '<=', endDateStr)
        .get();

      reportsState.records = snapshot.docs.map(function(doc) {
        return { id: doc.id, ...doc.data() };
      });

      reportsState.reportGenerated = true;
      applyReportsFilters();
    } catch (e) {
      console.error('Reports: Failed to generate', e);
      var errMsg = getErrorMessage(e);
      container.innerHTML = '<div class="reports-error-state"><div class="reports-error-icon">&#9888;</div><h4>Unable to load report data.</h4><p>' + escapeHtml(errMsg) + '</p><button id="reportsRetryBtn" class="btn btn-sm btn-outline">Try Again</button></div>';
    } finally {
      reportsState.isLoading = false;
     }
   }

  function resetReportsFilters() {
    var periodBtns = document.querySelectorAll('.reports-period-btn');
    periodBtns.forEach(function(btn) {
      btn.classList.remove('active');
    });
    var todayBtn = document.querySelector('.reports-period-btn[data-period="today"]');
    if (todayBtn) todayBtn.classList.add('active');

    reportsState.period = 'today';
    reportsState.customRange = null;
    reportsState.reportGenerated = false;

    var deptEl = document.getElementById('reportsDeptFilter');
    if (deptEl) deptEl.value = '';

    var empEl = document.getElementById('reportsEmployeeFilter');
    if (empEl) empEl.value = '';

    var statusEl = document.getElementById('reportsStatusFilter');
    if (statusEl) statusEl.value = '';

    var locEl = document.getElementById('reportsLocationFilter');
    if (locEl) locEl.value = '';

    var customGroup = document.getElementById('reportsCustomDateGroup');
    if (customGroup) {
      customGroup.setAttribute('hidden', 'hidden');
      customGroup.style.display = 'none';
    }

    resetReportsExportButtons();
    loadReportsData();
  }

  async function loadReportsData() {
    if (!getDb()) return;

    await loadReportsUsers();

    if (reportsState.users.length > 0) {
      populateReportsDeptFilter(reportsState.users);
      populateReportsEmployeeFilter(reportsState.users);
    }

    updateReportsDateIndicator();
    await generateReportsReport();
  }

  function initReports() {
    if (reportsState.initialized) return;

    var periodBtns = document.querySelectorAll('.reports-period-btn');
    periodBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        periodBtns.forEach(function(b) { b.classList.remove('active'); });
        this.classList.add('active');

        reportsState.period = this.getAttribute('data-period');

        var customGroup = document.getElementById('reportsCustomDateGroup');
        if (this.getAttribute('data-period') === 'custom') {
          if (customGroup) {
            customGroup.removeAttribute('hidden');
            customGroup.style.display = 'flex';
          }
        } else {
          if (customGroup) {
            customGroup.setAttribute('hidden', 'hidden');
            customGroup.style.display = 'none';
          }
          reportsState.customRange = null;
        }

        updateReportsDateIndicator();
      });
    });

    var startDate = document.getElementById('reportsStartDate');
    var endDate = document.getElementById('reportsEndDate');
    if (startDate) {
      startDate.addEventListener('change', function() {
        validateCustomDates();
      });
    }
    if (endDate) {
      endDate.addEventListener('change', function() {
        validateCustomDates();
      });
    }

    var generateBtn = document.getElementById('reportsGenerateBtn');
    if (generateBtn) {
      generateBtn.addEventListener('click', function() {
        var filters = getReportsFilters();
        reportsState.period = filters.period;
        reportsState.filters = filters;
        if (filters.period === 'custom') {
          var sEl = document.getElementById('reportsStartDate');
          var eEl = document.getElementById('reportsEndDate');
          if (sEl && sEl.value && eEl && eEl.value) {
            reportsState.customRange = { start: sEl.value, end: eEl.value };
          }
        }
        generateReportsReport();
      });
    }

    var resetBtn = document.getElementById('reportsResetBtn');
    if (resetBtn) {
      resetBtn.addEventListener('click', function() {
        resetReportsFilters();
      });
    }

    var deptEl = document.getElementById('reportsDeptFilter');
    if (deptEl) {
      deptEl.addEventListener('change', function() {
        applyReportsFilters();
      });
    }

    var empEl = document.getElementById('reportsEmployeeFilter');
    if (empEl) {
      empEl.addEventListener('change', function() {
        applyReportsFilters();
      });
    }

    var statusEl = document.getElementById('reportsStatusFilter');
    if (statusEl) {
      statusEl.addEventListener('change', function() {
        applyReportsFilters();
      });
    }

    var locEl = document.getElementById('reportsLocationFilter');
    if (locEl) {
      locEl.addEventListener('change', function() {
        applyReportsFilters();
      });
    }

    var container = document.getElementById('reportsResultsContainer');
    if (container) {
      container.addEventListener('click', function(e) {
        if (e.target && e.target.id === 'reportsRetryBtn') {
          loadReportsData();
        }
        if (e.target && e.target.id === 'reportsExportExcelBtn') {
          exportReportsToExcel();
        }
        if (e.target && e.target.id === 'reportsExportPdfBtn') {
          exportReportsToPdf();
        }
      });
    }

    // Also wire up via direct listeners if buttons exist at init time
    var excelBtn = document.getElementById('reportsExportExcelBtn');
    if (excelBtn) {
      excelBtn.addEventListener('click', exportReportsToExcel);
    }
    var pdfBtn = document.getElementById('reportsExportPdfBtn');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', exportReportsToPdf);
    }

    reportsState.initialized = true;
  }

  async function loadReportsSection() {
    initReports();
    await loadReportsData();
  }

  function validateCustomDates() {
    var startDate = document.getElementById('reportsStartDate');
    var endDate = document.getElementById('reportsEndDate');
    if (!startDate || !endDate) return;

    var sVal = startDate.value;
    var eVal = endDate.value;

    if (sVal && eVal) {
      var sDate = new Date(sVal);
      var eDate = new Date(eVal);

      if (eDate < sDate) {
        endDate.value = startDate.value;
      }

      reportsState.customRange = { start: sVal, end: endDate.value };
    }
  }

  // Reports navigation handled by setupNavigation nav handler calling loadReportsSection

  // Patch navigation to load analytics when clicked
  var originalSetupNavigation = setupNavigation;
  setupNavigation = function() {
    originalSetupNavigation();
    var navItems = document.querySelectorAll('.admin-nav-item[data-section]');
    navItems.forEach(function(item) {
      item.addEventListener('click', function() {
        var sectionId = this.getAttribute('data-section');
        if (sectionId === 'analytics') {
          setTimeout(function() {
            initAnalytics();
            loadAnalyticsData();
          }, 50);
        }
      });
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
