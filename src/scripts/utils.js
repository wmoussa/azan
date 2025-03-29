export const APP_VERSION = '1.0.8';

export function debugLog(message, data = null) {
    console.log(message, data);

    try {
        // Get existing logs
        const logs = JSON.parse(localStorage.getItem('debugLogs') || '[]');

        // Create new log entry with more structured data
        const logEntry = {
            timestamp: new Date().toISOString(),
            message,
            data: data ? JSON.stringify(data) : null,
            userAgent: navigator.userAgent.substring(0, 100), // Truncate user agent
            url: window.location.pathname
        };

        // Add new log to beginning (more recent first)
        logs.unshift(logEntry);

        // Keep only last 100 logs and ensure total size is under 4MB
        while (logs.length > 100 || JSON.stringify(logs).length > 4000000) {
            logs.pop();
        }

        localStorage.setItem('debugLogs', JSON.stringify(logs));
    } catch (error) {
        console.error('Error saving debug log:', error);
    }
} 