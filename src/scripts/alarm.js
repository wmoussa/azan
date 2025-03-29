// Instead, import the singleton instance
import { audioManager } from './audio-manager.js';
import { debugLog } from './utils.js';

// Initialize only after window is fully loaded
window.addEventListener('load', () => {
    console.log('Window loaded, initializing...');

    // Clear debug logs on page load
    localStorage.removeItem('debugLogs');
    console.log('Debug logs cleared on page load');

    // Initialize the audio button state
    const initButton = document.getElementById('initAudio');

    if (initButton) {
        // Add visual cue to init button
        initButton.style.animation = 'pulse 2s infinite';

        // Add click handler for initialization
        initButton.addEventListener('click', initializeAudio);
    }

    displayPrayerTimes();

    // Add event listener for debug button
    const debugButton = document.getElementById('debug-button');
    if (debugButton) {
        debugButton.addEventListener('click', showDebugLogs);
    }

    // Update times every hour
    setInterval(() => {
        console.log('Updating prayer times...');
        displayPrayerTimes();
        updateDateTime();
    }, 3600000); // 1 hour in milliseconds

    // Update next prayer highlight every minute
    setInterval(periodicUpdates, 60000); // 1 minute in milliseconds
});

// Add this to your HTML to show logs when needed
document.addEventListener('keydown', function (e) {
    // Press 'D' key to show debug logs
    if (e.key === 'd' || e.key === 'D') {
        showDebugLogs();
    }
});

// Function to get user's current location with Safari support
async function getCurrentLocation() {
    return new Promise(async (resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation is not supported by your browser'));
            return;
        }

        try {
            // For Safari iOS, we'll skip the permissions query as it's not well supported
            const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

            if (!isSafari && !isIOS) {
                const permission = await navigator.permissions.query({ name: 'geolocation' });
                if (permission.state === 'denied') {
                    reject(new Error('Location permission was denied. Please enable location services for this website in your browser settings.'));
                    return;
                }
            }

            // Try to get cached position first
            const cachedPosition = localStorage.getItem('lastKnownPosition');
            if (cachedPosition) {
                try {
                    const position = JSON.parse(cachedPosition);
                    const positionAge = Date.now() - position.timestamp;
                    if (positionAge < 3600000) { // Use cache if less than 1 hour old
                        resolve(position);
                        // Still try to update in background
                        updatePositionInBackground({
                            enableHighAccuracy: false,
                            timeout: 30000,
                            maximumAge: 300000
                        });
                        return;
                    }
                } catch (e) {
                    console.warn('Error parsing cached position:', e);
                    localStorage.removeItem('lastKnownPosition');
                }
            }

            // Safari iOS specific options
            const options = {
                enableHighAccuracy: false,
                timeout: 30000,
                maximumAge: 300000
            };

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    try {
                        // Cache the successful position
                        const positionToCache = {
                            coords: {
                                latitude: position.coords.latitude,
                                longitude: position.coords.longitude
                            },
                            timestamp: Date.now()
                        };
                        localStorage.setItem('lastKnownPosition', JSON.stringify(positionToCache));
                        resolve(position);
                    } catch (e) {
                        console.error('Error caching position:', e);
                        resolve(position); // Still resolve with the position even if caching fails
                    }
                },
                (err) => {
                    // Try to use cached position as fallback
                    const cachedPosition = localStorage.getItem('lastKnownPosition');
                    if (cachedPosition) {
                        try {
                            console.warn('Using cached position due to error:', err);
                            resolve(JSON.parse(cachedPosition));
                            return;
                        } catch (e) {
                            console.warn('Error parsing cached position:', e);
                            localStorage.removeItem('lastKnownPosition');
                        }
                    }

                    let errorMessage;
                    switch (err.code) {
                        case 1: // PERMISSION_DENIED
                            errorMessage = "Location access was denied. Please enable location services in your device settings and refresh the page.";
                            break;
                        case 2: // POSITION_UNAVAILABLE
                            errorMessage = "Location information is unavailable. Please check your device's location settings.";
                            break;
                        case 3: // TIMEOUT
                            errorMessage = "Location request timed out. Please check your internet connection and try again.";
                            break;
                        default:
                            errorMessage = "An unknown error occurred while getting location.";
                    }
                    reject(new Error(errorMessage));
                },
                options
            );
        } catch (error) {
            // Final fallback to cached position
            const cachedPosition = localStorage.getItem('lastKnownPosition');
            if (cachedPosition) {
                try {
                    console.warn('Using cached position due to error:', error);
                    resolve(JSON.parse(cachedPosition));
                    return;
                } catch (e) {
                    console.warn('Error parsing cached position:', e);
                    localStorage.removeItem('lastKnownPosition');
                }
            }
            reject(error);
        }
    });
}

