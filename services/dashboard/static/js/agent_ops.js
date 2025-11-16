/**
 * Agent Ops Manager - Inter-Agent Communication Feed
 * Displays real-time collaboration between Jarvis and Replit Agent
 */

class AgentOpsManager {
    constructor() {
        this.baseUrl = '/api/agents';
        this.messages = [];
        this.refreshInterval = null;
        this.currentFilter = '';
    }

    async getMessages(limit = 50, filters = {}) {
        const params = new URLSearchParams();
        params.append('limit', limit);
        
        if (filters.message_type) {
            params.append('message_type', filters.message_type);
        }
        if (filters.from_agent) {
            params.append('from_agent', filters.from_agent);
        }
        if (filters.since) {
            params.append('since', filters.since);
        }

        const response = await fetch(`${this.baseUrl}/messages?${params}`);
        return await response.json();
    }

    async sendMessage(fromAgent, toAgent, messageType, content, subject = null, metadata = null) {
        const response = await fetch(`${this.baseUrl}/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'same-origin',
            body: JSON.stringify({
                from_agent: fromAgent,
                to_agent: toAgent,
                message_type: messageType,
                subject: subject,
                content: content,
                metadata: metadata
            })
        });
        return await response.json();
    }

    async getStats() {
        const response = await fetch(`${this.baseUrl}/stats`);
        return await response.json();
    }
}

// Global instance
const agentOps = new AgentOpsManager();
let messageDetailModalInstance;

// Initialize agent ops feed
async function initializeAgentOps() {
    // Initialize modal
    messageDetailModalInstance = new bootstrap.Modal(document.getElementById('messageDetailModal'));
    
    // Load stats
    loadStats();
    
    // Load messages
    loadMessages();
    
    // Auto-refresh every 30 seconds
    agentOps.refreshInterval = setInterval(loadMessages, 30000);
}

// Load statistics
async function loadStats() {
    try {
        const result = await agentOps.getStats();
        
        if (result.success) {
            document.getElementById('total-messages').textContent = result.stats.total_messages || 0;
            document.getElementById('jarvis-messages').textContent = result.stats.from_jarvis || 0;
            document.getElementById('replit-messages').textContent = result.stats.from_replit_agent || 0;
            document.getElementById('recent-messages').textContent = result.stats.recent_messages_24h || 0;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Load messages
async function loadMessages() {
    try {
        const filters = {};
        if (agentOps.currentFilter) {
            filters.message_type = agentOps.currentFilter;
        }
        
        const result = await agentOps.getMessages(50, filters);
        
        if (result.success) {
            agentOps.messages = result.messages;
            renderMessages(result.messages);
        }
    } catch (error) {
        console.error('Error loading messages:', error);
        document.getElementById('agent-feed').innerHTML = `
            <div class="text-center py-5 text-danger">
                <i class="bi bi-exclamation-triangle"></i> Failed to load messages
            </div>
        `;
    }
}

// Render messages in feed
function renderMessages(messages) {
    const feed = document.getElementById('agent-feed');
    
    if (messages.length === 0) {
        feed.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="bi bi-inbox"></i><br>
                No agent messages yet. Click "Simulate Collaboration" to see the demo!
            </div>
        `;
        return;
    }
    
    feed.innerHTML = messages.map(msg => renderMessage(msg)).join('');
}

// Render single message
function renderMessage(message) {
    const fromAgentClass = getAgentClass(message.from_agent);
    const toAgentClass = getAgentClass(message.to_agent);
    const typeClass = getTypeClass(message.message_type);
    const timeAgo = formatTimeAgo(message.created_at);
    
    return `
        <div class="agent-message ${typeClass}" onclick="showMessageDetail('${message.id}')">
            <div class="message-header">
                <div class="message-agents">
                    <div class="agent-avatar ${fromAgentClass}"></div>
                    <div class="agent-flow">
                        <strong>${formatAgentName(message.from_agent)}</strong>
                        <i class="bi bi-arrow-right"></i>
                        <strong>${formatAgentName(message.to_agent)}</strong>
                    </div>
                </div>
                <div class="message-meta">
                    <span class="message-type-badge badge badge-${message.message_type}">
                        ${message.message_type.replace('_', ' ')}
                    </span>
                    <span class="message-time">${timeAgo}</span>
                </div>
            </div>
            
            ${message.subject ? `<div class="message-subject">${escapeHtml(message.subject)}</div>` : ''}
            
            <div class="message-content">
                ${formatMessageContent(message.content)}
            </div>
            
            <div class="message-footer">
                <span class="message-status status-${message.status}">
                    <i class="bi ${getStatusIcon(message.status)}"></i> ${message.status}
                </span>
                ${message.priority !== 'normal' ? `
                    <span class="message-priority priority-${message.priority}">
                        ${message.priority}
                    </span>
                ` : ''}
            </div>
        </div>
    `;
}

// Show message detail modal
function showMessageDetail(messageId) {
    const message = agentOps.messages.find(m => m.id === parseInt(messageId));
    
    if (!message) return;
    
    // Populate modal
    document.getElementById('detail-from-agent').textContent = formatAgentName(message.from_agent);
    document.getElementById('detail-to-agent').textContent = formatAgentName(message.to_agent);
    
    const typeBadge = document.getElementById('detail-type');
    typeBadge.textContent = message.message_type.replace('_', ' ');
    typeBadge.className = `badge badge-${message.message_type}`;
    
    const statusBadge = document.getElementById('detail-status');
    statusBadge.textContent = message.status;
    statusBadge.className = `badge bg-${getStatusColor(message.status)}`;
    
    const priorityBadge = document.getElementById('detail-priority');
    priorityBadge.textContent = message.priority;
    priorityBadge.className = `badge bg-${getPriorityColor(message.priority)}`;
    
    document.getElementById('detail-time').textContent = new Date(message.created_at).toLocaleString();
    
    if (message.subject) {
        document.getElementById('detail-subject-container').style.display = 'block';
        document.getElementById('detail-subject').textContent = message.subject;
    } else {
        document.getElementById('detail-subject-container').style.display = 'none';
    }
    
    document.getElementById('detail-content').innerHTML = formatMessageContent(message.content);
    
    if (message.metadata && Object.keys(message.metadata).length > 0) {
        document.getElementById('detail-metadata-container').style.display = 'block';
        document.getElementById('detail-metadata').textContent = JSON.stringify(message.metadata, null, 2);
    } else {
        document.getElementById('detail-metadata-container').style.display = 'none';
    }
    
    messageDetailModalInstance.show();
}

// Filter messages by type
function filterMessages() {
    const filterSelect = document.getElementById('message-type-filter');
    agentOps.currentFilter = filterSelect.value;
    loadMessages();
}

// Refresh feed
function refreshFeed() {
    loadMessages();
    loadStats();
    showToast('Info', 'Refreshing agent feed...', 'info');
}

// Clear feed (for demo)
async function clearFeed() {
    if (!confirm('This will remove all agent messages. Continue?')) {
        return;
    }
    
    // In a real implementation, this would call an API endpoint
    agentOps.messages = [];
    renderMessages([]);
    loadStats();
    showToast('Info', 'Feed cleared', 'info');
}

// ==================== SIMULATION FUNCTIONS ====================

// Simulate full agent collaboration dialogue
async function simulateAgentDialogue() {
    const dialogue = [
        {
            from: 'user',
            to: 'jarvis',
            type: 'request',
            subject: 'Deploy Nextcloud',
            content: 'Jarvis, I need to deploy Nextcloud on my homelab for file storage and collaboration'
        },
        {
            from: 'jarvis',
            to: 'jarvis',
            type: 'status_update',
            subject: 'Analyzing Request',
            content: 'Analyzing deployment request... Nextcloud requires Docker orchestration, PostgreSQL database, reverse proxy configuration, and SSL certificate provisioning'
        },
        {
            from: 'jarvis',
            to: 'replit_agent',
            type: 'task_delegation',
            subject: 'Code Generation Required',
            content: 'Request delegation: Complex deployment task requires docker-compose generation and Caddyfile configuration. Expertise: code generation'
        },
        {
            from: 'replit_agent',
            to: 'jarvis',
            type: 'response',
            subject: 'Task Acknowledged',
            content: 'Acknowledged. Analyzing Nextcloud deployment requirements and generating infrastructure code...'
        },
        {
            from: 'replit_agent',
            to: 'jarvis',
            type: 'status_update',
            subject: 'Code Generation Complete',
            content: '✓ Generated docker-compose service configuration\n✓ Created PostgreSQL dependency with volume mounts\n✓ Configured 3 persistent volumes (data, config, apps)\n✓ Generated Caddy reverse proxy configuration\n✓ Added SSL/TLS automatic certificate management'
        },
        {
            from: 'jarvis',
            to: 'user',
            type: 'response',
            subject: 'Deployment Complete',
            content: 'Deployment initiated successfully! Nextcloud will be available at https://nextcloud.evindrake.net in approximately 45 seconds. Default admin credentials have been generated and saved securely.'
        }
    ];
    
    showToast('Info', 'Simulating agent collaboration...', 'info');
    
    for (let i = 0; i < dialogue.length; i++) {
        await new Promise(resolve => setTimeout(resolve, i * 2500));
        
        const msg = dialogue[i];
        try {
            await agentOps.sendMessage(
                msg.from,
                msg.to,
                msg.type,
                msg.content,
                msg.subject
            );
            
            // Refresh feed to show new message
            await loadMessages();
            await loadStats();
        } catch (error) {
            console.error('Error sending simulated message:', error);
        }
    }
    
    showToast('Success', 'Agent collaboration demo completed!', 'success');
}

// Simulate task delegation
async function simulateTaskDelegation() {
    const tasks = [
        {
            from: 'user',
            to: 'jarvis',
            subject: 'Infrastructure Monitoring',
            content: 'Set up Prometheus and Grafana for monitoring my homelab infrastructure'
        },
        {
            from: 'jarvis',
            to: 'replit_agent',
            subject: 'Monitoring Stack Deployment',
            content: 'Need assistance deploying monitoring stack with pre-configured dashboards'
        }
    ];
    
    for (const task of tasks) {
        await agentOps.sendMessage(
            task.from,
            task.to,
            'task_delegation',
            task.content,
            task.subject,
            {complexity: 'medium'}
        );
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    loadMessages();
    loadStats();
    showToast('Success', 'Task delegation simulated', 'success');
}

// Simulate deployment workflow
async function simulateDeployment() {
    const workflow = [
        {
            from: 'jarvis',
            to: 'replit_agent',
            type: 'request',
            subject: 'Generate Deployment Config',
            content: 'Generate docker-compose configuration for Jellyfin media server'
        },
        {
            from: 'replit_agent',
            to: 'jarvis',
            type: 'response',
            subject: 'Config Generated',
            content: '✓ Docker Compose generated\n✓ Volume mounts configured\n✓ Hardware acceleration enabled\n✓ Network configuration complete'
        },
        {
            from: 'jarvis',
            to: 'user',
            type: 'notification',
            subject: 'Deployment Successful',
            content: 'Jellyfin has been deployed successfully at https://jellyfin.evindrake.net'
        }
    ];
    
    for (const msg of workflow) {
        await agentOps.sendMessage(
            msg.from,
            msg.to,
            msg.type,
            msg.content,
            msg.subject
        );
        await new Promise(resolve => setTimeout(resolve, 1500));
        loadMessages();
        loadStats();
    }
    
    showToast('Success', 'Deployment workflow simulated', 'success');
}

// ==================== UTILITY FUNCTIONS ====================

function getAgentClass(agent) {
    const classes = {
        'jarvis': 'jarvis-avatar',
        'replit_agent': 'replit-avatar',
        'user': 'user-avatar'
    };
    return classes[agent] || 'default-avatar';
}

function formatAgentName(agent) {
    const names = {
        'jarvis': 'Jarvis AI',
        'replit_agent': 'Replit Agent',
        'user': 'User'
    };
    return names[agent] || agent;
}

function getTypeClass(messageType) {
    return `type-${messageType.replace('_', '-')}`;
}

function getStatusIcon(status) {
    const icons = {
        'sent': 'bi-send',
        'delivered': 'bi-check',
        'acknowledged': 'bi-check-all',
        'completed': 'bi-check-circle-fill'
    };
    return icons[status] || 'bi-circle';
}

function getStatusColor(status) {
    const colors = {
        'sent': 'secondary',
        'delivered': 'info',
        'acknowledged': 'primary',
        'completed': 'success'
    };
    return colors[status] || 'secondary';
}

function getPriorityColor(priority) {
    const colors = {
        'low': 'secondary',
        'normal': 'info',
        'high': 'warning',
        'urgent': 'danger'
    };
    return colors[priority] || 'info';
}

function formatMessageContent(content) {
    // Convert newlines to <br> and preserve formatting
    return escapeHtml(content)
        .replace(/\n/g, '<br>')
        .replace(/✓/g, '<i class="bi bi-check-circle-fill text-success"></i>')
        .replace(/✗/g, '<i class="bi bi-x-circle-fill text-danger"></i>');
}

function formatTimeAgo(timestamp) {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = Math.floor((now - time) / 1000); // seconds
    
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(title, message, type = 'info') {
    if (typeof window.showToast === 'function') {
        window.showToast(title, message, type);
    } else {
        console.log(`[${type.toUpperCase()}] ${title}: ${message}`);
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', function() {
    if (agentOps.refreshInterval) {
        clearInterval(agentOps.refreshInterval);
    }
});
