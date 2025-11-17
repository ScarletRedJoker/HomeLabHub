let currentZone = '';
let allRecords = [];
let filteredRecords = [];
let recordToDelete = null;

const addRecordModal = new bootstrap.Modal(document.getElementById('addRecordModal'));
const deleteRecordModal = new bootstrap.Modal(document.getElementById('deleteRecordModal'));
const toast = new bootstrap.Toast(document.getElementById('toast'));

document.addEventListener('DOMContentLoaded', function() {
    loadZones();
    setupEventListeners();
});

function setupEventListeners() {
    const zoneSelector = document.getElementById('zone-selector');
    if (zoneSelector) {
        zoneSelector.addEventListener('change', function(e) {
            const zone = e.target.value;
            if (zone) {
                currentZone = zone;
                loadRecords(zone);
                document.getElementById('add-record-btn').disabled = false;
                document.getElementById('refresh-btn').disabled = false;
            } else {
                currentZone = '';
                resetRecordsView();
                document.getElementById('add-record-btn').disabled = true;
                document.getElementById('refresh-btn').disabled = true;
            }
        });
    }

    const typeFilter = document.getElementById('type-filter');
    if (typeFilter) {
        typeFilter.addEventListener('change', filterRecords);
    }

    const deleteConfirmation = document.getElementById('delete-confirmation');
    if (deleteConfirmation) {
        deleteConfirmation.addEventListener('input', function(e) {
            const confirmBtn = document.getElementById('confirmDeleteBtn');
            confirmBtn.disabled = e.target.value !== 'DELETE';
        });
    }

    const recordType = document.getElementById('record-type');
    if (recordType) {
        recordType.addEventListener('change', updateRecordTypeHints);
    }
}

async function loadZones() {
    try {
        const response = await fetch('/api/dns/zones');
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            populateZoneSelector(result.zones);
        } else {
            showToast('Error', result.error || 'Failed to load zones', 'danger');
            if (result.message) {
                console.error('Zone loading error:', result.message);
            }
        }
    } catch (error) {
        console.error('Error loading zones:', error);
        showToast('Error', 'Failed to load DNS zones. Check console for details.', 'danger');
    }
}

function populateZoneSelector(zones) {
    const selector = document.getElementById('zone-selector');
    selector.innerHTML = '<option value="">Select Domain...</option>';
    
    if (zones && zones.length > 0) {
        zones.forEach(zone => {
            const option = document.createElement('option');
            option.value = zone.name;
            option.textContent = `${zone.name} (${zone.record_count || 0} records)`;
            selector.appendChild(option);
        });
    } else {
        selector.innerHTML += '<option value="" disabled>No zones available</option>';
    }
}

