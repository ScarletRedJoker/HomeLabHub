// Network Management Page JavaScript

// Store bandwidth history for the chart
let bandwidthHistory = {
    timestamps: [],
    upload: [],
    download: [],
    maxDataPoints: 60 // Last hour at 1-minute intervals (or 60 points at 5-second intervals for 5 minutes)
};

let bandwidthChart = null;
let refreshInterval = null;

// Helper function to format bytes
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Helper function to get IP address from interface
function getIPAddress(addresses) {
    const ipv4 = addresses.find(addr => addr.family.includes('AF_INET') && !addr.family.includes('AF_INET6'));
    return ipv4 ? ipv4.address : 'N/A';
}

// Helper function to get MAC address from interface
function getMACAddress(addresses) {
    const mac = addresses.find(addr => addr.family.includes('AF_PACKET') || addr.family.includes('AF_LINK'));
    return mac ? mac.address : 'N/A';
}

// Load network statistics
async function loadNetworkStats() {
    try {
        const response = await fetch('/api/network/stats', {
            credentials: 'include'
        });
        const result = await response.json();
        
        if (result.success && result.data) {
            const stats = result.data;
            
            // Update statistics table
            const statsTable = document.getElementById('network-stats');
            statsTable.innerHTML = `
                <tr>
                    <td><strong>Total Sent</strong></td>
                    <td>${formatBytes(stats.bytes_sent)}</td>
                </tr>
                <tr>
                    <td><strong>Total Received</strong></td>
                    <td>${formatBytes(stats.bytes_recv)}</td>
                </tr>
                <tr>
                    <td><strong>Packets Sent</strong></td>
                    <td>${stats.packets_sent.toLocaleString()}</td>
                </tr>
                <tr>
                    <td><strong>Packets Received</strong></td>
                    <td>${stats.packets_recv.toLocaleString()}</td>
                </tr>
                <tr>
                    <td><strong>Errors In</strong></td>
                    <td class="${stats.errors_in > 0 ? 'text-danger' : ''}">${stats.errors_in}</td>
                </tr>
                <tr>
                    <td><strong>Errors Out</strong></td>
                    <td class="${stats.errors_out > 0 ? 'text-danger' : ''}">${stats.errors_out}</td>
                </tr>
                <tr>
                    <td><strong>Drops In</strong></td>
                    <td class="${stats.drops_in > 0 ? 'text-warning' : ''}">${stats.drops_in}</td>
                </tr>
                <tr>
                    <td><strong>Drops Out</strong></td>
                    <td class="${stats.drops_out > 0 ? 'text-warning' : ''}">${stats.drops_out}</td>
                </tr>
            `;
        }
    } catch (error) {
        console.error('Failed to load network stats:', error);
        const statsTable = document.getElementById('network-stats');
        if (statsTable) {
            statsTable.innerHTML = `
                <tr>
                    <td colspan="2" class="text-center text-danger">
                        <i class="fas fa-exclamation-triangle"></i> Failed to load stats
                    </td>
                </tr>
            `;
        }
    }
}

// Load bandwidth usage
async function loadBandwidth() {
    try {
        const response = await fetch('/api/network/bandwidth', {
            credentials: 'include'
        });
        const result = await response.json();
        
        if (result.success && result.data) {
            const data = result.data;
            
            // Update current bandwidth display
            document.getElementById('upload-speed').textContent = data.upload_mbps.toFixed(2) + ' Mbps';
            document.getElementById('download-speed').textContent = data.download_mbps.toFixed(2) + ' Mbps';
            
            // Add to history
            const now = new Date();
            bandwidthHistory.timestamps.push(now.toLocaleTimeString());
            bandwidthHistory.upload.push(data.upload_mbps);
            bandwidthHistory.download.push(data.download_mbps);
            
            // Keep only last N data points
            if (bandwidthHistory.timestamps.length > bandwidthHistory.maxDataPoints) {
                bandwidthHistory.timestamps.shift();
                bandwidthHistory.upload.shift();
                bandwidthHistory.download.shift();
            }
            
            // Update chart
            updateBandwidthChart();
        }
    } catch (error) {
        console.error('Failed to load bandwidth:', error);
        document.getElementById('upload-speed').textContent = 'N/A';
        document.getElementById('download-speed').textContent = 'N/A';
    }
}

