#!/bin/bash

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   Database Migration & Reset Tool            ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    echo -e "${RED}✗ .env file not found!${NC}"
    echo "Please run ./generate-unified-env.sh first"
    exit 1
fi

# Source environment variables
set -a
source .env
set +a

echo "This tool helps you:"
echo "  1. Reset/recreate databases (fresh start)"
echo "  2. Check database status"
echo "  3. Manually trigger database initialization"
echo ""

PS3='Select an option: '
options=("Check Database Status" "Reset All Databases" "Reset Discord Bot DB Only" "Reset Stream Bot DB Only" "Quit")
select opt in "${options[@]}"
do
    case $opt in
        "Check Database Status")
            echo ""
            echo "━━━ Checking Database Status ━━━"
            echo ""
            
            if ! docker ps | grep -q discord-bot-db; then
                echo -e "${RED}✗ discord-bot-db container is not running${NC}"
                echo "Run ./deploy-unified.sh to start it"
                break
            fi
            
            echo "PostgreSQL databases:"
            docker exec discord-bot-db psql -U ticketbot -d ticketbot -c "\l" | grep -E 'ticketbot|streambot' || echo "No databases found"
            
            echo ""
            echo "PostgreSQL users:"
            docker exec discord-bot-db psql -U ticketbot -d ticketbot -c "\du" | grep -E 'ticketbot|streambot' || echo "No users found"
            
            echo ""
            break
            ;;
        "Reset All Databases")
            echo ""
            echo -e "${YELLOW}⚠ WARNING: This will delete ALL data in both Discord Bot and Stream Bot databases!${NC}"
            read -p "Are you sure? Type 'yes' to confirm: " confirm
            
            if [ "$confirm" = "yes" ]; then
                echo ""
                echo "Stopping services..."
                docker-compose -f docker-compose.unified.yml stop discord-bot stream-bot
                
                echo "Removing database volume..."
                docker volume rm homelabhub_postgres_data 2>/dev/null || true
                
                echo "Restarting database container..."
                docker-compose -f docker-compose.unified.yml up -d discord-bot-db
                
                echo "Waiting for database to initialize..."
                sleep 10
                
                echo "Starting services..."
                docker-compose -f docker-compose.unified.yml up -d
                
                echo -e "${GREEN}✓ Databases reset successfully!${NC}"
            else
                echo "Operation cancelled"
            fi
            break
            ;;
        "Reset Discord Bot DB Only")
            echo ""
            echo -e "${YELLOW}⚠ WARNING: This will delete ALL data in the Discord Bot database!${NC}"
            read -p "Are you sure? Type 'yes' to confirm: " confirm
            
            if [ "$confirm" = "yes" ]; then
                echo ""
                echo "Stopping Discord Bot..."
                docker-compose -f docker-compose.unified.yml stop discord-bot
                
                echo "Dropping and recreating ticketbot database..."
                docker exec discord-bot-db psql -U ticketbot -d postgres -c "DROP DATABASE IF EXISTS ticketbot;"
                docker exec discord-bot-db psql -U ticketbot -d postgres -c "CREATE DATABASE ticketbot OWNER ticketbot;"
                
                echo "Restarting Discord Bot..."
                docker-compose -f docker-compose.unified.yml up -d discord-bot
                
                echo -e "${GREEN}✓ Discord Bot database reset successfully!${NC}"
            else
                echo "Operation cancelled"
            fi
            break
            ;;
        "Reset Stream Bot DB Only")
            echo ""
            echo -e "${YELLOW}⚠ WARNING: This will delete ALL data in the Stream Bot database!${NC}"
            read -p "Are you sure? Type 'yes' to confirm: " confirm
            
            if [ "$confirm" = "yes" ]; then
                echo ""
                echo "Stopping Stream Bot..."
                docker-compose -f docker-compose.unified.yml stop stream-bot
                
                echo "Dropping and recreating streambot database..."
                docker exec discord-bot-db psql -U ticketbot -d postgres -c "DROP DATABASE IF EXISTS streambot;"
                docker exec discord-bot-db psql -U ticketbot -d postgres -c "CREATE DATABASE streambot OWNER streambot;"
                docker exec discord-bot-db psql -U ticketbot -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE streambot TO streambot;"
                
                echo "Restarting Stream Bot..."
                docker-compose -f docker-compose.unified.yml up -d stream-bot
                
                echo -e "${GREEN}✓ Stream Bot database reset successfully!${NC}"
            else
                echo "Operation cancelled"
            fi
            break
            ;;
        "Quit")
            break
            ;;
        *) echo "Invalid option $REPLY";;
    esac
done

echo ""
