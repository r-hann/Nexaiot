/**
 * NexaIoT - Google Apps Script Backend
 * Deploy sebagai: Web App → Anyone can access
 *
 * SETUP:
 * 1. Buka Google Sheet baru
 * 2. Extensions → Apps Script → paste kode ini
 * 3. Deploy → New Deployment → Web App
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 4. Copy URL deployment → paste di js/config.js (APPS_SCRIPT_URL)
 *
 * STRUKTUR SHEET:
 *   Sheet "users"   : id | username | password | role | created_at
 *   Sheet "devices" : id | name | type | project_id | status | last_seen | ip | firmware | owner
 *   Sheet "projects": id | name | description | owner | created_at | widgets_json
 *   Sheet "data"    : id | device_id | field | value | unit | timestamp
 *   Sheet "alerts"  : id | device_id | title | message | severity | resolved | created_at
 *   Sheet "settings": key | value
 */

const SHEET_ID = SpreadsheetApp.getActiveSpreadsheet().getId();

// ─── CORS Helper ────────────────────────────────────────────────────────────
function setCORS(output) {
  return output
    .setMimeType(ContentService.MimeType.JSON)
    .setHeaders({ 'Access-Control-Allow-Origin': '*' });
}

function doOptions(e) {
  return ContentService.createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeaders({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
}

// ─── Router ─────────────────────────────────────────────────────────────────
function doGet(e) {
  const action = e.parameter.action || '';
  const token  = e.parameter.token  || '';
  let result;
  try {
    switch (action) {
      case 'login':         result = login(e.parameter.username, e.parameter.password); break;
      case 'getDevices':    result = requireAuth(token, () => getDevices(token)); break;
      case 'getProjects':   result = requireAuth(token, () => getProjects(token)); break;
      case 'getData':       result = requireAuth(token, () => getData(e.parameter.device_id, e.parameter.limit)); break;
      case 'getAlerts':     result = requireAuth(token, () => getAlerts(token)); break;
      case 'getSettings':   result = requireAuth(token, () => getSettings()); break;
      case 'resolveAlert':  result = requireAuth(token, () => resolveAlert(e.parameter.alert_id)); break;
      case 'deleteDevice':  result = requireAuth(token, () => deleteDevice(token, e.parameter.device_id)); break;
      case 'deleteProject': result = requireAuth(token, () => deleteProject(token, e.parameter.project_id)); break;
      case 'getStats':      result = requireAuth(token, () => getStats(token)); break;
      case 'getHistory':    result = requireAuth(token, () => getHistory(e.parameter.device_id, e.parameter.field, e.parameter.limit)); break;
      default:              result = { ok: false, error: 'Unknown action' };
    }
  } catch(err) {
    result = { ok: false, error: err.message };
  }
  return setCORS(ContentService.createTextOutput(JSON.stringify(result)));
}

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch(_) {}
  const action = body.action || '';
  const token  = body.token  || '';
  let result;
  try {
    switch (action) {
      case 'pushData':      result = pushData(body); break; // no auth (mikrokontroller)
      case 'createDevice':  result = requireAuth(token, () => createDevice(token, body)); break;
      case 'updateDevice':  result = requireAuth(token, () => updateDevice(token, body)); break;
      case 'createProject': result = requireAuth(token, () => createProject(token, body)); break;
      case 'updateProject': result = requireAuth(token, () => updateProject(token, body)); break;
      case 'saveWidgets':   result = requireAuth(token, () => saveWidgets(token, body)); break;
      case 'createAlert':   result = requireAuth(token, () => createAlert(token, body)); break;
      case 'saveSettings':  result = requireAuth(token, () => saveSettings(token, body)); break;
      case 'createUser':    result = requireAuth(token, () => createUser(token, body)); break;
      default:              result = { ok: false, error: 'Unknown action' };
    }
  } catch(err) {
    result = { ok: false, error: err.message };
  }
  return setCORS(ContentService.createTextOutput(JSON.stringify(result)));
}

// ─── Sheet Helpers ───────────────────────────────────────────────────────────
function getSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  return sh;
}

function sheetToObjects(sheetName) {
  const sh   = getSheet(sheetName);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0].map(h => String(h).trim());
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function appendRow(sheetName, headers, obj) {
  const sh = getSheet(sheetName);
  if (sh.getLastRow() === 0) sh.appendRow(headers);
  sh.appendRow(headers.map(h => obj[h] !== undefined ? obj[h] : ''));
}

