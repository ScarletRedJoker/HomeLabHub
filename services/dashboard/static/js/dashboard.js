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
