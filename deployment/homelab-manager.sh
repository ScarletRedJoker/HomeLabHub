#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "${SCRIPT_DIR}")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

print_header() {
    clear
    echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${CYAN}║${NC}          ${PURPLE}HOMELAB MANAGEMENT SYSTEM${NC}                      ${CYAN}║${NC}"
    echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_menu() {
    echo -e "${BLUE}Main Menu:${NC}"
    echo ""
    echo -e "  ${GREEN}1.${NC} Backup Management"
    echo -e "  ${GREEN}2.${NC} Restore Management"
    echo -e "  ${GREEN}3.${NC} Service Management"
    echo -e "  ${GREEN}4.${NC} System Status"
    echo -e "  ${GREEN}5.${NC} Database Management"
    echo -e "  ${GREEN}6.${NC} Documentation"
    echo -e "  ${RED}0.${NC} Exit"
    echo ""
    echo -n -e "${YELLOW}Select an option:${NC} "
}

backup_menu() {
    while true; do
        print_header
        echo -e "${BLUE}Backup Management:${NC}"
        echo ""
        echo -e "  ${GREEN}1.${NC} Backup All Databases (Manual)"
        echo -e "  ${GREEN}2.${NC} Backup Configurations (Manual)"
        echo -e "  ${GREEN}3.${NC} Backup Service Data (MinIO, n8n, Home Assistant)"
        echo -e "  ${GREEN}4.${NC} View Backup Status"
        echo -e "  ${GREEN}5.${NC} List Available Backups"
        echo -e "  ${GREEN}6.${NC} Setup Automated Backups (systemd)"
        echo -e "  ${RED}0.${NC} Back to Main Menu"
        echo ""
        echo -n -e "${YELLOW}Select an option:${NC} "
        read -r choice
        
        case $choice in
            1) backup_databases ;;
            2) backup_configs ;;
            3) backup_service_data ;;
            4) view_backup_status ;;
            5) list_backups ;;
            6) setup_automated_backups ;;
            0) break ;;
            *) echo -e "${RED}Invalid option${NC}" ; sleep 2 ;;
        esac
    done
}

restore_menu() {
    while true; do
        print_header
        echo -e "${BLUE}Restore Management:${NC}"
        echo ""
        echo -e "  ${GREEN}1.${NC} Restore Database (ticketbot)"
        echo -e "  ${GREEN}2.${NC} Restore Database (streambot)"
        echo -e "  ${GREEN}3.${NC} Restore Database (homelab_jarvis)"
        echo -e "  ${GREEN}4.${NC} Restore Configurations"
        echo -e "  ${GREEN}5.${NC} Restore Service Data"
        echo -e "  ${GREEN}6.${NC} List Available Backups"
        echo -e "  ${RED}0.${NC} Back to Main Menu"
        echo ""
        echo -n -e "${YELLOW}Select an option:${NC} "
        read -r choice
        
        case $choice in
            1) restore_database "ticketbot" ;;
            2) restore_database "streambot" ;;
            3) restore_database "homelab_jarvis" ;;
            4) restore_configurations ;;
            5) restore_service_data ;;
            6) list_backups ;;
            0) break ;;
            *) echo -e "${RED}Invalid option${NC}" ; sleep 2 ;;
        esac
    done
}

service_menu() {
    while true; do
        print_header
        echo -e "${BLUE}Service Management:${NC}"
        echo ""
        echo -e "  ${GREEN}1.${NC} Start All Services"
        echo -e "  ${GREEN}2.${NC} Stop All Services"
        echo -e "  ${GREEN}3.${NC} Restart All Services"
        echo -e "  ${GREEN}4.${NC} View Service Status"
        echo -e "  ${GREEN}5.${NC} View Service Logs"
        echo -e "  ${RED}0.${NC} Back to Main Menu"
        echo ""
        echo -n -e "${YELLOW}Select an option:${NC} "
        read -r choice
        
        case $choice in
            1) start_services ;;
            2) stop_services ;;
            3) restart_services ;;
            4) service_status ;;
            5) service_logs ;;
            0) break ;;
            *) echo -e "${RED}Invalid option${NC}" ; sleep 2 ;;
        esac
    done
}

backup_databases() {
    print_header
    echo -e "${BLUE}Running Database Backup...${NC}"
    echo ""
    
    if [ -f "${SCRIPT_DIR}/backup-databases.sh" ]; then
        "${SCRIPT_DIR}/backup-databases.sh"
        echo ""
        echo -e "${GREEN}Backup completed!${NC}"
    else
        echo -e "${RED}Error: backup-databases.sh not found${NC}"
    fi
    
    echo ""
    echo -n "Press Enter to continue..."
    read -r
}

