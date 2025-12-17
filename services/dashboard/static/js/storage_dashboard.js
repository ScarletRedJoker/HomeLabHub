let mountData = [];
let sortColumn = 'mount_point';
let sortDirection = 'asc';
let autoRefreshInterval = null;

document.addEventListener('DOMContentLoaded', function() {
    initializeStorageDashboard();
});

function initializeStorageDashboard() {
    loadStorageOverview();
    loadMounts();
    loadBackupDestinations();
    loadNasStatus();
    checkStorageHealth();
    
    startAutoRefresh();
    
    document.querySelectorAll('.mount-table th[data-sort]').forEach(th => {
        th.addEventListener('click', () => handleSort(th.dataset.sort));
    });
}

function startAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    autoRefreshInterval = setInterval(() => {
        loadStorageOverview();
        loadMounts();
        loadNasStatus();
    }, 60000);
}

function getCSRFToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
}

async function loadStorageOverview() {
    try {
        const response = await fetch('/storage-dashboard/api/storage/overview', {
            headers: {
                'X-CSRFToken': getCSRFToken()
            }
        });
        const data = await response.json();
        
        if (data.success) {
            const overview = data.overview;
            
            document.getElementById('totalCapacity').textContent = formatBytes(overview.total_capacity_bytes);
            document.getElementById('totalUsed').textContent = formatBytes(overview.total_used_bytes);
            document.getElementById('totalAvailable').textContent = formatBytes(overview.total_available_bytes);
            document.getElementById('nasMounts').textContent = overview.sources.nas.count;
            document.getElementById('localMounts').textContent = overview.sources.local.count;
            document.getElementById('cloudBuckets').textContent = overview.sources.cloud.count;
            
            renderAlerts(overview.alerts);
        }
    } catch (error) {
        console.error('Error loading storage overview:', error);
        showToast('Failed to load storage overview', 'error');
    }
}

