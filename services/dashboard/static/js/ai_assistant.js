const conversationHistory = [];
let aiServiceEnabled = false;

async function checkAIStatus() {
    try {
        const response = await fetch('/api/ai/status');
        const data = await response.json();
        
        aiServiceEnabled = data.enabled || false;
        
        if (!aiServiceEnabled) {
            const warningBanner = document.createElement('div');
            warningBanner.id = 'aiStatusWarning';
            warningBanner.className = 'alert alert-warning';
            warningBanner.style.cssText = 'margin: 10px 0; padding: 12px; border-radius: 8px; background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.3);';
            warningBanner.innerHTML = `
                <strong>⚙️ OpenAI API Not Configured</strong><br>
                The AI assistant requires an OpenAI API key to function.<br><br>
                <strong>How to fix:</strong>
                <ol style="margin: 8px 0 0 20px; padding: 0;">
                    <li>Go to your Replit project's <strong>Tools → Secrets</strong></li>
                    <li>Add <code>AI_INTEGRATIONS_OPENAI_API_KEY</code> with your OpenAI API key</li>
                    <li>Add <code>AI_INTEGRATIONS_OPENAI_BASE_URL</code> with value <code>https://api.openai.com/v1</code></li>
                    <li>Restart the dashboard workflow</li>
                </ol>
                <small>Get an API key from <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI Platform</a></small>
            `;
            
            const chatContainer = document.getElementById('chatMessages');
            if (chatContainer && chatContainer.parentElement) {
                chatContainer.parentElement.insertBefore(warningBanner, chatContainer);
            }
            
            const chatInput = document.getElementById('chatInput');
            if (chatInput) {
                chatInput.disabled = true;
                chatInput.placeholder = 'AI service is not configured. See instructions above.';
            }
        }
    } catch (error) {
        console.error('Error checking AI status:', error);
    }
}

window.addEventListener('DOMContentLoaded', checkAIStatus);

function addMessage(role, content) {
    const messagesDiv = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${role}`;
    messageDiv.innerHTML = `<div>${content.replace(/\n/g, '<br>')}</div>`;
    messagesDiv.appendChild(messageDiv);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

async function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();
    
    if (!message) return;
    
    addMessage('user', message);
    input.value = '';
    
    conversationHistory.push({
        role: 'user',
        content: message
    });
    
    addMessage('assistant', '<div class="spinner-border spinner-border-sm" role="status"></div> Thinking...');
    
    try {
        const response = await fetch('/api/ai/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: message,
                history: conversationHistory.slice(0, -1)
            })
        });
        
        // Check if we were redirected to login (not logged in)
        if (response.redirected || response.url.includes('/login')) {
            const messages = document.getElementById('chatMessages');
            messages.removeChild(messages.lastChild);
            addMessage('assistant', '⚠️ Please <a href="/login">log in</a> to use the AI assistant.');
            return;
        }
        
        // Parse JSON response
        const data = await response.json();
        
        const messages = document.getElementById('chatMessages');
        messages.removeChild(messages.lastChild);
        
        // Check for HTTP errors with specific handling
        if (!response.ok) {
            let errorMessage = data.message || `Server error (${response.status}). Please try again.`;
            
            // Provide specific guidance for common errors
            if (response.status === 503 && data.error_code === 'API_NOT_CONFIGURED') {
                errorMessage = `
                    <div class="alert alert-warning" style="margin: 10px 0; padding: 12px; border-radius: 8px; background: rgba(251, 191, 36, 0.1); border: 1px solid rgba(251, 191, 36, 0.3);">
                        <strong>⚙️ Configuration Required</strong><br>
                        ${errorMessage}<br><br>
                        <strong>How to fix:</strong>
                        <ol style="margin: 8px 0 0 20px; padding: 0;">
                            <li>Go to your Replit project's Tools → Secrets</li>
                            <li>Add the OpenAI API key (get one from <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI</a>)</li>
                            <li>Restart the dashboard workflow</li>
                        </ol>
                    </div>
                `;
            }
            
            addMessage('assistant', `⚠️ ${errorMessage}`);
            return;
        }
        
        if (data.success) {
            addMessage('assistant', data.data);
            conversationHistory.push({
                role: 'assistant',
                content: data.data
            });
        } else {
            addMessage('assistant', `⚠️ Error: ${data.message}`);
        }
    } catch (error) {
        console.error('Error sending message:', error);
        const messages = document.getElementById('chatMessages');
        if (messages.lastChild && messages.lastChild.className.includes('assistant')) {
            messages.removeChild(messages.lastChild);
        }
        if (error.message.includes('JSON')) {
            addMessage('assistant', '⚠️ Please <a href="/login">log in</a> to use the AI assistant.');
        } else {
            addMessage('assistant', `⚠️ Connection error: ${error.message}. Please check your network.`);
        }
    }
}

function quickQuestion(question) {
    document.getElementById('chatInput').value = question;
    sendMessage();
}

document.getElementById('chatInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

addMessage('assistant', 'Hello! I\'m your homelab AI assistant. I can help you troubleshoot issues, analyze logs, and answer questions about Docker, networking, and server management. How can I help you today?');
