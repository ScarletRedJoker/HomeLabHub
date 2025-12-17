let databases = [];
let credentials = [];
let backups = [];
let currentEnvironment = 'all';

document.addEventListener('DOMContentLoaded', function() {
    loadDatabases();
    loadCredentials();
    loadBackups();
    
    setInterval(loadDatabases, 60000);
    setInterval(loadBackups, 120000);
});

function getCSRFToken() {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
}

async function loadDatabases() {
    try {
        const response = await fetch(`/api/db-console/databases?environment=${currentEnvironment}`);
        const data = await response.json();
        
        if (data.success) {
            databases = data.databases;
            renderDatabases();
            updateCounts();
        } else {
            showToast('Failed to load databases: ' + data.error, 'error');
        }
    } catch (error) {
        console.error('Error loading databases:', error);
        renderEmptyDatabases('Error loading databases');
    }
}

async function loadCredentials() {
    try {
        const response = await fetch('/api/db-console/credentials');
        const data = await response.json();
        
        if (data.success) {
            credentials = data.credentials;
            renderCredentials();
        }
    } catch (error) {
        console.error('Error loading credentials:', error);
    }
}

async function loadBackups() {
    try {
        const response = await fetch(`/api/db-console/backups?environment=${currentEnvironment}`);
        const data = await response.json();
        
        if (data.success) {
            backups = data.backups;
            renderBackups();
        }
    } catch (error) {
        console.error('Error loading backups:', error);
    }
}