async function loadMounts() {
    const loading = document.getElementById('mountsLoading');
    const table = document.getElementById('mountTable');
    const empty = document.getElementById('mountsEmpty');
    
    loading.style.display = 'flex';
    table.style.display = 'none';
    empty.style.display = 'none';
    
    try {
        const response = await fetch('/storage-dashboard/api/storage/mounts', {
            headers: {
                'X-CSRFToken': getCSRFToken()
            }
        });
        const data = await response.json();
        
        loading.style.display = 'none';
        
        if (data.success && data.mounts.length > 0) {
            mountData = data.mounts;
            renderMountTable();
            table.style.display = 'table';
        } else {
            empty.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading mounts:', error);
        loading.style.display = 'none';
        empty.style.display = 'block';
        showToast('Failed to load storage mounts', 'error');
    }
}

function renderMountTable() {
    const tbody = document.getElementById('mountTableBody');
    
    const sorted = [...mountData].sort((a, b) => {
        let aVal = a[sortColumn];
        let bVal = b[sortColumn];
        
        if (typeof aVal === 'string') aVal = aVal.toLowerCase();
        if (typeof bVal === 'string') bVal = bVal.toLowerCase();
        
        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
        return 0;
    });
    
    tbody.innerHTML = sorted.map(mount => {
        const usageClass = mount.usage_percent >= 90 ? 'high' : 
                          mount.usage_percent >= 70 ? 'medium' : 'low';
        
        return `
            <tr>
                <td>
                    <strong>${escapeHtml(mount.mount_point)}</strong>
                    <div style="font-size: 0.8rem; color: var(--text-secondary);">
                        ${escapeHtml(mount.source || '')}
                    </div>
                </td>
                <td>
                    <span class="mount-type-badge ${mount.type}">
                        <i class="bi bi-${getTypeIcon(mount.type)}"></i>
                        ${mount.type.toUpperCase()}
                    </span>
                </td>
                <td>
                    <span class="status-indicator">
                        <span class="status-dot ${mount.status}"></span>
                        ${capitalizeFirst(mount.status)}
                    </span>
                </td>
                <td>
                    <div class="capacity-bar">
                        <div class="capacity-fill ${usageClass}" style="width: ${mount.usage_percent}%"></div>
                    </div>
                    <div class="capacity-text">
                        ${formatBytes(mount.used_bytes)} / ${formatBytes(mount.total_bytes)} (${mount.usage_percent}%)
                    </div>
                </td>
                <td>
                    <span style="font-size: 0.85rem; color: var(--text-secondary);">
                        ${formatTimestamp(mount.last_scan)}
                    </span>
                </td>
                <td>
                    <div class="quick-actions">
                        <button class="quick-action-btn" onclick="scanMount('${mount.id}')" title="Scan">
                            <i class="bi bi-search"></i>
                        </button>
                        <button class="quick-action-btn" onclick="viewMountDetails('${mount.id}')" title="Details">
                            <i class="bi bi-info-circle"></i>
                        </button>
                        ${mount.type === 'nas' ? `
                            <button class="quick-action-btn danger" onclick="unmountStorage('${mount.mount_point}')" title="Unmount">
                                <i class="bi bi-eject"></i>
                            </button>
                        ` : ''}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
    
    document.querySelectorAll('.mount-table th[data-sort]').forEach(th => {
        th.classList.remove('sorted-asc', 'sorted-desc');
        if (th.dataset.sort === sortColumn) {
            th.classList.add(`sorted-${sortDirection}`);
        }
    });
}

function handleSort(column) {
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'asc';
    }
    renderMountTable();
}

async function loadBackupDestinations() {
    const loading = document.getElementById('backupsLoading');
    const grid = document.getElementById('backupGrid');
    const empty = document.getElementById('backupsEmpty');
    
    loading.style.display = 'flex';
    grid.style.display = 'none';
    empty.style.display = 'none';
    
    try {
        const response = await fetch('/storage-dashboard/api/storage/backup-destinations', {
            headers: {
                'X-CSRFToken': getCSRFToken()
            }
        });
        const data = await response.json();
        
        loading.style.display = 'none';
        
        if (data.success && data.destinations.length > 0) {
            grid.innerHTML = data.destinations.map(dest => `
                <div class="backup-card">
                    <div class="backup-header">
                        <div class="backup-name">
                            <div class="backup-icon ${dest.type}">
                                <i class="bi bi-${getBackupIcon(dest.type)}"></i>
                            </div>
                            <div>
                                <strong>${escapeHtml(dest.name)}</strong>
                                <div style="font-size: 0.8rem; color: var(--text-secondary);">
                                    ${escapeHtml(dest.endpoint)}
                                </div>
                            </div>
                        </div>
                        <span class="status-indicator">
                            <span class="status-dot ${dest.status}"></span>
                        </span>
                    </div>
                    <div class="backup-meta">
                        <div class="backup-meta-row">
                            <span>Type:</span>
                            <span>${dest.type.toUpperCase()}</span>
                        </div>
                        <div class="backup-meta-row">
                            <span>Last Backup:</span>
                            <span>${dest.last_backup ? formatTimestamp(dest.last_backup) : 'Never'}</span>
                        </div>
                        ${dest.share ? `
                            <div class="backup-meta-row">
                                <span>Share:</span>
                                <span>${escapeHtml(dest.share)}</span>
                            </div>
                        ` : ''}
                        ${dest.bucket ? `
                            <div class="backup-meta-row">
                                <span>Bucket:</span>
                                <span>${escapeHtml(dest.bucket)}</span>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `).join('');
            grid.style.display = 'grid';
        } else {
            empty.style.display = 'block';
        }
    } catch (error) {
        console.error('Error loading backup destinations:', error);
        loading.style.display = 'none';
        empty.style.display = 'block';
    }
}

async function loadNasStatus() {
    try {
        const response = await fetch('/storage-dashboard/api/storage/nas-status', {
            headers: {
                'X-CSRFToken': getCSRFToken()
            }
        });
        const data = await response.json();
        
        const card = document.getElementById('nasStatusCard');
        
        if (data.success && data.nas) {
            const nas = data.nas;
            
            card.style.display = 'block';
            
            document.getElementById('nasHostname').textContent = nas.hostname || 'Unknown';
            document.getElementById('nasActiveMounts').textContent = nas.active_mounts || 0;
            document.getElementById('nasBackupShare').textContent = nas.backup_share || '--';
            document.getElementById('nasMediaShare').textContent = nas.media_share || '--';
            document.getElementById('nasIpAddress').textContent = nas.ip_address || '--';
            
            const statusEl = document.getElementById('nasStatus');
            const dot = statusEl.querySelector('.status-dot');
            const text = statusEl.querySelector('span:last-child');
            
            if (nas.is_online) {
                dot.className = 'status-dot online';
                text.textContent = 'Online';
            } else {
                dot.className = 'status-dot offline';
                text.textContent = 'Offline';
            }
        } else {
            card.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading NAS status:', error);
        document.getElementById('nasStatusCard').style.display = 'none';
    }
}

async function checkStorageHealth() {
    const loading = document.getElementById('healthLoading');
    const container = document.getElementById('healthChecks');
    
    loading.style.display = 'flex';
    container.innerHTML = '';
    
    try {
        const response = await fetch('/storage-dashboard/api/storage/health', {
            headers: {
                'X-CSRFToken': getCSRFToken()
            }
        });
        const data = await response.json();
        
        loading.style.display = 'none';
        
        if (data.success) {
            const health = data.health;
            
            container.innerHTML = health.checks.map(check => {
                let iconClass = 'bi-check-circle-fill';
                let colorClass = 'text-success';
                
                if (check.status === 'fail' || check.status === 'critical') {
                    iconClass = 'bi-x-circle-fill';
                    colorClass = 'text-danger';
                } else if (check.status === 'warning') {
                    iconClass = 'bi-exclamation-triangle-fill';
                    colorClass = 'text-warning';
                }
                
                return `
                    <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(31, 41, 55, 0.5); border-radius: 8px; margin-bottom: 8px;">
                        <i class="bi ${iconClass}" style="font-size: 1.2rem; color: var(--accent-${check.status === 'pass' ? 'green' : check.status === 'warning' ? 'yellow' : 'red'});"></i>
                        <div style="flex: 1;">
                            <strong>${escapeHtml(check.name)}</strong>
                            <div style="font-size: 0.85rem; color: var(--text-secondary);">${escapeHtml(check.message)}</div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    } catch (error) {
        console.error('Error checking storage health:', error);
        loading.style.display = 'none';
        container.innerHTML = '<div class="empty-state"><i class="bi bi-exclamation-triangle"></i><p>Failed to check storage health</p></div>';
    }
}

function renderAlerts(alerts) {
    const container = document.getElementById('alertSection');
    
    if (!alerts || alerts.length === 0) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = alerts.map(alert => `
        <div class="alert-card ${alert.type}">
            <i class="bi bi-${alert.type === 'critical' ? 'exclamation-octagon-fill' : 'exclamation-triangle-fill'} alert-icon"></i>
            <span class="alert-message">${escapeHtml(alert.message)}</span>
            <button class="quick-action-btn" onclick="viewMountDetails('${alert.mount_point}')">
                <i class="bi bi-arrow-right"></i>
            </button>
        </div>
    `).join('');
}

async function triggerScan() {
    showRefreshIndicator();
    
    try {
        const response = await fetch('/storage-dashboard/api/storage/scan', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            }
        });
        const data = await response.json();
        
        hideRefreshIndicator();
        
        if (data.success) {
            showToast(`Scan complete: ${data.scan.mounts_found} mounts scanned`, 'success');
            loadStorageOverview();
            loadMounts();
        } else {
            showToast('Scan failed: ' + data.error, 'error');
        }
    } catch (error) {
        hideRefreshIndicator();
        showToast('Scan failed', 'error');
    }
}

async function scanMount(mountId) {
    try {
        const response = await fetch(`/storage-dashboard/api/storage/mounts/${mountId}/usage`, {
            headers: {
                'X-CSRFToken': getCSRFToken()
            }
        });
        const data = await response.json();
        
        if (data.success) {
            showToast(`Mount scanned: ${data.usage.usage_percent}% used`, 'success');
            loadMounts();
        }
    } catch (error) {
        showToast('Failed to scan mount', 'error');
    }
}

async function viewMountDetails(mountId) {
    try {
        const response = await fetch(`/storage-dashboard/api/storage/mounts/${mountId}/usage`, {
            headers: {
                'X-CSRFToken': getCSRFToken()
            }
        });
        const data = await response.json();
        
        if (data.success) {
            const usage = data.usage;
            alert(`Mount: ${usage.mount_point}\n\nTotal: ${formatBytes(usage.total_bytes)}\nUsed: ${formatBytes(usage.used_bytes)} (${usage.usage_percent}%)\nFree: ${formatBytes(usage.free_bytes)}`);
        }
    } catch (error) {
        showToast('Failed to load mount details', 'error');
    }
}

async function unmountStorage(mountPoint) {
    if (!confirm(`Are you sure you want to unmount ${mountPoint}?`)) {
        return;
    }
    
    try {
        const response = await fetch('/nas/api/unmount', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            },
            body: JSON.stringify({ mount_point: mountPoint })
        });
        const data = await response.json();
        
        if (data.success) {
            showToast('Storage unmounted successfully', 'success');
            loadMounts();
        } else {
            showToast('Unmount failed: ' + data.error, 'error');
        }
    } catch (error) {
        showToast('Unmount failed', 'error');
    }
}

function refreshMounts() {
    showRefreshIndicator();
    loadMounts().then(() => hideRefreshIndicator());
}

function refreshBackupDestinations() {
    loadBackupDestinations();
}

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatTimestamp(timestamp) {
    if (!timestamp) return '--';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return date.toLocaleDateString();
}

function getTypeIcon(type) {
    switch (type) {
        case 'nas': return 'hdd-network';
        case 'local': return 'hdd';
        case 'cloud': return 'cloud';
        default: return 'box';
    }
}

function getBackupIcon(type) {
    switch (type) {
        case 'nas': return 'hdd-network-fill';
        case 'minio': return 'box-fill';
        case 's3': return 'cloud-fill';
        default: return 'archive-fill';
    }
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showRefreshIndicator() {
    document.getElementById('refreshIndicator').classList.add('show');
}

function hideRefreshIndicator() {
    document.getElementById('refreshIndicator').classList.remove('show');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class="bi bi-${type === 'success' ? 'check-circle-fill' : type === 'error' ? 'x-circle-fill' : 'info-circle-fill'}"></i>
        <span>${escapeHtml(message)}</span>
    `;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}