// Helper function to update position in background
function updatePositionInBackground(options) {
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const positionToCache = {
                coords: {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                },
                timestamp: Date.now()
            };
            localStorage.setItem('lastKnownPosition', JSON.stringify(positionToCache));
        },
        (error) => {
            console.warn('Background position update failed:', error);
        },
        options
    );
}

// Function to format time in 12-hour format with Safari support
function formatTime(date) {
    // Check if date is valid
    if (!(date instanceof Date) || isNaN(date)) {
        return 'Invalid Time';
    }

    try {
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        });
    } catch (error) {
        // Fallback formatting for older browsers
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        const formattedHours = hours % 12 || 12;
        const formattedMinutes = minutes < 10 ? '0' + minutes : minutes;
        return `${formattedHours}:${formattedMinutes} ${ampm}`;
    }
}

// Function to format date as DD-MM-YYYY
function formatDateForAPI(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

// Function to calculate and display prayer times
async function displayPrayerTimes() {
    try {
        console.log('Starting displayPrayerTimes...');

        // Get current location
        console.log('Getting current location...');
        const position = await getCurrentLocation();
        console.log('Location received:', {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
        });

        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;

        // Format today's date for the API
        const today = new Date();
        const dateStrApi = formatDateForAPI(today);

        // Call the Al-Adhan API with formatted date
        const apiUrl = `https://api.aladhan.com/v1/timings/${dateStrApi}?latitude=${latitude}&longitude=${longitude}&method=0&school=0`;
        console.log('Attempting API call to:', apiUrl);

        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json'
            }
        });
        console.log('API response status:', response.status);

        if (!response.ok) {
            console.error('API response not OK:', {
                status: response.status,
                statusText: response.statusText
            });
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('API data received:', data);

        if (!data.data || !data.data.timings) {
            throw new Error('Invalid response from prayer times API');
        }

        // Safari-friendly date parsing
        function parseTime(timeStr, dateStr) {
            console.log('Parsing time:', timeStr, 'for date:', dateStr);
            try {
                const [hours, minutes] = timeStr.split(':').map(Number);
                const [day, month, year] = dateStr.split('-').map(Number);
                const date = new Date();
                date.setFullYear(year);
                date.setMonth(month - 1); // Months are 0-based
                date.setDate(day);
                date.setHours(hours, minutes, 0, 0);
                return date;
            } catch (e) {
                console.error('Error parsing time:', e);
                return null;
            }
        }

        // Parse the date in a Safari-friendly way
        const dateStr = data.data.date.gregorian.date;
        console.log('Parsing date:', dateStr);

        const prayers = {
            fajr: parseTime(data.data.timings.Fajr, dateStr),
            dhuhr: parseTime(data.data.timings.Dhuhr, dateStr),
            asr: parseTime(data.data.timings.Asr, dateStr),
            maghrib: parseTime(data.data.timings.Maghrib, dateStr),
            isha: parseTime(data.data.timings.Isha, dateStr)
        };

        // Verify all times were parsed correctly
        const invalidTimes = Object.entries(prayers).filter(([name, time]) => !time);
        if (invalidTimes.length > 0) {
            throw new Error(`Failed to parse prayer times: ${invalidTimes.map(([name]) => name).join(', ')}`);
        }

        // Update the HTML with prayer times
        for (const [prayer, time] of Object.entries(prayers)) {
            const element = document.querySelector(`#${prayer} .time`);
            if (element) {
                element.textContent = formatTime(time);
            }
        }

        // Check for adhan separately to avoid race conditions
        checkAndPlayAdhan(prayers);

        // Update the next prayer highlight
        updateNextPrayer(prayers);

    } catch (error) {
        console.error('Full error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });

        debugLog('Prayer times error', {
            error: error.message,
            stack: error.stack
        });

        let errorMessage = 'Unable to calculate prayer times. ';
        if (error.message.includes('parse')) {
            errorMessage += 'Error processing prayer times data. Please refresh the page.';
        } else if (error.message.includes('HTTP error')) {
            errorMessage += 'The prayer times service is currently unavailable. Please try again later.';
        } else if (error.message.includes('location')) {
            errorMessage += 'Please ensure location services are enabled and refresh the page.';
        } else {
            errorMessage += `Error: ${error.message}`;
        }

        alert(errorMessage);
    }
}

