// ==================== STATE MANAGEMENT ====================
let conversationHistory = [];
let currentEventSource = null;
let isStreaming = false;
let useStreaming = true;
let useAutonomousMode = true;  // Enable autonomous mode by default
let currentModel = 'gpt-4o';

// Get CSRF token from meta tag
function getCsrfToken() {
    const token = document.querySelector('meta[name="csrf-token"]');
    return token ? token.content : '';
}

// Load settings from localStorage
function loadSettings() {
    const savedHistory = localStorage.getItem('jarvis_conversation');
    if (savedHistory) {
        try {
            conversationHistory = JSON.parse(savedHistory);
            // Restore conversation display
            conversationHistory.forEach(msg => {
                if (msg.role === 'user') {
                    addUserMessage(msg.content, false);
                } else if (msg.role === 'assistant') {
                    addAIMessage(msg.content, false);
                }
            });
        } catch (e) {
            console.error('Error loading conversation history:', e);
            conversationHistory = [];
        }
    }
    
    const savedStreaming = localStorage.getItem('jarvis_use_streaming');
    if (savedStreaming !== null) {
        useStreaming = savedStreaming === 'true';
        const streamToggle = document.getElementById('useStreamingToggle');
        if (streamToggle) streamToggle.checked = useStreaming;
    }
    
    const savedAutonomous = localStorage.getItem('jarvis_autonomous_mode');
    if (savedAutonomous !== null) {
        useAutonomousMode = savedAutonomous === 'true';
    } else {
        useAutonomousMode = true;  // Default to enabled
    }
    const autoToggle = document.getElementById('autonomousModeToggle');
    if (autoToggle) autoToggle.checked = useAutonomousMode;
    
    updateMessageCount();
}

function saveSettings() {
    const streamToggle = document.getElementById('useStreamingToggle');
    if (streamToggle) {
        useStreaming = streamToggle.checked;
        localStorage.setItem('jarvis_use_streaming', useStreaming.toString());
    }
}

function toggleAutonomousMode() {
    const toggle = document.getElementById('autonomousModeToggle');
    if (toggle) {
        useAutonomousMode = toggle.checked;
        localStorage.setItem('jarvis_autonomous_mode', useAutonomousMode.toString());
    }
}

function saveConversation() {
    try {
        localStorage.setItem('jarvis_conversation', JSON.stringify(conversationHistory));
    } catch (e) {
        console.error('Error saving conversation:', e);
    }
}

// ==================== MESSAGE RENDERING ====================

function addUserMessage(content, save = true) {
    const messagesDiv = document.getElementById('chatMessages');
    
    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper user-message-wrapper';
    
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble user-bubble';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.textContent = content;
    
    bubble.appendChild(contentDiv);
    wrapper.appendChild(bubble);
    messagesDiv.appendChild(wrapper);
    
    scrollToBottom();
    
    if (save) {
        conversationHistory.push({ role: 'user', content: content });
        saveConversation();
        updateMessageCount();
    }
}

function addAIMessage(content, save = true) {
    const messagesDiv = document.getElementById('chatMessages');
    
    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper ai-message-wrapper';
    
    const bubble = document.createElement('div');
    bubble.className = 'message-bubble ai-bubble';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    // Render markdown with syntax highlighting
    const rawMarkdown = marked.parse(content);
    const cleanHTML = DOMPurify.sanitize(rawMarkdown);
    contentDiv.innerHTML = cleanHTML;
    
    bubble.appendChild(contentDiv);
    wrapper.appendChild(bubble);
    messagesDiv.appendChild(wrapper);
    
    // Apply syntax highlighting to code blocks
    contentDiv.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
        addCopyButton(block);
    });
    
    scrollToBottom();
    
    if (save) {
        conversationHistory.push({ role: 'assistant', content: content });
        saveConversation();
        updateMessageCount();
    }
}

