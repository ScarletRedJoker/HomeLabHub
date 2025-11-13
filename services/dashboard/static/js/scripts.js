function setCommand(command) {
    document.getElementById('commandInput').value = command;
}

async function executeCommand() {
    const command = document.getElementById('commandInput').value.trim();
    
    if (!command) {
        alert('Please enter a command');
        return;
    }
    
    const outputPre = document.getElementById('commandOutput');
    outputPre.textContent = 'Executing command...\n';
    
    try {
        const response = await fetch('/api/scripts/execute', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                command: command
            })
        });
        
        const data = await response.json();
        
        let output = `Command: ${command}\n\n`;
        
        if (data.success) {
            output += '=== OUTPUT ===\n';
            output += data.output || '(no output)';
        } else {
            output += '=== ERROR ===\n';
            output += data.error || data.message || 'Unknown error';
        }
        
        outputPre.textContent = output;
    } catch (error) {
        console.error('Error executing command:', error);
        outputPre.textContent = `Error: ${error.message}`;
    }
}

document.getElementById('commandInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        executeCommand();
    }
});
