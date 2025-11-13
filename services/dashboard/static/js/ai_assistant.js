const conversationHistory = [];

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
        
        const data = await response.json();
        
        const messages = document.getElementById('chatMessages');
        messages.removeChild(messages.lastChild);
        
        if (data.success) {
            addMessage('assistant', data.data);
            conversationHistory.push({
                role: 'assistant',
                content: data.data
            });
        } else {
            addMessage('assistant', `Error: ${data.message}`);
        }
    } catch (error) {
        console.error('Error sending message:', error);
        const messages = document.getElementById('chatMessages');
        messages.removeChild(messages.lastChild);
        addMessage('assistant', `Error: ${error.message}`);
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
