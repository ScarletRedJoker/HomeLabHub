#!/bin/bash
# Custom init script for code-server
# This runs before code-server starts to ensure settings are applied

echo "[custom-init] Applying Jarvis AI configuration..."

# Ensure the User data directory exists
mkdir -p /config/data/User

# Copy settings.json if it exists and is newer
if [ -f /config-templates/settings.json ]; then
    cp /config-templates/settings.json /config/data/User/settings.json
    echo "[custom-init] Applied settings.json"
fi

# Ensure .continue directory exists for Continue.dev
mkdir -p /config/.continue

# Create keybindings to disable Copilot chat shortcuts
cat > /config/data/User/keybindings.json << 'EOF'
[
    {
        "key": "ctrl+shift+i",
        "command": "-github.copilot.chat.open",
        "when": "github.copilot.chat.enabled"
    },
    {
        "key": "ctrl+l",
        "command": "continue.focusContinueInput",
        "when": "editorTextFocus"
    }
]
EOF
echo "[custom-init] Applied keybindings.json"

# Disable problematic VS Code extensions by creating a disabled list
mkdir -p /config/data/User/globalStorage
cat > /config/data/User/globalStorage/disabled-extensions.json << 'EOF'
[
    "github.copilot",
    "github.copilot-chat"
]
EOF
echo "[custom-init] Created disabled extensions list"

echo "[custom-init] Jarvis AI configuration complete!"
