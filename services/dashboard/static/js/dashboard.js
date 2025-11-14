let systemChart;
const maxDataPoints = 20;
const chartData = {
    labels: [],
    cpu: [],
    memory: []
};

async function loadSystemInfo() {
    const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 10000)
    );
    
    try {
        const response = await Promise.race([
            fetch('/api/system/info'),
            timeout
        ]);
        const data = await response.json();
        
        if (data.success) {
            const info = data.data;
            
            if (document.getElementById('cpuPercent')) {
                document.getElementById('cpuPercent').textContent = `${info.cpu.percent.toFixed(1)}%`;
            }
            if (document.getElementById('memPercent')) {
                document.getElementById('memPercent').textContent = `${info.memory.percent.toFixed(1)}%`;
            }
            if (document.getElementById('diskPercent')) {
                document.getElementById('diskPercent').textContent = `${info.disk.percent.toFixed(1)}%`;
            }
            
            const now = new Date().toLocaleTimeString();
            chartData.labels.push(now);
            chartData.cpu.push(info.cpu.percent);
            chartData.memory.push(info.memory.percent);
            
            if (chartData.labels.length > maxDataPoints) {
                chartData.labels.shift();
                chartData.cpu.shift();
                chartData.memory.shift();
            }
            
            updateChart();
            
            const systemInfo = document.getElementById('systemInfo');
            if (systemInfo) {
                systemInfo.innerHTML = `
                    <p><strong>Hostname:</strong> ${info.system.hostname}</p>
                    <p><strong>Platform:</strong> ${info.system.platform} ${info.system.platform_release}</p>
                    <p><strong>CPU Cores:</strong> ${info.cpu.count} (${info.cpu.physical_count} physical)</p>
                    <p><strong>Total Memory:</strong> ${info.memory.total_gb} GB</p>
                    <p><strong>Available Memory:</strong> ${info.memory.available_gb} GB</p>
                    <p><strong>Total Disk:</strong> ${info.disk.total_gb} GB</p>
                    <p><strong>Free Disk:</strong> ${info.disk.free_gb} GB</p>
                    <p><strong>Network Sent:</strong> ${info.network.bytes_sent_mb} MB</p>
                    <p><strong>Network Received:</strong> ${info.network.bytes_recv_mb} MB</p>
                `;
            }
        } else {
            throw new Error(data.message || 'Failed to load system info');
        }
    } catch (error) {
        console.error('Error loading system info:', error);
        if (document.getElementById('cpuPercent')) {
            document.getElementById('cpuPercent').textContent = 'N/A';
        }
        if (document.getElementById('memPercent')) {
            document.getElementById('memPercent').textContent = 'N/A';
        }
        if (document.getElementById('diskPercent')) {
            document.getElementById('diskPercent').textContent = 'N/A';
        }
        const systemInfo = document.getElementById('systemInfo');
        if (systemInfo) {
            systemInfo.innerHTML = '<p style="color: var(--accent-red); text-align: center;"><i class="bi bi-exclamation-triangle"></i> Service Unavailable</p>';
        }
    }
}

async function refreshContainers() {
    const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 10000)
    );
    
    try {
        const response = await Promise.race([
            fetch('/api/containers'),
            timeout
        ]);
        const data = await response.json();
        
        if (data.success) {
            if (document.getElementById('containerCount')) {
                document.getElementById('containerCount').textContent = data.data.length;
            }
            displayContainers(data.data);
        } else {
            throw new Error(data.message || 'Failed to load containers');
        }
    } catch (error) {
        console.error('Error loading containers:', error);
        if (document.getElementById('containerCount')) {
            document.getElementById('containerCount').textContent = 'N/A';
        }
        const grid = document.getElementById('containersGrid');
        if (grid) {
            grid.innerHTML = '<p style="color: var(--accent-red); text-align: center; padding: 20px;"><i class="bi bi-exclamation-triangle"></i> Unable to load containers. Service may be unavailable.</p>';
        }
    }
}

