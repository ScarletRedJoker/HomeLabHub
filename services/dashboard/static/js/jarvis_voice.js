/**
 * Jarvis Voice Interface - Web Speech API Integration
 * Provides voice command input and speech synthesis output
 */

class JarvisVoice {
    constructor() {
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.isListening = false;
        this.isStopping = false;
        this.isPausedForTTS = false;
        this.sessionId = null;
        this.voices = [];
        
        // Command patterns for intent detection
        this.commandPatterns = {
            deploy: /^(?:deploy|create|build)\s+(?:a\s+)?(.+?)(?:\s+(?:project|website|app|application))?(?:\s+(?:on|at|for)\s+(.+))?$/i,
            database: /^(?:create|make|setup)\s+(?:a\s+)?(postgres|mysql|mongodb)\s+database\s+(?:called|named)?\s*(.+)$/i,
            ssl: /^(?:check|renew|create)\s+(?:ssl|certificate)\s+(?:for\s+)?(.+)$/i,
            query: /^(?:what|how|why|when|where|who|tell me|show me|explain)/i
        };
        
        this.init();
    }
    
    init() {
        // Check for browser support
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            console.error('Web Speech API not supported in this browser');
            this.showError('Voice recognition not supported in your browser. Please use Chrome, Edge, or Safari.');
            return;
        }
        
        // Initialize speech recognition
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
        
        // Event handlers
        this.recognition.onstart = () => this.onRecognitionStart();
        this.recognition.onresult = (event) => this.onRecognitionResult(event);
        this.recognition.onerror = (event) => this.onRecognitionError(event);
        this.recognition.onend = () => this.onRecognitionEnd();
        
        // Load available voices
        this.synthesis.onvoiceschanged = () => {
            this.voices = this.synthesis.getVoices();
        };
        
        // Initialize UI elements
        this.initUI();
        
