class DNSManager {
    constructor() {
        this.baseUrl = '/api/dns';
        this.currentZone = null;
        this.zones = [];
        this.records = [];
        this.dyndnsHosts = [];
    }

    async listZones() {
        const response = await fetch(`${this.baseUrl}/zones`);
        return await response.json();
    }

    async createZone(name, kind = 'Native', nameservers = []) {
        const response = await fetch(`${this.baseUrl}/zones`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name, kind, nameservers})
        });
        return await response.json();
    }

    async getZone(zoneName) {
        const response = await fetch(`${this.baseUrl}/zones/${zoneName}`);
        return await response.json();
    }

    async deleteZone(zoneName) {
        const response = await fetch(`${this.baseUrl}/zones/${zoneName}`, {
            method: 'DELETE'
        });
        return await response.json();
    }

    async listRecords(zone, type = null) {
        let url = `${this.baseUrl}/records?zone=${zone}`;
        if (type) url += `&type=${type}`;
        const response = await fetch(url);
        return await response.json();
    }

    async createRecord(zone, name, type, content, ttl = 300) {
        const response = await fetch(`${this.baseUrl}/records`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({zone, name, type, content, ttl})
        });
        return await response.json();
    }

    async updateRecord(zone, name, type, content, ttl = 300) {
        const response = await fetch(`${this.baseUrl}/records/${name}`, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({zone, type, content, ttl})
        });
        return await response.json();
    }

    async deleteRecord(zone, name, type) {
        const response = await fetch(`${this.baseUrl}/records/${name}?zone=${zone}&type=${type}`, {
            method: 'DELETE'
        });
        return await response.json();
    }

    async getDynDNSStatus() {
        const response = await fetch(`${this.baseUrl}/dyndns/status`);
        return await response.json();
    }

    async enableDynDNS(fqdn, zone, checkInterval = 300) {
        const response = await fetch(`${this.baseUrl}/dyndns/enable`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({fqdn, zone, check_interval: checkInterval})
        });
        return await response.json();
    }

    async disableDynDNS(hostId) {
        const response = await fetch(`${this.baseUrl}/dyndns/${hostId}`, {
            method: 'DELETE'
        });
        return await response.json();
    }

    async toggleDynDNS(hostId, enabled) {
        const response = await fetch(`${this.baseUrl}/dyndns/${hostId}/toggle`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({enabled})
        });
        return await response.json();
    }
}

const dnsManager = new DNSManager();
let createZoneModalInstance, createRecordModalInstance, deleteConfirmModalInstance;
let deleteCallback = null;

document.addEventListener('DOMContentLoaded', function() {
    createZoneModalInstance = new bootstrap.Modal(document.getElementById('createZoneModal'));
    createRecordModalInstance = new bootstrap.Modal(document.getElementById('createRecordModal'));
    deleteConfirmModalInstance = new bootstrap.Modal(document.getElementById('deleteConfirmModal'));

    document.getElementById('record-type').addEventListener('change', updateContentHelp);
    document.getElementById('record-dyndns').addEventListener('change', toggleDynDNSOptions);

    loadZones();
    loadDynDNSStatus();

    setInterval(loadDynDNSStatus, 30000);
});

function isAuthError(response) {
    return response.redirected || response.url.includes('/login') || response.status === 401;
}

function showAuthError() {
    const container = document.querySelector('.dns-management-page');
    if (container) {
        container.innerHTML = `
            <div class="alert alert-warning mt-4" role="alert">
                <h4 class="alert-heading"><i class="bi bi-exclamation-triangle"></i> Authentication Required</h4>
                <p>⚠️ Your session has expired. Please log in again to continue.</p>
                <hr>
                <a href="/login" class="btn btn-primary">
                    <i class="bi bi-box-arrow-in-right"></i> Login Now
                </a>
            </div>
        `;
    }
}

async function loadZones() {
    try {
        const tbody = document.getElementById('zones-list');
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-5">
                    <div class="spinner-border text-primary" role="status"></div>
                    <p class="mt-2 text-muted">Loading DNS zones...</p>
                </td>
            </tr>
        `;

        const result = await dnsManager.listZones();
        
        if (result.success) {
            dnsManager.zones = result.zones || [];
            renderZones();
            updateStats();
        } else {
            throw new Error(result.error || 'Failed to load zones');
        }
    } catch (error) {
        console.error('Error loading zones:', error);
        showToast('Error', error.message, 'danger');
        document.getElementById('zones-list').innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-5 text-danger">
                    <i class="bi bi-exclamation-triangle"></i> Failed to load DNS zones
                </td>
            </tr>
        `;
    }
}

