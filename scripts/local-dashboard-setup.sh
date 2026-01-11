#!/bin/bash
set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${CYAN}       NEBULA COMMAND - Local Dashboard Setup${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

PROJECT_ROOT="/opt/homelab/HomeLabHub"
DASHBOARD_DIR="$PROJECT_ROOT/services/dashboard-next"
SSH_KEY_PATH="$HOME/.ssh/homelab"

echo -e "${YELLOW}Step 1: Checking prerequisites...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}[ERROR]${NC} Node.js not found. Install with: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
    exit 1
fi
echo -e "${GREEN}[OK]${NC} Node.js $(node -v)"

if ! command -v npm &> /dev/null; then
    echo -e "${RED}[ERROR]${NC} npm not found"
    exit 1
fi
echo -e "${GREEN}[OK]${NC} npm $(npm -v)"

echo ""
echo -e "${YELLOW}Step 2: Checking SSH key...${NC}"

if [ ! -f "$SSH_KEY_PATH" ]; then
    echo -e "${YELLOW}[WARN]${NC} SSH key not found at $SSH_KEY_PATH"
    echo "Creating new SSH key..."
    ssh-keygen -t ed25519 -f "$SSH_KEY_PATH" -N "" -q
    echo -e "${GREEN}[OK]${NC} Created SSH key at $SSH_KEY_PATH"
    echo ""
    echo -e "${YELLOW}IMPORTANT: Copy this public key to your servers:${NC}"
    cat "${SSH_KEY_PATH}.pub"
    echo ""
    echo "Run these commands:"
    echo "  ssh-copy-id -i $SSH_KEY_PATH.pub root@linode.evindrake.net"
    echo "  ssh-copy-id -i $SSH_KEY_PATH.pub evin@host.evindrake.net"
    echo ""
else
    echo -e "${GREEN}[OK]${NC} SSH key exists at $SSH_KEY_PATH"
fi

echo ""
echo -e "${YELLOW}Step 3: Checking project directory...${NC}"

if [ ! -d "$PROJECT_ROOT" ]; then
    echo -e "${YELLOW}[WARN]${NC} Project not found at $PROJECT_ROOT"
    echo "Cloning repository..."
    sudo mkdir -p /opt/homelab
    sudo chown $USER:$USER /opt/homelab
    git clone https://github.com/YOUR_REPO/HomeLabHub.git "$PROJECT_ROOT"
fi
echo -e "${GREEN}[OK]${NC} Project exists at $PROJECT_ROOT"

echo ""
echo -e "${YELLOW}Step 4: Setting up environment...${NC}"

cd "$DASHBOARD_DIR"

if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cat > .env << EOF
# SSH Configuration - REQUIRED for server monitoring
SSH_KEY_PATH=$SSH_KEY_PATH

# Server Hosts
LINODE_SSH_HOST=linode.evindrake.net
LINODE_SSH_USER=root
HOME_SSH_HOST=host.evindrake.net
HOME_SSH_USER=evin

# Database - UPDATE THIS
JARVIS_DATABASE_URL=postgresql://user:password@localhost:5432/homelab_jarvis

# Local AI Services (Windows VM with RTX 3060)
OLLAMA_URL=http://100.118.44.102:11434
WINDOWS_VM_TAILSCALE_IP=100.118.44.102

# Session secret (auto-generated)
SESSION_SECRET=$(openssl rand -hex 32)

# Development mode
NEXT_PUBLIC_DEV_MODE=true
EOF
    echo -e "${GREEN}[OK]${NC} Created .env file"
    echo -e "${YELLOW}[ACTION REQUIRED]${NC} Edit $DASHBOARD_DIR/.env with your database credentials"
else
    echo -e "${GREEN}[OK]${NC} .env file exists"
fi

echo ""
echo -e "${YELLOW}Step 5: Testing SSH connectivity...${NC}"

test_ssh() {
    local host=$1
    local user=$2
    local name=$3
    
    if ssh -i "$SSH_KEY_PATH" -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$user@$host" "echo OK" 2>/dev/null; then
        echo -e "${GREEN}[OK]${NC} $name ($user@$host)"
        return 0
    else
        echo -e "${RED}[FAIL]${NC} $name ($user@$host)"
        return 1
    fi
}

test_ssh "linode.evindrake.net" "root" "Linode Server" || true
test_ssh "host.evindrake.net" "evin" "Home Server" || true
test_ssh "100.118.44.102" "admin" "Windows VM" || true

echo ""
echo -e "${YELLOW}Step 6: Installing dependencies...${NC}"
npm install

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}                    SETUP COMPLETE!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "To start the dashboard:"
echo "  cd $DASHBOARD_DIR"
echo "  npm run dev"
echo ""
echo "Dashboard will be available at: http://localhost:5000"
echo ""

read -p "Start the dashboard now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    npm run dev
fi
