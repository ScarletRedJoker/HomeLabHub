// Domain Status Monitoring Page JavaScript

const DOMAINS = [
    { name: 'bot.rig-city.com', service: 'Discord Bot' },
    { name: 'stream.rig-city.com', service: 'Stream Bot' },
    { name: 'plex.evindrake.net', service: 'Plex Media Server' },
    { name: 'n8n.evindrake.net', service: 'n8n Automation' },
    { name: 'scarletredjoker.com', service: 'Personal Website' },
    { name: 'vnc.evindrake.net', service: 'VNC Desktop' }
];

async function checkDomain(domain) {
    try {
        const startTime = Date.now();
        const response = await fetch(`https://${domain.name}`, {
            method: 'HEAD',
            mode: 'no-cors'
        });
        const responseTime = Date.now() - startTime;
        
        return {
            ...domain,
            status: 'online',
            responseTime: responseTime
        };
    } catch (error) {
        return {
            ...domain,
            status: 'unknown',
            responseTime: 0
        };
    }
}

async function refreshDomains() {
    const domainsList = document.getElementById('domains-list');
    domainsList.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin fa-2x"></i><p class="mt-2">Checking domains...</p></div>';
    
    try {
        const results = await Promise.all(DOMAINS.map(checkDomain));
        
        let html = '<div class="table-responsive"><table class="table table-hover">';
        html += '<thead><tr><th>Domain</th><th>Service</th><th>Status</th><th>Response Time</th></tr></thead><tbody>';
        
        let onlineCount = 0;
        let totalResponseTime = 0;
        
        results.forEach(domain => {
            const statusBadge = domain.status === 'online' 
                ? '<span class="badge badge-success">Online</span>' 
                : '<span class="badge badge-secondary">Unknown</span>';
            
            if (domain.status === 'online') {
                onlineCount++;
                totalResponseTime += domain.responseTime;
            }
            
            html += `
                <tr>
                    <td><strong>${domain.name}</strong></td>
                    <td>${domain.service}</td>
                    <td>${statusBadge}</td>
                    <td>${domain.responseTime > 0 ? domain.responseTime + ' ms' : '-'}</td>
                </tr>
            `;
        });
        
        html += '</tbody></table></div>';
        domainsList.innerHTML = html;
        
        document.getElementById('total-domains').textContent = results.length;
        document.getElementById('online-domains').textContent = onlineCount;
        document.getElementById('offline-domains').textContent = results.length - onlineCount;
        document.getElementById('avg-response-time').textContent = 
            onlineCount > 0 ? Math.round(totalResponseTime / onlineCount) + ' ms' : '0 ms';
        
    } catch (error) {
        console.error('Failed to check domains:', error);
        domainsList.innerHTML = '<div class="alert alert-danger">Failed to check domain status</div>';
    }
}

document.addEventListener('DOMContentLoaded', function() {
    refreshDomains();
    setInterval(refreshDomains, 60000);
});
