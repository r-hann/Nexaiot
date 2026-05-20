/**
 * NexaIoT Widget Engine
 * Mendukung: value-card, gauge, line-chart, bar-chart,
 *            switch-toggle, map, table, alert-log
 */
const Widgets = (() => {

  // ── Registry ────────────────────────────────────────────────────────────────
  const TYPES = {
    'value-card':   { label: 'Value Card',    icon: 'ti-card-boards',    defaultConfig: { title:'Value', field:'temp', unit:'', color:'accent' } },
    'gauge':        { label: 'Gauge',          icon: 'ti-gauge',          defaultConfig: { title:'Gauge', field:'temp', unit:'°C', min:0, max:100 } },
    'line-chart':   { label: 'Line Chart',     icon: 'ti-chart-line',     defaultConfig: { title:'Chart', field:'temp', unit:'', limit:30 } },
    'bar-chart':    { label: 'Bar Chart',      icon: 'ti-chart-bar',      defaultConfig: { title:'Bar Chart', field:'value', unit:'', limit:20 } },
    'switch-toggle':{ label: 'Switch/Relay',   icon: 'ti-toggle-right',   defaultConfig: { title:'Relay', field:'relay', onValue:'1', offValue:'0' } },
    'map':          { label: 'GPS Map',        icon: 'ti-map-pin',        defaultConfig: { title:'Location', lat_field:'lat', lng_field:'lng', zoom:13 } },
    'table':        { label: 'Data Table',     icon: 'ti-table',          defaultConfig: { title:'Data Table', fields:'temp,humidity', limit:10 } },
    'alert-log':    { label: 'Alert Log',      icon: 'ti-bell',           defaultConfig: { title:'Alerts', limit:5 } },
  };

  function getTypes() { return TYPES; }

  // ── Render dispatch ─────────────────────────────────────────────────────────
  function render(widget, data, deviceId) {
    switch (widget.type) {
      case 'value-card':    return renderValueCard(widget, data);
      case 'gauge':         return renderGauge(widget, data);
      case 'line-chart':    return renderLineChart(widget, data);
      case 'bar-chart':     return renderBarChart(widget, data);
      case 'switch-toggle': return renderSwitch(widget, data, deviceId);
      case 'map':           return renderMap(widget, data, widget.id);
      case 'table':         return renderTable(widget, data);
      case 'alert-log':     return renderAlertLog(widget);
      default: return `<div class="widget-error">Unknown widget: ${widget.type}</div>`;
    }
  }

  // ── Value Card ──────────────────────────────────────────────────────────────
  function renderValueCard(w, data) {
    const cfg    = w.config || {};
    const field  = cfg.field || 'value';
    const points = data[field] || [];
    const latest = points.length ? points[points.length - 1] : null;
    const val    = latest ? Number(latest.value).toFixed(2) : '—';
    const prev   = points.length > 1 ? points[points.length - 2].value : null;
    const delta  = prev !== null ? (Number(latest.value) - Number(prev)).toFixed(2) : null;
    const color  = cfg.color || 'accent';
    const colorMap = { accent:'var(--accent)', accent2:'var(--accent2)', accent3:'var(--accent3)', warn:'var(--warn)', danger:'var(--danger)', success:'var(--success)' };
    const c = colorMap[color] || 'var(--accent)';

    return `
      <div class="widget-body widget-value-card">
        <div class="vc-value" style="color:${c}">${val}<span class="vc-unit">${cfg.unit||''}</span></div>
        <div class="vc-field">${field}</div>
        ${delta !== null ? `<div class="vc-delta ${Number(delta)>=0?'pos':'neg'}">${Number(delta)>=0?'▲':'▼'} ${Math.abs(delta)}</div>` : ''}
        ${latest ? `<div class="vc-ts">${fmtTime(latest.timestamp)}</div>` : ''}
      </div>`;
  }

  // ── Gauge ───────────────────────────────────────────────────────────────────
  function renderGauge(w, data) {
    const cfg    = w.config || {};
    const field  = cfg.field || 'value';
    const points = data[field] || [];
    const latest = points.length ? points[points.length - 1] : null;
    const val    = latest ? Number(latest.value) : 0;
    const min    = Number(cfg.min) || 0;
    const max    = Number(cfg.max) || 100;
    const pct    = Math.min(100, Math.max(0, ((val - min) / (max - min)) * 100));
    const angle  = -135 + pct * 2.7;
    const color  = pct > 80 ? 'var(--danger)' : pct > 60 ? 'var(--warn)' : 'var(--accent)';
    const id     = `gauge_${w.id}`;

    return `
      <div class="widget-body widget-gauge">
        <svg viewBox="0 0 200 120" class="gauge-svg" id="${id}">
          <path d="M20 110 A90 90 0 0 1 180 110" fill="none" stroke="var(--bg3)" stroke-width="16" stroke-linecap="round"/>
          <path d="M20 110 A90 90 0 0 1 180 110" fill="none" stroke="${color}" stroke-width="16" stroke-linecap="round"
                stroke-dasharray="${pct * 2.827} 282.7" class="gauge-fill"/>
          <text x="100" y="105" text-anchor="middle" font-size="28" font-weight="700" fill="${color}">${val.toFixed(1)}</text>
          <text x="100" y="118" text-anchor="middle" font-size="11" fill="var(--text3)">${cfg.unit||''}</text>
          <text x="20" y="118" text-anchor="middle" font-size="9" fill="var(--text3)">${min}</text>
          <text x="180" y="118" text-anchor="middle" font-size="9" fill="var(--text3)">${max}</text>
        </svg>
      </div>`;
  }

  // ── Line Chart ──────────────────────────────────────────────────────────────
  function renderLineChart(w, data) {
    const cfg    = w.config || {};
    const field  = cfg.field || 'value';
    const points = (data[field] || []).slice(-(cfg.limit || 30));
    const id     = `chart_${w.id}`;

    if (!points.length) return `<div class="widget-body widget-empty">No data yet</div>`;

    const vals   = points.map(p => Number(p.value));
    const labels = points.map(p => fmtTime(p.timestamp));
    const latest = vals[vals.length - 1];

    return `
      <div class="widget-body widget-chart">
        <div class="chart-current">${latest.toFixed(2)} <span>${cfg.unit||''}</span></div>
        <canvas id="${id}" height="100"></canvas>
      </div>
      <script>
        (function(){
          const el = document.getElementById('${id}');
          if (!el || !window.Chart) return;
          if (el._chart) el._chart.destroy();
          el._chart = new Chart(el.getContext('2d'), {
            type: 'line',
            data: {
              labels: ${JSON.stringify(labels)},
              datasets: [{ data: ${JSON.stringify(vals)},
                borderColor: '${w.config && w.config.color ? 'var(--' + w.config.color + ')' : 'var(--accent)'}',
                backgroundColor: 'rgba(0,212,170,0.08)',
                borderWidth: 2, pointRadius: 2, tension: 0.4, fill: true }]
            },
            options: {
              animation: false, responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: { ticks: { color: '#555b72', maxTicksLimit: 6, font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                y: { ticks: { color: '#555b72', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.04)' } }
              }
            }
          });
        })();
      <\/script>`;
  }

  // ── Bar Chart ───────────────────────────────────────────────────────────────
  function renderBarChart(w, data) {
    const cfg    = w.config || {};
    const field  = cfg.field || 'value';
    const points = (data[field] || []).slice(-(cfg.limit || 20));
    const id     = `barchart_${w.id}`;

    if (!points.length) return `<div class="widget-body widget-empty">No data yet</div>`;

    const vals   = points.map(p => Number(p.value));
    const labels = points.map(p => fmtTime(p.timestamp));

    return `
      <div class="widget-body widget-chart">
        <canvas id="${id}" height="100"></canvas>
      </div>
      <script>
        (function(){
          const el = document.getElementById('${id}');
          if (!el || !window.Chart) return;
          if (el._chart) el._chart.destroy();
          el._chart = new Chart(el.getContext('2d'), {
            type: 'bar',
            data: {
              labels: ${JSON.stringify(labels)},
              datasets: [{ data: ${JSON.stringify(vals)},
                backgroundColor: 'rgba(0,153,255,0.4)',
                borderColor: 'rgba(0,153,255,0.8)',
                borderWidth: 1, borderRadius: 3 }]
            },
            options: {
              animation: false, responsive: true, maintainAspectRatio: false,
              plugins: { legend: { display: false } },
              scales: {
                x: { ticks: { color:'#555b72', maxTicksLimit:8, font:{size:9} }, grid:{color:'rgba(255,255,255,0.04)'} },
                y: { ticks: { color:'#555b72', font:{size:9} }, grid:{color:'rgba(255,255,255,0.04)'} }
              }
            }
          });
        })();
      <\/script>`;
  }

  // ── Switch Toggle ───────────────────────────────────────────────────────────
  function renderSwitch(w, data, deviceId) {
    const cfg    = w.config || {};
    const field  = cfg.field || 'relay';
    const points = data[field] || [];
    const latest = points.length ? points[points.length - 1] : null;
    const isOn   = latest && String(latest.value) === String(cfg.onValue || '1');

    return `
      <div class="widget-body widget-switch">
        <div class="sw-state ${isOn ? 'on' : 'off'}">${isOn ? 'ON' : 'OFF'}</div>
        <label class="sw-toggle">
          <input type="checkbox" ${isOn ? 'checked' : ''}
            onchange="Widgets.sendCommand('${deviceId}', '${field}', this.checked ? '${cfg.onValue||1}' : '${cfg.offValue||0}', this)">
          <span class="sw-slider"></span>
        </label>
        <div class="sw-label">${cfg.title || field}</div>
        ${latest ? `<div class="vc-ts">${fmtTime(latest.timestamp)}</div>` : ''}
      </div>`;
  }

  // ── GPS Map ─────────────────────────────────────────────────────────────────
  function renderMap(w, data, widgetId) {
    const cfg    = w.config || {};
    const latPts = data[cfg.lat_field || 'lat'] || [];
    const lngPts = data[cfg.lng_field || 'lng'] || [];
    const lat    = latPts.length ? Number(latPts[latPts.length-1].value) : -6.2088;
    const lng    = lngPts.length ? Number(lngPts[lngPts.length-1].value) : 106.8456;
    const mapId  = `map_${widgetId}`;
    const zoom   = Number(cfg.zoom) || 13;

    return `
      <div class="widget-body widget-map">
        <div id="${mapId}" class="leaflet-map-container"></div>
      </div>
      <script>
        (function(){
          setTimeout(function(){
            const el = document.getElementById('${mapId}');
            if (!el || !window.L) return;
            if (el._map) { el._map.remove(); }
            const m = L.map('${mapId}').setView([${lat}, ${lng}], ${zoom});
            el._map = m;
            L.tileLayer('${window.NEXAIOT.config.MAP_TILE}', { attribution: '© OSM' }).addTo(m);
            L.marker([${lat}, ${lng}]).addTo(m).bindPopup('Device location').openPopup();
          }, 200);
        })();
      <\/script>`;
  }

  // ── Data Table ──────────────────────────────────────────────────────────────
  function renderTable(w, data) {
    const cfg    = w.config || {};
    const fields = (cfg.fields || 'value').split(',').map(f => f.trim());
    const limit  = Number(cfg.limit) || 10;
    // Collect all timestamps
    const tsSet  = new Set();
    fields.forEach(f => (data[f] || []).forEach(p => tsSet.add(p.timestamp)));
    const timestamps = [...tsSet].sort().slice(-limit);
    if (!timestamps.length) return `<div class="widget-body widget-empty">No data yet</div>`;

    const rows = timestamps.map(ts => {
      const cells = fields.map(f => {
        const pt = (data[f] || []).find(p => p.timestamp === ts);
        return `<td>${pt ? Number(pt.value).toFixed(2) + (pt.unit ? ' '+pt.unit : '') : '—'}</td>`;
      });
      return `<tr><td class="ts-cell">${fmtTime(ts)}</td>${cells.join('')}</tr>`;
    }).reverse();

    return `
      <div class="widget-body widget-table-wrap">
        <table class="widget-table">
          <thead><tr><th>Time</th>${fields.map(f=>`<th>${f}</th>`).join('')}</tr></thead>
          <tbody>${rows.join('')}</tbody>
        </table>
      </div>`;
  }

  // ── Alert Log ───────────────────────────────────────────────────────────────
  function renderAlertLog(w) {
    const cfg    = w.config || {};
    const limit  = Number(cfg.limit) || 5;
    const alerts = (window.NEXAIOT.state?.alerts || []).slice(0, limit);

    if (!alerts.length) return `<div class="widget-body widget-empty">No alerts</div>`;

    const items = alerts.map(a => `
      <div class="al-item ${a.resolved ? 'resolved' : a.severity}">
        <div class="al-dot"></div>
        <div class="al-text">
          <div class="al-title">${a.title}</div>
          <div class="al-sub">${fmtTime(a.created_at)} · ${a.severity}</div>
        </div>
        ${!a.resolved ? `<button class="btn-xs" onclick="App.resolveAlert('${a.id}')">Resolve</button>` : '<span class="al-done">✓</span>'}
      </div>`).join('');

    return `<div class="widget-body widget-alert-log">${items}</div>`;
  }

  // ── Send command (switch) ───────────────────────────────────────────────────
  async function sendCommand(deviceId, field, value, toggleEl) {
    // Push ke Google Sheet sebagai data point (nilai 0/1)
    // Mikrokontroller polling field ini untuk tau state relay
    try {
      const token = Store.get('token');
      await fetch(window.NEXAIOT.config.APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'pushData',
          device_id: deviceId,
          readings: [{ field, value, unit: '' }]
        })
      });
      console.log(`Command sent: ${field}=${value}`);
    } catch(e) {
      console.error('Command failed', e);
      if (toggleEl) toggleEl.checked = !toggleEl.checked; // revert
    }
  }

  // ── Config form builder ─────────────────────────────────────────────────────
  function buildConfigForm(type, current) {
    const defaults = TYPES[type]?.defaultConfig || {};
    const cfg = { ...defaults, ...(current || {}) };
    const fields = {
      title:      { label: 'Title',       type: 'text' },
      field:      { label: 'Data Field',  type: 'text', hint: 'Nama field dari sensor (contoh: temp)' },
      unit:       { label: 'Unit',        type: 'text', hint: 'Satuan (contoh: °C, %)' },
      color:      { label: 'Color',       type: 'select', options: ['accent','accent2','accent3','warn','danger','success'] },
      min:        { label: 'Min Value',   type: 'number' },
      max:        { label: 'Max Value',   type: 'number' },
      limit:      { label: 'Data Points', type: 'number', hint: 'Jumlah data terakhir yang ditampilkan' },
      onValue:    { label: 'ON Value',    type: 'text', hint: 'Nilai saat ON (default: 1)' },
      offValue:   { label: 'OFF Value',   type: 'text', hint: 'Nilai saat OFF (default: 0)' },
      lat_field:  { label: 'Lat Field',   type: 'text' },
      lng_field:  { label: 'Lng Field',   type: 'text' },
      zoom:       { label: 'Map Zoom',    type: 'number' },
      fields:     { label: 'Fields',      type: 'text', hint: 'Pisahkan dengan koma (contoh: temp,humidity)' },
    };
    const relevant = Object.keys(defaults);
    return relevant.map(key => {
      const f = fields[key] || { label: key, type: 'text' };
      if (f.type === 'select') {
        return `<div class="form-group">
          <label class="form-label">${f.label}</label>
          <select class="form-input" name="${key}">
            ${f.options.map(o => `<option value="${o}" ${cfg[key]===o?'selected':''}>${o}</option>`).join('')}
          </select>
        </div>`;
      }
      return `<div class="form-group">
        <label class="form-label">${f.label}${f.hint?`<span class="form-hint">${f.hint}</span>`:''}</label>
        <input class="form-input" type="${f.type||'text'}" name="${key}" value="${cfg[key]??''}">
      </div>`;
    }).join('');
  }

  // ── Util ────────────────────────────────────────────────────────────────────
  function fmtTime(ts) {
    if (!ts) return '—';
    try {
      const d = new Date(ts);
      return d.toLocaleTimeString('id-ID', { hour:'2-digit', minute:'2-digit', second:'2-digit' });
    } catch(_) { return ts; }
  }

  return { getTypes, render, buildConfigForm, sendCommand };
})();
