/**
 * Universal AI Helper Widget
 * Provides contextual AI assistance on any dashboard page
 */

class AIHelperWidget {
    constructor() {
        this.widgetOpen = false;
        this.conversationHistory = [];
        this.currentPage = this.detectPage();
        this.isListening = false;
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.voiceEnabled = true;
        this.initVoice();
        this.initWidget();
    }
    
    initVoice() {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            console.log('Voice recognition not supported');
            this.voiceEnabled = false;
            return;
        }
        
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
        
        this.recognition.onstart = () => {
            this.isListening = true;
            this.updateMicButton();
        };
        
        this.recognition.onresult = (event) => {
            let finalTranscript = '';
            let interimTranscript = '';
            
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript;
                } else {
                    interimTranscript += transcript;
                }
            }
            
            const input = document.getElementById('aiHelperInput');
            if (finalTranscript) {
                input.value = finalTranscript;
                this.sendMessage();
            } else if (interimTranscript) {
                input.value = interimTranscript;
            }
        };
        
        this.recognition.onerror = (event) => {
            console.log('Voice recognition error:', event.error);
            this.isListening = false;
            this.updateMicButton();
        };
        
        this.recognition.onend = () => {
            this.isListening = false;
            this.updateMicButton();
        };
    }
    
    updateMicButton() {
        const micBtn = document.getElementById('aiHelperMic');
        if (micBtn) {
            if (this.isListening) {
                micBtn.classList.add('listening');
                micBtn.innerHTML = '<i class="bi bi-mic-fill"></i>';
            } else {
                micBtn.classList.remove('listening');
                micBtn.innerHTML = '<i class="bi bi-mic"></i>';
            }
        }
    }
    
    toggleVoice() {
        if (!this.voiceEnabled || !this.recognition) {
            this.addMessage('error', 'Voice recognition not supported in your browser');
            return;
        }
        
        if (this.isListening) {
            this.recognition.stop();
        } else {
            try {
                this.recognition.start();
            } catch (error) {
                console.error('Voice start error:', error);
            }
        }
    }
    
    speak(text) {
        if (!this.synthesis) return;
        
        this.synthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        
        const voices = this.synthesis.getVoices();
        const preferredVoice = voices.find(v => 
            v.name.includes('Google') || v.name.includes('Microsoft') || v.name.includes('Samantha')
        );
        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }
        
        this.synthesis.speak(utterance);
    }

    detectPage() {
        const path = window.location.pathname;
        const pageMap = {
            '/containers': 'containers',
            '/databases': 'databases',
            '/domains': 'domains',
            '/logs': 'logs',
            '/network': 'network',
            '/system': 'system',
            '/marketplace': 'marketplace',
            '/scripts': 'scripts',
            '/file_manager': 'file_manager',
            '/smart_home': 'smart_home',
            '/google_services': 'google_services',
            '/remote_desktop': 'remote_desktop',
            '/game_connect': 'game_streaming',
            '/dashboard': 'overview'
        };
        
        for (const [path_prefix, page] of Object.entries(pageMap)) {
            if (path.startsWith(path_prefix)) {
                return page;
            }
        }
        return 'general';
    }

    initWidget() {
        // Create widget HTML
        const widgetHTML = `
            <div id="aiHelperWidget" class="ai-helper-widget ${this.widgetOpen ? 'open' : ''}">
                <div class="ai-helper-toggle" id="aiHelperToggle">
                    <i class="bi bi-robot"></i>
                    <span class="ai-helper-badge" id="aiHelperBadge" style="display: none;"></span>
                </div>
                <div class="ai-helper-panel" id="aiHelperPanel">
                    <div class="ai-helper-header">
                        <h6><i class="bi bi-robot me-2"></i>AI Assistant</h6>
                        <button class="btn-close btn-close-white" id="aiHelperClose"></button>
                    </div>
                    <div class="ai-helper-body">
                        <div class="ai-helper-context mb-3">
                            <small class="text-muted">
                                <i class="bi bi-info-circle me-1"></i>
                                Page: <strong id="aiHelperContext">${this.currentPage}</strong>
                            </small>
                        </div>
                        <div class="ai-helper-messages" id="aiHelperMessages">
                            <div class="ai-helper-welcome">
                                <p class="mb-2"><strong>👋 Hello! I'm your AI assistant.</strong></p>
                                <p class="mb-3 small">I can help you with:</p>
                                <ul class="small mb-0">
                                    ${this.getContextualHelp()}
                                </ul>
                            </div>
                        </div>
                        <div class="ai-helper-input">
                            <textarea 
                                id="aiHelperInput" 
                                class="form-control form-control-sm" 
                                rows="2" 
                                placeholder="Ask me anything or click the mic to speak..."
                            ></textarea>
                            <div class="ai-helper-buttons mt-2">
                                <button class="btn btn-outline-secondary btn-sm ai-helper-mic-btn" id="aiHelperMic" title="Voice Input">
                                    <i class="bi bi-mic"></i>
                                </button>
                                <button class="btn btn-primary btn-sm flex-grow-1" id="aiHelperSend">
                                    <i class="bi bi-send me-1"></i>Send
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Inject widget into DOM
        document.body.insertAdjacentHTML('beforeend', widgetHTML);

        // Add styles
        this.injectStyles();

        // Attach event listeners
        this.attachEventListeners();
    }

    getContextualHelp() {
        const helpMap = {
            'containers': `
                <li>Troubleshoot container issues</li>
                <li>Explain Docker commands</li>
                <li>Analyze container logs</li>
                <li>Restart and manage containers</li>
            `,
            'databases': `
                <li>Create and configure databases</li>
                <li>Troubleshoot connection issues</li>
                <li>Optimize database queries</li>
                <li>Explain database migrations</li>
            `,
            'domains': `
                <li>Configure DNS settings</li>
                <li>Troubleshoot SSL certificates</li>
                <li>Set up reverse proxy rules</li>
                <li>Diagnose domain connectivity</li>
            `,
            'logs': `
                <li>Analyze error patterns</li>
                <li>Find specific log entries</li>
                <li>Explain error messages</li>
                <li>Suggest fixes for issues</li>
            `,
            'network': `
                <li>Diagnose network issues</li>
                <li>Explain port configurations</li>
                <li>Troubleshoot connectivity</li>
                <li>Analyze network traffic</li>
            `,
            'system': `
                <li>Monitor system resources</li>
                <li>Explain performance metrics</li>
                <li>Troubleshoot high CPU/memory</li>
                <li>Suggest optimizations</li>
            `,
            'marketplace': `
                <li>Recommend applications</li>
                <li>Explain deployment options</li>
                <li>Help with app configuration</li>
                <li>Troubleshoot installations</li>
            `,
            'game_streaming': `
                <li>Configure Sunshine streaming</li>
                <li>Troubleshoot connection issues</li>
                <li>Optimize streaming quality</li>
                <li>Set up game integrations</li>
            `,
            'smart_home': `
                <li>Configure Home Assistant</li>
                <li>Create automation scripts</li>
                <li>Troubleshoot device issues</li>
                <li>Explain entity states</li>
            `,
        };

        return helpMap[this.currentPage] || `
            <li>Answer technical questions</li>
            <li>Troubleshoot issues</li>
            <li>Explain configurations</li>
            <li>Suggest optimizations</li>
        `;
    }

    attachEventListeners() {
        const toggle = document.getElementById('aiHelperToggle');
        const close = document.getElementById('aiHelperClose');
        const send = document.getElementById('aiHelperSend');
        const input = document.getElementById('aiHelperInput');
        const mic = document.getElementById('aiHelperMic');

        toggle.addEventListener('click', () => this.toggleWidget());
        close.addEventListener('click', () => this.closeWidget());
        send.addEventListener('click', () => this.sendMessage());
        
        if (mic) {
            mic.addEventListener('click', () => this.toggleVoice());
        }
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.ctrlKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        // Keyboard shortcut: Press 'J' to toggle voice (when widget is open)
        document.addEventListener('keydown', (e) => {
            if (e.key === 'j' && e.altKey && this.widgetOpen) {
                e.preventDefault();
                this.toggleVoice();
            }
        });
    }

    toggleWidget() {
        this.widgetOpen = !this.widgetOpen;
        const widget = document.getElementById('aiHelperWidget');
        if (this.widgetOpen) {
            widget.classList.add('open');
        } else {
            widget.classList.remove('open');
        }
    }

    closeWidget() {
        this.widgetOpen = false;
        document.getElementById('aiHelperWidget').classList.remove('open');
    }

    async sendMessage() {
        const input = document.getElementById('aiHelperInput');
        const message = input.value.trim();
        
        if (!message) return;

        // Add user message to chat
        this.addMessage('user', message);
        input.value = '';

        // Add to conversation history
        this.conversationHistory.push({
            role: 'user',
            content: message
        });

        // Show typing indicator
        this.showTypingIndicator();

        try {
            // Call AI chat API with page context
            const contextualMessage = `[Page: ${this.currentPage}] ${message}`;
            
            // Get CSRF token from meta tag or cookie
            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || 
                             this.getCookie('csrf_access_token') || '';
            
            const response = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRFToken': csrfToken
                },
                credentials: 'include',
                body: JSON.stringify({
                    message: contextualMessage,
                    conversation_history: this.conversationHistory
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('AI API Error:', response.status, errorText);
                this.addMessage('error', `API Error (${response.status}): ${errorText.slice(0, 100)}`);
                return;
            }

            const data = await response.json();

            if (data.success) {
                this.addMessage('assistant', data.response);
                this.conversationHistory.push({
                    role: 'assistant',
                    content: data.response
                });
                // Speak the response (TTS)
                this.speak(data.response.replace(/[#*`_]/g, '').slice(0, 500));
            } else {
                this.addMessage('error', data.error || 'Failed to get response');
            }
        } catch (error) {
            console.error('AI Helper Error:', error);
            this.addMessage('error', 'Failed to connect to AI service');
        } finally {
            this.hideTypingIndicator();
        }
    }

    addMessage(role, content) {
        const messagesDiv = document.getElementById('aiHelperMessages');
        
        // Remove welcome message on first interaction
        const welcome = messagesDiv.querySelector('.ai-helper-welcome');
        if (welcome) {
            welcome.remove();
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-helper-message ai-helper-message-${role}`;
        
        if (role === 'user') {
            messageDiv.innerHTML = `<div class="message-content">${this.escapeHtml(content)}</div>`;
        } else if (role === 'assistant') {
            // Render markdown for assistant messages with XSS protection
            const contentDiv = document.createElement('div');
            contentDiv.className = 'message-content';
            
            // Use DOMPurify if available, otherwise fallback to safe textContent
            if (typeof DOMPurify !== 'undefined') {
                const rawMarkdown = marked.parse(content);
                const sanitized = DOMPurify.sanitize(rawMarkdown, {
                    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'a'],
                    ALLOWED_ATTR: ['href', 'class']
                });
                contentDiv.innerHTML = sanitized;
            } else {
                // Fallback: render as plain text if DOMPurify not available
                contentDiv.textContent = content;
            }
            
            messageDiv.appendChild(contentDiv);
        } else if (role === 'error') {
            messageDiv.innerHTML = `<div class="message-content text-danger"><i class="bi bi-exclamation-triangle me-1"></i>${this.escapeHtml(content)}</div>`;
        }

        messagesDiv.appendChild(messageDiv);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    showTypingIndicator() {
        const messagesDiv = document.getElementById('aiHelperMessages');
        const indicator = document.createElement('div');
        indicator.id = 'aiHelperTyping';
        indicator.className = 'ai-helper-typing';
        indicator.innerHTML = `
            <div class="typing-indicator">
                <span></span><span></span><span></span>
            </div>
        `;
        messagesDiv.appendChild(indicator);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    hideTypingIndicator() {
        const indicator = document.getElementById('aiHelperTyping');
        if (indicator) {
            indicator.remove();
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }

    injectStyles() {
        const styles = `
            <style>
                .ai-helper-widget {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    z-index: 1050;
                }

                .ai-helper-toggle {
                    position: relative;
                    width: 60px;
                    height: 60px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: white;
                    font-size: 28px;
                    cursor: pointer;
                    box-shadow: 0 4px 20px rgba(102, 126, 234, 0.4);
                    transition: transform 0.3s ease, box-shadow 0.3s ease;
                }

                .ai-helper-toggle:hover {
                    transform: scale(1.1);
                    box-shadow: 0 6px 30px rgba(102, 126, 234, 0.6);
                }

                .ai-helper-badge {
                    position: absolute;
                    top: -5px;
                    right: -5px;
                    width: 20px;
                    height: 20px;
                    background: #ff4444;
                    border-radius: 50%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    font-weight: bold;
                }

                .ai-helper-panel {
                    position: absolute;
                    bottom: 75px;
                    right: 0;
                    width: 350px;
                    max-height: 500px;
                    background: rgba(20, 20, 30, 0.95);
                    backdrop-filter: blur(10px);
                    border-radius: 15px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    display: none;
                    flex-direction: column;
                }

                .ai-helper-widget.open .ai-helper-panel {
                    display: flex;
                    animation: slideUp 0.3s ease;
                }

                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                .ai-helper-header {
                    padding: 15px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }

                .ai-helper-header h6 {
                    margin: 0;
                    color: #fff;
                    font-weight: 600;
                }

                .ai-helper-body {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    padding: 15px;
                    overflow: hidden;
                }

                .ai-helper-context {
                    padding: 8px 12px;
                    background: rgba(102, 126, 234, 0.2);
                    border-radius: 8px;
                    border-left: 3px solid #667eea;
                }

                .ai-helper-messages {
                    flex: 1;
                    overflow-y: auto;
                    margin-bottom: 15px;
                    max-height: 300px;
                }

                .ai-helper-welcome {
                    padding: 10px;
                    color: rgba(255, 255, 255, 0.8);
                }

                .ai-helper-welcome ul {
                    padding-left: 20px;
                }

                .ai-helper-message {
                    margin-bottom: 12px;
                    animation: fadeIn 0.3s ease;
                }

                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }

                .ai-helper-message-user .message-content {
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                    padding: 10px 15px;
                    border-radius: 15px 15px 0 15px;
                    margin-left: auto;
                    max-width: 80%;
                    word-wrap: break-word;
                }

                .ai-helper-message-assistant .message-content {
                    background: rgba(255, 255, 255, 0.1);
                    color: rgba(255, 255, 255, 0.95);
                    padding: 10px 15px;
                    border-radius: 15px 15px 15px 0;
                    max-width: 80%;
                    word-wrap: break-word;
                }

                .ai-helper-message-assistant .message-content code {
                    background: rgba(0, 0, 0, 0.3);
                    padding: 2px 6px;
                    border-radius: 4px;
                }

                .ai-helper-typing {
                    padding: 10px;
                }

                .typing-indicator {
                    display: flex;
                    gap: 5px;
                }

                .typing-indicator span {
                    width: 8px;
                    height: 8px;
                    background: #667eea;
                    border-radius: 50%;
                    animation: bounce 1.4s infinite ease-in-out both;
                }

                .typing-indicator span:nth-child(1) { animation-delay: -0.32s; }
                .typing-indicator span:nth-child(2) { animation-delay: -0.16s; }

                @keyframes bounce {
                    0%, 80%, 100% { transform: scale(0); }
                    40% { transform: scale(1); }
                }

                .ai-helper-input textarea {
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    color: white;
                    resize: none;
                }

                .ai-helper-input textarea:focus {
                    background: rgba(255, 255, 255, 0.08);
                    border-color: #667eea;
                    color: white;
                }

                .ai-helper-input textarea::placeholder {
                    color: rgba(255, 255, 255, 0.5);
                }
                
                .ai-helper-buttons {
                    display: flex;
                    gap: 8px;
                }
                
                .ai-helper-mic-btn {
                    width: 40px;
                    height: 38px;
                    padding: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-color: rgba(255, 255, 255, 0.2);
                    color: rgba(255, 255, 255, 0.7);
                    transition: all 0.3s ease;
                }
                
                .ai-helper-mic-btn:hover {
                    background: rgba(102, 126, 234, 0.2);
                    border-color: #667eea;
                    color: #667eea;
                }
                
                .ai-helper-mic-btn.listening {
                    background: linear-gradient(135deg, #34d399 0%, #10b981 100%);
                    border-color: #34d399;
                    color: white;
                    animation: pulse-mic 1.5s ease-in-out infinite;
                }
                
                @keyframes pulse-mic {
                    0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.5); }
                    50% { transform: scale(1.05); box-shadow: 0 0 0 8px rgba(52, 211, 153, 0); }
                }

                @media (max-width: 576px) {
                    .ai-helper-panel {
                        width: calc(100vw - 40px);
                        right: -10px;
                    }
                }
            </style>
        `;
        document.head.insertAdjacentHTML('beforeend', styles);
    }
}

// Auto-initialize widget after all scripts load
function initializeAIHelper() {
    // Verify required libraries are loaded
    if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') {
        console.warn('AI Helper Widget: Required libraries (marked, DOMPurify) not loaded');
        return;
    }
    
    // Only initialize on non-AI-assistant pages (avoid duplicate widgets)
    if (!window.location.pathname.includes('ai_assistant') && 
        !window.location.pathname.includes('agent_swarm')) {
        window.aiHelperWidget = new AIHelperWidget();
    }
}

// Initialize after DOM and all scripts are loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAIHelper);
} else {
    // DOM already loaded, initialize immediately
    initializeAIHelper();
}
