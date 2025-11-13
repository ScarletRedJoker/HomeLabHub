// Network Management Page JavaScript

async function loadNetworkStats() {
    try {
        const response = await fetch('/api/system/stats', {
            credentials: 'include'
        });
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
        }
    } catch (error) {
        console.error('Failed to load network stats:', error);
    }
}

async function loadNetworkInterfaces() {
    const container = document.getElementById('network-interfaces');
    container.innerHTML = `
        <p style="color: var(--text-secondary); padding: 20px; text-align: center;">
            Network interface monitoring coming soon...
        </p>
    `;
}

document.addEventListener('DOMContentLoaded', function() {
    loadNetworkStats();
    loadNetworkInterfaces();
    setInterval(loadNetworkStats, 10000);
});
