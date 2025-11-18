// Marketplace JavaScript
let currentCategory = 'all';
let apps = [];
let deployedApps = [];
let currentDeployingApp = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadApps();
    loadDeployedApps();
    setupEventListeners();
    
    // Auto-refresh deployed apps every 30 seconds
    setInterval(loadDeployedApps, 30000);
});

function setupEventListeners() {
    // Category filtering
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategory = btn.dataset.category;
            filterApps();
        });
    });
    
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            switchTab(tab.dataset.tab);
        });
    });
    
    // Deploy form submission
    document.getElementById('deploy-form').addEventListener('submit', (e) => {
        e.preventDefault();
        submitDeployment();
    });
}

function switchTab(tabName) {
    if (tabName === 'browse') {
        document.getElementById('browse-section').style.display = 'block';
        document.getElementById('deployed-section').style.display = 'none';
    } else if (tabName === 'deployed') {
        document.getElementById('browse-section').style.display = 'none';
        document.getElementById('deployed-section').style.display = 'block';
        loadDeployedApps();
    }
}

async function loadApps() {
    try {
        const response = await fetch('/api/marketplace/apps');
        const data = await response.json();
        
        if (data.success) {
            apps = data.data.apps;
            renderApps();
        } else {
            showNotification('Failed to load apps: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Error loading apps:', error);
        showNotification('Failed to load marketplace apps', 'error');
    }
}

function filterApps() {
    renderApps();
}

function renderApps() {
    const grid = document.getElementById('apps-grid');
    let filteredApps = apps;
    
    if (currentCategory !== 'all') {
        filteredApps = apps.filter(app => app.category === currentCategory);
    }
    
    if (filteredApps.length === 0) {
        grid.innerHTML = '<div class="empty-state">No apps found in this category</div>';
        return;
    }
    
    grid.innerHTML = filteredApps.map(app => `
        <div class="app-card" onclick="openDeployModal('${app.slug}')">
            <img src="${app.icon_url}" alt="${app.name}" class="app-icon" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect fill=%22%23667eea%22 width=%22100%22 height=%22100%22/><text x=%2250%22 y=%2250%22 font-size=%2260%22 text-anchor=%22middle%22 dy=%22.3em%22 fill=%22white%22>${app.name[0]}</text></svg>'">
            <div class="app-category">${app.category}</div>
            <div class="app-name">${app.name}</div>
            <div class="app-description">${app.description}</div>
            <button class="deploy-btn" onclick="event.stopPropagation(); openDeployModal('${app.slug}')">
                Deploy →
            </button>
        </div>
    `).join('');
}

function openDeployModal(slug) {
    const app = apps.find(a => a.slug === slug);
    if (!app) return;
    
    currentDeployingApp = app;
    document.getElementById('deploy-modal-title').textContent = `Deploy ${app.name}`;
    
    // Generate form fields based on env_template
    const formFields = document.getElementById('deploy-form-fields');
    formFields.innerHTML = '';
    
    if (app.long_description) {
        formFields.innerHTML += `
            <div class="form-group">
                <p style="color: var(--text-secondary); font-size: 0.9rem;">${app.long_description}</p>
            </div>
        `;
    }
    
    Object.entries(app.env_template).forEach(([key, config]) => {
        const fieldId = `field-${key}`;
        let inputHtml = '';
        
        if (config.type === 'password' && config.generate) {
            inputHtml = `
                <div style="display: flex; align-items: center;">
                    <input type="password" id="${fieldId}" name="${key}" 
                           placeholder="${config.placeholder || ''}" 
                           ${config.required ? 'required' : ''}>
                    <button type="button" class="generate-btn" onclick="generatePassword('${fieldId}')">
                        Generate
                    </button>
                </div>
            `;
        } else if (config.type === 'number') {
            inputHtml = `
                <input type="number" id="${fieldId}" name="${key}" 
                       value="${config.default || ''}"
                       placeholder="${config.placeholder || ''}" 
                       ${config.required ? 'required' : ''}>
            `;
        } else {
            inputHtml = `
                <input type="${config.type}" id="${fieldId}" name="${key}" 
                       value="${config.default || ''}"
                       placeholder="${config.placeholder || ''}" 
                       ${config.required ? 'required' : ''}>
            `;
        }
        
        formFields.innerHTML += `
            <div class="form-group">
                <label for="${fieldId}">
                    ${config.label}
                    ${config.required ? '<span style="color: #ef4444;">*</span>' : ''}
                </label>
                ${inputHtml}
            </div>
        `;
    });
    
    // Auto-generate passwords on modal open
    Object.entries(app.env_template).forEach(([key, config]) => {
        if (config.type === 'password' && config.generate) {
            const fieldId = `field-${key}`;
            generatePassword(fieldId);
        }
    });
    
    document.getElementById('deploy-modal').classList.add('active');
}

function closeDeployModal() {
    document.getElementById('deploy-modal').classList.remove('active');
    currentDeployingApp = null;
}

function generatePassword(fieldId) {
    const length = 24;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    
    for (let i = 0; i < length; i++) {
        password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    
    document.getElementById(fieldId).value = password;
    document.getElementById(fieldId).type = 'text';
    
    setTimeout(() => {
        document.getElementById(fieldId).type = 'password';
    }, 2000);
}

async function submitDeployment() {
    if (!currentDeployingApp) return;
    
    const form = document.getElementById('deploy-form');
    const formData = new FormData(form);
    const config = {};
    
    formData.forEach((value, key) => {
        if (value) {
            config[key] = value;
        }
    });
    
    try {
        const response = await fetch(`/api/marketplace/deploy/${currentDeployingApp.slug}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(config)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification(`${currentDeployingApp.name} is being deployed!`, 'success');
            closeDeployModal();
            
            // Switch to deployed apps tab
            document.querySelector('[data-tab="deployed"]').click();
            
            // Refresh deployed apps
            setTimeout(loadDeployedApps, 2000);
        } else {
            showNotification('Deployment failed: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Error deploying app:', error);
        showNotification('Failed to deploy app', 'error');
    }
}

async function loadDeployedApps() {
    try {
        const response = await fetch('/api/marketplace/deployed');
        const data = await response.json();
        
        if (data.success) {
            deployedApps = data.data.deployed_apps;
            renderDeployedApps();
        }
    } catch (error) {
        console.error('Error loading deployed apps:', error);
    }
}

function renderDeployedApps() {
    const list = document.getElementById('deployed-apps-list');
    
    if (deployedApps.length === 0) {
        list.innerHTML = '<div class="empty-state">No deployed apps yet. Deploy your first app from the Browse Apps tab!</div>';
        return;
    }
    
    list.innerHTML = deployedApps.map(app => {
        const statusClass = app.status === 'running' ? 'status-running' : 
                           app.status === 'stopped' ? 'status-stopped' : 'status-deploying';
        
        return `
            <div class="deployed-app">
                <div class="deployed-app-header">
                    <div>
                        <div class="deployed-app-name">${app.app_name || 'Unknown'}</div>
                        <div style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 0.25rem;">
                            ${app.domain || `localhost:${app.port}`}
                        </div>
                    </div>
                    <div>
                        <span class="status-badge ${statusClass}">
                            ${app.status}
                        </span>
                    </div>
                </div>
                
                <div class="app-actions">
                    ${app.domain ? `<button class="action-btn" onclick="openApp('${app.domain}')">Open</button>` : ''}
                    ${app.port && !app.domain ? `<button class="action-btn" onclick="openApp('http://localhost:${app.port}')">Open (Port ${app.port})</button>` : ''}
                    <button class="action-btn" onclick="viewLogs(${app.id})">Logs</button>
                    ${app.status === 'running' ? `
                        <button class="action-btn" onclick="stopApp(${app.id})">Stop</button>
                        <button class="action-btn" onclick="restartApp(${app.id})">Restart</button>
                    ` : `
                        <button class="action-btn" onclick="startApp(${app.id})">Start</button>
                    `}
                    <button class="action-btn danger" onclick="confirmRemoveApp(${app.id}, '${app.app_name}')">Remove</button>
                </div>
                
                ${app.error_message ? `
                    <div style="margin-top: 1rem; padding: 0.75rem; background: rgba(239, 68, 68, 0.1); border-left: 3px solid #ef4444; border-radius: 4px;">
                        <strong style="color: #ef4444;">Error:</strong> ${app.error_message}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

function openApp(url) {
    if (!url.startsWith('http')) {
        url = 'https://' + url;
    }
    window.open(url, '_blank');
}

async function startApp(id) {
    try {
        const response = await fetch(`/api/marketplace/deployed/${id}/start`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('App started successfully', 'success');
            loadDeployedApps();
        } else {
            showNotification('Failed to start app: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Error starting app:', error);
        showNotification('Failed to start app', 'error');
    }
}

async function stopApp(id) {
    try {
        const response = await fetch(`/api/marketplace/deployed/${id}/stop`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('App stopped successfully', 'success');
            loadDeployedApps();
        } else {
            showNotification('Failed to stop app: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Error stopping app:', error);
        showNotification('Failed to stop app', 'error');
    }
}

async function restartApp(id) {
    try {
        const response = await fetch(`/api/marketplace/deployed/${id}/restart`, {
            method: 'POST'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('App restarted successfully', 'success');
            loadDeployedApps();
        } else {
            showNotification('Failed to restart app: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Error restarting app:', error);
        showNotification('Failed to restart app', 'error');
    }
}

function confirmRemoveApp(id, name) {
    if (confirm(`Are you sure you want to remove ${name}? This will stop and delete the container.`)) {
        removeApp(id);
    }
}

async function removeApp(id) {
    try {
        const response = await fetch(`/api/marketplace/deployed/${id}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('App removed successfully', 'success');
            loadDeployedApps();
        } else {
            showNotification('Failed to remove app: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Error removing app:', error);
        showNotification('Failed to remove app', 'error');
    }
}

async function viewLogs(id) {
    try {
        const response = await fetch(`/api/marketplace/deployed/${id}/logs?tail=200`);
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('logs-content').textContent = data.data.logs || 'No logs available';
            document.getElementById('logs-modal').classList.add('active');
        } else {
            showNotification('Failed to fetch logs: ' + data.message, 'error');
        }
    } catch (error) {
        console.error('Error fetching logs:', error);
        showNotification('Failed to fetch logs', 'error');
    }
}

function closeLogsModal() {
    document.getElementById('logs-modal').classList.remove('active');
}

// Close modals when clicking outside
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
    }
});

function showNotification(message, type = 'info') {
    // Reuse existing notification system if available
    if (typeof window.showNotification === 'function') {
        window.showNotification(message, type);
    } else {
        // Fallback to alert
        alert(message);
    }
}
