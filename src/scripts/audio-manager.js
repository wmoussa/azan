import { debugLog } from './utils.js';

export class AudioManager {
    constructor() {
        // If an instance already exists, return it
        if (AudioManager.instance) {
            return AudioManager.instance;
        }

        // Store the instance
        AudioManager.instance = this;

        // Initialize properties
        this.audioContext = null;
        this.sounds = {
            silent: './sounds/10-seconds-of-silence.mp3',
            adhan: {
                shia: './sounds/adhan_alhalawaji.mp3'
            }
        };
        this.buffers = {};
        this.initialized = false;
        this.currentAdhan = 'shia';
        this.silentAudioInterval = null;
        this.lastPlayedAdhan = {
            fajr: 0,
            dhuhr: 0,
            asr: 0,
            maghrib: 0,
            isha: 0
        };

        console.log('[AudioManager] Initialized with sounds:', this.sounds);
    }

    async init() {
        if (this.initialized) {
            console.log('[AudioManager] Already initialized, skipping');
            return;
        }

        try {
            debugLog('[AudioManager] Starting initialization...');

            // Create audio context
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioContext();

            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // Load all sounds
            await this.loadSounds();

            this.initialized = true;
            this.initSilentAudio();

            debugLog('[AudioManager] Initialization complete');
            return true;
        } catch (error) {
            debugLog('[AudioManager] Initialization failed:', error);
            throw error;
        }
    }

    async loadSounds() {
        console.log('[AudioManager] Loading sounds...');
        debugLog('Starting to load sounds');
        const loadPromises = [];

        // Load silent audio
        loadPromises.push(this.loadSound('silent', this.sounds.silent));

        // Load adhan sounds
        for (const [type, url] of Object.entries(this.sounds.adhan)) {
            loadPromises.push(this.loadSound(`adhan_${type}`, url));
        }

        try {
            await Promise.all(loadPromises);
            debugLog('All sounds loaded successfully', {
                loadedSounds: Object.keys(this.buffers)
            });
            console.log('[AudioManager] All sounds loaded:', Object.keys(this.buffers));
        } catch (error) {
            debugLog('Error loading sounds', {
                error: error.message,
                stack: error.stack
            });
        }
    }

    async loadSound(name, url) {
        try {
            debugLog(`Loading sound: ${name} from ${url}`);
            const response = await fetch(url);
            if (!response.ok) {
                const errorDetails = {
                    status: response.status,
                    statusText: response.statusText,
                    url: url
                };
                debugLog(`Fetch failed for ${name}:`, errorDetails);
                throw new Error(`HTTP error! status: ${response.status}, statusText: ${response.statusText}`);
            }
            const arrayBuffer = await response.arrayBuffer();

            // Add size check and logging
            const bufferSize = arrayBuffer.byteLength;
            debugLog(`Received arrayBuffer for ${name}:`, {
                byteLength: bufferSize,
                url: url
            });

            if (bufferSize === 0) {
                throw new Error(`Received empty array buffer for ${name}`);
            }

            // Add try-catch specifically for decoding
            try {
                // Use Promise-based decodeAudioData
                const audioBuffer = await new Promise((resolve, reject) => {
                    this.audioContext.decodeAudioData(
                        arrayBuffer,
                        (decodedData) => {
                            debugLog(`Successfully decoded ${name}`, {
                                duration: decodedData.duration,
                                numberOfChannels: decodedData.numberOfChannels,
                                sampleRate: decodedData.sampleRate
                            });
                            resolve(decodedData);
                        },
                        (error) => {
                            debugLog(`Error decoding ${name}:`, error);
                            reject(error);
                        }
                    );
                });

                // Validate the decoded audio buffer
                if (!audioBuffer || audioBuffer.length === 0) {
                    throw new Error(`Invalid audio buffer for ${name}`);
                }

                this.buffers[name] = audioBuffer;
                debugLog(`Successfully loaded sound: ${name}`);
            } catch (decodeError) {
                debugLog(`Failed to decode audio data for ${name}:`, {
                    error: decodeError.message,
                    stack: decodeError.stack
                });
                throw decodeError;
            }
        } catch (error) {
            debugLog(`Failed to load sound ${name}:`, {
                error: error.message,
                stack: error.stack,
                url: url
            });

            if (name === 'silent') {
                // For silent audio, create a fallback buffer
                debugLog('Creating fallback silent buffer');
                try {
                    const sampleRate = this.audioContext.sampleRate;
                    const buffer = this.audioContext.createBuffer(1, sampleRate * 10, sampleRate); // 10 seconds
                    const channelData = buffer.getChannelData(0);
                    // Fill with silence (zeros)
                    for (let i = 0; i < channelData.length; i++) {
                        channelData[i] = 0;
                    }
                    this.buffers[name] = buffer;
                    debugLog('Created fallback silent buffer successfully');
                    return;
                } catch (fallbackError) {
                    debugLog('Failed to create fallback silent buffer:', fallbackError);
                    throw fallbackError;
                }
            }
            throw error;
        }
    }

    async playAdhan(isManualTrigger = false) {
        try {
            await this.init();
            const soundName = `adhan_${this.currentAdhan}`;
            await this.playSound(soundName);

            // Update UI elements
            const button = document.querySelector('.test-sound');
            if (button) {
                button.textContent = 'Test Adhan Sound';
                button.disabled = false;
            }

        } catch (error) {
            console.error('[AudioManager] Error playing Adhan:', error);
            this.handlePlaybackError(error);
        }
    }