// Update the initializeAudio function
async function initializeAudio() {
    const initButton = document.getElementById('initAudio');
    const testButton = document.querySelector('.test-sound');

    try {
        debugLog('[AlarmSystem] Initializing audio...');

        if (initButton) {
            initButton.disabled = true;
            initButton.textContent = 'Initializing...';
        }

        await audioManager.init();

        if (initButton) {
            initButton.textContent = 'Audio Ready';
            initButton.disabled = true;
            initButton.classList.add('initialized');
        }

        // Enable test button after initialization
        if (testButton) {
            testButton.disabled = false;
        }

        debugLog('[AlarmSystem] Audio initialized successfully');
    } catch (error) {
        debugLog('[AlarmSystem] Failed to initialize audio:', error);

        if (initButton) {
            initButton.disabled = false;
            initButton.textContent = 'Retry Initialize';
            initButton.classList.remove('initialized');
        }

        alert('Failed to initialize audio. Please try again.');
    }
}

async function playAdhan(isManualTrigger = false) {
    await audioManager.playAdhan(isManualTrigger);
}

// Add at the beginning of the file
function updateDateTime() {
    const dateElement = document.getElementById('current-date');
    const timeElement = document.getElementById('current-time');

    const now = new Date();

    // Format date as: "Sunday, January 1, 2024"
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateElement.textContent = now.toLocaleDateString('en-US', dateOptions);

    // Format time as: "12:00:00 PM"
    const timeOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true };
    timeElement.textContent = now.toLocaleTimeString('en-US', timeOptions);
}

// Update date and time every second
setInterval(updateDateTime, 1000);
updateDateTime(); // Initial call

// Add this function after the formatTime function
function updateNextPrayer(prayers) {
    // Remove previous next-prayer class from all prayers
    document.querySelectorAll('.prayer-time').forEach(el => {
        el.classList.remove('next-prayer');
    });

    const now = new Date();
    let nextPrayer = null;
    let smallestDiff = Infinity;

    // Find the next prayer
    for (const [prayer, time] of Object.entries(prayers)) {
        const timeDiff = time - now;
        if (timeDiff > 0 && timeDiff < smallestDiff) {
            smallestDiff = timeDiff;
            nextPrayer = prayer;
        }
    }

    // If no next prayer found today, first prayer of next day is next
    if (!nextPrayer) {
        nextPrayer = 'fajr';
    }

    // Add highlight to next prayer
    const nextPrayerElement = document.getElementById(nextPrayer);
    if (nextPrayerElement) {
        nextPrayerElement.classList.add('next-prayer');
    }
}

// Add this function to handle periodic updates
function periodicUpdates() {
    const prayers = getPrayerTimesFromDOM();
    if (prayers) {
        updateNextPrayer(prayers);
        checkAndPlayAdhan(prayers);
    }
}

// Function to get prayer times from DOM
function getPrayerTimesFromDOM() {
    const prayers = {};
    const prayerNames = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];

    for (const prayer of prayerNames) {
        const timeElement = document.querySelector(`#${prayer} .time`);
        if (timeElement) {
            const timeStr = timeElement.textContent;
            const today = new Date();
            const [time, period] = timeStr.split(' ');
            const [hours, minutes] = time.split(':');

            let hour = parseInt(hours);
            if (period === 'PM' && hour !== 12) hour += 12;
            if (period === 'AM' && hour === 12) hour = 0;

            today.setHours(hour, parseInt(minutes), 0);
            prayers[prayer] = today;
        }
    }

    return Object.keys(prayers).length === 5 ? prayers : null;
}

