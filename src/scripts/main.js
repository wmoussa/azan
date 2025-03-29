import { debugLog, APP_VERSION } from './utils.js';
import { audioManager } from './audio-manager.js';
import './alarm.js';

// Make audioManager available globally if needed
window.audioManager = audioManager;
// Make debugLog available globally if needed
window.debugLog = debugLog;

// Display version number
document.getElementById('app-version').textContent = APP_VERSION; 