backup_configs() {
    print_header
    echo -e "${BLUE}Running Configuration Backup...${NC}"
    echo ""
    
    if [ -f "${SCRIPT_DIR}/backup-configs.sh" ]; then
        "${SCRIPT_DIR}/backup-configs.sh"
        echo ""
        echo -e "${GREEN}Backup completed!${NC}"
    else
        echo -e "${RED}Error: backup-configs.sh not found${NC}"
    fi
    
    echo ""
    echo -n "Press Enter to continue..."
    read -r
}

backup_service_data() {
    print_header
    echo -e "${BLUE}Backing Up Service Data...${NC}"
    echo ""
    
    BACKUP_ROOT="/home/evin/contain/backups/services"
    mkdir -p "${BACKUP_ROOT}/minio" "${BACKUP_ROOT}/n8n" "${BACKUP_ROOT}/homeassistant"
    
    echo -e "${YELLOW}Backing up MinIO data...${NC}"
    docker run --rm \
        --volumes-from homelab-minio \
        -v "${BACKUP_ROOT}/minio":/backup \
        alpine tar czf /backup/minio_$(date +%Y%m%d_%H%M%S).tar.gz /data 2>/dev/null || true
    echo -e "${GREEN}✓ MinIO backup completed${NC}"
    
    echo -e "${YELLOW}Backing up n8n workflows...${NC}"
    docker run --rm \
        --volumes-from n8n \
        -v "${BACKUP_ROOT}/n8n":/backup \
        alpine tar czf /backup/n8n_$(date +%Y%m%d_%H%M%S).tar.gz /home/node/.n8n 2>/dev/null || true
    echo -e "${GREEN}✓ n8n backup completed${NC}"
    
    echo -e "${YELLOW}Backing up Home Assistant config...${NC}"
    docker run --rm \
        --volumes-from homeassistant \
        -v "${BACKUP_ROOT}/homeassistant":/backup \
        alpine tar czf /backup/homeassistant_$(date +%Y%m%d_%H%M%S).tar.gz /config 2>/dev/null || true
    echo -e "${GREEN}✓ Home Assistant backup completed${NC}"
    
    echo ""
    echo -e "${GREEN}All service data backed up successfully!${NC}"
    echo ""
    echo -n "Press Enter to continue..."
    read -r
}