function uid() {
  return Utilities.getUuid().replace(/-/g,'').substring(0,12);
}

function now() {
  return new Date().toISOString();
}

// ─── Auth ────────────────────────────────────────────────────────────────────
const TOKEN_CACHE = {}; // { token: { userId, username, role, exp } }

function login(username, password) {
  if (!username || !password) return { ok: false, error: 'Missing credentials' };
  const users = sheetToObjects('users');
  const user  = users.find(u => u.username === username && u.password === password);
  if (!user) return { ok: false, error: 'Invalid username or password' };
  const token = uid() + uid();
  const exp   = Date.now() + 8 * 3600 * 1000; // 8 jam
  TOKEN_CACHE[token] = { userId: user.id, username: user.username, role: user.role, exp };
  return { ok: true, token, user: { id: user.id, username: user.username, role: user.role } };
}

function requireAuth(token, fn) {
  const session = TOKEN_CACHE[token];
  if (!session) return { ok: false, error: 'Unauthorized' };
  if (Date.now() > session.exp) { delete TOKEN_CACHE[token]; return { ok: false, error: 'Session expired' }; }
  return fn();
}

function getSession(token) {
  return TOKEN_CACHE[token] || null;
}

// ─── Devices ─────────────────────────────────────────────────────────────────
function getDevices(token) {
  const session = getSession(token);
  const devs    = sheetToObjects('devices');
  return { ok: true, data: devs.filter(d => d.owner === session.username || session.role === 'admin') };
}

function createDevice(token, body) {
  const session = getSession(token);
  const device = {
    id: uid(), name: body.name, type: body.type || 'ESP32',
    project_id: body.project_id || '', status: 'offline',
    last_seen: '', ip: '', firmware: body.firmware || 'unknown',
    owner: session.username
  };
  appendRow('devices',
    ['id','name','type','project_id','status','last_seen','ip','firmware','owner'],
    device
  );
  return { ok: true, data: device };
}

function updateDevice(token, body) {
  const sh   = getSheet('devices');
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h));
  const idIdx   = headers.indexOf('id');
  for (let r = 1; r < data.length; r++) {
    if (data[r][idIdx] === body.id) {
      headers.forEach((h, c) => { if (body[h] !== undefined) sh.getRange(r+1, c+1).setValue(body[h]); });
      return { ok: true };
    }
  }
  return { ok: false, error: 'Device not found' };
}

function deleteDevice(token, device_id) {
  const sh   = getSheet('devices');
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h));
  const idIdx   = headers.indexOf('id');
  for (let r = 1; r < data.length; r++) {
    if (data[r][idIdx] === device_id) {
      sh.deleteRow(r + 1);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Device not found' };
}

// ─── Projects ────────────────────────────────────────────────────────────────
function getProjects(token) {
  const session = getSession(token);
  const projs   = sheetToObjects('projects');
  const owned   = projs.filter(p => p.owner === session.username || session.role === 'admin');
  return { ok: true, data: owned };
}

function createProject(token, body) {
  const session = getSession(token);
  const proj = {
    id: uid(), name: body.name, description: body.description || '',
    owner: session.username, created_at: now(), widgets_json: '[]'
  };
  appendRow('projects', ['id','name','description','owner','created_at','widgets_json'], proj);
  return { ok: true, data: proj };
}

function updateProject(token, body) {
  const sh   = getSheet('projects');
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h));
  const idIdx   = headers.indexOf('id');
  for (let r = 1; r < data.length; r++) {
    if (data[r][idIdx] === body.id) {
      headers.forEach((h, c) => { if (body[h] !== undefined) sh.getRange(r+1, c+1).setValue(body[h]); });
      return { ok: true };
    }
  }
  return { ok: false, error: 'Project not found' };
}

function deleteProject(token, project_id) {
  const sh   = getSheet('projects');
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h));
  const idIdx   = headers.indexOf('id');
  for (let r = 1; r < data.length; r++) {
    if (data[r][idIdx] === project_id) {
      sh.deleteRow(r + 1);
      return { ok: true };
    }
  }
  return { ok: false, error: 'Project not found' };
}

function saveWidgets(token, body) {
  return updateProject(token, { id: body.project_id, widgets_json: JSON.stringify(body.widgets) });
}

// ─── Data (Sensor readings) ───────────────────────────────────────────────────
/**
 * Endpoint untuk mikrokontroller:
 * POST { action:"pushData", api_key:"xxx", device_id:"yyy", readings:[{field:"temp",value:28.4,unit:"C"}] }
 */