async function displayContainers(containers) {
    const grid = document.getElementById('containersGrid');
    
    if (containers.length === 0) {
        grid.innerHTML = '<p class="text-muted">No containers found</p>';
        return;
    }
    
    let html = '<div class="row">';
    
    for (const container of containers) {
        const statusClass = container.status === 'running' ? 'status-running' : 
                          container.status === 'exited' ? 'status-exited' : 'status-created';
        
        let detailsHtml = '';
        try {
            const detailsResponse = await fetch(`/api/containers/${container.name}/status`);
            const detailsData = await detailsResponse.json();
            
            if (detailsData.success) {
                const details = detailsData.data;
                detailsHtml = `
                    <div class="stat-item">
                        <span class="stat-label">CPU:</span>
                        <span class="stat-value">${details.cpu_percent}%</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Memory:</span>
                        <span class="stat-value">${details.memory_percent.toFixed(1)}% (${details.memory_usage_mb} MB)</span>
                    </div>
                `;
            }
        } catch (e) {
            console.error('Error fetching container details:', e);
        }
        
        html += `
            <div class="col-md-6 col-lg-4 mb-3">
                <div class="container-card">
                    <h5>${container.name}</h5>
                    <div class="mb-2">
                        <span class="status-badge ${statusClass}">${container.status}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">Image:</span>
                        <span class="stat-value">${container.image}</span>
                    </div>
                    <div class="stat-item">
                        <span class="stat-label">ID:</span>
                        <span class="stat-value">${container.id}</span>
                    </div>
                    ${detailsHtml}
                    <div class="btn-group-sm mt-3">
                        <button class="btn btn-success btn-sm" onclick="controlContainer('${container.name}', 'start')">
                            <i class="bi bi-play-fill"></i> Start
                        </button>
                        <button class="btn btn-warning btn-sm" onclick="controlContainer('${container.name}', 'stop')">
                            <i class="bi bi-stop-fill"></i> Stop
                        </button>
                        <button class="btn btn-info btn-sm" onclick="controlContainer('${container.name}', 'restart')">
                            <i class="bi bi-arrow-clockwise"></i> Restart
                        </button>
                        <button class="btn btn-secondary btn-sm" onclick="viewLogs('${container.name}')">
                            <i class="bi bi-terminal"></i> Logs
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    
    html += '</div>';
    grid.innerHTML = html;
}

async function controlContainer(name, action) {
    try {
        const response = await fetch(`/api/containers/${name}/${action}`, {
            method: 'POST'
        });
        const data = await response.json();
        
        if (data.success) {
            alert(`Container ${name} ${action} successful`);
            refreshContainers();
        } else {
            alert(`Error: ${data.message}`);
        }
    } catch (error) {
        console.error(`Error ${action} container:`, error);
        alert(`Error: ${error.message}`);
    }
}

function viewLogs(containerName) {
    window.location.href = `/logs?container=${containerName}`;
}

function initChart() {
    const ctx = document.getElementById('systemChart').getContext('2d');
    systemChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartData.labels,
            datasets: [{
                label: 'CPU %',
                data: chartData.cpu,
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                tension: 0.1
            }, {
                label: 'Memory %',
                data: chartData.memory,
                borderColor: 'rgb(255, 99, 132)',
                backgroundColor: 'rgba(255, 99, 132, 0.2)',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100
                }
            }
        }
    });
}

function updateChart() {
    if (systemChart) {
        systemChart.data.labels = chartData.labels;
        systemChart.data.datasets[0].data = chartData.cpu;
        systemChart.data.datasets[1].data = chartData.memory;
        systemChart.update();
    }
}

initChart();
loadSystemInfo();
refreshContainers();

setInterval(loadSystemInfo, 5000);
setInterval(refreshContainers, 10000);

// Favicon Management Functions
let currentServiceId = null;
let currentServiceName = null;
let selectedFile = null;

function getCsrfToken() {
    const token = document.querySelector('meta[name="csrf-token"]');
    return token ? token.getAttribute('content') : '';
}

function openFaviconModal(serviceId, serviceName) {
    currentServiceId = serviceId;
    currentServiceName = serviceName;
    
    document.getElementById('modal-service-name').textContent = `Manage Favicon - ${serviceName}`;
    document.getElementById('faviconModalOverlay').classList.add('active');
    document.getElementById('success-message').style.display = 'none';
    document.getElementById('error-message').style.display = 'none';
    
    selectedFile = null;
    document.getElementById('favicon-file-input').value = '';
    document.getElementById('upload-btn').disabled = true;
    
    loadCurrentFavicon(serviceId);
}

function closeFaviconModal() {
    document.getElementById('faviconModalOverlay').classList.remove('active');
    currentServiceId = null;
    currentServiceName = null;
    selectedFile = null;
}

async function loadCurrentFavicon(serviceId) {
    try {
        const response = await fetch(`/api/services/${serviceId}/favicon`, {
            credentials: 'include'
        });
        const data = await response.json();
        
        const previewContainer = document.getElementById('favicon-preview');
        const deleteBtn = document.getElementById('delete-btn');
        
        if (data.success && data.has_favicon) {
            previewContainer.innerHTML = `<img src="${data.favicon_url}?t=${Date.now()}" alt="Current favicon">`;
            deleteBtn.style.display = 'block';
        } else {
            previewContainer.innerHTML = '<i class="bi bi-image"></i>';
            deleteBtn.style.display = 'none';
        }
    } catch (error) {
        console.error('Error loading current favicon:', error);
        showError('Failed to load current favicon');
    }
}

function handleFaviconPreview(event) {
    const file = event.target.files[0];
    
    if (!file) {
        selectedFile = null;
        document.getElementById('upload-btn').disabled = true;
        return;
    }
    
    const allowedTypes = ['image/png', 'image/x-icon', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
        showError('Invalid file type. Please use PNG, ICO, JPG, or SVG.');
        event.target.value = '';
        selectedFile = null;
        document.getElementById('upload-btn').disabled = true;
        return;
    }
    
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
        showError('File too large. Maximum size is 2MB.');
        event.target.value = '';
        selectedFile = null;
        document.getElementById('upload-btn').disabled = true;
        return;
    }
    
    selectedFile = file;
    document.getElementById('upload-btn').disabled = false;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        const previewContainer = document.getElementById('favicon-preview');
        previewContainer.innerHTML = `<img src="${e.target.result}" alt="Preview">`;
    };
    reader.readAsDataURL(file);
}

async function uploadFavicon() {
    if (!selectedFile || !currentServiceId) {
        showError('Please select a file first');
        return;
    }
    
    const uploadBtn = document.getElementById('upload-btn');
    uploadBtn.disabled = true;
    uploadBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Uploading...';
    
    try {
        const formData = new FormData();
        formData.append('favicon', selectedFile);
        
        const response = await fetch(`/api/services/${currentServiceId}/favicon`, {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess('Favicon uploaded successfully!');
            updateServiceFavicon(currentServiceId, data.favicon_url);
            document.getElementById('delete-btn').style.display = 'block';
            selectedFile = null;
            document.getElementById('favicon-file-input').value = '';
            
            setTimeout(() => {
                closeFaviconModal();
            }, 1500);
        } else {
            showError(data.message || 'Upload failed');
        }
    } catch (error) {
        console.error('Upload error:', error);
        showError('Upload failed: ' + error.message);
    } finally {
        uploadBtn.disabled = false;
        uploadBtn.innerHTML = '<i class="bi bi-check-circle"></i> Upload';
    }
}

async function deleteFavicon() {
    if (!currentServiceId) {
        showError('No service selected');
        return;
    }
    
    if (!confirm('Are you sure you want to remove this favicon?')) {
        return;
    }
    
    const deleteBtn = document.getElementById('delete-btn');
    deleteBtn.disabled = true;
    deleteBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Removing...';
    
    try {
        const response = await fetch(`/api/services/${currentServiceId}/favicon`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess('Favicon removed successfully!');
            updateServiceFavicon(currentServiceId, null);
            document.getElementById('favicon-preview').innerHTML = '<i class="bi bi-image"></i>';
            deleteBtn.style.display = 'none';
            
            setTimeout(() => {
                closeFaviconModal();
            }, 1500);
        } else {
            showError(data.message || 'Deletion failed');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showError('Deletion failed: ' + error.message);
    } finally {
        deleteBtn.disabled = false;
        deleteBtn.innerHTML = '<i class="bi bi-trash"></i> Remove';
    }
}

function updateServiceFavicon(serviceId, faviconUrl) {
    const faviconContainer = document.getElementById(`favicon-${serviceId}`);
    if (faviconContainer) {
        if (faviconUrl) {
            faviconContainer.innerHTML = `<img src="${faviconUrl}?t=${Date.now()}" alt="Service favicon" style="width: 100%; height: 100%; object-fit: contain; border-radius: 4px;">`;
        } else {
            faviconContainer.innerHTML = '<i class="bi bi-box-seam"></i>';
        }
    }
}

function showSuccess(message) {
    const successMsg = document.getElementById('success-message');
    const errorMsg = document.getElementById('error-message');
    
    errorMsg.style.display = 'none';
    successMsg.textContent = message;
    successMsg.style.display = 'block';
    
    setTimeout(() => {
        successMsg.style.display = 'none';
    }, 5000);
}

function showError(message) {
    const successMsg = document.getElementById('success-message');
    const errorMsg = document.getElementById('error-message');
    
    successMsg.style.display = 'none';
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
    
    setTimeout(() => {
        errorMsg.style.display = 'none';
    }, 5000);
}

document.getElementById('faviconModalOverlay').addEventListener('click', function(e) {
    if (e.target === this) {
        closeFaviconModal();
    }
});