    async playSound(soundName) {
        debugLog(`Attempting to play sound: ${soundName}`);

        try {
            if (!this.initialized) {
                debugLog('Not initialized, initializing now...');
                await this.init();
            }

            if (this.audioContext.state === 'suspended') {
                debugLog('Audio context suspended, resuming...');
                await this.audioContext.resume();
            }

            if (!this.buffers[soundName]) {
                throw new Error(`Sound ${soundName} not found in buffers`);
            }

            debugLog(`Playing sound: ${soundName}`);
            const source = this.audioContext.createBufferSource();
            source.buffer = this.buffers[soundName];

            // Add a gain node for volume control
            const gainNode = this.audioContext.createGain();
            if (soundName === 'silent') {
                // Set very low but non-zero volume for silent sound
                gainNode.gain.value = 0.01;
                debugLog('Set silent sound volume', { gainValue: gainNode.gain.value });
            }

            source.connect(gainNode);
            gainNode.connect(this.audioContext.destination);

            return new Promise((resolve, reject) => {
                source.onended = () => {
                    debugLog(`Sound ${soundName} finished playing`, {
                        duration: source.buffer.duration,
                        currentTime: this.audioContext.currentTime
                    });
                    if (soundName === 'silent') {
                        debugLog('Silent sound interval played successfully');
                    }
                    resolve();
                };
                source.onerror = (error) => {
                    debugLog('Error playing sound', { error, soundName });
                    if (soundName === 'silent') {
                        debugLog('Silent sound interval failed', { error });
                    }
                    reject(error);
                };
                source.start(0);
            });
        } catch (error) {
            debugLog('Error in playSound', { error, soundName });
            if (soundName === 'silent') {
                debugLog('Silent sound interval failed', { error });
            }
            throw error;
        }
    }

    initSilentAudio() {
        debugLog('Initializing silent audio interval');
        this.clearSilentAudioInterval();
        this.silentAudioInterval = setInterval(() => {
            debugLog('Attempting to play silent sound interval');
            this.playSound('silent').catch(error => {
                debugLog('Silent audio play failed', { error });
            });
        }, 120000); // Changed from 600000 (10 minutes) to 120000 (2 minutes)
    }

    clearSilentAudioInterval() {
        if (this.silentAudioInterval) {
            clearInterval(this.silentAudioInterval);
            this.silentAudioInterval = null;
        }
    }

    handlePlaybackError(error) {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const button = document.querySelector('.test-sound');
        if (button) {
            button.textContent = 'Test Adhan Sound';
            button.disabled = false;
        }

        if (isIOS) {
            alert('To enable Adhan playback on iOS:\n1. Add this page to your home screen\n2. Open it from there\n3. Tap the test button once');
        } else {
            alert('Unable to play Adhan. Please ensure audio playback is enabled on your device.');
        }
    }

    async initializeWithButton() {
        try {
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
            const button = document.getElementById('initAudio');

            debugLog('Starting audio initialization', {
                platform: isIOS ? 'iOS' : 'other',
                userAgent: navigator.userAgent
            });

            if (button) {
                button.disabled = true;
                button.textContent = 'Initializing...';
            }

            console.log('[AudioManager] Starting initialization...');

            try {
                // Create audio context if it doesn't exist
                if (!this.audioContext) {
                    const AudioContext = window.AudioContext || window.webkitAudioContext;
                    this.audioContext = new AudioContext();
                    debugLog('Created new AudioContext', {
                        state: this.audioContext.state,
                        sampleRate: this.audioContext.sampleRate
                    });
                }
            } catch (error) {
                debugLog('Failed to create AudioContext', {
                    error: error.message,
                    stack: error.stack
                });
                throw error;
            }

            try {
                // Resume audio context if suspended
                if (this.audioContext.state === 'suspended') {
                    debugLog('Attempting to resume AudioContext');
                    await this.audioContext.resume();
                    debugLog('Resumed AudioContext', {
                        newState: this.audioContext.state
                    });
                }
            } catch (error) {
                debugLog('Failed to resume AudioContext', {
                    error: error.message,
                    stack: error.stack
                });
                throw error;
            }

            try {
                debugLog('Starting init() process');
                await this.init();
                debugLog('Completed init() process');
            } catch (error) {
                debugLog('Failed during init() process', {
                    error: error.message,
                    stack: error.stack
                });
                throw error;
            }

            // For iOS, create a short silent buffer
            if (isIOS) {
                try {
                    debugLog('Creating silent buffer for iOS');
                    const buffer = this.audioContext.createBuffer(1, 1, 22050);
                    const source = this.audioContext.createBufferSource();
                    source.buffer = buffer;
                    source.connect(this.audioContext.destination);
                    await source.start();
                    debugLog('Silent buffer played successfully');
                } catch (error) {
                    debugLog('Failed to play silent buffer', {
                        error: error.message,
                        stack: error.stack
                    });
                    // Don't throw here, as this is not critical
                }
            }

            if (button) {
                button.disabled = false;
                button.textContent = 'Audio Initialized';
                button.classList.add('initialized');
            }

            debugLog('Audio initialization successful', {
                contextState: this.audioContext?.state,
                buffersLoaded: Object.keys(this.buffers)
            });

            console.log('[AudioManager] Audio initialized successfully');
            return true;
        } catch (error) {
            console.error('[AudioManager] Initialization error:', error);
            debugLog('Audio initialization failed', {
                error: error.message,
                stack: error.stack,
                contextState: this.audioContext?.state
            });

            const button = document.getElementById('initAudio');
            if (button) {
                button.disabled = false;
                button.textContent = 'Retry Initialize';
                button.classList.remove('initialized');
            }

            // Re-throw the error to be handled by the caller
            throw error;
        }
    }
}

// Create and export a single instance
export const audioManager = new AudioManager(); 