function pushData(body) {
  if (!body.device_id) return { ok: false, error: 'device_id required' };

  // Verify api_key dari settings (opsional)
  const settings = sheetToObjects('settings');
  const apiKeySetting = settings.find(s => s.key === 'api_key');
  if (apiKeySetting && apiKeySetting.value && body.api_key !== apiKeySetting.value) {
    return { ok: false, error: 'Invalid API key' };
  }

  const readings = body.readings || [];
  const ts = now();
  const headers = ['id','device_id','field','value','unit','timestamp'];

  readings.forEach(r => {
    appendRow('data', headers, {
      id: uid(), device_id: body.device_id,
      field: r.field, value: r.value, unit: r.unit || '',
      timestamp: ts
    });
  });

  // Update device status & last_seen
  updateDevice('', { id: body.device_id, status: 'online', last_seen: ts, ip: body.ip || '' });

  // Check alert rules
  checkAlertRules(body.device_id, readings);

  // Trim data sheet — keep latest 5000 rows
  trimSheet('data', 5000);

  return { ok: true, timestamp: ts };
}

function getData(device_id, limit) {
  if (!device_id) return { ok: false, error: 'device_id required' };
  const lim  = parseInt(limit) || 100;
  const rows = sheetToObjects('data').filter(r => r.device_id === device_id);
  const last = rows.slice(-lim);
  // Group by field
  const grouped = {};
  last.forEach(r => {
    if (!grouped[r.field]) grouped[r.field] = [];
    grouped[r.field].push({ value: r.value, unit: r.unit, timestamp: r.timestamp });
  });
  return { ok: true, data: grouped };
}

function getHistory(device_id, field, limit) {
  if (!device_id || !field) return { ok: false, error: 'device_id and field required' };
  const lim  = parseInt(limit) || 50;
  const rows = sheetToObjects('data')
    .filter(r => r.device_id === device_id && r.field === field)
    .slice(-lim);
  return { ok: true, data: rows };
}

function getStats(token) {
  const session  = getSession(token);
  const devices  = sheetToObjects('devices').filter(d => d.owner === session.username || session.role === 'admin');
  const projects = sheetToObjects('projects').filter(p => p.owner === session.username || session.role === 'admin');
  const alerts   = sheetToObjects('alerts').filter(a => !a.resolved && (session.role === 'admin' || devices.some(d => d.id === a.device_id)));
  const online   = devices.filter(d => d.status === 'online').length;
  const allData  = sheetToObjects('data');
  // Data points in last hour
  const hourAgo  = new Date(Date.now() - 3600000).toISOString();
  const dpHour   = allData.filter(r => r.timestamp > hourAgo && devices.some(d => d.id === r.device_id)).length;

  return {
    ok: true,
    data: {
      total_devices: devices.length,
      online_devices: online,
      offline_devices: devices.length - online,
      total_projects: projects.length,
      active_alerts: alerts.length,
      data_points_hour: dpHour,
      uptime_pct: devices.length ? Math.round((online / devices.length) * 1000) / 10 : 0
    }
  };
}

// ─── Alerts ──────────────────────────────────────────────────────────────────
function getAlerts(token) {
  const session = getSession(token);
  const devices = sheetToObjects('devices').filter(d => d.owner === session.username || session.role === 'admin');
  const devIds  = devices.map(d => d.id);
  const alerts  = sheetToObjects('alerts').filter(a => devIds.includes(a.device_id));
  return { ok: true, data: alerts.reverse() };
}

function createAlert(token, body) {
  const alert = {
    id: uid(), device_id: body.device_id, title: body.title,
    message: body.message, severity: body.severity || 'warning',
    resolved: '', created_at: now()
  };
  appendRow('alerts', ['id','device_id','title','message','severity','resolved','created_at'], alert);
  return { ok: true, data: alert };
}

function resolveAlert(alert_id) {
  const sh   = getSheet('alerts');
  const data = sh.getDataRange().getValues();
  const headers = data[0].map(h => String(h));
  const idIdx   = headers.indexOf('id');
  const resIdx  = headers.indexOf('resolved');
  for (let r = 1; r < data.length; r++) {
    if (data[r][idIdx] === alert_id) {
      sh.getRange(r+1, resIdx+1).setValue(now());
      return { ok: true };
    }
  }
  return { ok: false, error: 'Alert not found' };
}

