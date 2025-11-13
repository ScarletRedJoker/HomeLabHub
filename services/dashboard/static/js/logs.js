let currentLogs = '';

async function loadContainers() {
    try {
        const response = await fetch('/api/containers');
        const data = await response.json();
        
        const select = document.getElementById('containerSelect');
        select.innerHTML = '<option value="">Select a container...</option>';
        
        if (data.success) {
            data.data.forEach(container => {
                const option = document.createElement('option');
                option.value = container.name;
                option.textContent = `${container.name} (${container.status})`;
                select.appendChild(option);
            });
        }
        
        const params = new URLSearchParams(window.location.search);
        const containerParam = params.get('container');
        if (containerParam) {
            select.value = containerParam;
            loadLogs();
        }
    } catch (error) {
        console.error('Error loading containers:', error);
    }
}

async function loadLogs() {
    const container = document.getElementById('containerSelect').value;
    const lines = document.getElementById('logLines').value;
    
    if (!container) {
        alert('Please select a container');
        return;
    }
    
    try {
        const response = await fetch(`/api/containers/${container}/logs?lines=${lines}`);
        const data = await response.json();
        
        if (data.success) {
            currentLogs = data.data;
            displayLogs(currentLogs);
        } else {
            document.getElementById('logsContent').textContent = `Error: ${data.message}`;
        }
    } catch (error) {
        console.error('Error loading logs:', error);
        document.getElementById('logsContent').textContent = `Error: ${error.message}`;
    }
}

function displayLogs(logs) {
    const logsContent = document.getElementById('logsContent');
    const searchTerm = document.getElementById('logSearch').value.toLowerCase();
    
    if (searchTerm) {
        const lines = logs.split('\n');
        const filtered = lines.filter(line => line.toLowerCase().includes(searchTerm));
        logsContent.textContent = filtered.join('\n');
    } else {
        logsContent.textContent = logs;
    }
    
    logsContent.scrollTop = logsContent.scrollHeight;
}

document.getElementById('logSearch').addEventListener('input', () => {
    displayLogs(currentLogs);
});

async function analyzeWithAI() {
    if (!currentLogs) {
        alert('Please load logs first');
        return;
    }
    
    const container = document.getElementById('containerSelect').value;
    
    const modal = new bootstrap.Modal(document.getElementById('aiAnalysisModal'));
    modal.show();
    
    document.getElementById('aiAnalysisContent').innerHTML = '<div class="text-center"><div class="spinner-border" role="status"></div><p>Analyzing logs...</p></div>';
    
    try {
        const response = await fetch('/api/ai/analyze-logs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                logs: currentLogs,
                context: `Container: ${container}`
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            document.getElementById('aiAnalysisContent').innerHTML = `<div class="alert alert-success"><pre style="white-space: pre-wrap;">${data.data}</pre></div>`;
        } else {
            document.getElementById('aiAnalysisContent').innerHTML = `<div class="alert alert-danger">Error: ${data.message}</div>`;
        }
    } catch (error) {
        console.error('Error analyzing logs:', error);
        document.getElementById('aiAnalysisContent').innerHTML = `<div class="alert alert-danger">Error: ${error.message}</div>`;
    }
}

function downloadLogs() {
    if (!currentLogs) {
        alert('Please load logs first');
        return;
    }
    
    const container = document.getElementById('containerSelect').value;
    const blob = new Blob([currentLogs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${container}_logs_${new Date().toISOString()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
}

loadContainers();