function renderZones() {
    const tbody = document.getElementById('zones-list');
    
    if (dnsManager.zones.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="text-center py-5 text-muted">
                    <i class="bi bi-inbox"></i><br>
                    No DNS zones found. Create your first zone to get started!
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = dnsManager.zones.map(zone => `
        <tr onclick="viewZone('${zone.name}')" style="cursor: pointer;">
            <td><strong>${zone.name}</strong></td>
            <td><span class="badge bg-info">${zone.kind || 'Native'}</span></td>
            <td>${zone.record_count || 0}</td>
            <td onclick="event.stopPropagation()">
                <div class="btn-group btn-group-sm">
                    <button class="btn btn-outline-primary" onclick="viewZone('${zone.name}')" title="View records">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-outline-danger" onclick="confirmDeleteZone('${zone.name}')" title="Delete zone">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

async function viewZone(zoneName) {
    dnsManager.currentZone = zoneName;
    document.getElementById('current-zone-display').textContent = `Zone: ${zoneName}`;
    document.getElementById('add-record-btn').disabled = false;
    document.getElementById('record-zone').value = zoneName;
    
    await loadRecords(zoneName);
}

async function loadRecords(zone) {
    try {
        const tbody = document.getElementById('records-list');
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-5">
                    <div class="spinner-border text-primary" role="status"></div>
                    <p class="mt-2 text-muted">Loading DNS records...</p>
                </td>
            </tr>
        `;

        const result = await dnsManager.listRecords(zone);
        
        if (result.success) {
            dnsManager.records = result.records || [];
            renderRecords();
        } else {
            throw new Error(result.error || 'Failed to load records');
        }
    } catch (error) {
        console.error('Error loading records:', error);
        showToast('Error', error.message, 'danger');
        document.getElementById('records-list').innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-5 text-danger">
                    <i class="bi bi-exclamation-triangle"></i> Failed to load DNS records
                </td>
            </tr>
        `;
    }
}

function renderRecords() {
    const tbody = document.getElementById('records-list');
    
    if (dnsManager.records.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-5 text-muted">
                    <i class="bi bi-inbox"></i><br>
                    No DNS records found for this zone
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = dnsManager.records.map(record => {
        const isDynDNS = dnsManager.dyndnsHosts.some(h => h.fqdn === record.name && h.enabled);
        
        return `
            <tr>
                <td><strong>${record.name}</strong></td>
                <td><span class="record-type ${record.type}">${record.type}</span></td>
                <td><code>${record.content}</code></td>
                <td>${record.ttl || 300}s</td>
                <td>
                    <div class="btn-group btn-group-sm">
                        ${!isDynDNS ? `
                            <button class="btn btn-outline-info btn-sm" onclick="enableRecordDynDNS('${record.name}')" title="Enable DynDNS">
                                <i class="bi bi-arrow-repeat"></i>
                            </button>
                        ` : `
                            <span class="badge bg-success">DynDNS</span>
                        `}
                        <button class="btn btn-outline-danger btn-sm" onclick="confirmDeleteRecord('${record.name}', '${record.type}')" title="Delete record">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

async function loadDynDNSStatus() {
    try {
        const result = await dnsManager.getDynDNSStatus();
        
        if (result.success) {
            dnsManager.dyndnsHosts = result.hosts || [];
            renderDynDNSHosts();
            updateStats();
        } else {
            throw new Error(result.error || 'Failed to load DynDNS status');
        }
    } catch (error) {
        console.error('Error loading DynDNS status:', error);
        const container = document.getElementById('dyndns-hosts-container');
        container.innerHTML = `
            <div class="text-center py-5 text-danger">
                <i class="bi bi-exclamation-triangle"></i> Failed to load DynDNS hosts
            </div>
        `;
    }
}

function renderDynDNSHosts() {
    const container = document.getElementById('dyndns-hosts-container');
    
    if (dnsManager.dyndnsHosts.length === 0) {
        container.innerHTML = `
            <div class="text-center py-5 text-muted">
                <i class="bi bi-info-circle"></i><br>
                No Dynamic DNS hosts configured<br>
                <small>Enable DynDNS for A records to automatically update IP addresses</small>
            </div>
        `;
        return;
    }

    container.innerHTML = dnsManager.dyndnsHosts.map(host => {
        const statusClass = host.enabled ? (host.failure_count > 3 ? 'error' : 'healthy') : 'disabled';
        const statusText = host.enabled ? (host.failure_count > 3 ? 'Error' : 'Active') : 'Disabled';
        
        return `
            <div class="dyndns-host-card">
                <div class="host-info">
                    <h4>${host.fqdn}</h4>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
                <div class="host-details">
                    <span><i class="bi bi-geo-alt"></i> Current IP: ${host.last_ip || 'Unknown'}</span>
                    <span><i class="bi bi-clock"></i> Last Check: ${formatRelativeTime(host.last_checked_at)}</span>
                    <span><i class="bi bi-arrow-repeat"></i> Interval: ${host.check_interval || 300}s</span>
                    ${host.failure_count > 0 ? `<span class="text-warning"><i class="bi bi-exclamation-triangle"></i> Failures: ${host.failure_count}</span>` : ''}
                </div>
                <div class="host-actions">
                    <button class="btn btn-sm ${host.enabled ? 'btn-warning' : 'btn-success'}" 
                            onclick="toggleDynDNSHost(${host.id}, ${!host.enabled})">
                        <i class="bi bi-${host.enabled ? 'pause' : 'play'}-circle"></i> 
                        ${host.enabled ? 'Disable' : 'Enable'}
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="confirmDisableDynDNS(${host.id})">
                        <i class="bi bi-trash"></i> Remove
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function updateStats() {
    document.getElementById('total-zones').textContent = dnsManager.zones.length;
    
    const totalRecords = dnsManager.zones.reduce((sum, zone) => sum + (zone.record_count || 0), 0);
    document.getElementById('total-records').textContent = totalRecords;
    
    document.getElementById('dyndns-hosts').textContent = dnsManager.dyndnsHosts.length;
}

function showCreateZoneModal() {
    document.getElementById('createZoneForm').reset();
    createZoneModalInstance.show();
}

async function createZone() {
    const zoneName = document.getElementById('zone-name').value.trim();
    const kind = document.getElementById('zone-kind').value;
    const nameserversText = document.getElementById('zone-nameservers').value.trim();
    
    if (!zoneName) {
        showToast('Validation Error', 'Zone name is required', 'warning');
        return;
    }

    const domainRegex = /^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/i;
    if (!domainRegex.test(zoneName)) {
        showToast('Validation Error', 'Invalid domain format', 'warning');
        return;
    }

    const nameservers = nameserversText ? nameserversText.split('\n').filter(ns => ns.trim()) : [];
    
    const btn = document.getElementById('createZoneBtn');
    const btnText = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.spinner-border');
    
    btn.disabled = true;
    btnText.classList.add('d-none');
    spinner.classList.remove('d-none');

    try {
        const result = await dnsManager.createZone(zoneName, kind, nameservers);
        
        if (result.success) {
            showToast('Success', `Zone ${zoneName} created successfully!`, 'success');
            createZoneModalInstance.hide();
            loadZones();
        } else {
            throw new Error(result.error || 'Failed to create zone');
        }
    } catch (error) {
        console.error('Error creating zone:', error);
        showToast('Error', error.message, 'danger');
    } finally {
        btn.disabled = false;
        btnText.classList.remove('d-none');
        spinner.classList.add('d-none');
    }
}

function showCreateRecordModal() {
    if (!dnsManager.currentZone) {
        showToast('Error', 'Please select a zone first', 'warning');
        return;
    }

    document.getElementById('createRecordForm').reset();
    document.getElementById('record-zone').value = dnsManager.currentZone;
    document.getElementById('record-id').value = '';
    document.getElementById('recordModalTitle').innerHTML = '<i class="bi bi-plus-circle"></i> Add DNS Record';
    document.getElementById('record-ttl').value = 300;
    document.getElementById('dyndns-options').classList.add('d-none');
    
    createRecordModalInstance.show();
}

async function createRecord() {
    const zone = document.getElementById('record-zone').value;
    const name = document.getElementById('record-name').value.trim();
    const type = document.getElementById('record-type').value;
    const content = document.getElementById('record-content').value.trim();
    const ttl = parseInt(document.getElementById('record-ttl').value);
    const enableDynDNS = document.getElementById('record-dyndns').checked;
    const dyndnsInterval = parseInt(document.getElementById('dyndns-interval').value);
    
    if (!zone || !name || !type || !content) {
        showToast('Validation Error', 'All fields are required', 'warning');
        return;
    }

    if (ttl < 60 || ttl > 86400) {
        showToast('Validation Error', 'TTL must be between 60 and 86400 seconds', 'warning');
        return;
    }

    if (type === 'A') {
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (!ipRegex.test(content)) {
            showToast('Validation Error', 'Invalid IPv4 address format', 'warning');
            return;
        }
    }
    
    const btn = document.getElementById('createRecordBtn');
    const btnText = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.spinner-border');
    
    btn.disabled = true;
    btnText.classList.add('d-none');
    spinner.classList.remove('d-none');

    try {
        const result = await dnsManager.createRecord(zone, name, type, content, ttl);
        
        if (result.success) {
            showToast('Success', `DNS record created successfully!`, 'success');
            
            if (enableDynDNS && type === 'A') {
                const fqdn = name === '@' ? zone : `${name}.${zone}`;
                await dnsManager.enableDynDNS(fqdn, zone, dyndnsInterval);
                showToast('Info', `DynDNS enabled for ${fqdn}`, 'info');
            }
            
            createRecordModalInstance.hide();
            loadRecords(zone);
            loadDynDNSStatus();
        } else {
            throw new Error(result.error || 'Failed to create record');
        }
    } catch (error) {
        console.error('Error creating record:', error);
        showToast('Error', error.message, 'danger');
    } finally {
        btn.disabled = false;
        btnText.classList.remove('d-none');
        spinner.classList.add('d-none');
    }
}

function confirmDeleteZone(zoneName) {
    event.stopPropagation();
    document.getElementById('delete-message').textContent = 
        `Are you sure you want to delete the zone "${zoneName}"? This will delete all records in this zone.`;
    deleteCallback = () => deleteZone(zoneName);
    deleteConfirmModalInstance.show();
}

async function deleteZone(zoneName) {
    try {
        const result = await dnsManager.deleteZone(zoneName);
        
        if (result.success) {
            showToast('Success', `Zone ${zoneName} deleted successfully!`, 'success');
            deleteConfirmModalInstance.hide();
            
            if (dnsManager.currentZone === zoneName) {
                dnsManager.currentZone = null;
                document.getElementById('current-zone-display').textContent = 'Select a zone to view records';
                document.getElementById('add-record-btn').disabled = true;
                document.getElementById('records-list').innerHTML = `
                    <tr>
                        <td colspan="5" class="text-center py-5 text-muted">
                            <i class="bi bi-info-circle"></i> Select a zone from the left to view records
                        </td>
                    </tr>
                `;
            }
            
            loadZones();
        } else {
            throw new Error(result.error || 'Failed to delete zone');
        }
    } catch (error) {
        console.error('Error deleting zone:', error);
        showToast('Error', error.message, 'danger');
    }
}

function confirmDeleteRecord(name, type) {
    event.stopPropagation();
    document.getElementById('delete-message').textContent = 
        `Are you sure you want to delete the ${type} record "${name}"?`;
    deleteCallback = () => deleteRecord(name, type);
    deleteConfirmModalInstance.show();
}

async function deleteRecord(name, type) {
    if (!dnsManager.currentZone) return;
    
    try {
        const result = await dnsManager.deleteRecord(dnsManager.currentZone, name, type);
        
        if (result.success) {
            showToast('Success', `DNS record deleted successfully!`, 'success');
            deleteConfirmModalInstance.hide();
            loadRecords(dnsManager.currentZone);
        } else {
            throw new Error(result.error || 'Failed to delete record');
        }
    } catch (error) {
        console.error('Error deleting record:', error);
        showToast('Error', error.message, 'danger');
    }
}

async function enableRecordDynDNS(recordName) {
    if (!dnsManager.currentZone) return;
    
    const fqdn = recordName === '@' ? dnsManager.currentZone : `${recordName}.${dnsManager.currentZone}`;
    
    try {
        const result = await dnsManager.enableDynDNS(fqdn, dnsManager.currentZone, 300);
        
        if (result.success) {
            showToast('Success', `DynDNS enabled for ${fqdn}`, 'success');
            loadDynDNSStatus();
            loadRecords(dnsManager.currentZone);
        } else {
            throw new Error(result.error || 'Failed to enable DynDNS');
        }
    } catch (error) {
        console.error('Error enabling DynDNS:', error);
        showToast('Error', error.message, 'danger');
    }
}

async function toggleDynDNSHost(hostId, enabled) {
    try {
        const result = await dnsManager.toggleDynDNS(hostId, enabled);
        
        if (result.success) {
            showToast('Success', `DynDNS ${enabled ? 'enabled' : 'disabled'}`, 'success');
            loadDynDNSStatus();
        } else {
            throw new Error(result.error || 'Failed to toggle DynDNS');
        }
    } catch (error) {
        console.error('Error toggling DynDNS:', error);
        showToast('Error', error.message, 'danger');
    }
}

function confirmDisableDynDNS(hostId) {
    const host = dnsManager.dyndnsHosts.find(h => h.id === hostId);
    if (!host) return;
    
    document.getElementById('delete-message').textContent = 
        `Are you sure you want to remove DynDNS for "${host.fqdn}"?`;
    deleteCallback = () => disableDynDNS(hostId);
    deleteConfirmModalInstance.show();
}

async function disableDynDNS(hostId) {
    try {
        const result = await dnsManager.disableDynDNS(hostId);
        
        if (result.success) {
            showToast('Success', 'DynDNS removed successfully!', 'success');
            deleteConfirmModalInstance.hide();
            loadDynDNSStatus();
            if (dnsManager.currentZone) {
                loadRecords(dnsManager.currentZone);
            }
        } else {
            throw new Error(result.error || 'Failed to disable DynDNS');
        }
    } catch (error) {
        console.error('Error disabling DynDNS:', error);
        showToast('Error', error.message, 'danger');
    }
}

function confirmDelete() {
    if (deleteCallback) {
        deleteCallback();
    }
}

function refreshZones() {
    loadZones();
    showToast('Info', 'Refreshing DNS zones...', 'info');
}

function refreshDynDNS() {
    loadDynDNSStatus();
    showToast('Info', 'Refreshing DynDNS status...', 'info');
}

function updateContentHelp() {
    const type = document.getElementById('record-type').value;
    const helpText = document.getElementById('content-help');
    
    const helpMessages = {
        'A': 'IPv4 address (e.g., 192.168.1.1)',
        'AAAA': 'IPv6 address (e.g., 2001:0db8:85a3::8a2e:0370:7334)',
        'CNAME': 'Target domain name (e.g., example.com)',
        'MX': 'Mail server (e.g., 10 mail.example.com)',
        'TXT': 'Text content (e.g., verification codes, SPF records)',
        'NS': 'Nameserver (e.g., ns1.example.com)',
        'SRV': 'Service record (e.g., 10 5 5060 sipserver.example.com)'
    };
    
    helpText.textContent = helpMessages[type] || 'Record content';
}

function toggleDynDNSOptions() {
    const enabled = document.getElementById('record-dyndns').checked;
    const type = document.getElementById('record-type').value;
    const options = document.getElementById('dyndns-options');
    
    if (enabled && type === 'A') {
        options.classList.remove('d-none');
    } else {
        options.classList.add('d-none');
        document.getElementById('record-dyndns').checked = false;
    }
}

function showToast(title, message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastIcon = document.getElementById('toast-icon');
    const toastTitle = document.getElementById('toast-title');
    const toastBody = document.getElementById('toast-body');

    const iconMap = {
        success: 'bi-check-circle-fill text-success',
        danger: 'bi-exclamation-circle-fill text-danger',
        warning: 'bi-exclamation-triangle-fill text-warning',
        info: 'bi-info-circle-fill text-info'
    };

    toastIcon.className = `bi me-2 ${iconMap[type] || iconMap.info}`;
    toastTitle.textContent = title;
    toastBody.textContent = message;

    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
}

function formatRelativeTime(dateString) {
    if (!dateString) return 'Never';
    
    const date = new Date(dateString);
    const seconds = Math.floor((new Date() - date) / 1000);
    
    const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60
    };

    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
        }
    }

    return 'Just now';
}

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString();
}