view_backup_status() {
    print_header
    echo -e "${BLUE}Backup Status:${NC}"
    echo ""
    
    BACKUP_ROOT="/home/evin/contain/backups"
    
    if [ -f "${BACKUP_ROOT}/database/status.txt" ]; then
        echo -e "${YELLOW}Last Backup Status:${NC}"
        tail -5 "${BACKUP_ROOT}/database/status.txt"
        echo ""
    fi
    
    echo -e "${YELLOW}Database Backups:${NC}"
    if [ -d "${BACKUP_ROOT}/database/daily" ]; then
        echo "  Daily: $(ls -1 ${BACKUP_ROOT}/database/daily/*.sql.gz 2>/dev/null | wc -l) backups"
        echo "  Weekly: $(ls -1 ${BACKUP_ROOT}/database/weekly/*.sql.gz 2>/dev/null | wc -l) backups"
        echo "  Total Size: $(du -sh ${BACKUP_ROOT}/database 2>/dev/null | cut -f1)"
    else
        echo "  No database backups found"
    fi
    echo ""
    
    echo -e "${YELLOW}Configuration Backups:${NC}"
    if [ -d "${BACKUP_ROOT}/config" ]; then
        echo "  Count: $(ls -1 ${BACKUP_ROOT}/config/config_*.tar.gz 2>/dev/null | wc -l) backups"
        echo "  Total Size: $(du -sh ${BACKUP_ROOT}/config 2>/dev/null | cut -f1)"
    else
        echo "  No config backups found"
    fi
    echo ""
    
    echo -e "${YELLOW}Service Data Backups:${NC}"
    if [ -d "${BACKUP_ROOT}/services" ]; then
        for service in minio n8n homeassistant; do
            if [ -d "${BACKUP_ROOT}/services/${service}" ]; then
                count=$(ls -1 ${BACKUP_ROOT}/services/${service}/*.tar.gz 2>/dev/null | wc -l)
                echo "  ${service}: ${count} backups"
            fi
        done
    else
        echo "  No service data backups found"
    fi
    
    echo ""
    echo -n "Press Enter to continue..."
    read -r
}

list_backups() {
    print_header
    echo -e "${BLUE}Available Backups:${NC}"
    echo ""
    
    BACKUP_ROOT="/home/evin/contain/backups"
    
    echo -e "${YELLOW}Recent Database Backups:${NC}"
    if [ -d "${BACKUP_ROOT}/database/daily" ]; then
        find "${BACKUP_ROOT}/database/daily" -name "*.sql.gz" -type f -printf '%T@ %p\n' 2>/dev/null | \
            sort -rn | head -10 | while read -r timestamp file; do
                date_str=$(date -d "@${timestamp}" '+%Y-%m-%d %H:%M:%S')
                size=$(du -h "${file}" | cut -f1)
                echo "  [${date_str}] $(basename ${file}) (${size})"
            done
    fi
    echo ""
    
    echo -e "${YELLOW}Recent Configuration Backups:${NC}"
    if [ -d "${BACKUP_ROOT}/config" ]; then
        find "${BACKUP_ROOT}/config" -name "config_*.tar.gz" -type f -printf '%T@ %p\n' 2>/dev/null | \
            sort -rn | head -5 | while read -r timestamp file; do
                date_str=$(date -d "@${timestamp}" '+%Y-%m-%d %H:%M:%S')
                size=$(du -h "${file}" | cut -f1)
                echo "  [${date_str}] $(basename ${file}) (${size})"
            done
    fi
    
    echo ""
    echo -n "Press Enter to continue..."
    read -r
}

setup_automated_backups() {
    print_header
    echo -e "${BLUE}Setup Automated Backups (systemd):${NC}"
    echo ""
    echo -e "${YELLOW}This will install systemd timer for daily backups at 3:00 AM${NC}"
    echo ""
    echo -n "Continue? (yes/no): "
    read -r confirm
    
    if [ "${confirm}" = "yes" ]; then
        sudo cp "${SCRIPT_DIR}/backup-systemd.service" /etc/systemd/system/homelab-backup.service
        sudo cp "${SCRIPT_DIR}/backup-systemd.timer" /etc/systemd/system/homelab-backup.timer
        sudo systemctl daemon-reload
        sudo systemctl enable homelab-backup.timer
        sudo systemctl start homelab-backup.timer
        
        echo ""
        echo -e "${GREEN}Automated backups enabled!${NC}"
        echo ""
        sudo systemctl status homelab-backup.timer
    else
        echo -e "${YELLOW}Cancelled${NC}"
    fi
    
    echo ""
    echo -n "Press Enter to continue..."
    read -r
}

restore_database() {
    local db=$1
    print_header
    echo -e "${BLUE}Restore Database: ${db}${NC}"
    echo ""
    
    if [ -f "${SCRIPT_DIR}/restore-database.sh" ]; then
        "${SCRIPT_DIR}/restore-database.sh" "${db}"
    else
        echo -e "${RED}Error: restore-database.sh not found${NC}"
    fi
    
    echo ""
    echo -n "Press Enter to continue..."
    read -r
}

restore_configurations() {
    print_header
    echo -e "${BLUE}Restore Configurations:${NC}"
    echo ""
    
    BACKUP_ROOT="/home/evin/contain/backups/config"
    
    if [ ! -d "${BACKUP_ROOT}" ]; then
        echo -e "${RED}No configuration backups found${NC}"
        echo ""
        echo -n "Press Enter to continue..."
        read -r
        return
    fi
    
    echo -e "${YELLOW}Available configuration backups:${NC}"
    select backup in $(ls -1t ${BACKUP_ROOT}/config_*.tar.gz 2>/dev/null); do
        if [ -n "${backup}" ]; then
            echo ""
            echo -e "${YELLOW}Selected: $(basename ${backup})${NC}"
            echo ""
            echo "This will extract to: ${BACKUP_ROOT}/restore"
            echo "You will need to manually decrypt .env files and copy them to their locations."
            echo ""
            echo -n "Continue? (yes/no): "
            read -r confirm
            
            if [ "${confirm}" = "yes" ]; then
                mkdir -p "${BACKUP_ROOT}/restore"
                tar -xzf "${backup}" -C "${BACKUP_ROOT}/restore"
                
                echo ""
                echo -e "${GREEN}Backup extracted to: ${BACKUP_ROOT}/restore${NC}"
                echo ""
                echo -e "${YELLOW}Next steps:${NC}"
                echo "1. Decrypt .env files: openssl enc -aes-256-cbc -d -pbkdf2 -in FILE.encrypted -out FILE -pass pass:\"homelab-backup-$(date +%Y)\""
                echo "2. Copy files to project root"
                echo "3. Restart services"
                echo ""
                echo "See BACKUP_RESTORE_GUIDE.md for detailed instructions"
            fi
            break
        fi
    done
    
    echo ""
    echo -n "Press Enter to continue..."
    read -r
}

restore_service_data() {
    print_header
    echo -e "${BLUE}Restore Service Data:${NC}"
    echo ""
    
    echo "This is an advanced operation. Please refer to BACKUP_RESTORE_GUIDE.md"
    echo "for detailed restoration instructions for MinIO, n8n, and Home Assistant."
    
    echo ""
    echo -n "Press Enter to continue..."
    read -r
}

start_services() {
    print_header
    echo -e "${BLUE}Starting All Services...${NC}"
    echo ""
    
    cd "${PROJECT_ROOT}"
    docker-compose -f docker-compose.unified.yml up -d
    
    echo ""
    echo -e "${GREEN}Services started!${NC}"
    echo ""
    echo -n "Press Enter to continue..."
    read -r
}

stop_services() {
    print_header
    echo -e "${BLUE}Stopping All Services...${NC}"
    echo ""
    
    cd "${PROJECT_ROOT}"
    docker-compose -f docker-compose.unified.yml stop
    
    echo ""
    echo -e "${GREEN}Services stopped!${NC}"
    echo ""
    echo -n "Press Enter to continue..."
    read -r
}

restart_services() {
    print_header
    echo -e "${BLUE}Restarting All Services...${NC}"
    echo ""
    
    cd "${PROJECT_ROOT}"
    docker-compose -f docker-compose.unified.yml restart
    
    echo ""
    echo -e "${GREEN}Services restarted!${NC}"
    echo ""
    echo -n "Press Enter to continue..."
    read -r
}

service_status() {
    print_header
    echo -e "${BLUE}Service Status:${NC}"
    echo ""
    
    cd "${PROJECT_ROOT}"
    docker-compose -f docker-compose.unified.yml ps
    
    echo ""
    echo -n "Press Enter to continue..."
    read -r
}

service_logs() {
    print_header
    echo -e "${BLUE}Service Logs:${NC}"
    echo ""
    
    echo "Select service:"
    select service in "dashboard" "discord-bot" "stream-bot" "postgres" "redis" "minio" "all"; do
        if [ -n "${service}" ]; then
            cd "${PROJECT_ROOT}"
            if [ "${service}" = "all" ]; then
                docker-compose -f docker-compose.unified.yml logs --tail=50
            else
                docker-compose -f docker-compose.unified.yml logs --tail=50 "${service}"
            fi
            break
        fi
    done
    
    echo ""
    echo -n "Press Enter to continue..."
    read -r
}

system_status() {
    print_header
    echo -e "${BLUE}System Status:${NC}"
    echo ""
    
    echo -e "${YELLOW}Docker Status:${NC}"
    docker info --format "  Version: {{.ServerVersion}}"
    docker info --format "  Containers: {{.Containers}} ({{.ContainersRunning}} running)"
    echo ""
    
    echo -e "${YELLOW}Disk Usage:${NC}"
    df -h / | tail -1 | awk '{print "  Root: " $3 " / " $2 " (" $5 " used)"}'
    if [ -d "/home/evin/contain/backups" ]; then
        echo "  Backups: $(du -sh /home/evin/contain/backups 2>/dev/null | cut -f1)"
    fi
    echo ""
    
    echo -e "${YELLOW}Memory Usage:${NC}"
    free -h | grep Mem | awk '{print "  Used: " $3 " / " $2}'
    echo ""
    
    echo -e "${YELLOW}Service Health:${NC}"
    cd "${PROJECT_ROOT}"
    docker-compose -f docker-compose.unified.yml ps | tail -n +2 | while read line; do
        name=$(echo "$line" | awk '{print $1}')
        status=$(echo "$line" | grep -o "Up" || echo "Down")
        if [ "${status}" = "Up" ]; then
            echo -e "  ${GREEN}✓${NC} ${name}"
        else
            echo -e "  ${RED}✗${NC} ${name}"
        fi
    done
    
    echo ""
    echo -n "Press Enter to continue..."
    read -r
}

database_menu() {
    while true; do
        print_header
        echo -e "${BLUE}Database Management:${NC}"
        echo ""
        echo -e "  ${GREEN}1.${NC} Database Status"
        echo -e "  ${GREEN}2.${NC} Run Database Migrations"
        echo -e "  ${GREEN}3.${NC} Connect to Database (psql)"
        echo -e "  ${GREEN}4.${NC} View Database Size"
        echo -e "  ${RED}0.${NC} Back to Main Menu"
        echo ""
        echo -n -e "${YELLOW}Select an option:${NC} "
        read -r choice
        
        case $choice in
            1) database_status ;;
            2) run_migrations ;;
            3) connect_database ;;
            4) database_size ;;
            0) break ;;
            *) echo -e "${RED}Invalid option${NC}" ; sleep 2 ;;
        esac
    done
}

database_status() {
    print_header
    echo -e "${BLUE}Database Status:${NC}"
    echo ""
    
    docker exec discord-bot-db pg_isready -U ticketbot && \
        echo -e "${GREEN}✓ PostgreSQL is running${NC}" || \
        echo -e "${RED}✗ PostgreSQL is not running${NC}"
    
    echo ""
    echo -e "${YELLOW}Databases:${NC}"
    docker exec discord-bot-db psql -U ticketbot -d ticketbot -c "\l" | grep -E "ticketbot|streambot|homelab_jarvis"
    
    echo ""
    echo -n "Press Enter to continue..."
    read -r
}

run_migrations() {
    print_header
    echo -e "${BLUE}Run Database Migrations:${NC}"
    echo ""
    
    echo "This will run pending database migrations for all services."
    echo ""
    echo -n "Continue? (yes/no): "
    read -r confirm
    
    if [ "${confirm}" = "yes" ]; then
        cd "${PROJECT_ROOT}"
        ./deployment/migrate-all.sh
    fi
    
    echo ""
    echo -n "Press Enter to continue..."
    read -r
}

connect_database() {
    print_header
    echo -e "${BLUE}Connect to Database:${NC}"
    echo ""
    
    echo "Select database:"
    select db in "ticketbot" "streambot" "homelab_jarvis"; do
        if [ -n "${db}" ]; then
            user="${db}"
            [ "${db}" = "homelab_jarvis" ] && user="jarvis"
            
            echo ""
            echo -e "${YELLOW}Connecting to ${db}...${NC}"
            echo "Type 'exit' or '\q' to quit"
            echo ""
            
            docker exec -it discord-bot-db psql -U "${user}" -d "${db}"
            break
        fi
    done
    
    echo ""
    echo -n "Press Enter to continue..."
    read -r
}

database_size() {
    print_header
    echo -e "${BLUE}Database Sizes:${NC}"
    echo ""
    
    docker exec discord-bot-db psql -U ticketbot -d postgres -c "\
        SELECT datname, pg_size_pretty(pg_database_size(datname)) AS size \
        FROM pg_database \
        WHERE datname IN ('ticketbot', 'streambot', 'homelab_jarvis') \
        ORDER BY pg_database_size(datname) DESC;"
    
    echo ""
    echo -n "Press Enter to continue..."
    read -r
}

docs_menu() {
    print_header
    echo -e "${BLUE}Documentation:${NC}"
    echo ""
    
    echo -e "  ${GREEN}1.${NC} View Backup & Restore Guide"
    echo -e "  ${GREEN}2.${NC} View Deployment Guide"
    echo -e "  ${GREEN}3.${NC} View Quick Start Guide"
    echo -e "  ${GREEN}4.${NC} View README"
    echo -e "  ${RED}0.${NC} Back to Main Menu"
    echo ""
    echo -n -e "${YELLOW}Select an option:${NC} "
    read -r choice
    
    case $choice in
        1) less "${PROJECT_ROOT}/BACKUP_RESTORE_GUIDE.md" ;;
        2) [ -f "${PROJECT_ROOT}/docs/DEPLOYMENT_GUIDE.md" ] && less "${PROJECT_ROOT}/docs/DEPLOYMENT_GUIDE.md" || echo "Not found" ;;
        3) [ -f "${PROJECT_ROOT}/docs/QUICK_START_GUIDE.md" ] && less "${PROJECT_ROOT}/docs/QUICK_START_GUIDE.md" || echo "Not found" ;;
        4) less "${PROJECT_ROOT}/README.md" ;;
        0) return ;;
        *) echo -e "${RED}Invalid option${NC}" ; sleep 2 ;;
    esac
}

main() {
    while true; do
        print_header
        print_menu
        read -r choice
        
        case $choice in
            1) backup_menu ;;
            2) restore_menu ;;
            3) service_menu ;;
            4) system_status ;;
            5) database_menu ;;
            6) docs_menu ;;
            0) 
                echo ""
                echo -e "${GREEN}Goodbye!${NC}"
                exit 0
                ;;
            *) echo -e "${RED}Invalid option${NC}" ; sleep 2 ;;
        esac
    done
}

main "$@"
