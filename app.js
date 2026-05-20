/**
 * NexaIoT App Core
 * Handles: routing, state, polling, all page rendering
 */
const App = (() => {

  // ── State ────────────────────────────────────────────────────────────────────
  const state = {
    page:        'dashboard',
    projects:    [],
    devices:     [],
    alerts:      [],
    stats:       {},
    deviceData:  {},  // { device_id: { field: [points] } }
    settings:    { refresh_interval: 10 },
    activeProject: null,
    editMode:    false,
    pollerTimer: null,
    pollerSecs:  10,
  };
  window.NEXAIOT.state = state;

  // ── Init ─────────────────────────────────────────────────────────────────────
  async function init() {
    if (!Auth.isLoggedIn()) { window.location.href = 'index.html'; return; }
    renderShell();
    await loadAll();
    navigate(state.page);
    startPoller();
  }

  async function loadAll() {
    showLoader(true);
    try {
      const [stats, devices, projects, alerts, settings] = await Promise.all([
        API.getStats(), API.getDevices(), API.getProjects(), API.getAlerts(), API.getSettings()
      ]);
      if (stats.ok)    state.stats    = stats.data;
      if (devices.ok)  state.devices  = devices.data;
      if (projects.ok) state.projects = projects.data;
      if (alerts.ok)   state.alerts   = alerts.data;
      if (settings.ok) {
        state.settings = settings.data;
        state.pollerSecs = Number(settings.data.refresh_interval) || 10;
      }
      // Pre-load data for all online devices
      await Promise.all(
        state.devices.filter(d => d.status === 'online').map(d =>
          API.getData(d.id, 50).then(r => { if (r.ok) state.deviceData[d.id] = r.data; })
        )
      );
    } catch(e) { Toast.error('Gagal memuat data: ' + e.message); }
    showLoader(false);
  }

  // ── Poller ───────────────────────────────────────────────────────────────────
  function startPoller() {
    stopPoller();
    state.pollerTimer = setInterval(async () => {
      try {
        const [stats, devices, alerts] = await Promise.all([
          API.getStats(), API.getDevices(), API.getAlerts()
        ]);
        if (stats.ok)   { state.stats   = stats.data;   updateStatCards(); }
        if (devices.ok) { state.devices = devices.data; updateDeviceBadges(); }
        if (alerts.ok)  { state.alerts  = alerts.data;  updateAlertBadge(); }
        // Refresh data for active project devices
        if (state.activeProject) {
          const projDevs = state.devices.filter(d => d.project_id === state.activeProject.id);
          await Promise.all(projDevs.map(d =>
            API.getData(d.id, 50).then(r => { if (r.ok) state.deviceData[d.id] = r.data; })
          ));
          if (state.page === 'project-view') renderProjectWidgets();
        }
        updateRefreshIndicator();
      } catch(_) {}
    }, state.pollerSecs * 1000);
  }

  function stopPoller() {
    if (state.pollerTimer) clearInterval(state.pollerTimer);
  }

  function setRefreshInterval(secs) {
    state.pollerSecs = secs;
    startPoller();
  }

  // ── Shell ────────────────────────────────────────────────────────────────────
  function renderShell() {
    const user = Auth.getUser();
    document.getElementById('app').innerHTML = `
    <aside class="sidebar" id="sidebar">
      <div class="logo">
        <div class="logo-mark">
          <div class="logo-icon"><i class="ti ti-circuit-board"></i></div>
          <div>
            <div class="logo-text">${state.settings.app_name || 'NexaIoT'}</div>
            <div class="logo-sub">PLATFORM v2.0</div>
          </div>
        </div>
      </div>
      <nav class="nav" id="sidebar-nav">
        <div class="nav-section">OVERVIEW</div>
        <div class="nav-item active" data-page="dashboard"><i class="ti ti-layout-dashboard"></i> Dashboard</div>
        <div class="nav-item" data-page="devices"><i class="ti ti-cpu"></i> Devices <span class="nav-badge" id="badge-devices">0</span></div>
        <div class="nav-item" data-page="monitoring"><i class="ti ti-chart-line"></i> Monitoring</div>
        <div class="nav-section">MANAGEMENT</div>
        <div class="nav-item" data-page="projects"><i class="ti ti-stack-2"></i> Projects</div>
        <div class="nav-item" data-page="analytics"><i class="ti ti-chart-bar"></i> Analytics</div>
        <div class="nav-item" data-page="alerts"><i class="ti ti-bell"></i> Alerts <span class="nav-badge nav-badge-red" id="badge-alerts">0</span></div>
        <div class="nav-item" data-page="cloud"><i class="ti ti-cloud"></i> Cloud Sync</div>
        <div class="nav-item" data-page="automation"><i class="ti ti-robot"></i> Automation</div>
        <div class="nav-section">SYSTEM</div>
        <div class="nav-item" data-page="settings"><i class="ti ti-settings"></i> Settings</div>
        <div class="nav-item" data-page="api"><i class="ti ti-api"></i> API & Tokens</div>
      </nav>
      <div class="sidebar-footer">
        <div class="user-card">
          <div class="avatar">${(user?.username||'U').substring(0,2).toUpperCase()}</div>
          <div class="user-info">
            <div class="user-name">${user?.username}</div>
            <div class="user-role">${user?.role}</div>
          </div>
          <button class="icon-btn" onclick="Auth.logout()" title="Logout"><i class="ti ti-logout"></i></button>
        </div>
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <div>
          <div class="topbar-title" id="page-title">Dashboard</div>
          <div class="topbar-path" id="page-path">nexaiot / overview</div>
        </div>
        <div class="topbar-right">
          <div class="search-wrap">
            <i class="ti ti-search"></i>
            <input type="text" class="form-input" id="global-search" placeholder="Cari device, project..." oninput="App.search(this.value)">
          </div>
          <div class="refresh-indicator" id="refresh-indicator" title="Auto-refresh aktif">
            <i class="ti ti-refresh"></i>
            <span id="refresh-interval-label">${state.pollerSecs}s</span>
          </div>
          <button class="icon-btn notif-dot" id="btn-notif" title="Alerts" onclick="navigate('alerts')"><i class="ti ti-bell"></i></button>
          <button class="btn btn-primary" id="btn-new-project" onclick="showNewProjectModal()">
            <i class="ti ti-plus"></i> New Project
          </button>
        </div>
      </header>

      <div class="content" id="content">
        <div class="loader-overlay" id="loader"><div class="spinner"></div></div>
      </div>
    </main>

    <div class="modal-backdrop" id="modal-backdrop" onclick="closeModal()"></div>
    <div class="modal" id="modal"></div>
    <div class="toast-container" id="toast-container"></div>`;

    // Nav click handlers
    document.getElementById('sidebar-nav').querySelectorAll('.nav-item[data-page]').forEach(el => {
      el.addEventListener('click', () => navigate(el.dataset.page));
    });

    updateDeviceBadges();
    updateAlertBadge();
  }

  // ── Navigation ───────────────────────────────────────────────────────────────
  function navigate(page, params) {
    state.page = page;
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (navEl) navEl.classList.add('active');
    const pageMeta = {
      dashboard:    { title: 'Dashboard',    path: 'nexaiot / overview' },
      devices:      { title: 'Devices',      path: 'nexaiot / devices' },
      monitoring:   { title: 'Monitoring',   path: 'nexaiot / monitoring' },
      projects:     { title: 'Projects',     path: 'nexaiot / projects' },
      analytics:    { title: 'Analytics',    path: 'nexaiot / analytics' },
      alerts:       { title: 'Alerts',       path: 'nexaiot / alerts' },
      cloud:        { title: 'Cloud Sync',   path: 'nexaiot / cloud' },
      automation:   { title: 'Automation',   path: 'nexaiot / automation' },
      settings:     { title: 'Settings',     path: 'nexaiot / settings' },
      api:          { title: 'API & Tokens', path: 'nexaiot / api' },
      'project-view': { title: params?.name || 'Project', path: 'nexaiot / projects / ' + (params?.name||'') },
    };
    const meta = pageMeta[page] || { title: page, path: 'nexaiot' };
    document.getElementById('page-title').textContent = meta.title;
    document.getElementById('page-path').textContent  = meta.path;
    renderPage(page, params);
  }

  // ── Page Renderer ────────────────────────────────────────────────────────────
  function renderPage(page, params) {
    const content = document.getElementById('content');
    const loaderEl = document.getElementById('loader');
    switch(page) {
      case 'dashboard':     content.innerHTML = loaderEl.outerHTML + renderDashboard();    break;
      case 'devices':       content.innerHTML = loaderEl.outerHTML + renderDevices();      break;
      case 'monitoring':    content.innerHTML = loaderEl.outerHTML + renderMonitoring();   break;
      case 'projects':      content.innerHTML = loaderEl.outerHTML + renderProjects();     break;
      case 'project-view':  renderProjectView(params);                                    break;
      case 'analytics':     content.innerHTML = loaderEl.outerHTML + renderAnalytics();   break;
      case 'alerts':        content.innerHTML = loaderEl.outerHTML + renderAlerts();       break;
      case 'cloud':         content.innerHTML = loaderEl.outerHTML + renderCloud();        break;
      case 'automation':    content.innerHTML = loaderEl.outerHTML + renderAutomation();   break;
      case 'settings':      content.innerHTML = loaderEl.outerHTML + renderSettings();     break;
      case 'api':           content.innerHTML = loaderEl.outerHTML + renderAPI();          break;
      default:              content.innerHTML = loaderEl.outerHTML + '<div class="page-placeholder">Coming soon</div>';
    }
    // Run inline scripts (for charts/maps)
    content.querySelectorAll('script').forEach(s => {
      const ns = document.createElement('script');
      ns.textContent = s.textContent;
      s.parentNode.replaceChild(ns, s);
    });
  }

  // ── Dashboard ────────────────────────────────────────────────────────────────
  function renderDashboard() {
    const s = state.stats;
    const onlineDevs = state.devices.filter(d => d.status === 'online');
    const offlineDevs = state.devices.filter(d => d.status !== 'online');
    const openAlerts  = state.alerts.filter(a => !a.resolved);

    return `
    <div id="page-dashboard">
      <div class="stats-grid" id="stat-cards">
        ${statCard('ACTIVE DEVICES',    s.online_devices||0,         'ti-cpu',      'var(--accent)',  `+${s.total_devices||0} total`)}
        ${statCard('SYSTEM UPTIME',     (s.uptime_pct||0)+'%',       'ti-heartbeat','var(--success)', 'real-time')}
        ${statCard('DATA POINTS / HR',  fmtNum(s.data_points_hour||0),'ti-database', 'var(--accent2)', 'last hour')}
        ${statCard('ACTIVE ALERTS',     openAlerts.length,           'ti-bell',     openAlerts.length?'var(--warn)':'var(--success)', 'need attention')}
      </div>

      <div class="section-header">
        <div class="section-title">Perangkat Aktif</div>
        <button class="btn btn-ghost btn-sm" onclick="navigate('devices')">Lihat Semua <i class="ti ti-arrow-right"></i></button>
      </div>
      <div class="devices-grid" id="device-cards">
        ${state.devices.slice(0,6).map(d => renderDeviceCard(d)).join('') || '<div class="empty-state"><i class="ti ti-cpu"></i><p>Belum ada device. <a href="#" onclick="showAddDeviceModal()">Tambah sekarang</a></p></div>'}
      </div>

      <div class="two-col">
        <div class="panel">
          <div class="panel-header">
            <span class="panel-title">Activity Log</span>
            <button class="btn btn-ghost btn-sm" onclick="navigate('alerts')">
              <i class="ti ti-filter"></i> Filter
            </button>
          </div>
          <div class="log-list">
            ${state.alerts.slice(0,8).map(a => logItem(a)).join('') || '<div class="log-empty">Tidak ada aktivitas</div>'}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:14px">
          <div class="panel">
            <div class="panel-header">
              <span class="panel-title">Active Alerts</span>
              <span class="status-pill pill-${openAlerts.length?'offline':'active'}">${openAlerts.length} open</span>
            </div>
            ${openAlerts.slice(0,3).map(a => alertItem(a)).join('') || '<div class="log-empty">No active alerts 🎉</div>'}
          </div>
          <div class="panel" style="padding:16px 18px">
            <div style="font-size:13px;font-weight:600;margin-bottom:14px">Resource Usage</div>
            ${progressBar('Devices Used',   Math.round(((s.online_devices||0)/(s.total_devices||1))*100), 'var(--accent)')}
            ${progressBar('Active Alerts',  Math.min(100, (openAlerts.length)*20), openAlerts.length?'var(--warn)':'var(--accent)')}
            ${progressBar('Data Rate',      Math.min(100, Math.round((s.data_points_hour||0)/100)), 'var(--accent2)')}
          </div>
        </div>
      </div>
    </div>`;
  }

  function statCard(label, value, icon, color, sub) {
    return `
    <div class="stat-card" id="stat-${label.replace(/\s/g,'_').toLowerCase()}">
      <div class="stat-top">
        <span class="stat-label">${label}</span>
        <div class="stat-icon" style="background:${color}22;color:${color}"><i class="ti ${icon}"></i></div>
      </div>
      <div class="stat-value" style="color:${color}">${value}</div>
      <div class="stat-sub">${sub}</div>
    </div>`;
  }

  function renderDeviceCard(d) {
    const statusColor = { online:'var(--success)', offline:'var(--danger)', warning:'var(--warn)' };
    const sc = statusColor[d.status] || 'var(--text3)';
    const lastData = state.deviceData[d.id] || {};
    const fields   = Object.keys(lastData).slice(0,4);
    const metrics  = fields.map(f => {
      const pts = lastData[f] || [];
      const latest = pts.length ? pts[pts.length-1] : null;
      return `<div class="metric-item">
        <div class="metric-label">${f.toUpperCase()}</div>
        <div class="metric-value" style="color:${sc}">${latest ? Number(latest.value).toFixed(1)+(latest.unit?` ${latest.unit}`:'') : '—'}</div>
      </div>`;
    }).join('');

    return `
    <div class="device-card ${d.status}" onclick="showDeviceDetail('${d.id}')">
      <div class="device-header">
        <div>
          <div class="device-name">${d.name}</div>
          <div class="device-type">${d.type} · ${d.project_id ? (state.projects.find(p=>p.id===d.project_id)?.name||d.project_id) : 'No project'}</div>
        </div>
        <div class="device-status" style="color:${sc}">
          <div class="status-dot ${d.status}"></div>${d.status.toUpperCase()}
        </div>
      </div>
      ${metrics ? `<div class="device-metrics">${metrics}</div>` : '<div class="no-data-hint">Menunggu data...</div>'}
      <div class="mini-chart">${makeMiniChart(lastData, fields[0])}</div>
    </div>`;
  }

  function makeMiniChart(data, field) {
    if (!field) return '';
    const pts  = (data[field] || []).slice(-15);
    if (!pts.length) return '';
    const vals = pts.map(p => Number(p.value));
    const max  = Math.max(...vals) || 1;
    return pts.map(p => {
      const h = Math.max(4, Math.round((Number(p.value)/max)*100));
      return `<div class="chart-bar" style="height:${h}%"></div>`;
    }).join('');
  }

  function logItem(a) {
    const icons = { critical:'ti-alert-circle danger', warning:'ti-alert-triangle warning', info:'ti-info-circle info' };
    const ic = icons[a.severity] || 'ti-circle-dot info';
    return `
    <div class="log-item">
      <div class="log-icon ${a.severity||'info'}"><i class="ti ${ic.split(' ')[0]}"></i></div>
      <div>
        <div class="log-msg">${a.title}: ${a.message}</div>
        <div class="log-time">${fmtDateTime(a.created_at)}</div>
      </div>
    </div>`;
  }

  function alertItem(a) {
    const colors = { critical:'var(--danger)', warning:'var(--warn)', info:'var(--accent2)' };
    return `
    <div class="alert-item">
      <div class="alert-dot" style="background:${colors[a.severity]||'var(--warn)'}"></div>
      <div class="alert-text">
        <div class="alert-title">${a.title}</div>
        <div class="alert-sub">${fmtDateTime(a.created_at)}</div>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="resolveAlert('${a.id}')">Fix</button>
    </div>`;
  }

  function progressBar(label, pct, color) {
    return `
    <div class="progress-row">
      <span class="progress-label">${label}</span>
      <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:${pct}%;background:${color}"></div></div>
      <span class="progress-val">${pct}%</span>
    </div>`;
  }

  // ── Devices Page ─────────────────────────────────────────────────────────────
  function renderDevices() {
    return `
    <div id="page-devices">
      <div class="section-header" style="margin-bottom:20px">
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <div class="search-wrap" style="width:220px">
            <i class="ti ti-search"></i>
            <input type="text" class="form-input" placeholder="Cari device..." id="dev-search" oninput="filterDevices(this.value)" style="height:34px;padding-top:6px;padding-bottom:6px">
          </div>
          <select class="form-input" style="width:140px;height:34px;padding:6px 10px" onchange="filterDevices(null, this.value)">
            <option value="">Semua Status</option>
            <option value="online">Online</option>
            <option value="offline">Offline</option>
          </select>
        </div>
        <button class="btn btn-primary" onclick="showAddDeviceModal()"><i class="ti ti-plus"></i> Tambah Device</button>
      </div>
      <div class="panel">
        <table>
          <thead><tr><th>DEVICE NAME</th><th>TYPE</th><th>STATUS</th><th>LAST SEEN</th><th>IP</th><th>PROJECT</th><th>FIRMWARE</th><th>ACTIONS</th></tr></thead>
          <tbody id="devices-table-body">
            ${state.devices.map(d => deviceTableRow(d)).join('') || '<tr><td colspan="8" class="empty-cell">Belum ada device</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>`;
  }

  function deviceTableRow(d) {
    const sc = { online:'var(--success)', offline:'var(--danger)', warning:'var(--warn)' };
    const proj = state.projects.find(p => p.id === d.project_id);
    return `<tr>
      <td><span style="font-weight:600">${d.name}</span></td>
      <td><span class="tag tag-teal">${d.type}</span></td>
      <td><div style="display:flex;align-items:center;gap:6px">
        <div class="status-dot ${d.status}"></div>
        <span style="color:${sc[d.status]||'var(--text3)'};font-family:var(--mono);font-size:11px">${d.status.toUpperCase()}</span>
      </div></td>
      <td style="color:var(--text3);font-family:var(--mono);font-size:11px">${d.last_seen ? fmtDateTime(d.last_seen) : '—'}</td>
      <td style="font-family:var(--mono);font-size:12px">${d.ip || '—'}</td>
      <td>${proj ? `<span class="tag tag-blue">${proj.name}</span>` : '—'}</td>
      <td style="font-family:var(--mono);font-size:12px;color:var(--text3)">${d.firmware||'—'}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="icon-btn" title="Monitor" onclick="showDeviceMonitor('${d.id}')"><i class="ti ti-chart-line"></i></button>
          <button class="icon-btn" title="Edit" onclick="showEditDeviceModal('${d.id}')"><i class="ti ti-edit"></i></button>
          <button class="icon-btn" title="Delete" style="color:var(--danger)" onclick="deleteDevice('${d.id}')"><i class="ti ti-trash"></i></button>
        </div>
      </td>
    </tr>`;
  }

  // ── Monitoring Page ──────────────────────────────────────────────────────────
  function renderMonitoring() {
    const onlineDevs = state.devices.filter(d => d.status === 'online');
    const first = onlineDevs[0];
    return `
    <div id="page-monitoring">
      <div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap;align-items:center">
        <select class="form-input" style="width:220px;height:34px;padding:6px 10px" id="mon-device-select" onchange="loadMonitorData(this.value)">
          <option value="">Pilih Device...</option>
          ${state.devices.map(d => `<option value="${d.id}" ${first&&d.id===first.id?'selected':''}>${d.name} (${d.status})</option>`).join('')}
        </select>
        <select class="form-input" style="width:140px;height:34px;padding:6px 10px" id="mon-limit-select" onchange="loadMonitorData(document.getElementById('mon-device-select').value)">
          <option value="30">30 data</option>
          <option value="50" selected>50 data</option>
          <option value="100">100 data</option>
          <option value="200">200 data</option>
        </select>
        <button class="btn btn-ghost btn-sm" onclick="loadMonitorData(document.getElementById('mon-device-select').value)"><i class="ti ti-refresh"></i> Refresh</button>
        <button class="btn btn-ghost btn-sm" onclick="exportCSV()"><i class="ti ti-download"></i> Export CSV</button>
      </div>
      <div id="monitor-content">
        <div class="empty-state"><i class="ti ti-chart-line"></i><p>Pilih device untuk melihat data</p></div>
      </div>
    </div>`;
  }

  async function loadMonitorData(deviceId) {
    if (!deviceId) return;
    const limit = document.getElementById('mon-limit-select')?.value || 50;
    showLoader(true);
    const res = await API.getData(deviceId, limit);
    showLoader(false);
    if (!res.ok) { Toast.error('Gagal memuat data'); return; }
    const data   = res.data;
    const fields = Object.keys(data);
    const device = state.devices.find(d => d.id === deviceId);
    state.deviceData[deviceId] = data;
    const el = document.getElementById('monitor-content');
    if (!el) return;
    if (!fields.length) {
      el.innerHTML = '<div class="empty-state"><i class="ti ti-database"></i><p>Device belum mengirim data</p></div>';
      return;
    }
    el.innerHTML = `
      <div class="widget-grid" style="margin-bottom:14px">
        ${fields.map(f => {
          const pts    = data[f] || [];
          const latest = pts.length ? pts[pts.length-1] : null;
          const unit   = latest?.unit || '';
          const w = { id: deviceId+'_'+f, type:'line-chart', config: { title:f, field:f, unit, limit:Number(limit) }, title:f };
          return `<div class="chart-panel">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <div>
                <div style="font-size:11px;color:var(--text3);font-family:var(--mono)">${f.toUpperCase()}</div>
                <div style="font-size:22px;font-weight:700;color:var(--accent);margin-top:2px">${latest ? Number(latest.value).toFixed(2) : '—'} <span style="font-size:14px">${unit}</span></div>
              </div>
              <span class="status-pill pill-active">LIVE</span>
            </div>
            ${Widgets.render(w, data)}
          </div>`;
        }).join('')}
      </div>
      <div class="section-header"><div class="section-title">Data Stream — ${device?.name||deviceId}</div></div>
      <div class="panel">
        <table>
          <thead><tr><th>TIMESTAMP</th>${fields.map(f=>`<th>${f.toUpperCase()}</th>`).join('')}</tr></thead>
          <tbody>
            ${buildDataTable(data, fields)}
          </tbody>
        </table>
      </div>`;
    // Run scripts
    el.querySelectorAll('script').forEach(s => {
      const ns = document.createElement('script'); ns.textContent = s.textContent;
      s.parentNode.replaceChild(ns, s);
    });
  }

  function buildDataTable(data, fields) {
    const tsSet = new Set();
    fields.forEach(f => (data[f]||[]).forEach(p => tsSet.add(p.timestamp)));
    const timestamps = [...tsSet].sort().reverse().slice(0,50);
    return timestamps.map(ts => {
      const cells = fields.map(f => {
        const pt = (data[f]||[]).find(p => p.timestamp === ts);
        return `<td style="font-family:var(--mono);font-size:12px">${pt ? Number(pt.value).toFixed(2)+(pt.unit?' '+pt.unit:'') : '—'}</td>`;
      });
      return `<tr><td style="font-family:var(--mono);font-size:11px;color:var(--text3)">${fmtDateTime(ts)}</td>${cells.join('')}</tr>`;
    }).join('') || '<tr><td colspan="99" class="empty-cell">Belum ada data</td></tr>';
  }

  function exportCSV() {
    const deviceId = document.getElementById('mon-device-select')?.value;
    if (!deviceId) return;
    const data   = state.deviceData[deviceId] || {};
    const fields = Object.keys(data);
    const tsSet  = new Set();
    fields.forEach(f => (data[f]||[]).forEach(p => tsSet.add(p.timestamp)));
    const timestamps = [...tsSet].sort();
    const header = ['timestamp', ...fields].join(',');
    const rows   = timestamps.map(ts => {
      const cells = fields.map(f => { const pt = (data[f]||[]).find(p=>p.timestamp===ts); return pt ? pt.value : ''; });
      return [ts, ...cells].join(',');
    });
    const csv = [header, ...rows].join('\n');
    const a   = document.createElement('a');
    a.href    = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `nexaiot_${deviceId}_${Date.now()}.csv`;
    a.click();
  }

  // ── Projects Page ────────────────────────────────────────────────────────────
  function renderProjects() {
    return `
    <div id="page-projects">
      <div class="section-header" style="margin-bottom:20px">
        <div class="search-wrap" style="width:220px">
          <i class="ti ti-search"></i>
          <input type="text" class="form-input" placeholder="Cari project..." style="height:34px;padding-top:6px;padding-bottom:6px">
        </div>
        <button class="btn btn-primary" onclick="showNewProjectModal()"><i class="ti ti-plus"></i> New Project</button>
      </div>
      <div class="projects-grid">
        <div class="project-card new-project" onclick="showNewProjectModal()">
          <i class="ti ti-plus"></i>
          <div class="np-title">Create New Project</div>
          <div class="np-sub">Tambah dashboard IoT baru</div>
        </div>
        ${state.projects.map(p => projectCard(p)).join('')}
      </div>
    </div>`;
  }

  function projectCard(p) {
    let widgets = [];
    try { widgets = JSON.parse(p.widgets_json || '[]'); } catch(_){}
    const devs   = state.devices.filter(d => d.project_id === p.id);
    const online = devs.filter(d => d.status === 'online').length;
    const status = devs.length ? (online === devs.length ? 'active' : online > 0 ? 'warning' : 'offline') : 'active';
    const icons  = ['ti-home','ti-bolt','ti-plant','ti-camera','ti-thermometer','ti-waves'];
    const icon   = icons[Math.abs(hashStr(p.id)) % icons.length];
    const colors = ['var(--accent)','var(--accent2)','var(--accent3)','var(--warn)','var(--success)'];
    const color  = colors[Math.abs(hashStr(p.name)) % colors.length];
    return `
    <div class="project-card" onclick="openProject('${p.id}')">
      <div class="project-color" style="background:${color}22;color:${color}"><i class="ti ${icon}"></i></div>
      <div class="project-name">${p.name}</div>
      <div class="project-desc">${p.description || 'No description'}</div>
      <div style="margin-bottom:10px">
        <span class="tag tag-teal">${devs.length} device${devs.length!==1?'s':''}</span>
        <span class="tag tag-blue">${widgets.length} widget${widgets.length!==1?'s':''}</span>
      </div>
      <div class="project-footer">
        <div class="project-devices"><i class="ti ti-clock" style="font-size:12px"></i> ${fmtDateTime(p.created_at)}</div>
        <span class="status-pill pill-${status}">${status.toUpperCase()}</span>
      </div>
    </div>`;
  }

  // ── Project View (Dashboard editor) ─────────────────────────────────────────
  function renderProjectView(proj) {
    state.activeProject = proj;
    let widgets = [];
    try { widgets = JSON.parse(proj.widgets_json || '[]'); } catch(_){}
    state.activeWidgets = widgets;
    const devs = state.devices.filter(d => d.project_id === proj.id);
    const content = document.getElementById('content');
    content.innerHTML = `
    <div id="page-project-view">
      <div class="pv-toolbar">
        <div style="display:flex;align-items:center;gap:12px">
          <button class="btn btn-ghost btn-sm" onclick="navigate('projects')"><i class="ti ti-arrow-left"></i> Back</button>
          <span style="font-size:15px;font-weight:600">${proj.name}</span>
          <span class="status-pill pill-active">${devs.length} device${devs.length!==1?'s':''}</span>
        </div>
        <div style="display:flex;gap:10px">
          <button class="btn btn-ghost btn-sm" id="btn-edit-toggle" onclick="toggleEditMode()">
            <i class="ti ti-edit"></i> Edit Dashboard
          </button>
          <button class="btn btn-primary btn-sm" onclick="showAddWidgetModal()" id="btn-add-widget" style="display:none">
            <i class="ti ti-plus"></i> Add Widget
          </button>
          <button class="btn btn-ghost btn-sm" onclick="saveWidgets()" id="btn-save-widgets" style="display:none">
            <i class="ti ti-device-floppy"></i> Save
          </button>
        </div>
      </div>

      <div class="pv-device-bar">
        ${devs.map(d => `
          <div class="pv-device-pill ${d.status}">
            <div class="status-dot ${d.status}"></div>
            ${d.name}
          </div>`).join('') || '<span style="color:var(--text3);font-size:12px">Belum ada device terhubung ke project ini</span>'}
        <button class="btn btn-ghost btn-sm" style="margin-left:auto" onclick="showAssignDeviceModal('${proj.id}')">
          <i class="ti ti-link"></i> Assign Device
        </button>
      </div>

      <div class="widget-canvas ${widgets.length?'':'empty'}" id="widget-canvas">
        ${widgets.length ? '' : `
          <div class="canvas-empty">
            <i class="ti ti-layout-grid"></i>
            <p>Dashboard masih kosong</p>
            <button class="btn btn-primary" onclick="toggleEditMode(); showAddWidgetModal()">
              <i class="ti ti-plus"></i> Tambah Widget Pertama
            </button>
          </div>`}
      </div>
    </div>`;

    // Load device data then render widgets
    Promise.all(devs.map(d =>
      API.getData(d.id, 50).then(r => { if (r.ok) state.deviceData[d.id] = r.data; })
    )).then(renderProjectWidgets);
  }

  function renderProjectWidgets() {
    const canvas  = document.getElementById('widget-canvas');
    if (!canvas) return;
    const widgets = state.activeWidgets || [];
    if (!widgets.length) return;
    const proj    = state.activeProject;
    const devs    = state.devices.filter(d => d.project_id === proj.id);
    canvas.classList.remove('empty');
    canvas.innerHTML = widgets.map((w, i) => {
      const device  = devs.find(d => d.id === w.device_id) || devs[0];
      const data    = device ? (state.deviceData[device.id] || {}) : {};
      return `
      <div class="widget-container ${state.editMode?'edit-mode':''}" id="wc_${w.id}" style="grid-column:span ${w.colspan||2}">
        <div class="widget-header">
          <span class="widget-title"><i class="ti ${Widgets.getTypes()[w.type]?.icon||'ti-square'}"></i> ${w.title||w.type}</span>
          <div class="widget-actions">
            <span class="tag tag-blue" style="font-size:10px">${device?.name||'—'}</span>
            ${state.editMode ? `
              <button class="icon-btn btn-xs" onclick="editWidget(${i})" title="Edit"><i class="ti ti-edit"></i></button>
              <button class="icon-btn btn-xs" style="color:var(--danger)" onclick="removeWidget(${i})" title="Remove"><i class="ti ti-trash"></i></button>
            ` : ''}
          </div>
        </div>
        ${Widgets.render(w, data, device?.id)}
      </div>`;
    }).join('');
    // Run scripts inside widgets
    canvas.querySelectorAll('script').forEach(s => {
      const ns = document.createElement('script'); ns.textContent = s.textContent;
      s.parentNode.replaceChild(ns, s);
    });
  }

  function toggleEditMode() {
    state.editMode = !state.editMode;
    const btn    = document.getElementById('btn-edit-toggle');
    const addBtn = document.getElementById('btn-add-widget');
    const saveBtn= document.getElementById('btn-save-widgets');
    if (btn) btn.innerHTML = state.editMode ? '<i class="ti ti-check"></i> Done Editing' : '<i class="ti ti-edit"></i> Edit Dashboard';
    if (addBtn)  addBtn.style.display  = state.editMode ? '' : 'none';
    if (saveBtn) saveBtn.style.display = state.editMode ? '' : 'none';
    renderProjectWidgets();
  }

  function removeWidget(idx) {
    state.activeWidgets.splice(idx, 1);
    renderProjectWidgets();
  }

  async function saveWidgets() {
    const proj = state.activeProject;
    if (!proj) return;
    showLoader(true);
    const res = await API.saveWidgets(proj.id, state.activeWidgets);
    showLoader(false);
    if (res.ok) { Toast.success('Dashboard disimpan!'); proj.widgets_json = JSON.stringify(state.activeWidgets); }
    else Toast.error('Gagal menyimpan: ' + res.error);
  }

  // ── Add Widget Modal ─────────────────────────────────────────────────────────
  function showAddWidgetModal(editIdx) {
    const isEdit  = editIdx !== undefined;
    const existing= isEdit ? state.activeWidgets[editIdx] : null;
    const types   = Widgets.getTypes();
    const devs    = state.devices.filter(d => d.project_id === state.activeProject?.id);
    const selType = existing?.type || 'value-card';

    showModal(`
      <div class="modal-header"><h3>${isEdit?'Edit':'Add'} Widget</h3><button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button></div>
      <div class="modal-body">
        <div class="form-group">
          <label class="form-label">Widget Type</label>
          <div class="widget-type-grid" id="widget-type-grid">
            ${Object.entries(types).map(([k,v]) => `
              <div class="widget-type-card ${k===selType?'selected':''}" onclick="selectWidgetType('${k}')" data-type="${k}">
                <i class="ti ${v.icon}"></i>
                <span>${v.label}</span>
              </div>`).join('')}
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Device</label>
          <select class="form-input" id="wf-device">
            ${devs.map(d => `<option value="${d.id}" ${existing?.device_id===d.id?'selected':''}>${d.name}</option>`).join('') || '<option value="">No devices</option>'}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Widget Title</label>
          <input class="form-input" id="wf-title" value="${existing?.title||''}">
        </div>
        <div class="form-group">
          <label class="form-label">Column Span</label>
          <select class="form-input" id="wf-colspan">
            <option value="1" ${existing?.colspan===1?'selected':''}>1 col (narrow)</option>
            <option value="2" ${!existing||existing?.colspan===2?'selected':''}>2 cols (normal)</option>
            <option value="3" ${existing?.colspan===3?'selected':''}>3 cols (wide)</option>
            <option value="4" ${existing?.colspan===4?'selected':''}>4 cols (full)</option>
          </select>
        </div>
        <div id="widget-config-fields">
          ${Widgets.buildConfigForm(selType, existing?.config)}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="confirmAddWidget(${isEdit?editIdx:'undefined'})">
          ${isEdit ? 'Update Widget' : 'Add Widget'}
        </button>
      </div>`);
  }

  function selectWidgetType(type) {
    document.querySelectorAll('.widget-type-card').forEach(el => el.classList.remove('selected'));
    document.querySelector(`.widget-type-card[data-type="${type}"]`)?.classList.add('selected');
    document.getElementById('widget-config-fields').innerHTML = Widgets.buildConfigForm(type, null);
  }

  function confirmAddWidget(editIdx) {
    const type     = document.querySelector('.widget-type-card.selected')?.dataset.type || 'value-card';
    const deviceId = document.getElementById('wf-device')?.value;
    const title    = document.getElementById('wf-title')?.value || type;
    const colspan  = Number(document.getElementById('wf-colspan')?.value) || 2;
    const config   = {};
    document.querySelectorAll('#widget-config-fields [name]').forEach(el => {
      config[el.name] = el.value;
    });
    const widget = {
      id:        editIdx !== undefined ? state.activeWidgets[editIdx].id : uid(),
      type, title, device_id: deviceId, colspan, config
    };
    if (editIdx !== undefined) state.activeWidgets[editIdx] = widget;
    else state.activeWidgets.push(widget);
    closeModal();
    renderProjectWidgets();
  }

  function editWidget(idx) { showAddWidgetModal(idx); }

  // ── Alerts Page ──────────────────────────────────────────────────────────────
  function renderAlerts() {
    const open     = state.alerts.filter(a => !a.resolved);
    const resolved = state.alerts.filter(a => a.resolved);
    return `
    <div id="page-alerts">
      <div class="section-header" style="margin-bottom:20px">
        <div style="display:flex;gap:8px">
          <span class="btn btn-ghost btn-sm" style="color:var(--danger)">Critical (${open.filter(a=>a.severity==='critical').length})</span>
          <span class="btn btn-ghost btn-sm" style="color:var(--warn)">Warning (${open.filter(a=>a.severity==='warning').length})</span>
        </div>
        <button class="btn btn-primary" onclick="showCreateAlertModal()"><i class="ti ti-plus"></i> Create Alert</button>
      </div>
      <div class="section-title" style="margin-bottom:12px">Active Alerts</div>
      <div class="panel" style="margin-bottom:18px">
        ${open.length ? open.map(a => fullAlertRow(a)).join('') : '<div class="log-empty">No active alerts 🎉</div>'}
      </div>
      <div class="section-title" style="margin-bottom:12px">Resolved (${resolved.length})</div>
      <div class="panel">
        ${resolved.slice(0,10).map(a => fullAlertRow(a, true)).join('') || '<div class="log-empty">No resolved alerts</div>'}
      </div>
    </div>`;
  }

  function fullAlertRow(a, isResolved) {
    const colors = { critical:'var(--danger)', warning:'var(--warn)', info:'var(--accent2)' };
    const device = state.devices.find(d => d.id === a.device_id);
    return `
    <div class="full-alert-row ${a.severity} ${isResolved?'resolved':''}">
      <div style="width:36px;height:36px;border-radius:8px;background:${colors[a.severity]||'var(--warn)'}22;color:${colors[a.severity]||'var(--warn)'};display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">
        <i class="ti ${a.severity==='critical'?'ti-alert-circle':a.severity==='warning'?'ti-alert-triangle':'ti-info-circle'}"></i>
      </div>
      <div style="flex:1">
        <div style="font-size:13.5px;font-weight:500">${a.title}</div>
        <div style="font-size:12px;color:var(--text3);margin-top:2px">${a.message}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:4px">${device?device.name:'Unknown device'} · ${fmtDateTime(a.created_at)}</div>
      </div>
      <span class="status-pill pill-${isResolved?'active':'offline'}">${isResolved?'RESOLVED':a.severity.toUpperCase()}</span>
      ${!isResolved ? `<button class="btn btn-ghost btn-sm" onclick="resolveAlert('${a.id}')" style="margin-left:8px">Resolve</button>` : ''}
    </div>`;
  }

  async function resolveAlert(id) {
    const res = await API.resolveAlert(id);
    if (res.ok) {
      state.alerts = state.alerts.map(a => a.id === id ? {...a, resolved: new Date().toISOString()} : a);
      updateAlertBadge();
      if (state.page === 'alerts') renderPage('alerts');
      Toast.success('Alert resolved');
    } else Toast.error(res.error);
  }

  // ── Analytics ────────────────────────────────────────────────────────────────
  function renderAnalytics() {
    const s = state.stats;
    return `
    <div id="page-analytics">
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:24px">
        ${statCard('TOTAL DEVICES',  s.total_devices||0,       'ti-cpu',      'var(--accent)',  'all registered')}
        ${statCard('ONLINE NOW',     s.online_devices||0,      'ti-wifi',     'var(--success)', 'currently connected')}
        ${statCard('DATA/HOUR',      fmtNum(s.data_points_hour||0), 'ti-database','var(--accent2)', 'data points')}
      </div>
      <div class="two-col">
        <div class="panel" style="padding:18px">
          <div style="font-size:13px;font-weight:600;margin-bottom:16px">Device Uptime</div>
          ${state.devices.map(d => progressBar(d.name, d.status==='online'?100:0, d.status==='online'?'var(--accent)':'var(--danger)')).join('')||'<div class="log-empty">No devices</div>'}
        </div>
        <div class="panel" style="padding:18px">
          <div style="font-size:13px;font-weight:600;margin-bottom:16px">Projects</div>
          ${state.projects.map((p,i) => {
            const devs = state.devices.filter(d => d.project_id === p.id);
            const colors = ['var(--accent)','var(--accent2)','var(--accent3)','var(--warn)','var(--success)'];
            return `<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
              <div style="width:8px;height:8px;border-radius:50%;background:${colors[i%colors.length]};flex-shrink:0"></div>
              <span style="font-size:13px;flex:1">${p.name}</span>
              <span style="font-size:13px;font-family:var(--mono);color:var(--text2)">${devs.length} dev</span>
            </div>`;
          }).join('')||'<div class="log-empty">No projects</div>'}
        </div>
      </div>
    </div>`;
  }

  // ── Settings Page ────────────────────────────────────────────────────────────
  function renderSettings() {
    const user = Auth.getUser();
    const s    = state.settings;
    return `
    <div id="page-settings">
      <div style="display:grid;grid-template-columns:180px 1fr;gap:20px">
        <div style="display:flex;flex-direction:column;gap:2px">
          <div class="nav-section" style="padding:8px 10px">SETTINGS</div>
          <div class="nav-item active" onclick="showSettingsSection('profile',this)">Profile</div>
          <div class="nav-item" onclick="showSettingsSection('app',this)">App Settings</div>
          <div class="nav-item" onclick="showSettingsSection('refresh',this)">Refresh & Polling</div>
          <div class="nav-item" onclick="showSettingsSection('users',this)">User Management</div>
          <div class="nav-item" onclick="showSettingsSection('alerts',this)">Alert Rules</div>
        </div>
        <div id="settings-content">
          ${renderProfileSettings(user)}
        </div>
      </div>
    </div>`;
  }

  function renderProfileSettings(user) {
    return `<div class="panel" style="padding:24px">
      <div style="font-size:14px;font-weight:600;margin-bottom:20px">Profile Settings</div>
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px;padding-bottom:24px;border-bottom:1px solid var(--border)">
        <div class="avatar" style="width:56px;height:56px;font-size:18px">${(user?.username||'U').substring(0,2).toUpperCase()}</div>
        <div>
          <div style="font-size:14px;font-weight:500">${user?.username}</div>
          <div style="font-size:12px;color:var(--text3);margin-top:2px">${user?.role}</div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Username</label>
        <input class="form-input" value="${user?.username}" disabled style="opacity:0.6">
      </div>
      <div class="form-group">
        <label class="form-label">Role</label>
        <input class="form-input" value="${user?.role}" disabled style="opacity:0.6">
      </div>
      <button class="btn btn-primary" onclick="Auth.logout()"><i class="ti ti-logout"></i> Logout</button>
    </div>`;
  }

  function showSettingsSection(section, navEl) {
    document.querySelectorAll('#page-settings .nav-item').forEach(el => el.classList.remove('active'));
    if (navEl) navEl.classList.add('active');
    const el = document.getElementById('settings-content');
    const s  = state.settings;
    const sections = {
      profile: () => renderProfileSettings(Auth.getUser()),
      app: () => `<div class="panel" style="padding:24px">
        <div style="font-size:14px;font-weight:600;margin-bottom:20px">App Settings</div>
        <div class="form-group"><label class="form-label">App Name</label>
          <input class="form-input" id="set-appname" value="${s.app_name||'NexaIoT'}"></div>
        <button class="btn btn-primary" onclick="saveAppSettings()"><i class="ti ti-device-floppy"></i> Save</button>
      </div>`,
      refresh: () => `<div class="panel" style="padding:24px">
        <div style="font-size:14px;font-weight:600;margin-bottom:20px">Refresh & Polling</div>
        <div class="form-group"><label class="form-label">Refresh Interval (detik)</label>
          <input class="form-input" type="number" id="set-refresh" value="${s.refresh_interval||10}" min="5" max="300">
          <div class="form-hint" style="margin-top:6px">Min: 5s, Max: 300s. Lebih kecil = lebih sering polling Google Sheet.</div>
        </div>
        <button class="btn btn-primary" onclick="saveRefreshSettings()"><i class="ti ti-device-floppy"></i> Apply</button>
      </div>`,
      users: () => `<div class="panel" style="padding:24px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <div style="font-size:14px;font-weight:600">User Management</div>
          <button class="btn btn-primary btn-sm" onclick="showAddUserModal()"><i class="ti ti-plus"></i> Add User</button>
        </div>
        <div class="log-empty">Data user dikelola di Google Sheet tab "users".</div>
      </div>`,
      alerts: () => `<div class="panel" style="padding:24px">
        <div style="font-size:14px;font-weight:600;margin-bottom:20px">Alert Rules</div>
        <div class="form-group"><label class="form-label">Rules JSON</label>
          <textarea class="form-input" id="set-alertrules" rows="8" style="font-family:var(--mono);font-size:12px">${s.alert_rules||'[]'}</textarea>
          <div class="form-hint" style="margin-top:6px">Format: [{"field":"temp","condition":"gt","threshold":"35","severity":"warning","title":"Suhu tinggi"}]</div>
        </div>
        <button class="btn btn-primary" onclick="saveAlertRules()"><i class="ti ti-device-floppy"></i> Save Rules</button>
      </div>`,
    };
    el.innerHTML = sections[section] ? sections[section]() : '';
  }

  async function saveAppSettings() {
    const name = document.getElementById('set-appname')?.value;
    const res  = await API.saveSettings({ app_name: name });
    if (res.ok) { state.settings.app_name = name; Toast.success('Saved!'); }
    else Toast.error(res.error);
  }

  async function saveRefreshSettings() {
    const secs = Number(document.getElementById('set-refresh')?.value) || 10;
    const res  = await API.saveSettings({ refresh_interval: secs });
    if (res.ok) { state.settings.refresh_interval = secs; setRefreshInterval(secs); Toast.success('Refresh interval updated!'); }
    else Toast.error(res.error);
  }

  async function saveAlertRules() {
    const rules = document.getElementById('set-alertrules')?.value;
    try { JSON.parse(rules); } catch(_) { Toast.error('JSON tidak valid!'); return; }
    const res = await API.saveSettings({ alert_rules: rules });
    if (res.ok) { state.settings.alert_rules = rules; Toast.success('Alert rules saved!'); }
    else Toast.error(res.error);
  }

  // ── API Page ─────────────────────────────────────────────────────────────────
  function renderAPI() {
    const scriptUrl = window.NEXAIOT.config.APPS_SCRIPT_URL;
    return `
    <div id="page-api">
      <div class="panel" style="padding:24px;margin-bottom:14px">
        <div style="font-size:14px;font-weight:600;margin-bottom:16px">Apps Script URL</div>
        <div style="background:var(--bg3);border:1px solid var(--border2);border-radius:var(--r);padding:12px 16px;font-family:var(--mono);font-size:12px;word-break:break-all;margin-bottom:12px">${scriptUrl}</div>
      </div>
      <div class="panel" style="padding:24px">
        <div style="font-size:14px;font-weight:600;margin-bottom:16px">Contoh Kode Mikrokontroller (ESP32 Arduino)</div>
        <pre class="code-block">#include &lt;WiFi.h&gt;
#include &lt;HTTPClient.h&gt;
#include &lt;ArduinoJson.h&gt;

const char* ssid     = "YOUR_WIFI";
const char* password = "YOUR_PASSWORD";
const char* scriptUrl = "${scriptUrl}";
const char* deviceId  = "YOUR_DEVICE_ID";  // dari dashboard NexaIoT
const char* apiKey    = "YOUR_API_KEY";     // dari Settings → API Key

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) delay(500);
  Serial.println("WiFi connected");
}

void loop() {
  float temp     = 28.4;  // baca dari sensor
  float humidity = 67.0;

  HTTPClient http;
  http.begin(scriptUrl);
  http.addHeader("Content-Type", "application/json");

  String payload = "{";
  payload += "\\"action\\":\\"pushData\\",";
  payload += "\\"api_key\\":\\"" + String(apiKey) + "\\",";
  payload += "\\"device_id\\":\\"" + String(deviceId) + "\\",";
  payload += "\\"ip\\":\\"" + WiFi.localIP().toString() + "\\",";
  payload += "\\"readings\\":[";
  payload +=   "{\\"field\\":\\"temp\\",\\"value\\":" + String(temp) + ",\\"unit\\":\\"C\\"},";
  payload +=   "{\\"field\\":\\"humidity\\",\\"value\\":" + String(humidity) + ",\\"unit\\":\\"%\\"}";
  payload += "]}";

  int code = http.POST(payload);
  Serial.println("HTTP: " + String(code));
  http.end();

  delay(10000);  // kirim setiap 10 detik
}</pre>
        <div style="font-size:12px;color:var(--text3);margin-top:12px">
          Library yang dibutuhkan: WiFi (built-in), HTTPClient (built-in), ArduinoJson (install via Library Manager)
        </div>
      </div>
    </div>`;
  }

  // ── Cloud Page ───────────────────────────────────────────────────────────────
  function renderCloud() {
    return `<div id="page-cloud">
      <div class="panel" style="padding:24px">
        <div style="font-size:14px;font-weight:600;margin-bottom:16px">Cloud Sync Status</div>
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px">
          <div class="status-dot online"></div>
          <span style="font-size:13px">Terhubung ke Google Sheets</span>
        </div>
        <div style="font-size:13px;color:var(--text2);line-height:1.8">
          Data tersimpan langsung di Google Sheet.<br>
          Semua device, project, dan data sensor disimpan secara real-time.<br>
          Untuk backup, download Google Sheet sebagai Excel/CSV.<br>
          <br>
          <strong>Sheet yang digunakan:</strong> users, devices, projects, data, alerts, settings
        </div>
      </div>
    </div>`;
  }

  function renderAutomation() {
    return `<div id="page-automation">
      <div class="panel" style="padding:24px">
        <div style="font-size:14px;font-weight:600;margin-bottom:12px">Automation Rules</div>
        <div style="font-size:13px;color:var(--text2)">Automation dikonfigurasi melalui Settings → Alert Rules menggunakan rule berbasis threshold.<br><br>
        Rule akan otomatis memicu alert saat nilai sensor melampaui batas yang ditentukan.<br>
        Untuk aktuasi (nyalakan relay, dll), gunakan Switch widget di project dashboard.</div>
      </div>
    </div>`;
  }

  // ── Modals ───────────────────────────────────────────────────────────────────
  function showModal(html) {
    document.getElementById('modal').innerHTML = html;
    document.getElementById('modal').classList.add('open');
    document.getElementById('modal-backdrop').classList.add('open');
  }
  function closeModal() {
    document.getElementById('modal').classList.remove('open');
    document.getElementById('modal-backdrop').classList.remove('open');
  }

  function showNewProjectModal() {
    showModal(`
      <div class="modal-header"><h3>New Project</h3><button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Project Name *</label><input class="form-input" id="np-name" placeholder="Contoh: Smart Home"></div>
        <div class="form-group"><label class="form-label">Description</label><textarea class="form-input" id="np-desc" rows="3" placeholder="Deskripsi singkat project"></textarea></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="confirmNewProject()">Create Project</button>
      </div>`);
    setTimeout(() => document.getElementById('np-name')?.focus(), 100);
  }

  async function confirmNewProject() {
    const name = document.getElementById('np-name')?.value?.trim();
    const desc = document.getElementById('np-desc')?.value?.trim();
    if (!name) { Toast.error('Nama project wajib diisi'); return; }
    showLoader(true);
    const res = await API.createProject({ name, description: desc });
    showLoader(false);
    if (res.ok) {
      state.projects.push(res.data);
      closeModal();
      Toast.success('Project berhasil dibuat!');
      openProject(res.data.id);
    } else Toast.error(res.error);
  }

  function showAddDeviceModal() {
    showModal(`
      <div class="modal-header"><h3>Tambah Device</h3><button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Device Name *</label><input class="form-input" id="ad-name" placeholder="Contoh: ESP32-Sensor-01"></div>
        <div class="form-group"><label class="form-label">Device Type</label>
          <select class="form-input" id="ad-type">
            <option>ESP32</option><option>ESP8266</option><option>Arduino</option><option>Raspberry Pi</option><option>Other</option>
          </select></div>
        <div class="form-group"><label class="form-label">Project</label>
          <select class="form-input" id="ad-project">
            <option value="">— No project —</option>
            ${state.projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Firmware Version</label><input class="form-input" id="ad-fw" placeholder="v1.0.0"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="confirmAddDevice()">Add Device</button>
      </div>`);
  }

  async function confirmAddDevice() {
    const name       = document.getElementById('ad-name')?.value?.trim();
    const type       = document.getElementById('ad-type')?.value;
    const project_id = document.getElementById('ad-project')?.value;
    const firmware   = document.getElementById('ad-fw')?.value;
    if (!name) { Toast.error('Nama device wajib diisi'); return; }
    showLoader(true);
    const res = await API.createDevice({ name, type, project_id, firmware });
    showLoader(false);
    if (res.ok) {
      state.devices.push(res.data);
      closeModal();
      Toast.success('Device berhasil ditambahkan! Device ID: ' + res.data.id);
      updateDeviceBadges();
      if (state.page === 'devices') renderPage('devices');
    } else Toast.error(res.error);
  }

  function showEditDeviceModal(deviceId) {
    const d = state.devices.find(dev => dev.id === deviceId);
    if (!d) return;
    showModal(`
      <div class="modal-header"><h3>Edit Device</h3><button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Device Name</label><input class="form-input" id="ed-name" value="${d.name}"></div>
        <div class="form-group"><label class="form-label">Device Type</label>
          <select class="form-input" id="ed-type">
            ${['ESP32','ESP8266','Arduino','Raspberry Pi','Other'].map(t=>`<option ${d.type===t?'selected':''}>${t}</option>`).join('')}
          </select></div>
        <div class="form-group"><label class="form-label">Project</label>
          <select class="form-input" id="ed-project">
            <option value="">— No project —</option>
            ${state.projects.map(p=>`<option value="${p.id}" ${d.project_id===p.id?'selected':''}>${p.name}</option>`).join('')}
          </select></div>
        <div style="font-family:var(--mono);font-size:11px;color:var(--text3)">Device ID (untuk kode): <strong>${d.id}</strong></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="confirmEditDevice('${deviceId}')">Save</button>
      </div>`);
  }

  async function confirmEditDevice(deviceId) {
    const name       = document.getElementById('ed-name')?.value?.trim();
    const type       = document.getElementById('ed-type')?.value;
    const project_id = document.getElementById('ed-project')?.value;
    showLoader(true);
    const res = await API.updateDevice({ id: deviceId, name, type, project_id });
    showLoader(false);
    if (res.ok) {
      const idx = state.devices.findIndex(d => d.id === deviceId);
      if (idx >= 0) Object.assign(state.devices[idx], { name, type, project_id });
      closeModal();
      Toast.success('Device updated!');
      if (state.page === 'devices') renderPage('devices');
    } else Toast.error(res.error);
  }

  function showDeviceDetail(deviceId) {
    const d = state.devices.find(dev => dev.id === deviceId);
    if (!d) return;
    navigate('monitoring');
    setTimeout(() => {
      const sel = document.getElementById('mon-device-select');
      if (sel) { sel.value = deviceId; loadMonitorData(deviceId); }
    }, 100);
  }

  function showDeviceMonitor(deviceId) { showDeviceDetail(deviceId); }

  function showAssignDeviceModal(projectId) {
    const unassigned = state.devices.filter(d => !d.project_id);
    showModal(`
      <div class="modal-header"><h3>Assign Device ke Project</h3><button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button></div>
      <div class="modal-body">
        ${unassigned.length ? `
          <div class="form-group"><label class="form-label">Pilih Device</label>
            <select class="form-input" id="assign-dev-id">
              ${unassigned.map(d=>`<option value="${d.id}">${d.name} (${d.type})</option>`).join('')}
            </select></div>` :
          '<div class="log-empty">Semua device sudah di-assign ke project. Tambah device baru di menu Devices.</div>'}
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        ${unassigned.length ? `<button class="btn btn-primary" onclick="confirmAssignDevice('${projectId}')">Assign</button>` : ''}
      </div>`);
  }

  async function confirmAssignDevice(projectId) {
    const deviceId = document.getElementById('assign-dev-id')?.value;
    if (!deviceId) return;
    const res = await API.updateDevice({ id: deviceId, project_id: projectId });
    if (res.ok) {
      const idx = state.devices.findIndex(d => d.id === deviceId);
      if (idx >= 0) state.devices[idx].project_id = projectId;
      closeModal();
      Toast.success('Device berhasil di-assign!');
      renderProjectView(state.activeProject);
    } else Toast.error(res.error);
  }

  function showCreateAlertModal() {
    showModal(`
      <div class="modal-header"><h3>Create Alert</h3><button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Device</label>
          <select class="form-input" id="ca-device">${state.devices.map(d=>`<option value="${d.id}">${d.name}</option>`).join('')}</select></div>
        <div class="form-group"><label class="form-label">Title</label><input class="form-input" id="ca-title"></div>
        <div class="form-group"><label class="form-label">Message</label><input class="form-input" id="ca-msg"></div>
        <div class="form-group"><label class="form-label">Severity</label>
          <select class="form-input" id="ca-sev"><option>warning</option><option>critical</option><option>info</option></select></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="confirmCreateAlert()">Create</button>
      </div>`);
  }

  async function confirmCreateAlert() {
    const res = await API.createAlert({
      device_id: document.getElementById('ca-device')?.value,
      title:     document.getElementById('ca-title')?.value,
      message:   document.getElementById('ca-msg')?.value,
      severity:  document.getElementById('ca-sev')?.value,
    });
    if (res.ok) { state.alerts.unshift(res.data); closeModal(); Toast.success('Alert created!'); updateAlertBadge(); }
    else Toast.error(res.error);
  }

  function showAddUserModal() {
    showModal(`
      <div class="modal-header"><h3>Add User</h3><button class="modal-close" onclick="closeModal()"><i class="ti ti-x"></i></button></div>
      <div class="modal-body">
        <div class="form-group"><label class="form-label">Username</label><input class="form-input" id="au-user"></div>
        <div class="form-group"><label class="form-label">Password</label><input class="form-input" type="password" id="au-pass"></div>
        <div class="form-group"><label class="form-label">Role</label>
          <select class="form-input" id="au-role"><option>user</option><option>admin</option></select></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
        <button class="btn btn-primary" onclick="confirmAddUser()">Create User</button>
      </div>`);
  }

  async function confirmAddUser() {
    const res = await API.createUser({
      username: document.getElementById('au-user')?.value,
      password: document.getElementById('au-pass')?.value,
      role:     document.getElementById('au-role')?.value,
    });
    if (res.ok) { closeModal(); Toast.success('User created!'); }
    else Toast.error(res.error);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────
  function openProject(projectId) {
    const proj = state.projects.find(p => p.id === projectId);
    if (!proj) return;
    navigate('project-view', proj);
  }

  async function deleteDevice(deviceId) {
    if (!confirm('Hapus device ini?')) return;
    const res = await API.deleteDevice(deviceId);
    if (res.ok) {
      state.devices = state.devices.filter(d => d.id !== deviceId);
      Toast.success('Device dihapus'); updateDeviceBadges();
      if (state.page === 'devices') renderPage('devices');
    } else Toast.error(res.error);
  }

  function updateStatCards() {
    const s = state.stats;
    const map = {
      'ACTIVE_DEVICES': s.online_devices,
      'SYSTEM_UPTIME':  (s.uptime_pct||0) + '%',
      'DATA_POINTS_/_HR': fmtNum(s.data_points_hour||0),
    };
    // Quick update without full re-render
  }

  function updateDeviceBadges() {
    const el = document.getElementById('badge-devices');
    if (el) el.textContent = state.devices.length;
  }

  function updateAlertBadge() {
    const open = state.alerts.filter(a => !a.resolved).length;
    const el   = document.getElementById('badge-alerts');
    if (el) el.textContent = open;
    const notifBtn = document.getElementById('btn-notif');
    if (notifBtn) {
      notifBtn.classList.toggle('notif-dot', open > 0);
    }
  }

  function updateRefreshIndicator() {
    const el = document.getElementById('refresh-interval-label');
    if (el) el.textContent = state.pollerSecs + 's';
  }

  function filterDevices(query, status) {
    const q = (query || document.getElementById('dev-search')?.value || '').toLowerCase();
    const s = status !== undefined ? status : '';
    const tbody = document.getElementById('devices-table-body');
    if (!tbody) return;
    const filtered = state.devices.filter(d => {
      const matchQ = !q || d.name.toLowerCase().includes(q) || d.type.toLowerCase().includes(q);
      const matchS = !s || d.status === s;
      return matchQ && matchS;
    });
    tbody.innerHTML = filtered.map(d => deviceTableRow(d)).join('') || '<tr><td colspan="8" class="empty-cell">Tidak ada device</td></tr>';
  }

  function search(query) {
    if (!query) return;
    const q = query.toLowerCase();
    const devMatch  = state.devices.find(d => d.name.toLowerCase().includes(q));
    const projMatch = state.projects.find(p => p.name.toLowerCase().includes(q));
    if (devMatch)  { navigate('devices'); return; }
    if (projMatch) { openProject(projMatch.id); return; }
  }

  function showLoader(show) {
    const el = document.getElementById('loader');
    if (el) el.style.display = show ? 'flex' : 'none';
  }

  // ── Utils ─────────────────────────────────────────────────────────────────────
  function uid() { return Math.random().toString(36).substring(2, 10); }
  function fmtNum(n) { return n > 999 ? (n/1000).toFixed(1)+'K' : String(n); }
  function fmtDateTime(ts) {
    if (!ts) return '—';
    try { return new Date(ts).toLocaleString('id-ID', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }); }
    catch(_) { return ts; }
  }
  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < (s||'').length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    return h;
  }

  // ── Expose globals ───────────────────────────────────────────────────────────
  // Functions called from inline HTML onclick need to be global
  Object.assign(window, {
    navigate, openProject, showNewProjectModal, confirmNewProject,
    showAddDeviceModal, confirmAddDevice, showEditDeviceModal, confirmEditDevice,
    showDeviceDetail, showDeviceMonitor, deleteDevice,
    showAddWidgetModal, confirmAddWidget, selectWidgetType, editWidget, removeWidget,
    toggleEditMode, saveWidgets, showAssignDeviceModal, confirmAssignDevice,
    showCreateAlertModal, confirmCreateAlert, resolveAlert,
    showAddUserModal, confirmAddUser,
    loadMonitorData, exportCSV, filterDevices,
    showSettingsSection, saveAppSettings, saveRefreshSettings, saveAlertRules,
    closeModal,
  });

  return { init, navigate, resolveAlert, search };
})();