function checkAlertRules(device_id, readings) {
  // Simple threshold rules from settings
  const settings = sheetToObjects('settings');
  const rulesRaw = settings.find(s => s.key === 'alert_rules');
  if (!rulesRaw) return;
  let rules = [];
  try { rules = JSON.parse(rulesRaw.value); } catch(_) { return; }
  readings.forEach(r => {
    rules.forEach(rule => {
      if (rule.field !== r.field) return;
      let triggered = false;
      if (rule.condition === 'gt' && parseFloat(r.value) > parseFloat(rule.threshold)) triggered = true;
      if (rule.condition === 'lt' && parseFloat(r.value) < parseFloat(rule.threshold)) triggered = true;
      if (triggered) {
        createAlert('', {
          device_id, title: rule.title || `${r.field} alert`,
          message: `${r.field} = ${r.value}${r.unit} (threshold: ${rule.condition} ${rule.threshold})`,
          severity: rule.severity || 'warning'
        });
      }
    });
  });
}

// ─── Settings ────────────────────────────────────────────────────────────────
function getSettings() {
  const rows = sheetToObjects('settings');
  const obj  = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  return { ok: true, data: obj };
}

function saveSettings(token, body) {
  const session = getSession(token);
  if (session.role !== 'admin') return { ok: false, error: 'Admin only' };
  const sh      = getSheet('settings');
  const data    = sh.getDataRange().getValues();
  const headers = data.length > 0 ? data[0].map(h => String(h)) : ['key','value'];
  if (data.length === 0) sh.appendRow(headers);
  const keyIdx  = headers.indexOf('key');
  const valIdx  = headers.indexOf('value');
  Object.entries(body.settings || {}).forEach(([key, value]) => {
    let found = false;
    for (let r = 1; r < data.length; r++) {
      if (data[r][keyIdx] === key) {
        sh.getRange(r+1, valIdx+1).setValue(value);
        found = true; break;
      }
    }
    if (!found) sh.appendRow([key, value]);
  });
  return { ok: true };
}

// ─── Users ───────────────────────────────────────────────────────────────────
function createUser(token, body) {
  const session = getSession(token);
  if (session.role !== 'admin') return { ok: false, error: 'Admin only' };
  const user = {
    id: uid(), username: body.username, password: body.password,
    role: body.role || 'user', created_at: now()
  };
  appendRow('users', ['id','username','password','role','created_at'], user);
  return { ok: true, data: { id: user.id, username: user.username, role: user.role } };
}

// ─── Utility ─────────────────────────────────────────────────────────────────
function trimSheet(sheetName, maxRows) {
  const sh    = getSheet(sheetName);
  const total = sh.getLastRow();
  if (total > maxRows + 1) {
    sh.deleteRows(2, total - maxRows - 1);
  }
}

/**
 * Run sekali untuk setup sheet awal + user admin default
 * Jalankan dari Apps Script editor: Run → initSetup
 */
function initSetup() {
  // Users
  const ush = getSheet('users');
  if (ush.getLastRow() === 0) {
    ush.appendRow(['id','username','password','role','created_at']);
    ush.appendRow([uid(), 'admin', 'admin123', 'admin', now()]);
  }
  // Devices
  const dsh = getSheet('devices');
  if (dsh.getLastRow() === 0)
    dsh.appendRow(['id','name','type','project_id','status','last_seen','ip','firmware','owner']);
  // Projects
  const psh = getSheet('projects');
  if (psh.getLastRow() === 0)
    psh.appendRow(['id','name','description','owner','created_at','widgets_json']);
  // Data
  const dash = getSheet('data');
  if (dash.getLastRow() === 0)
    dash.appendRow(['id','device_id','field','value','unit','timestamp']);
  // Alerts
  const ash = getSheet('alerts');
  if (ash.getLastRow() === 0)
    ash.appendRow(['id','device_id','title','message','severity','resolved','created_at']);
  // Settings
  const sesh = getSheet('settings');
  if (sesh.getLastRow() === 0) {
    sesh.appendRow(['key','value']);
    sesh.appendRow(['api_key', uid()]);
    sesh.appendRow(['app_name', 'NexaIoT']);
    sesh.appendRow(['refresh_interval', '10']);
    sesh.appendRow(['alert_rules', '[]']);
  }
  SpreadsheetApp.getUi().alert('Setup complete! Default login: admin / admin123');
}