// Initialize and update bandwidth chart
function updateBandwidthChart() {
    const ctx = document.getElementById('bandwidthChart');
    if (!ctx) return;
    
    if (!bandwidthChart) {
        bandwidthChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: bandwidthHistory.timestamps,
                datasets: [
                    {
                        label: 'Upload',
                        data: bandwidthHistory.upload,
                        borderColor: 'rgba(75, 192, 192, 1)',
                        backgroundColor: 'rgba(75, 192, 192, 0.2)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Download',
                        data: bandwidthHistory.download,
                        borderColor: 'rgba(54, 162, 235, 1)',
                        backgroundColor: 'rgba(54, 162, 235, 0.2)',
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Mbps'
                        }
                    },
                    x: {
                        title: {
                            display: true,
                            text: 'Time'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    title: {
                        display: true,
                        text: 'Bandwidth Usage History'
                    }
                }
            }
        });
    } else {
        bandwidthChart.data.labels = bandwidthHistory.timestamps;
        bandwidthChart.data.datasets[0].data = bandwidthHistory.upload;
        bandwidthChart.data.datasets[1].data = bandwidthHistory.download;
        bandwidthChart.update('none'); // Update without animation for smooth real-time updates
    }
}

// Load network interfaces
async function loadNetworkInterfaces() {
    const container = document.getElementById('network-interfaces');
    
    try {
        const response = await fetch('/api/network/interfaces', {
            credentials: 'include'
        });
        const result = await response.json();
        
        if (result.success && result.data) {
            const interfaces = result.data;
            
            if (interfaces.length === 0) {
                container.innerHTML = `
                    <p class="text-center text-muted">
                        <i class="fas fa-info-circle"></i> No network interfaces found
                    </p>
                `;
                return;
            }
            
            let html = '';
            interfaces.forEach(iface => {
                const isUp = iface.stats?.is_up;
                const statusClass = isUp ? 'success' : 'secondary';
                const statusIcon = isUp ? 'check-circle' : 'times-circle';
                const ipAddress = getIPAddress(iface.addresses);
                const macAddress = getMACAddress(iface.addresses);
                
                html += `
                    <div class="card mb-2" style="background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);">
                        <div class="card-body p-2">
                            <div class="d-flex justify-content-between align-items-center">
                                <div>
                                    <strong><i class="fas fa-network-wired"></i> ${iface.name}</strong>
                                    <span class="badge bg-${statusClass} ms-2">
                                        <i class="fas fa-${statusIcon}"></i> ${isUp ? 'UP' : 'DOWN'}
                                    </span>
                                </div>
                                <small class="text-muted">MTU: ${iface.stats?.mtu || 'N/A'}</small>
                            </div>
                            <div class="row mt-2">
                                <div class="col-md-6">
                                    <small><strong>IP:</strong> ${ipAddress}</small><br>
                                    <small><strong>MAC:</strong> ${macAddress}</small>
                                </div>
                                <div class="col-md-6">
                                    ${iface.io ? `
                                        <small><strong>TX:</strong> ${formatBytes(iface.io.bytes_sent)}</small><br>
                                        <small><strong>RX:</strong> ${formatBytes(iface.io.bytes_recv)}</small>
                                    ` : '<small class="text-muted">No I/O stats</small>'}
                                </div>
                            </div>
                            ${iface.io && (iface.io.errors_in > 0 || iface.io.errors_out > 0) ? `
                                <div class="mt-2">
                                    <small class="text-danger">
                                        <i class="fas fa-exclamation-triangle"></i> 
                                        Errors: ${iface.io.errors_in + iface.io.errors_out}
                                    </small>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                `;
            });
            
            container.innerHTML = html;
        }
    } catch (error) {
        console.error('Failed to load network interfaces:', error);
        container.innerHTML = `
            <p class="text-center text-danger">
                <i class="fas fa-exclamation-triangle"></i> Failed to load interfaces
            </p>
        `;
    }
}

// Load listening ports
async function loadListeningPorts() {
    const container = document.getElementById('listening-ports');
    
    try {
        const response = await fetch('/api/network/ports', {
            credentials: 'include'
        });
        const result = await response.json();
        
        if (result.success && result.data) {
            const ports = result.data;
            
            if (ports.length === 0) {
                container.innerHTML = `
                    <tr>
                        <td colspan="4" class="text-center text-muted">
                            <i class="fas fa-info-circle"></i> No listening ports found
                        </td>
                    </tr>
                `;
                return;
            }
            
            // Common ports to highlight
            const commonPorts = [80, 443, 22, 3000, 5000, 8080, 8443, 3306, 5432, 27017, 6379];
            
            let html = '';
            ports.forEach(port => {
                const isCommon = commonPorts.includes(port.port);
                const rowClass = isCommon ? 'table-warning' : '';
                
                html += `
                    <tr class="${rowClass}">
                        <td>
                            <strong>${port.port}</strong>
                            ${isCommon ? '<i class="fas fa-star text-warning ms-1" title="Common port"></i>' : ''}
                        </td>
                        <td><span class="badge bg-info">${port.protocol}</span></td>
                        <td><code>${port.address}</code></td>
                        <td>
                            ${port.process ? `<span class="badge bg-secondary">${port.process}</span>` : '<span class="text-muted">N/A</span>'}
                        </td>
                    </tr>
                `;
            });
            
            container.innerHTML = html;
        }
    } catch (error) {
        console.error('Failed to load listening ports:', error);
        container.innerHTML = `
            <tr>
                <td colspan="4" class="text-center text-danger">
                    <i class="fas fa-exclamation-triangle"></i> Failed to load ports
                </td>
            </tr>
        `;
    }
}

// Load active connections
async function loadActiveConnections() {
    try {
        const response = await fetch('/api/network/connections', {
            credentials: 'include'
        });
        const result = await response.json();
        
        if (result.success && result.data) {
            const data = result.data;
            
            // Update connection summary
            document.getElementById('total-connections').textContent = data.total || 0;
            document.getElementById('tcp-connections').textContent = data.by_protocol?.TCP || 0;
            document.getElementById('udp-connections').textContent = data.by_protocol?.UDP || 0;
            document.getElementById('established-connections').textContent = data.by_status?.ESTABLISHED || 0;
            
            // Update connections table
            const container = document.getElementById('active-connections');
            
            if (data.error) {
                container.innerHTML = `
                    <tr>
                        <td colspan="5" class="text-center text-warning">
                            <i class="fas fa-exclamation-triangle"></i> ${data.error}
                        </td>
                    </tr>
                `;
                return;
            }
            
            if (!data.connections || data.connections.length === 0) {
                container.innerHTML = `
                    <tr>
                        <td colspan="5" class="text-center text-muted">
                            <i class="fas fa-info-circle"></i> No active connections
                        </td>
                    </tr>
                `;
                return;
            }
            
            let html = '';
            data.connections.forEach(conn => {
                // Determine if it's a Docker connection
                const isDocker = conn.process && (
                    conn.process.includes('docker') || 
                    conn.process.includes('containerd') ||
                    conn.local_address?.includes('172.') ||
                    conn.remote_address?.includes('172.')
                );
                
                const rowClass = isDocker ? 'table-info' : '';
                
                // Status badge color
                let statusClass = 'secondary';
                if (conn.status === 'ESTABLISHED') statusClass = 'success';
                else if (conn.status === 'LISTEN') statusClass = 'primary';
                else if (conn.status === 'TIME_WAIT') statusClass = 'warning';
                else if (conn.status === 'CLOSE_WAIT') statusClass = 'danger';
                
                html += `
                    <tr class="${rowClass}">
                        <td><span class="badge bg-info">${conn.protocol}</span></td>
                        <td><code>${conn.local_address || 'N/A'}</code></td>
                        <td><code>${conn.remote_address || 'N/A'}</code></td>
                        <td><span class="badge bg-${statusClass}">${conn.status}</span></td>
                        <td>
                            ${conn.process ? `
                                <span class="badge bg-secondary">${conn.process}</span>
                                ${isDocker ? '<i class="fab fa-docker text-info ms-1" title="Docker connection"></i>' : ''}
                            ` : '<span class="text-muted">N/A</span>'}
                        </td>
                    </tr>
                `;
            });
            
            container.innerHTML = html;
        }
    } catch (error) {
        console.error('Failed to load active connections:', error);
        const container = document.getElementById('active-connections');
        if (container) {
            container.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-danger">
                        <i class="fas fa-exclamation-triangle"></i> Failed to load connections
                    </td>
                </tr>
            `;
        }
    }
}

// Load all network data
async function loadAllNetworkData() {
    await Promise.all([
        loadNetworkStats(),
        loadBandwidth(),
        loadNetworkInterfaces(),
        loadListeningPorts(),
        loadActiveConnections()
    ]);
}

// Initialize page
document.addEventListener('DOMContentLoaded', function() {
    console.log('Network monitoring page loaded');
    
    // Load initial data
    loadAllNetworkData();
    
    // Set up auto-refresh every 5 seconds
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    refreshInterval = setInterval(loadAllNetworkData, 5000);
});

// Clean up on page unload
window.addEventListener('beforeunload', function() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    if (bandwidthChart) {
        bandwidthChart.destroy();
    }
});
