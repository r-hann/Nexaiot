/**
 * NexaIoT API Layer
 * Semua komunikasi ke Google Apps Script lewat sini
 */
const API = (() => {
  function getURL() {
    return window.NEXAIOT.config.APPS_SCRIPT_URL;
  }

  async function get(params) {
    const url = new URL(getURL());
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const token = Store.get('token');
    if (token) url.searchParams.set('token', token);
    const res = await fetch(url.toString());
    return res.json();
  }

  async function post(body) {
    const token = Store.get('token');
    if (token) body.token = token;
    const res = await fetch(getURL(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return res.json();
  }

  return {
    // Auth
    login: (username, password) => get({ action: 'login', username, password }),

    // Stats
    getStats: () => get({ action: 'getStats' }),

    // Devices
    getDevices:   ()     => get({ action: 'getDevices' }),
    createDevice: (body) => post({ action: 'createDevice', ...body }),
    updateDevice: (body) => post({ action: 'updateDevice', ...body }),
    deleteDevice: (id)   => get({ action: 'deleteDevice', device_id: id }),

    // Projects
    getProjects:   ()     => get({ action: 'getProjects' }),
    createProject: (body) => post({ action: 'createProject', ...body }),
    updateProject: (body) => post({ action: 'updateProject', ...body }),
    deleteProject: (id)   => get({ action: 'deleteProject', project_id: id }),
    saveWidgets:   (project_id, widgets) => post({ action: 'saveWidgets', project_id, widgets }),

    // Data
    getData:    (device_id, limit) => get({ action: 'getData', device_id, limit: limit || 100 }),
    getHistory: (device_id, field, limit) => get({ action: 'getHistory', device_id, field, limit: limit || 50 }),

    // Alerts
    getAlerts:    ()       => get({ action: 'getAlerts' }),
    createAlert:  (body)   => post({ action: 'createAlert', ...body }),
    resolveAlert: (alert_id) => get({ action: 'resolveAlert', alert_id }),

    // Settings
    getSettings:  ()     => get({ action: 'getSettings' }),
    saveSettings: (settings) => post({ action: 'saveSettings', settings }),

    // Users
    createUser: (body) => post({ action: 'createUser', ...body }),
  };
})();

/**
 * Simple LocalStorage store
 */
const Store = {
  get:    (k)    => { try { return JSON.parse(localStorage.getItem('nxi_' + k)); } catch(_) { return null; } },
  set:    (k, v) => localStorage.setItem('nxi_' + k, JSON.stringify(v)),
  remove: (k)    => localStorage.removeItem('nxi_' + k),
  clear:  ()     => Object.keys(localStorage).filter(k => k.startsWith('nxi_')).forEach(k => localStorage.removeItem(k)),
};

/**
 * Event bus sederhana
 */
const Bus = (() => {
  const listeners = {};
  return {
    on:   (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    off:  (ev, fn) => { listeners[ev] = (listeners[ev] || []).filter(f => f !== fn); },
    emit: (ev, data) => (listeners[ev] || []).forEach(fn => fn(data)),
  };
})();