function addCopyButton(codeBlock) {
    const pre = codeBlock.parentElement;
    
    // Check if copy button already exists
    if (pre.querySelector('.copy-code-btn')) return;
    
    const button = document.createElement('button');
    button.className = 'copy-code-btn';
    button.innerHTML = '<i class="bi bi-clipboard"></i>';
    button.title = 'Copy code';
    
    button.addEventListener('click', async () => {
        const code = codeBlock.textContent;
        try {
            await navigator.clipboard.writeText(code);
            button.innerHTML = '<i class="bi bi-check2"></i>';
            button.classList.add('copied');
            setTimeout(() => {
                button.innerHTML = '<i class="bi bi-clipboard"></i>';
                button.classList.remove('copied');
            }, 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    });
    
    pre.style.position = 'relative';
    pre.appendChild(button);
}

function showTypingIndicator() {
    document.getElementById('typingIndicator').style.display = 'block';
    scrollToBottom();
}

function hideTypingIndicator() {
    document.getElementById('typingIndicator').style.display = 'none';
}

function scrollToBottom() {
    const messagesDiv = document.getElementById('chatMessages');
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function updateMessageCount() {
    const count = conversationHistory.length;
    document.getElementById('messageCount').textContent = `${count} message${count !== 1 ? 's' : ''}`;
}

// ==================== STREAMING CHAT ====================

async function sendMessageStream(message, model) {
    showTypingIndicator();
    isStreaming = true;
    document.getElementById('stopGenerationContainer').style.display = 'block';
    
    let accumulatedContent = '';
    let messageDiv = null;
    
    try {
        const response = await fetch('/api/ai/chat/stream', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({
                message: message,
                conversation_history: conversationHistory,
                model: model
            })
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        hideTypingIndicator();
        
        // Create AI message bubble
        const messagesDiv = document.getElementById('chatMessages');
        const wrapper = document.createElement('div');
        wrapper.className = 'message-wrapper ai-message-wrapper';
        
        const bubble = document.createElement('div');
        bubble.className = 'message-bubble ai-bubble';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        bubble.appendChild(contentDiv);
        wrapper.appendChild(bubble);
        messagesDiv.appendChild(wrapper);
        messageDiv = contentDiv;
        
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    
                    if (data === '[DONE]') {
                        isStreaming = false;
                        document.getElementById('stopGenerationContainer').style.display = 'none';
                        
                        conversationHistory.push({ role: 'assistant', content: accumulatedContent });
                        saveConversation();
                        updateMessageCount();
                        return;
                    }
                    
                    try {
                        const parsed = JSON.parse(data);
                        
                        if (parsed.error) {
                            throw new Error(parsed.error);
                        }
                        
                        if (parsed.content) {
                            accumulatedContent += parsed.content;
                            
                            // Render markdown incrementally
                            const rawMarkdown = marked.parse(accumulatedContent);
                            const cleanHTML = DOMPurify.sanitize(rawMarkdown);
                            messageDiv.innerHTML = cleanHTML;
                            
                            // Apply syntax highlighting
                            messageDiv.querySelectorAll('pre code').forEach((block) => {
                                hljs.highlightElement(block);
                                addCopyButton(block);
                            });
                            
                            scrollToBottom();
                        }
                    } catch (e) {
                        if (data.trim()) {
                            console.error('Error parsing SSE data:', e, data);
                        }
                    }
                }
            }
        }
        
    } catch (error) {
        console.error('Streaming error:', error);
        hideTypingIndicator();
        document.getElementById('stopGenerationContainer').style.display = 'none';
        isStreaming = false;
        
        if (messageDiv) {
            messageDiv.innerHTML = `<p class="text-danger">⚠️ Error: ${error.message}</p><p class="small">Falling back to non-streaming mode...</p>`;
        }
        
        // Fallback to non-streaming
        await sendMessageNonStream(message, model);
    }
}

async function sendMessageNonStream(message, model) {
    showTypingIndicator();
    
    try {
        const response = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({
                message: message,
                conversation_history: conversationHistory,
                model: model
            })
        });
        
        if (response.redirected || response.url.includes('/login')) {
            hideTypingIndicator();
            addAIMessage('⚠️ Please [log in](/login) to use the AI assistant.', false);
            return;
        }
        
        if (!response.ok) {
            throw new Error(`Server error (${response.status})`);
        }
        
        const data = await response.json();
        hideTypingIndicator();
        
        if (data.success) {
            addAIMessage(data.data);
        } else {
            addAIMessage(`⚠️ Error: ${data.message}`, false);
        }
        
    } catch (error) {
        console.error('Error sending message:', error);
        hideTypingIndicator();
        addAIMessage(`⚠️ Connection error: ${error.message}. Please check your network.`, false);
    }
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message || isStreaming) return;
    
    addUserMessage(message);
    input.value = '';
    input.style.height = 'auto';
    
    const model = document.getElementById('modelSelector').value;
    
    // Use autonomous mode for real command execution
    if (useAutonomousMode) {
        await sendMessageAutonomous(message, model);
    } else if (useStreaming) {
        await sendMessageStream(message, model);
    } else {
        await sendMessageNonStream(message, model);
    }
}