async function loadRecords(zone, silent = false) {
    if (!zone) return;
    
    try {
        if (!silent) {
            document.getElementById('records-tbody').innerHTML = `
                <tr>
                    <td colspan="5" class="text-center py-5">
                        <div class="spinner-border text-primary" role="status"></div>
                        <p class="mt-2 text-muted">Loading records...</p>
                    </td>
                </tr>
            `;
        }

        const response = await fetch(`/api/dns/records/${encodeURIComponent(zone)}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        
        if (result.success) {
            allRecords = result.records || [];
            filterRecords();
            updateStats();
            if (!silent && allRecords.length === 0) {
                showToast('Info', `No records found for ${zone}`, 'info');
            }
        } else {
            throw new Error(result.error || 'Failed to load records');
        }
    } catch (error) {
        console.error('Error loading records:', error);
        showToast('Error', `Failed to load records for ${zone}`, 'danger');
        document.getElementById('records-tbody').innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-5 text-danger">
                    <i class="bi bi-exclamation-triangle"></i> Failed to load records
                </td>
            </tr>
        `;
    }
}

function filterRecords() {
    const typeFilter = document.getElementById('type-filter').value;
    
    filteredRecords = allRecords.filter(record => {
        if (typeFilter && record.type !== typeFilter) {
            return false;
        }
        return true;
    });
    
    renderRecords();
}

function renderRecords() {
    const tbody = document.getElementById('records-tbody');
    
    if (filteredRecords.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-5 text-muted">
                    <i class="bi bi-inbox fs-1"></i><br>
                    No DNS records found
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = filteredRecords.map(record => `
        <tr>
            <td>
                <span class="record-type-badge type-${record.type.toLowerCase()}">
                    ${record.type}
                </span>
            </td>
            <td><code>${escapeHtml(record.host || '@')}</code></td>
            <td class="text-break">${escapeHtml(record.value || record.content || '')}</td>
            <td>
                <span class="ttl-badge">${formatTTL(record.ttl)}</span>
            </td>
            <td>
                <button class="btn btn-sm btn-outline-primary btn-action me-1" 
                        onclick="editRecord('${record.id}')" 
                        aria-label="Edit record"
                        title="Edit">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger btn-action" 
                        onclick="confirmDeleteRecord('${record.id}')" 
                        aria-label="Delete record"
                        title="Delete">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function updateStats() {
    const total = allRecords.length;
    const aRecords = allRecords.filter(r => r.type === 'A' || r.type === 'AAAA').length;
    const cnameRecords = allRecords.filter(r => r.type === 'CNAME').length;
    const otherRecords = allRecords.filter(r => r.type !== 'A' && r.type !== 'AAAA' && r.type !== 'CNAME').length;
    
    document.getElementById('total-records').textContent = total;
    document.getElementById('a-records').textContent = aRecords;
    document.getElementById('cname-records').textContent = cnameRecords;
    document.getElementById('other-records').textContent = otherRecords;
}

function resetRecordsView() {
    allRecords = [];
    filteredRecords = [];
    updateStats();
    document.getElementById('records-tbody').innerHTML = `
        <tr>
            <td colspan="5" class="text-center py-5 text-muted">
                <i class="bi bi-inbox fs-1"></i><br>
                Select a domain to view DNS records
            </td>
        </tr>
    `;
}

function showAddRecordModal() {
    if (!currentZone) {
        showToast('Warning', 'Please select a domain first', 'warning');
        return;
    }
    
    document.getElementById('modal-title-text').textContent = 'Add DNS Record';
    document.getElementById('record-id').value = '';
    document.getElementById('recordForm').reset();
    document.getElementById('record-ttl').value = '300';
    document.querySelector('#submitRecordBtn .btn-text').textContent = 'Add Record';
    
    addRecordModal.show();
}

function editRecord(recordId) {
    const record = allRecords.find(r => r.id === recordId);
    if (!record) {
        showToast('Error', 'Record not found', 'danger');
        return;
    }
    
    document.getElementById('modal-title-text').textContent = 'Edit DNS Record';
    document.getElementById('record-id').value = record.id;
    document.getElementById('record-type').value = record.type;
    document.getElementById('record-host').value = record.host || '@';
    document.getElementById('record-value').value = record.value || record.content || '';
    document.getElementById('record-ttl').value = record.ttl || 300;
    document.querySelector('#submitRecordBtn .btn-text').textContent = 'Update Record';
    
    updateRecordTypeHints();
    addRecordModal.show();
}

async function submitRecord() {
    const recordId = document.getElementById('record-id').value;
    const type = document.getElementById('record-type').value;
    const host = document.getElementById('record-host').value.trim();
    const value = document.getElementById('record-value').value.trim();
    const ttl = parseInt(document.getElementById('record-ttl').value);
    
    if (!type || !host || !value) {
        showToast('Error', 'Please fill in all required fields', 'danger');
        return;
    }
    
    const btn = document.getElementById('submitRecordBtn');
    const btnText = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.spinner-border');
    
    btn.disabled = true;
    btnText.classList.add('d-none');
    spinner.classList.remove('d-none');
    
    try {
        const data = { type, host, value, ttl };
        const url = recordId 
            ? `/api/dns/records/${encodeURIComponent(currentZone)}/${recordId}`
            : `/api/dns/records/${encodeURIComponent(currentZone)}`;
        const method = recordId ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Success', result.message || `Record ${recordId ? 'updated' : 'created'} successfully`, 'success');
            addRecordModal.hide();
            loadRecords(currentZone);
        } else {
            throw new Error(result.error || result.message || 'Failed to save record');
        }
    } catch (error) {
        console.error('Error saving record:', error);
        showToast('Error', error.message, 'danger');
    } finally {
        btn.disabled = false;
        btnText.classList.remove('d-none');
        spinner.classList.add('d-none');
    }
}

function confirmDeleteRecord(recordId) {
    const record = allRecords.find(r => r.id === recordId);
    if (!record) {
        showToast('Error', 'Record not found', 'danger');
        return;
    }
    
    recordToDelete = record;
    document.getElementById('delete-record-type').textContent = record.type;
    document.getElementById('delete-record-host').textContent = record.host || '@';
    document.getElementById('delete-record-value').textContent = record.value || record.content || '';
    document.getElementById('delete-confirmation').value = '';
    document.getElementById('confirmDeleteBtn').disabled = true;
    
    deleteRecordModal.show();
}

async function deleteRecord() {
    if (!recordToDelete) return;
    
    const btn = document.getElementById('confirmDeleteBtn');
    btn.disabled = true;
    
    try {
        const response = await fetch(
            `/api/dns/records/${encodeURIComponent(currentZone)}/${recordToDelete.id}`,
            { method: 'DELETE' }
        );
        
        const result = await response.json();
        
        if (result.success) {
            showToast('Success', 'Record deleted successfully', 'success');
            deleteRecordModal.hide();
            loadRecords(currentZone);
            recordToDelete = null;
        } else {
            throw new Error(result.error || 'Failed to delete record');
        }
    } catch (error) {
        console.error('Error deleting record:', error);
        showToast('Error', error.message, 'danger');
    } finally {
        btn.disabled = false;
    }
}

function refreshRecords() {
    if (currentZone) {
        loadRecords(currentZone);
        showToast('Info', 'Refreshing DNS records...', 'info');
    }
}

function updateRecordTypeHints() {
    const type = document.getElementById('record-type').value;
    const hint = document.getElementById('record-type-hint');
    const hintText = document.getElementById('hint-text');
    const valueHelpText = document.getElementById('value-help-text');
    
    const hints = {
        'A': {
            help: 'Enter an IPv4 address (e.g., 74.76.32.151)',
            hint: '<strong>A Record:</strong> Maps a domain to an IPv4 address. Use for pointing your domain to a server.'
        },
        'AAAA': {
            help: 'Enter an IPv6 address (e.g., 2001:0db8:85a3::8a2e:0370:7334)',
            hint: '<strong>AAAA Record:</strong> Maps a domain to an IPv6 address.'
        },
        'CNAME': {
            help: 'Enter a domain name (e.g., example.com)',
            hint: '<strong>CNAME Record:</strong> Creates an alias to another domain. Cannot be used on root domain (@).'
        },
        'MX': {
            help: 'Enter mail server (e.g., mail.example.com)',
            hint: '<strong>MX Record:</strong> Specifies mail servers for your domain. Lower priority numbers are preferred.'
        },
        'TXT': {
            help: 'Enter text content',
            hint: '<strong>TXT Record:</strong> Stores text information. Used for SPF, DKIM, domain verification, etc.'
        },
        'NS': {
            help: 'Enter nameserver (e.g., ns1.example.com)',
            hint: '<strong>NS Record:</strong> Delegates a subdomain to different nameservers.'
        },
        'DYN': {
            help: 'Enter current IP or use @ for auto-detection',
            hint: '<strong>DYN Record:</strong> Dynamic DNS record that can be updated automatically with your changing IP address.'
        }
    };
    
    if (type && hints[type]) {
        valueHelpText.textContent = hints[type].help;
        hintText.innerHTML = hints[type].hint;
        hint.style.display = 'block';
    } else {
        hint.style.display = 'none';
        valueHelpText.textContent = 'Enter the target value for this record';
    }
}

function formatTTL(seconds) {
    if (!seconds) return 'Default';
    
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days} day${days !== 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''}`;
    if (minutes > 0) return `${minutes} min${minutes !== 1 ? 's' : ''}`;
    return `${seconds} sec`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showToast(title, message, type = 'info') {
    const toastEl = document.getElementById('toast');
    const toastIcon = document.getElementById('toast-icon');
    const toastTitle = document.getElementById('toast-title');
    const toastBody = document.getElementById('toast-body');
    
    const icons = {
        success: 'bi-check-circle-fill text-success',
        danger: 'bi-exclamation-triangle-fill text-danger',
        warning: 'bi-exclamation-circle-fill text-warning',
        info: 'bi-info-circle-fill text-info'
    };
    
    toastIcon.className = `bi me-2 ${icons[type] || icons.info}`;
    toastTitle.textContent = title;
    toastBody.textContent = message;
    
    toast.show();
}
