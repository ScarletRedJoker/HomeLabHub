#!/bin/bash
set -e

echo "╔════════════════════════════════════════════════╗"
echo "║        Nebula Agent Setup Script (Linux)       ║"
echo "╚════════════════════════════════════════════════╝"

INSTALL_DIR="${INSTALL_DIR:-/opt/nebula-agent}"
AGENT_PORT="${AGENT_PORT:-9765}"
AGENT_USER="${AGENT_USER:-nebula}"
SERVICE_NAME="nebula-agent"

check_root() {
    if [ "$EUID" -ne 0 ]; then
        echo "Please run this script as root (sudo)"
        exit 1
    fi
}

check_dependencies() {
    echo ""
    echo "[1/7] Checking dependencies..."
    
    if ! command -v node &> /dev/null; then
        echo "  Node.js not found. Installing..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    fi
    
    NODE_VERSION=$(node --version)
    echo "  Node.js $NODE_VERSION found"
    
    if ! command -v npm &> /dev/null; then
        echo "  npm not found. Please reinstall Node.js"
        exit 1
    fi
    
    NPM_VERSION=$(npm --version)
    echo "  npm $NPM_VERSION found"
}

create_user() {
    echo ""
    echo "[2/7] Setting up user..."
    
    if ! id "$AGENT_USER" &>/dev/null; then
        useradd --system --no-create-home --shell /bin/false "$AGENT_USER"
        echo "  Created user: $AGENT_USER"
    else
        echo "  User $AGENT_USER already exists"
    fi
}

install_agent() {
    echo ""
    echo "[3/7] Installing Nebula Agent..."
    
    mkdir -p "$INSTALL_DIR"
    
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    
    cp -r "$SCRIPT_DIR"/* "$INSTALL_DIR/"
    
    cd "$INSTALL_DIR"
    
    npm install --production=false
    echo "  Dependencies installed"
}

build_agent() {
    echo ""
    echo "[4/7] Building TypeScript..."
    
    cd "$INSTALL_DIR"
    npm run build
    echo "  Build complete"
}

setup_permissions() {
    echo ""
    echo "[5/7] Setting permissions..."
    
    chown -R "$AGENT_USER":"$AGENT_USER" "$INSTALL_DIR"
    
    mkdir -p /home/"$AGENT_USER"/.nebula-agent
    chown -R "$AGENT_USER":"$AGENT_USER" /home/"$AGENT_USER"/.nebula-agent 2>/dev/null || true
    
    echo "  Permissions set"
}

install_systemd_service() {
    echo ""
    echo "[6/7] Installing systemd service..."
    
    cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=Nebula Agent - AI Services Controller
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=${AGENT_USER}
Group=${AGENT_USER}
WorkingDirectory=${INSTALL_DIR}
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

Environment=NODE_ENV=production
Environment=AGENT_PORT=${AGENT_PORT}

ProtectSystem=full
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable ${SERVICE_NAME}
    echo "  Systemd service installed and enabled"
}

configure_firewall() {
    echo ""
    echo "[7/7] Configuring firewall..."
    
    if command -v ufw &> /dev/null; then
        ufw allow ${AGENT_PORT}/tcp comment "Nebula Agent" 2>/dev/null || true
        echo "  UFW rule added for port ${AGENT_PORT}"
    elif command -v firewall-cmd &> /dev/null; then
        firewall-cmd --permanent --add-port=${AGENT_PORT}/tcp 2>/dev/null || true
        firewall-cmd --reload 2>/dev/null || true
        echo "  Firewalld rule added for port ${AGENT_PORT}"
    else
        echo "  No firewall detected, skipping firewall configuration"
    fi
}

start_service() {
    echo ""
    echo "Starting Nebula Agent..."
    
    systemctl start ${SERVICE_NAME}
    
    sleep 2
    
    if systemctl is-active --quiet ${SERVICE_NAME}; then
        echo ""
        echo "╔════════════════════════════════════════════════╗"
        echo "║      Nebula Agent Setup Complete!              ║"
        echo "╚════════════════════════════════════════════════╝"
        echo ""
        echo "Agent is running on: http://0.0.0.0:${AGENT_PORT}"
        echo ""
        echo "Useful commands:"
        echo "  Status:  systemctl status ${SERVICE_NAME}"
        echo "  Logs:    journalctl -u ${SERVICE_NAME} -f"
        echo "  Restart: systemctl restart ${SERVICE_NAME}"
        echo "  Stop:    systemctl stop ${SERVICE_NAME}"
        echo ""
        
        TOKEN_FILE="/home/${AGENT_USER}/.nebula-agent/agent-token.txt"
        if [ -f "$TOKEN_FILE" ]; then
            echo "Token file location: $TOKEN_FILE"
            echo "Use the token from this file to connect from your dashboard."
        fi
    else
        echo "Service failed to start. Check logs with:"
        echo "  journalctl -u ${SERVICE_NAME} -n 50"
        exit 1
    fi
}

main() {
    check_root
    check_dependencies
    create_user
    install_agent
    build_agent
    setup_permissions
    install_systemd_service
    configure_firewall
    start_service
}

main "$@"