async function sendMessageAutonomous(message, model) {
    showTypingIndicator();
    
    try {
        const response = await fetch('/api/jarvis/control/chat/autonomous', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrfToken()
            },
            body: JSON.stringify({
                message: message,
                conversation_history: conversationHistory,
                model: model
            })
        });
        
        if (response.redirected || response.url.includes('/login')) {
            hideTypingIndicator();
            addAIMessage('⚠️ Please [log in](/login) to use the AI assistant.', false);
            return;
        }
        
        if (!response.ok) {
            throw new Error(`Server error (${response.status})`);
        }
        
        const data = await response.json();
        hideTypingIndicator();
        
        if (data.success) {
            // Display tool execution results if any
            if (data.tool_calls && data.tool_calls.length > 0) {
                addToolExecutionResults(data.tool_calls);
            }
            
            // Add the AI response
            if (data.response) {
                addAIMessage(data.response);
            }
        } else {
            addAIMessage(`⚠️ Error: ${data.error || 'Unknown error'}`, false);
        }
        
    } catch (error) {
        console.error('Error in autonomous mode:', error);
        hideTypingIndicator();
        addAIMessage(`⚠️ Connection error: ${error.message}. Please check your network.`, false);
    }
}

function addToolExecutionResults(toolCalls) {
    const messagesDiv = document.getElementById('chatMessages');
    
    const wrapper = document.createElement('div');
    wrapper.className = 'message-wrapper';
    
    const group = document.createElement('div');
    group.className = 'tool-results-group';
    
    toolCalls.forEach((tc, index) => {
        const chipId = `tool-${Date.now()}-${index}`;
        const outputText = tc.output || tc.error || 'No output';
        const toolName = formatToolName(tc.tool);
        const host = tc.host || 'local';
        const time = tc.execution_time?.toFixed(1) || '0';
        
        const item = document.createElement('div');
        item.className = 'tool-result-item';
        
        const chip = document.createElement('div');
        chip.className = 'tool-chip';
        chip.setAttribute('data-target', chipId);
        chip.onclick = () => toggleToolDetail(chipId);
        chip.innerHTML = `
            <i class="bi ${tc.success ? 'bi-check-circle-fill' : 'bi-x-circle-fill'} tool-chip-icon ${tc.success ? 'success' : 'error'}"></i>
            <span class="tool-chip-text">${toolName}</span>
            <span class="tool-chip-meta">
                <span class="host">${host}</span>
                <span>${time}s</span>
            </span>
            <i class="bi bi-chevron-down tool-chip-expand"></i>
        `;
        
        const detail = document.createElement('div');
        detail.className = 'tool-detail';
        detail.id = chipId;
        detail.innerHTML = `
            <div class="tool-detail-header">
                <button class="tool-detail-copy" onclick="event.stopPropagation(); copyOutput('${chipId}')" title="Copy">
                    <i class="bi bi-clipboard"></i> Copy
                </button>
            </div>
            <pre class="tool-detail-output" data-output="${escapeHtml(outputText)}"><code>${escapeHtml(outputText)}</code></pre>
        `;
        
        item.appendChild(chip);
        item.appendChild(detail);
        group.appendChild(item);
    });
    
    wrapper.appendChild(group);
    messagesDiv.appendChild(wrapper);
    scrollToBottom();
}

function toggleToolDetail(id) {
    const detail = document.getElementById(id);
    const chip = document.querySelector(`[data-target="${id}"]`);
    if (detail && chip) {
        detail.classList.toggle('show');
        chip.classList.toggle('expanded');
    }
}

