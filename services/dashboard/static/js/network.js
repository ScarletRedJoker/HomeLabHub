// Network Management Page JavaScript

async function loadNetworkStats() {
    const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Request timeout')), 10000)
    );
    
    try {
        const response = await Promise.race([
            fetch('/api/system/stats', {
                credentials: 'include'
            }),
            timeout
        ]);
        const result = await response.json();
        
        if (result.success && result.data) {
            const stats = result.data;
            document.getElementById('upload-speed').textContent = stats.network_sent_mb.toFixed(2) + ' MB';
            document.getElementById('download-speed').textContent = stats.network_recv_mb.toFixed(2) + ' MB';
            
            const statsTable = document.getElementById('network-stats');
            statsTable.innerHTML = `
                <tr>
                    <td><strong>Sent</strong></td>
                    <td>${stats.network_sent_mb.toFixed(2)} MB</td>
                </tr>
                <tr>
                    <td><strong>Received</strong></td>
                    <td>${stats.network_recv_mb.toFixed(2)} MB</td>
                </tr>
                <tr>
                    <td><strong>Hostname</strong></td>
                    <td>${stats.hostname}</td>
                </tr>
            `;
        } else {
            throw new Error('Failed to load network stats');
        }
    } catch (error) {
        console.error('Failed to load network stats:', error);
        const statsTable = document.getElementById('network-stats');
        if (statsTable) {
            statsTable.innerHTML = `
                <tr>
                    <td colspan="2" style="color: var(--accent-red); text-align: center; padding: 20px;">
                        <i class="bi bi-exclamation-triangle"></i> Service Unavailable
                    </td>
                </tr>
            `;
        }
        if (document.getElementById('upload-speed')) {
            document.getElementById('upload-speed').textContent = 'N/A';
        }
        if (document.getElementById('download-speed')) {
            document.getElementById('download-speed').textContent = 'N/A';
        }
    }
}

async function loadNetworkInterfaces() {
    const container = document.getElementById('network-interfaces');
    container.innerHTML = `
        <p style="color: var(--text-secondary); padding: 20px; text-align: center;">
            <i class="bi bi-info-circle"></i> Network interface monitoring coming soon...
        </p>
    `;
}

async function loadListeningPorts() {
    const container = document.getElementById('listening-ports');
    if (container) {
        container.innerHTML = `
            <tr>
                <td colspan="4" style="color: var(--text-secondary); text-align: center; padding: 20px;">
                    <i class="bi bi-info-circle"></i> Port monitoring coming soon...
                </td>
            </tr>
        `;
    }
}

async function loadActiveConnections() {
    const container = document.getElementById('active-connections');
    if (container) {
        container.innerHTML = `
            <tr>
                <td colspan="5" style="color: var(--text-secondary); text-align: center; padding: 20px;">
                    <i class="bi bi-info-circle"></i> Connection monitoring coming soon...
                </td>
            </tr>
        `;
    }
    
    const summary = document.getElementById('connection-summary');
    if (summary) {
        summary.querySelectorAll('h4').forEach(el => {
            el.textContent = 'N/A';
        });
    }
}

document.addEventListener('DOMContentLoaded', function() {
    loadNetworkStats();
    loadNetworkInterfaces();
    loadListeningPorts();
    loadActiveConnections();
    setInterval(loadNetworkStats, 10000);
});