function filterByEnvironment(env) {
    currentEnvironment = env;
    
    document.querySelectorAll('.env-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelector(`[data-env="${env}"]`).classList.add('active');
    
    loadDatabases();
    loadBackups();
}

function updateCounts() {
    const allCount = databases.length;
    const localCount = databases.filter(db => db.environment === 'local').length;
    const linodeCount = databases.filter(db => db.environment === 'linode').length;
    
    document.getElementById('countAll').textContent = allCount;
    document.getElementById('countLocal').textContent = localCount;
    document.getElementById('countLinode').textContent = linodeCount;
}

function renderDatabases() {
    const grid = document.getElementById('databaseGrid');
    
    if (databases.length === 0) {
        renderEmptyDatabases('No databases found');
        return;
    }
    
    grid.innerHTML = databases.map(db => `
        <div class="db-card">
            <div class="db-card-header">
                <div class="db-name">${escapeHtml(db.db_name)}</div>
                <span class="db-env-badge db-env-${db.environment}">${db.environment}</span>
            </div>
            
            <div class="db-stats">
                <div class="db-stat">
                    <div class="db-stat-value">${db.size_mb !== null ? db.size_mb : '-'}</div>
                    <div class="db-stat-label">MB</div>
                </div>
                <div class="db-stat">
                    <div class="db-stat-value">${db.connection_count !== null ? db.connection_count : '-'}</div>
                    <div class="db-stat-label">Conns</div>
                </div>
                <div class="db-stat">
                    <div class="db-stat-value">${db.table_count !== null ? db.table_count : '-'}</div>
                    <div class="db-stat-label">Tables</div>
                </div>
            </div>
            
            <div class="db-info">
                <div class="db-info-item">
                    <i class="bi bi-server"></i>
                    <span>${escapeHtml(db.host)}:${db.port}</span>
                </div>
                <div class="db-info-item">
                    <i class="bi bi-person"></i>
                    <span>${escapeHtml(db.username)}</span>
                </div>
                <div class="db-info-item">
                    <span class="status-indicator status-${db.test_status || 'unknown'}"></span>
                    <span>${db.test_status ? db.test_status.charAt(0).toUpperCase() + db.test_status.slice(1) : 'Not tested'}</span>
                </div>
            </div>
            
            <div class="db-actions">
                <button class="btn-sm" onclick="testConnection('${db.id}')" title="Test Connection">
                    <i class="bi bi-plug"></i>
                </button>
                <button class="btn-sm" onclick="copyConnectionString('${db.id}')" title="Copy Connection String">
                    <i class="bi bi-clipboard"></i>
                </button>
                <button class="btn-sm" onclick="showBackupModal('${db.id}')" title="Create Backup">
                    <i class="bi bi-download"></i>
                </button>
                <button class="btn-sm danger" onclick="deleteCredential('${db.id}', '${escapeHtml(db.db_name)}')" title="Delete">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function renderEmptyDatabases(message) {
    const grid = document.getElementById('databaseGrid');
    grid.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
            <i class="bi bi-database-x"></i>
            <p>${message}</p>
            <button class="btn-sm primary" onclick="showAddCredentialModal()" style="margin-top: 16px;">
                <i class="bi bi-plus-circle"></i> Add Database
            </button>
        </div>
    `;
}

function renderCredentials() {
    const tbody = document.getElementById('credentialsBody');
    
    if (credentials.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">No credentials stored</td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = credentials.map(cred => `
        <tr>
            <td><strong>${escapeHtml(cred.db_name)}</strong></td>
            <td>${escapeHtml(cred.host)}:${cred.port}</td>
            <td>${escapeHtml(cred.username)}</td>
            <td>
                <span class="password-field">
                    <span id="pwd-${cred.id}">${cred.password_masked}</span>
                    <button class="btn-sm" onclick="togglePassword('${cred.id}')" style="padding: 2px 6px;">
                        <i class="bi bi-eye"></i>
                    </button>
                </span>
            </td>
            <td><span class="db-env-badge db-env-${cred.environment}">${cred.environment}</span></td>
            <td>
                <span class="status-indicator status-${cred.test_status || 'unknown'}"></span>
                ${cred.test_status || 'Unknown'}
            </td>
            <td>
                <div style="display: flex; gap: 4px;">
                    <button class="btn-sm" onclick="testConnection('${cred.id}')" title="Test">
                        <i class="bi bi-plug"></i>
                    </button>
                    <button class="btn-sm" onclick="copyConnectionString('${cred.id}')" title="Copy">
                        <i class="bi bi-clipboard"></i>
                    </button>
                    <button class="btn-sm danger" onclick="deleteCredential('${cred.id}', '${escapeHtml(cred.db_name)}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderBackups() {
    const tbody = document.getElementById('backupBody');
    
    if (backups.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="empty-state">No backups found</td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = backups.map(backup => `
        <tr>
            <td><strong>${escapeHtml(backup.db_name)}</strong></td>
            <td><span class="db-env-badge db-env-${backup.environment || 'unknown'}">${backup.environment || 'Unknown'}</span></td>
            <td>${backup.backup_type}</td>
            <td>${backup.file_size_mb ? backup.file_size_mb + ' MB' : '-'}</td>
            <td><span class="status-badge ${backup.status}">${backup.status}</span></td>
            <td>${formatDate(backup.created_at)}</td>
            <td>
                <div style="display: flex; gap: 4px;">
                    ${backup.status === 'completed' ? `
                        <button class="btn-sm" onclick="downloadBackup('${backup.id}')" title="Download">
                            <i class="bi bi-download"></i>
                        </button>
                        <button class="btn-sm" onclick="showRestoreModal('${backup.id}')" title="Restore">
                            <i class="bi bi-arrow-counterclockwise"></i>
                        </button>
                    ` : ''}
                    <button class="btn-sm danger" onclick="deleteBackup('${backup.id}')" title="Delete">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function showAddCredentialModal() {
    document.getElementById('credModalTitle').textContent = 'Add Database Credential';
    document.getElementById('credentialId').value = '';
    document.getElementById('credentialForm').reset();
    document.getElementById('connectionResult').style.display = 'none';
    document.getElementById('credentialModal').style.display = 'block';
}

function showBackupModal(credentialId) {
    document.getElementById('backupCredentialId').value = credentialId;
    document.getElementById('backupForm').reset();
    document.getElementById('backupModal').style.display = 'block';
}

function showRestoreModal(backupId) {
    document.getElementById('restoreBackupId').value = backupId;
    
    const select = document.getElementById('restoreTarget');
    select.innerHTML = '<option value="">Select target database...</option>';
    credentials.forEach(cred => {
        select.innerHTML += `<option value="${cred.id}">${cred.db_name} (${cred.environment})</option>`;
    });
    
    document.getElementById('restoreModal').style.display = 'block';
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

async function saveCredential(event) {
    event.preventDefault();
    
    const data = {
        db_name: document.getElementById('dbName').value,
        host: document.getElementById('dbHost').value,
        port: parseInt(document.getElementById('dbPort').value),
        username: document.getElementById('dbUsername').value,
        password: document.getElementById('dbPassword').value
    };
    
    try {
        const response = await fetch('/api/db-console/credentials', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Credential saved successfully', 'success');
            closeModal('credentialModal');
            loadDatabases();
            loadCredentials();
        } else {
            showToast('Failed to save credential: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    }
}

async function testConnection(credentialId) {
    try {
        const btn = event.target.closest('button');
        const originalHtml = btn.innerHTML;
        btn.innerHTML = '<span class="loading-spinner"></span>';
        btn.disabled = true;
        
        const response = await fetch('/api/db-console/test-connection', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            },
            body: JSON.stringify({ credential_id: credentialId })
        });
        
        const result = await response.json();
        
        btn.innerHTML = originalHtml;
        btn.disabled = false;
        
        if (result.success) {
            showToast('Connection successful! ' + (result.version || ''), 'success');
            loadDatabases();
            loadCredentials();
        } else {
            showToast('Connection failed: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Error testing connection: ' + error.message, 'error');
    }
}

async function testConnectionFromModal() {
    const resultDiv = document.getElementById('connectionResult');
    
    const data = {
        host: document.getElementById('dbHost').value,
        port: parseInt(document.getElementById('dbPort').value),
        database: document.getElementById('dbName').value,
        username: document.getElementById('dbUsername').value,
        password: document.getElementById('dbPassword').value
    };
    
    resultDiv.innerHTML = '<span class="loading-spinner"></span> Testing connection...';
    resultDiv.className = 'connection-result';
    resultDiv.style.display = 'block';
    
    try {
        const response = await fetch('/api/db-console/test-connection', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            resultDiv.className = 'connection-result success';
            resultDiv.innerHTML = '<i class="bi bi-check-circle"></i> Connection successful!<br><small>' + (result.version || '') + '</small>';
        } else {
            resultDiv.className = 'connection-result error';
            resultDiv.innerHTML = '<i class="bi bi-x-circle"></i> Connection failed: ' + result.error;
        }
    } catch (error) {
        resultDiv.className = 'connection-result error';
        resultDiv.innerHTML = '<i class="bi bi-x-circle"></i> Error: ' + error.message;
    }
}

async function copyConnectionString(credentialId) {
    try {
        const response = await fetch(`/api/db-console/connection-string/${credentialId}?show_password=true`);
        const result = await response.json();
        
        if (result.success) {
            await navigator.clipboard.writeText(result.connection_string);
            showToast('Connection string copied to clipboard', 'success');
        } else {
            showToast('Failed to get connection string: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    }
}

async function deleteCredential(credentialId, dbName) {
    if (!confirm(`Are you sure you want to delete the credential for "${dbName}"?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/db-console/credentials/${credentialId}`, {
            method: 'DELETE',
            headers: {
                'X-CSRFToken': getCSRFToken()
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Credential deleted successfully', 'success');
            loadDatabases();
            loadCredentials();
        } else {
            showToast('Failed to delete credential: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    }
}

async function createBackup(event) {
    event.preventDefault();
    
    const data = {
        credential_id: document.getElementById('backupCredentialId').value,
        backup_type: document.getElementById('backupType').value,
        compression: document.getElementById('backupCompression').value
    };
    
    try {
        const response = await fetch('/api/db-console/backup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Backup started successfully', 'success');
            closeModal('backupModal');
            
            if (result.task_id) {
                pollBackupStatus(result.task_id);
            } else {
                loadBackups();
            }
        } else {
            showToast('Failed to start backup: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    }
}

async function restoreBackup(event) {
    event.preventDefault();
    
    const targetCredential = document.getElementById('restoreTarget').value;
    if (!targetCredential) {
        showToast('Please select a target database', 'error');
        return;
    }
    
    const data = {
        backup_job_id: document.getElementById('restoreBackupId').value,
        target_credential_id: targetCredential
    };
    
    try {
        const response = await fetch('/api/db-console/restore', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Restore started successfully', 'success');
            closeModal('restoreModal');
            
            if (result.task_id) {
                pollBackupStatus(result.task_id);
            }
        } else {
            showToast('Failed to start restore: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    }
}

async function pollBackupStatus(taskId) {
    const checkStatus = async () => {
        try {
            const response = await fetch(`/api/db-console/backup/status/${taskId}`);
            const result = await response.json();
            
            if (result.ready) {
                loadBackups();
                showToast('Backup/Restore completed', 'success');
            } else if (result.status === 'PENDING' || result.status === 'STARTED') {
                setTimeout(checkStatus, 3000);
            } else {
                loadBackups();
            }
        } catch (error) {
            console.error('Error polling status:', error);
        }
    };
    
    setTimeout(checkStatus, 2000);
}

function downloadBackup(backupId) {
    window.open(`/api/databases/backups/${backupId}/download`, '_blank');
}

async function deleteBackup(backupId) {
    if (!confirm('Are you sure you want to delete this backup?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/databases/backups/${backupId}`, {
            method: 'DELETE',
            headers: {
                'X-CSRFToken': getCSRFToken()
            }
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Backup deleted successfully', 'success');
            loadBackups();
        } else {
            showToast('Failed to delete backup: ' + result.error, 'error');
        }
    } catch (error) {
        showToast('Error: ' + error.message, 'error');
    }
}

async function togglePassword(credentialId) {
    const pwdSpan = document.getElementById(`pwd-${credentialId}`);
    
    if (pwdSpan.textContent === '••••••••') {
        try {
            const response = await fetch(`/api/db-console/connection-string/${credentialId}?show_password=true`);
            const result = await response.json();
            
            if (result.success) {
                const match = result.connection_string.match(/:([^@]+)@/);
                if (match) {
                    pwdSpan.textContent = match[1];
                    setTimeout(() => {
                        pwdSpan.textContent = '••••••••';
                    }, 5000);
                }
            }
        } catch (error) {
            console.error('Error fetching password:', error);
        }
    } else {
        pwdSpan.textContent = '••••••••';
    }
}

function refreshDatabases() {
    loadDatabases();
    loadCredentials();
    showToast('Refreshing databases...', 'info');
}

function refreshBackups() {
    loadBackups();
    showToast('Refreshing backups...', 'info');
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="bi bi-${type === 'success' ? 'check-circle' : type === 'error' ? 'x-circle' : 'info-circle'}"></i>
        <span>${escapeHtml(message)}</span>
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => {
        toast.remove();
    }, 4000);
}

window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
};