async function copyOutput(id) {
    const detail = document.getElementById(id);
    const pre = detail?.querySelector('.tool-detail-output');
    const btn = detail?.querySelector('.tool-detail-copy');
    if (pre && btn) {
        const text = pre.getAttribute('data-output') || pre.textContent;
        try {
            await navigator.clipboard.writeText(text);
            btn.innerHTML = '<i class="bi bi-check2"></i> Copied';
            btn.classList.add('copied');
            setTimeout(() => {
                btn.innerHTML = '<i class="bi bi-clipboard"></i> Copy';
                btn.classList.remove('copied');
            }, 2000);
        } catch (err) {
            console.error('Copy failed:', err);
        }
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatToolName(name) {
    return name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function stopGeneration() {
    if (currentEventSource) {
        currentEventSource.close();
        currentEventSource = null;
    }
    isStreaming = false;
    hideTypingIndicator();
    document.getElementById('stopGenerationContainer').style.display = 'none';
}

// ==================== CONVERSATION MANAGEMENT ====================

function startNewChat() {
    if (conversationHistory.length > 0) {
        if (!confirm('Start a new conversation? Current chat will be saved to history.')) {
            return;
        }
    }
    
    conversationHistory = [];
    document.getElementById('chatMessages').innerHTML = '';
    saveConversation();
    updateMessageCount();
    showWelcomeMessage();
}

function exportChat() {
    if (conversationHistory.length === 0) {
        alert('No messages to export');
        return;
    }
    
    // Export as markdown
    let markdown = '# Jarvis AI Chat Export\n\n';
    markdown += `**Date:** ${new Date().toLocaleString()}\n\n`;
    markdown += `**Model:** ${document.getElementById('modelSelector').value}\n\n`;
    markdown += '---\n\n';
    
    conversationHistory.forEach(msg => {
        if (msg.role === 'user') {
            markdown += `**User:**\n${msg.content}\n\n`;
        } else {
            markdown += `**Jarvis:**\n${msg.content}\n\n`;
        }
    });
    
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `jarvis-chat-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
}

function clearHistory() {
    if (!confirm('Clear all conversation history? This cannot be undone.')) {
        return;
    }
    
    localStorage.removeItem('jarvis_conversation');
    startNewChat();
}

function showChatMenu() {
    const modal = new bootstrap.Modal(document.getElementById('chatMenuModal'));
    modal.show();
}

// ==================== QUICK PROMPTS ====================

function quickPrompt(prompt) {
    document.getElementById('chatInput').value = prompt;
    sendMessage();
}

// ==================== UI ENHANCEMENTS ====================

// Auto-resize textarea
document.getElementById('chatInput').addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

// Enter to send, Shift+Enter for new line
document.getElementById('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

// ==================== INITIALIZATION ====================

function showWelcomeMessage() {
    const welcome = `**👋 Welcome to Jarvis AI!**

I'm your DevOps copilot. I can help you with:

- 🐳 Docker container troubleshooting
- 📊 Server health diagnostics
- 🔧 Network configuration
- 📝 Log analysis
- 🚀 Deployment automation

Try the quick actions below or ask me anything!`;
    
    addAIMessage(welcome, false);
}

// ==================== MODEL MANAGEMENT ====================

async function loadAvailableModels() {
    try {
        const response = await fetch('/api/ai/models');
        const data = await response.json();
        
        if (data.success && data.data) {
            const select = document.getElementById('modelSelector');
            select.innerHTML = data.data.map(model => 
                `<option value="${model.id}">${model.name}</option>`
            ).join('');
        }
    } catch (error) {
        console.error('Error loading models:', error);
    }
}

// ==================== INITIALIZATION ====================

function initializeApp() {
    // Configure marked.js options (if loaded)
    if (typeof marked !== 'undefined') {
        marked.setOptions({
            highlight: function(code, lang) {
                if (lang && hljs.getLanguage(lang)) {
                    try {
                        return hljs.highlight(code, { language: lang }).value;
                    } catch (e) {
                        console.error('Highlight error:', e);
                    }
                }
                return hljs.highlightAuto(code).value;
            },
            breaks: true,
            gfm: true
        });
    } else {
        console.warn('marked.js not loaded, markdown rendering may not work');
    }

    // Load saved conversation and settings
    loadSettings();

    // Load available models dynamically
    loadAvailableModels();

    // Show welcome message if no history
    if (conversationHistory.length === 0) {
        showWelcomeMessage();
    }
}

// Initialize when DOM and scripts are ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
