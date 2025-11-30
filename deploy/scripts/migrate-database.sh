#!/bin/bash
set -euo pipefail

echo "================================================"
echo "  Database Migration Script"
echo "  Local PostgreSQL -> Linode PostgreSQL"
echo "================================================"
echo ""

LOCAL_PG_CONTAINER="${LOCAL_PG_CONTAINER:-homelab-postgres}"
LINODE_HOST="${LINODE_HOST:-}"
LINODE_PG_USER="${LINODE_PG_USER:-postgres}"
LINODE_PG_PASSWORD="${LINODE_PG_PASSWORD:-}"

BACKUP_DIR="/tmp/pg_migration_$(date +%Y%m%d_%H%M%S)"

print_status() { echo -e "\n\033[1;34m==>\033[0m \033[1m$1\033[0m"; }
print_success() { echo -e "\033[1;32m✓\033[0m $1"; }
print_error() { echo -e "\033[1;31m✗\033[0m $1"; }

if [[ -z "$LINODE_HOST" ]]; then
    echo "Usage: LINODE_HOST=your.linode.ip LINODE_PG_PASSWORD=xxx $0"
    exit 1
fi

backup_local() {
    print_status "Backing up local databases..."
    
    mkdir -p "$BACKUP_DIR"
    
    for db in ticketbot streambot homelab_jarvis; do
        print_status "Dumping $db..."
        docker exec "$LOCAL_PG_CONTAINER" pg_dump -U postgres -Fc "$db" > "$BACKUP_DIR/$db.dump"
        print_success "Backed up $db ($(du -h "$BACKUP_DIR/$db.dump" | cut -f1))"
    done
    
    print_success "All databases backed up to $BACKUP_DIR"
}

restore_to_linode() {
    print_status "Restoring databases to Linode..."
    
    export PGPASSWORD="$LINODE_PG_PASSWORD"
    
    print_status "Verifying target databases exist..."
    for db in ticketbot streambot homelab_jarvis; do
        if ! psql -h "$LINODE_HOST" -U "$LINODE_PG_USER" -lqt 2>/dev/null | cut -d \| -f 1 | grep -qw "$db"; then
            print_error "Database '$db' does not exist on Linode. Run init scripts first!"
            print_error "Ensure docker compose up has started PostgreSQL with init scripts."
            exit 1
        fi
    done
    
    local failed=0
    for db in ticketbot streambot homelab_jarvis; do
        print_status "Restoring $db to Linode..."
        
        if pg_restore -h "$LINODE_HOST" -U "$LINODE_PG_USER" -d "$db" --clean --if-exists "$BACKUP_DIR/$db.dump" 2>&1; then
            print_success "Restored $db"
        else
            print_error "Failed to restore $db"
            failed=1
        fi
    done
    
    unset PGPASSWORD
    
    if [[ $failed -eq 1 ]]; then
        print_error "Some databases failed to restore. Check errors above."
        exit 1
    fi
    
    print_success "All databases restored to Linode"
}

verify_migration() {
    print_status "Verifying migration..."
    
    export PGPASSWORD="$LINODE_PG_PASSWORD"
    
    for db in ticketbot streambot homelab_jarvis; do
        count=$(psql -h "$LINODE_HOST" -U "$LINODE_PG_USER" -d "$db" -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | tr -d ' ')
        print_success "$db: $count tables"
    done
    
    unset PGPASSWORD
}

main() {
    backup_local
    restore_to_linode
    verify_migration
    
    echo ""
    echo "================================================"
    echo "  Migration Complete!"
    echo "================================================"
    echo ""
    echo "Backups saved to: $BACKUP_DIR"
    echo ""
    echo "Next steps:"
    echo "  1. Update Linode .env with database passwords"
    echo "  2. Start services: docker compose up -d"
    echo "  3. Verify data in applications"
    echo "  4. Update DNS records"
    echo ""
}

main "$@"