// Update the showDebugLogs function to fix button functionality
function showDebugLogs() {
    try {
        const logs = JSON.parse(localStorage.getItem('debugLogs') || '[]');
        const debugButton = document.getElementById('debug-button');

        // Create a modal for displaying logs
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 90%;
            max-width: 800px;
            height: 80%;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 0 20px rgba(0,0,0,0.3);
            z-index: 1000;
            display: flex;
            flex-direction: column;
        `;

        // Add active state to debug button
        if (debugButton) {
            debugButton.classList.add('active');
        }

        // When modal is closed, remove active state
        modal.addEventListener('remove', () => {
            if (debugButton) {
                debugButton.classList.remove('active');
            }
        });

        // Create content element first so we can reference it in button handlers
        const content = document.createElement('div');
        content.style.cssText = `
            flex: 1;
            overflow-y: auto;
            background: #f5f5f5;
            padding: 10px;
            border-radius: 4px;
            font-family: monospace;
            white-space: pre-wrap;
            margin-top: 10px;
        `;

        // Create buttons with proper event listeners
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.onclick = () => modal.remove();

        const clearBtn = document.createElement('button');
        clearBtn.textContent = 'Clear';
        clearBtn.onclick = () => {
            if (confirm('Are you sure you want to clear all logs?')) {
                localStorage.removeItem('debugLogs');
                content.textContent = 'No logs available';
            }
        };

        const downloadBtn = document.createElement('button');
        downloadBtn.textContent = 'Download';
        downloadBtn.onclick = () => {
            const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `debug-logs-${new Date().toISOString()}.json`;
            a.click();
            URL.revokeObjectURL(url);
        };

        // Create header with buttons
        const header = document.createElement('div');
        header.style.marginBottom = '10px';
        const headerContent = document.createElement('div');
        headerContent.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';

        const title = document.createElement('h2');
        title.style.margin = '0';
        title.textContent = 'Debug Logs';

        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'display: flex; gap: 8px;';
        buttonContainer.appendChild(downloadBtn);
        buttonContainer.appendChild(clearBtn);
        buttonContainer.appendChild(closeBtn);

        headerContent.appendChild(title);
        headerContent.appendChild(buttonContainer);
        header.appendChild(headerContent);

        // Format logs
        const formattedLogs = logs.map(log => {
            const time = new Date(log.timestamp).toLocaleString();
            let formattedData = '';
            try {
                formattedData = log.data ? JSON.parse(log.data) : '';
                formattedData = JSON.stringify(formattedData, null, 2);
            } catch (e) {
                formattedData = log.data;
            }

            return `[${time}] ${log.message}\n${formattedData ? `Data: ${formattedData}\n` : ''}${'-'.repeat(50)}`;
        }).join('\n\n');

        content.textContent = formattedLogs || 'No logs available';

        // Assemble modal
        modal.appendChild(header);
        modal.appendChild(content);
        document.body.appendChild(modal);

    } catch (error) {
        console.error('Error showing debug logs:', error);
        alert('Error showing debug logs. Check console for details.');
    }
}

// Add new function to handle adhan checks
function checkAndPlayAdhan(prayers) {
    const now = new Date();

    for (const [prayer, time] of Object.entries(prayers)) {
        const timeDiff = Math.abs(now - time);
        const diffInSeconds = timeDiff / 1000;

        // Check if we're within 30 seconds of prayer time
        if (diffInSeconds <= 30) {
            const lastPlayedTime = audioManager.lastPlayedAdhan[prayer] || 0;
            const timeSinceLastPlayed = (now.getTime() - lastPlayedTime) / 1000;

            // Only play if we haven't played in the last minute
            if (timeSinceLastPlayed > 60) {
                console.log(`Playing adhan for ${prayer}`);
                playAdhan();
                audioManager.lastPlayedAdhan[prayer] = now.getTime();
            }
        }
    }
}
