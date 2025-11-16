async function loadDashboardStats() {
    try {
        const marketplaceResp = await fetch('/api/marketplace/templates');
        if (marketplaceResp.ok) {
            const data = await marketplaceResp.json();
            const count = data.templates?.length || 0;
            document.getElementById('marketplaceCount').textContent = count;
            document.getElementById('marketplaceStatus').textContent = `${count} templates ready`;
        }
        
        const deployedResp = await fetch('/api/marketplace/deployments');
        if (deployedResp.ok) {
            const data = await deployedResp.json();
            document.getElementById('deployedCount').textContent = data.deployments?.length || 0;
        }
        
        const agentResp = await fetch('/api/agents/messages');
        if (agentResp.ok) {
            const data = await agentResp.json();
            document.getElementById('agentMessages').textContent = data.messages?.length || 0;
        }
        
        loadFeaturedApps();
        loadRecentActivity();
        
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

async function loadFeaturedApps() {
    try {
        const resp = await fetch('/api/marketplace/templates/featured');
        if (resp.ok) {
            const data = await resp.json();
            const grid = document.getElementById('featuredApps');
            
            if (data.templates && data.templates.length > 0) {
                grid.innerHTML = data.templates.slice(0, 4).map(app => `
                    <div class="app-card">
                        <div class="app-icon">
                            <i class="bi ${app.icon_url || 'bi-app'}"></i>
                        </div>
                        <h4>${app.display_name}</h4>
                        <p>${app.description || 'No description available'}</p>
                        <button class="deploy-btn" onclick="window.location='/marketplace'">Deploy</button>
                    </div>
                `).join('');
            } else {
                grid.innerHTML = '<p class="empty-message">No featured apps available yet</p>';
            }
        }
    } catch (error) {
        console.error('Error loading featured apps:', error);
        document.getElementById('featuredApps').innerHTML = '<p class="error-message">Failed to load featured apps</p>';
    }
}

async function loadRecentActivity() {
    try {
        const resp = await fetch('/api/agents/messages?limit=5');
        if (resp.ok) {
            const data = await resp.json();
            const feed = document.getElementById('activityFeed');
            
            if (data.messages && data.messages.length > 0) {
                feed.innerHTML = data.messages.map(msg => `
                    <div class="activity-item">
                        <div class="activity-header">
                            <strong>${msg.from_agent}</strong> 
                            <i class="bi bi-arrow-right"></i> 
                            <strong>${msg.to_agent}</strong>
                            <span class="timestamp">${formatTime(msg.created_at)}</span>
                        </div>
                        <p class="activity-content">${truncate(msg.content, 100)}</p>
                    </div>
                `).join('');
            } else {
                feed.innerHTML = '<p class="empty-message">No recent agent activity</p>';
            }
        }
    } catch (error) {
        console.error('Error loading recent activity:', error);
        document.getElementById('activityFeed').innerHTML = '<p class="error-message">Failed to load activity</p>';
    }
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

function truncate(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

document.addEventListener('DOMContentLoaded', loadDashboardStats);

setInterval(loadDashboardStats, 30000);
