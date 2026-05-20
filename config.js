/**
 * NexaIoT Config
 * ══════════════
 * LANGKAH SETUP:
 * 1. Buka Google Sheet → Extensions → Apps Script
 * 2. Paste Code.gs → Save → Deploy → Web App
 * 3. Copy URL deployment ke APPS_SCRIPT_URL di bawah
 * 4. Jalankan initSetup() sekali dari Apps Script editor
 */

const NEXAIOT_CONFIG = {
  // ← GANTI INI dengan URL deployment Google Apps Script kamu
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbxyylv_1YJfTcht5aUepra1-29S50gRnZPstx8keX6XPk96EShn3_JDcQKT-GyBuVMk/exec',

  APP_NAME:        'NexaIoT',
  VERSION:         '2.0.0',

  // Default refresh interval (detik) — bisa diubah dari Settings
  DEFAULT_REFRESH:  10,

  // Map tile (OpenStreetMap, gratis)
  MAP_TILE: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',

  // Warna tema
  COLORS: {
    accent:  '#00d4aa',
    accent2: '#0099ff',
    accent3: '#7c3aed',
    danger:  '#ef4444',
    warn:    '#f59e0b',
    success: '#22c55e',
  }
};

// Jangan ubah di bawah ini
window.NEXAIOT = window.NEXAIOT || {};
window.NEXAIOT.config = NEXAIOT_CONFIG;