        console.log('Jarvis Voice Interface initialized');
    }
    
    initUI() {
        const micButton = document.getElementById('voice-mic-button');
        const stopButton = document.getElementById('voice-stop-button');
        
        if (micButton) {
            micButton.addEventListener('click', () => this.startListening());
        }
        
        if (stopButton) {
            stopButton.addEventListener('click', () => this.stopListening());
        }
    }
    
    startListening() {
        if (!this.recognition) {
            this.showError('Voice recognition not available');
            return;
        }
        
        if (this.isListening) {
            console.log('Already listening');
            return;
        }
        
        try {
            this.recognition.start();
            // UI will be updated by onRecognitionStart
        } catch (error) {
            console.error('Error starting recognition:', error);
            // If recognition partially started, clean up state
            if (error.message && error.message.includes('already')) {
                // Recognition is already running, leave state as-is
                console.log('Recognition already running');
            } else {
                // Real error - reset state
                this.enterIdleState();
                this.showError('Failed to start voice recognition. Please check microphone permissions and try again.');
            }
        }
    }
    
    stopListening() {
        // Check if recognition exists before trying to stop
        if (!this.recognition) {
            console.log('Recognition not available');
            return;
        }
        
        // Mark as manual stop
        this.isStopping = true;
        
        // Stop recognition if running
        try {
            this.recognition.stop();
        } catch (error) {
            console.error('Error stopping recognition:', error);
            // Force state reset even if stop failed
            this.enterIdleState();
        }
    }
    
    onRecognitionStart() {
        this.enterListeningState();
        console.log('Voice recognition started');
    }
    
    onRecognitionResult(event) {
        let interimTranscript = '';
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                finalTranscript += transcript;
            } else {
                interimTranscript += transcript;
            }
        }
        
        // Update transcript display
        if (finalTranscript) {
            this.displayTranscript(finalTranscript, true);
            this.processCommand(finalTranscript);
        } else if (interimTranscript) {
            this.displayTranscript(interimTranscript, false);
        }
    }
    
    onRecognitionError(event) {
        console.log('Recognition error event:', event.error);
        
        // Ignore errors during TTS pause (abort is intentional)
        if (this.isPausedForTTS) {
            console.log('Ignoring error during TTS pause (intentional abort)');
            return;
        }
        
        // Real error occurred - reset state first
        this.enterIdleState();
        
        // Show context-specific error messages
        const errorMessages = {
            'no-speech': 'No speech detected. Try speaking louder or closer to your microphone.',
            'audio-capture': 'No microphone found. Please check that your microphone is connected and try again.',
            'not-allowed': 'Microphone access denied. Please allow microphone access in your browser settings and reload the page.',
            'network': 'Network error occurred. Please check your internet connection.',
            'aborted': 'Voice recognition was stopped unexpectedly.'
        };
        
        const message = errorMessages[event.error] || `Voice recognition error: ${event.error}`;
        this.showError(message);
    }
    
    onRecognitionEnd() {
        console.log('Voice recognition ended');
        
        // Handle based on why recognition ended
        if (this.isStopping) {
            // User manually stopped
            console.log('Manual stop detected');
            this.enterIdleState();
        } else if (this.isPausedForTTS) {
            // Paused for TTS - stay in speaking state, will resume after TTS
            console.log('Recognition ended for TTS pause');
            // Don't change state - TTS handler will manage resume
        } else {
            // Natural end - auto-restart for continuous listening
            console.log('Auto-restarting recognition for continuous listening');
            setTimeout(() => {
                if (!this.isStopping && !this.isPausedForTTS) {
                    try {
                        this.recognition.start();
                        // enterListeningState() will be called by onRecognitionStart
                    } catch (error) {
                        console.error('Error restarting recognition:', error);
                        this.enterIdleState();
                    }
                }
            }, 500);
        }
    }
    
    displayTranscript(text, isFinal) {
        const transcriptEl = document.getElementById('voice-transcript');
        if (transcriptEl) {
            transcriptEl.textContent = text;
            transcriptEl.classList.toggle('final', isFinal);
        }
    }
    
    async processCommand(command) {
        this.showStatus('Processing command...', 'info');
        this.addToHistory('user', command);
        
        try {
            // Detect command intent
            let response;
            
            if (this.commandPatterns.deploy.test(command)) {
                response = await this.handleDeployCommand(command);
            } else if (this.commandPatterns.database.test(command)) {
                response = await this.handleDatabaseCommand(command);
            } else if (this.commandPatterns.ssl.test(command)) {
                response = await this.handleSSLCommand(command);
            } else {
                response = await this.handleQueryCommand(command);
            }
            
            if (response && response.success) {
                const message = response.message || response.response || 'Command executed successfully';
                this.speak(message);
                this.addToHistory('jarvis', message);
                this.showStatus('Command completed', 'success');
            } else {
                const error = response?.error || 'Command failed';
                this.speak(`Error: ${error}`);
                this.addToHistory('error', error);
                this.showStatus(error, 'error');
            }
        } catch (error) {
            console.error('Error processing command:', error);
            const errorMsg = error.message || 'Failed to process command';
            this.speak(`Error: ${errorMsg}`);
            this.showError(errorMsg);
        }
    }
    
    async handleDeployCommand(command) {
        const match = command.match(this.commandPatterns.deploy);
        if (!match) return { success: false, error: 'Could not parse deploy command' };
        
        const projectName = match[1].trim();
        const domain = match[2]?.trim();
        
        return await this.apiRequest('/api/jarvis/voice/deploy', {
            command: 'deploy',
            params: {
                project_name: projectName,
                project_type: 'website',
                domain: domain
            }
        });
    }
    
    async handleDatabaseCommand(command) {
        const match = command.match(this.commandPatterns.database);
        if (!match) return { success: false, error: 'Could not parse database command' };
        
        const dbType = match[1].toLowerCase();
        const dbName = match[2].trim();
        
        return await this.apiRequest('/api/jarvis/voice/database', {
            db_type: dbType,
            db_name: dbName
        });
    }
    
    async handleSSLCommand(command) {
        const match = command.match(this.commandPatterns.ssl);
        if (!match) return { success: false, error: 'Could not parse SSL command' };
        
        const domain = match[1].trim();
        const action = command.toLowerCase().includes('renew') ? 'renew' :
                      command.toLowerCase().includes('create') ? 'create' : 'check';
        
        return await this.apiRequest('/api/jarvis/voice/ssl', {
            domain: domain,
            action: action
        });
    }
    
    async handleQueryCommand(command) {
        return await this.apiRequest('/api/jarvis/voice/query', {
            message: command,
            session_id: this.sessionId
        });
    }
    
    async apiRequest(endpoint, data) {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': this.getApiKey()
            },
            body: JSON.stringify(data)
        });
        
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        
        const result = await response.json();
        
        // Store session ID if returned
        if (result.session_id) {
            this.sessionId = result.session_id;
        }
        
        return result;
    }
    
    speak(text) {
        if (!this.synthesis) {
            console.error('Speech synthesis not available');
            return;
        }
        
        // Pause recognition during TTS to prevent self-feedback loop
        const wasListening = this.isListening;
        if (wasListening && this.recognition) {
            console.log('Pausing recognition during TTS playback');
            this.isPausedForTTS = true;  // Mark as TTS pause (not user stop)
            try {
                this.recognition.abort();  // Use abort() instead of stop() to prevent 'no-speech' error
            } catch (error) {
                console.error('Error aborting recognition for TTS:', error);
                // Continue with TTS even if abort failed
            }
        }
        
        // Cancel any ongoing speech
        this.synthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        
        // Use a natural-sounding voice if available
        const preferredVoices = ['Google US English', 'Microsoft Zira', 'Alex', 'Samantha'];
        const voice = this.voices.find(v => preferredVoices.some(pv => v.name.includes(pv)));
        if (voice) {
            utterance.voice = voice;
        }
        
        utterance.onstart = () => {
            this.enterSpeakingState();
        };
        
        utterance.onend = () => {
            // Resume recognition after TTS completes (if it was listening before)
            this.isPausedForTTS = false;
            if (wasListening) {
                console.log('Resuming recognition after TTS playback');
                setTimeout(() => {
                    if (!this.isStopping) {
                        try {
                            this.recognition.start();
                            // enterListeningState() will be called by onRecognitionStart
                        } catch (error) {
                            console.error('Error resuming recognition:', error);
                            this.enterIdleState();
                        }
                    }
                }, 500);
            } else {
                this.enterIdleState();
            }
        };
        
        utterance.onerror = (error) => {
            console.error('Speech synthesis error:', error);
            this.isPausedForTTS = false;
            if (wasListening && !this.isStopping) {
                // Try to resume even on error
                setTimeout(() => {
                    try {
                        this.recognition.start();
                    } catch (e) {
                        console.error('Error resuming after TTS error:', e);
                        this.enterIdleState();
                    }
                }, 500);
            } else {
                this.enterIdleState();
            }
        };
        
        this.synthesis.speak(utterance);
    }
    
    updateUI(state) {
        const micButton = document.getElementById('voice-mic-button');
        const stopButton = document.getElementById('voice-stop-button');
        const indicator = document.getElementById('voice-indicator');
        
        if (micButton) {
            micButton.disabled = (state === 'listening' || state === 'speaking');
            micButton.classList.toggle('active', state === 'listening');
        }
        
        if (stopButton) {
            // Keep stop button enabled while listening OR speaking to allow cancel
            stopButton.disabled = (state !== 'listening' && state !== 'speaking');
        }
        
        if (indicator) {
            indicator.className = `voice-indicator ${state}`;
            const stateText = {
                'idle': 'Ready',
                'listening': 'Listening...',
                'speaking': 'Speaking...',
                'processing': 'Processing...'
            };
            indicator.textContent = stateText[state] || 'Ready';
        }
    }
    
    addToHistory(role, message) {
        const historyEl = document.getElementById('voice-history');
        if (!historyEl) return;
        
        const messageEl = document.createElement('div');
        messageEl.className = `voice-message ${role}`;
        
        const iconClass = {
            'user': 'bi-person-fill',
            'jarvis': 'bi-robot',
            'error': 'bi-exclamation-triangle-fill'
        }[role] || 'bi-chat-fill';
        
        messageEl.innerHTML = `
            <div class="voice-message-icon">
                <i class="bi ${iconClass}"></i>
            </div>
            <div class="voice-message-content">
                <div class="voice-message-role">${role === 'jarvis' ? 'Jarvis' : role.charAt(0).toUpperCase() + role.slice(1)}</div>
                <div class="voice-message-text">${this.escapeHtml(message)}</div>
                <div class="voice-message-time">${new Date().toLocaleTimeString()}</div>
            </div>
        `;
        
        historyEl.appendChild(messageEl);
        historyEl.scrollTop = historyEl.scrollHeight;
    }
    
    showStatus(message, type = 'info') {
        const statusEl = document.getElementById('voice-status');
        if (!statusEl) return;
        
        statusEl.textContent = message;
        statusEl.className = `voice-status ${type}`;
        statusEl.style.display = 'block';
        
        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    }
    
    showError(message) {
        this.showStatus(message, 'error');
        this.addToHistory('error', message);
    }
    
    getApiKey() {
        return localStorage.getItem('dashboard_api_key') || '';
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    // State machine helpers for consistent state management
    enterListeningState() {
        this.isListening = true;
        this.isStopping = false;
        this.updateUI('listening');
        this.showStatus('Listening...', 'info');
    }
    
    enterSpeakingState() {
        this.updateUI('speaking');
    }
    
    enterIdleState() {
        this.isListening = false;
        this.isStopping = false;
        this.isPausedForTTS = false;
        this.updateUI('idle');
        this.showStatus('Ready', 'info');
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.jarvisVoice = new JarvisVoice();
});
