// ==================== STATE MANAGEMENT ====================
let conversationHistory = [];
let currentEventSource = null;
let isStreaming = false;
let useStreaming = true;
let currentModel = 'gpt-5';

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
        document.getElementById('useStreamingToggle').checked = useStreaming;
    }
    
    updateMessageCount();
}

function saveSettings() {
    useStreaming = document.getElementById('useStreamingToggle').checked;
    localStorage.setItem('jarvis_use_streaming', useStreaming.toString());
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
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message,
                history: conversationHistory,
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
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message,
                history: conversationHistory,
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
    
    if (useStreaming) {
        await sendMessageStream(message, model);
    } else {
        await sendMessageNonStream(message, model);
    }
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

// Configure marked.js options
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

// Load saved conversation and settings
loadSettings();

// Show welcome message if no history
if (conversationHistory.length === 0) {
    showWelcomeMessage();
}
