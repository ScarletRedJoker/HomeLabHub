#!/bin/bash
#
# Plex Cache Manager
# Syncs frequently-watched content from NAS to local fast storage
# for buffer-free 4K playback.
#

set -e

CACHE_BASE="/opt/plex-cache"
NAS_BASE="/mnt/nas/networkshare"

CACHE_MOVIES="$CACHE_BASE/movies"
CACHE_SHOWS="$CACHE_BASE/shows"
CACHE_MUSIC="$CACHE_BASE/music"

NAS_MOVIES="$NAS_BASE/video/Movies"
NAS_SHOWS="$NAS_BASE/video/Shows"
NAS_MUSIC="$NAS_BASE/music"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

show_help() {
    cat << EOF
${BLUE}Plex Cache Manager${NC}
==================
Syncs content from slow NAS to fast local storage for buffer-free playback.

${YELLOW}USAGE:${NC}
    $0 <command> [options]

${YELLOW}COMMANDS:${NC}
    setup               Create cache directories and set permissions
    add <type> <name>   Add content to cache (type: movie, show, music)
    remove <type> <name> Remove content from cache
    list [type]         List cached content (type: movie, show, music, all)
    status              Show cache disk usage and statistics
    sync                Re-sync all cached content from NAS
    search <query>      Search NAS for content to cache
    clear [type]        Clear cache (type: movie, show, music, all)

${YELLOW}EXAMPLES:${NC}
    $0 setup                              # Initial setup
    $0 search "john wick"                 # Find John Wick on NAS
    $0 add movie "John.Wick.2014"         # Cache a movie (partial name match)
    $0 add show "Breaking Bad"            # Cache a TV show
    $0 add music "Pink Floyd"             # Cache an artist/album
    $0 list                               # Show all cached content
    $0 status                             # Show cache disk usage
    $0 remove movie "John.Wick.2014"      # Remove from cache

${YELLOW}NOTES:${NC}
    - Cache location: $CACHE_BASE
    - Movies cached to: $CACHE_MOVIES
    - Shows cached to: $CACHE_SHOWS  
    - Music cached to: $CACHE_MUSIC
    - Add cache directories to Plex as libraries for priority playback
    - Uses rsync for efficient syncing (only copies changed files)

EOF
}

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This command requires root privileges. Use: sudo $0 $*"
        exit 1
    fi
}

setup_cache() {
    check_root
    
    log_info "Creating cache directories..."
    mkdir -p "$CACHE_MOVIES" "$CACHE_SHOWS" "$CACHE_MUSIC"
    
    log_info "Setting permissions (PUID=1000, PGID=1000 for Plex)..."
    chown -R 1000:1000 "$CACHE_BASE"
    chmod -R 755 "$CACHE_BASE"
    
    log_info "Cache directories created:"
    echo "  - Movies: $CACHE_MOVIES"
    echo "  - Shows:  $CACHE_SHOWS"
    echo "  - Music:  $CACHE_MUSIC"
    
    echo ""
    log_info "Checking NAS mount..."
    if mountpoint -q /mnt/nas/networkshare 2>/dev/null || [ -d "$NAS_MOVIES" ]; then
        log_info "NAS is mounted at $NAS_BASE"
    else
        log_warn "NAS doesn't appear to be mounted. Run setup-nas-mounts.sh first."
    fi
    
    echo ""
    log_info "Setup complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Search for content:  $0 search 'movie name'"
    echo "  2. Add to cache:        sudo $0 add movie 'Movie.Folder.Name'"
    echo "  3. In Plex, add $CACHE_BASE as a library source"
    echo "  4. Plex will prioritize local cache over NAS"
}

search_nas() {
    local query="$1"
    
    if [ -z "$query" ]; then
        log_error "Please provide a search query"
        echo "Usage: $0 search <query>"
        exit 1
    fi
    
    echo -e "${BLUE}Searching NAS for: ${NC}$query"
    echo ""
    
    echo -e "${YELLOW}=== Movies ===${NC}"
    if [ -d "$NAS_MOVIES" ]; then
        find "$NAS_MOVIES" -maxdepth 1 -type d -iname "*$query*" 2>/dev/null | while read -r dir; do
            name=$(basename "$dir")
            size=$(du -sh "$dir" 2>/dev/null | cut -f1)
            echo "  $name ($size)"
        done
    else
        echo "  (NAS movies not mounted)"
    fi
    
    echo ""
    echo -e "${YELLOW}=== TV Shows ===${NC}"
    if [ -d "$NAS_SHOWS" ]; then
        find "$NAS_SHOWS" -maxdepth 1 -type d -iname "*$query*" 2>/dev/null | while read -r dir; do
            name=$(basename "$dir")
            size=$(du -sh "$dir" 2>/dev/null | cut -f1)
            echo "  $name ($size)"
        done
    else
        echo "  (NAS shows not mounted)"
    fi
    
    echo ""
    echo -e "${YELLOW}=== Music ===${NC}"
    if [ -d "$NAS_MUSIC" ]; then
        find "$NAS_MUSIC" -maxdepth 2 -type d -iname "*$query*" 2>/dev/null | while read -r dir; do
            name=$(basename "$dir")
            size=$(du -sh "$dir" 2>/dev/null | cut -f1)
            echo "  $name ($size)"
        done
    else
        echo "  (NAS music not mounted)"
    fi
    
    echo ""
    echo "To cache, use: sudo $0 add <type> '<folder-name>'"
}

add_to_cache() {
    check_root
    
    local type="$1"
    local name="$2"
    
    if [ -z "$type" ] || [ -z "$name" ]; then
        log_error "Please provide type and name"
        echo "Usage: $0 add <movie|show|music> <name>"
        exit 1
    fi
    
    local source_base=""
    local cache_dest=""
    
    case "$type" in
        movie|movies)
            source_base="$NAS_MOVIES"
            cache_dest="$CACHE_MOVIES"
            ;;
        show|shows|tv)
            source_base="$NAS_SHOWS"
            cache_dest="$CACHE_SHOWS"
            ;;
        music)
            source_base="$NAS_MUSIC"
            cache_dest="$CACHE_MUSIC"
            ;;
        *)
            log_error "Unknown type: $type. Use: movie, show, or music"
            exit 1
            ;;
    esac
    
    local source_dir=$(find "$source_base" -maxdepth 1 -type d -iname "*$name*" 2>/dev/null | head -1)
    
    if [ -z "$source_dir" ]; then
        log_error "Could not find '$name' in $source_base"
        echo "Try: $0 search '$name'"
        exit 1
    fi
    
    local folder_name=$(basename "$source_dir")
    local size=$(du -sh "$source_dir" 2>/dev/null | cut -f1)
    
    log_info "Found: $folder_name ($size)"
    log_info "Syncing to cache..."
    
    mkdir -p "$cache_dest"
    
    rsync -av --progress "$source_dir" "$cache_dest/"
    
    chown -R 1000:1000 "$cache_dest/$folder_name"
    
    log_info "Successfully cached: $folder_name"
    log_info "Location: $cache_dest/$folder_name"
    
    echo ""
    echo "Reminder: Add $cache_dest to Plex as a library source if not already done."
}

remove_from_cache() {
    check_root
    
    local type="$1"
    local name="$2"
    
    if [ -z "$type" ] || [ -z "$name" ]; then
        log_error "Please provide type and name"
        echo "Usage: $0 remove <movie|show|music> <name>"
        exit 1
    fi
    
    local cache_dir=""
    
    case "$type" in
        movie|movies)
            cache_dir="$CACHE_MOVIES"
            ;;
        show|shows|tv)
            cache_dir="$CACHE_SHOWS"
            ;;
        music)
            cache_dir="$CACHE_MUSIC"
            ;;
        *)
            log_error "Unknown type: $type"
            exit 1
            ;;
    esac
    
    local target=$(find "$cache_dir" -maxdepth 1 -type d -iname "*$name*" 2>/dev/null | head -1)
    
    if [ -z "$target" ]; then
        log_error "Could not find '$name' in cache"
        echo "Cached $type:"
        ls -1 "$cache_dir" 2>/dev/null || echo "  (empty)"
        exit 1
    fi
    
    local folder_name=$(basename "$target")
    local size=$(du -sh "$target" 2>/dev/null | cut -f1)
    
    log_warn "Will remove: $folder_name ($size)"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$target"
        log_info "Removed: $folder_name"
    else
        log_info "Cancelled"
    fi
}

list_cache() {
    local type="${1:-all}"
    
    echo -e "${BLUE}=== Plex Cache Contents ===${NC}"
    echo ""
    
    if [ "$type" = "all" ] || [ "$type" = "movie" ] || [ "$type" = "movies" ]; then
        echo -e "${YELLOW}Movies ($CACHE_MOVIES):${NC}"
        if [ -d "$CACHE_MOVIES" ] && [ "$(ls -A "$CACHE_MOVIES" 2>/dev/null)" ]; then
            for dir in "$CACHE_MOVIES"/*/; do
                [ -d "$dir" ] || continue
                name=$(basename "$dir")
                size=$(du -sh "$dir" 2>/dev/null | cut -f1)
                echo "  - $name ($size)"
            done
        else
            echo "  (empty)"
        fi
        echo ""
    fi
    
    if [ "$type" = "all" ] || [ "$type" = "show" ] || [ "$type" = "shows" ] || [ "$type" = "tv" ]; then
        echo -e "${YELLOW}TV Shows ($CACHE_SHOWS):${NC}"
        if [ -d "$CACHE_SHOWS" ] && [ "$(ls -A "$CACHE_SHOWS" 2>/dev/null)" ]; then
            for dir in "$CACHE_SHOWS"/*/; do
                [ -d "$dir" ] || continue
                name=$(basename "$dir")
                size=$(du -sh "$dir" 2>/dev/null | cut -f1)
                echo "  - $name ($size)"
            done
        else
            echo "  (empty)"
        fi
        echo ""
    fi
    
    if [ "$type" = "all" ] || [ "$type" = "music" ]; then
        echo -e "${YELLOW}Music ($CACHE_MUSIC):${NC}"
        if [ -d "$CACHE_MUSIC" ] && [ "$(ls -A "$CACHE_MUSIC" 2>/dev/null)" ]; then
            for dir in "$CACHE_MUSIC"/*/; do
                [ -d "$dir" ] || continue
                name=$(basename "$dir")
                size=$(du -sh "$dir" 2>/dev/null | cut -f1)
                echo "  - $name ($size)"
            done
        else
            echo "  (empty)"
        fi
        echo ""
    fi
}

show_status() {
    echo -e "${BLUE}=== Plex Cache Status ===${NC}"
    echo ""
    
    if [ -d "$CACHE_BASE" ]; then
        echo "Cache Location: $CACHE_BASE"
        echo ""
        
        local total_size=$(du -sh "$CACHE_BASE" 2>/dev/null | cut -f1)
        echo "Total Cache Size: $total_size"
        echo ""
        
        echo "Breakdown:"
        for subdir in movies shows music; do
            if [ -d "$CACHE_BASE/$subdir" ]; then
                size=$(du -sh "$CACHE_BASE/$subdir" 2>/dev/null | cut -f1)
                count=$(find "$CACHE_BASE/$subdir" -maxdepth 1 -type d 2>/dev/null | wc -l)
                count=$((count - 1))
                echo "  - ${subdir^}: $size ($count items)"
            fi
        done
        
        echo ""
        echo "Disk Space:"
        df -h "$CACHE_BASE" | tail -1 | awk '{print "  Used: "$3" / "$2" ("$5" full), Available: "$4}'
    else
        log_warn "Cache not set up. Run: sudo $0 setup"
    fi
}

sync_cache() {
    check_root
    
    log_info "Re-syncing all cached content from NAS..."
    
    local synced=0
    
    for cache_dir in "$CACHE_MOVIES" "$CACHE_SHOWS" "$CACHE_MUSIC"; do
        [ -d "$cache_dir" ] || continue
        
        local type=""
        local nas_base=""
        
        case "$cache_dir" in
            *movies*) type="Movies"; nas_base="$NAS_MOVIES" ;;
            *shows*)  type="Shows";  nas_base="$NAS_SHOWS" ;;
            *music*)  type="Music";  nas_base="$NAS_MUSIC" ;;
        esac
        
        for cached_item in "$cache_dir"/*/; do
            [ -d "$cached_item" ] || continue
            
            local name=$(basename "$cached_item")
            local source="$nas_base/$name"
            
            if [ -d "$source" ]; then
                log_info "Syncing $type: $name"
                rsync -av --delete "$source/" "$cached_item/"
                synced=$((synced + 1))
            else
                log_warn "Source not found for: $name"
            fi
        done
    done
    
    log_info "Sync complete. Updated $synced items."
}

clear_cache() {
    check_root
    
    local type="${1:-all}"
    
    local dirs_to_clear=()
    
    case "$type" in
        movie|movies)
            dirs_to_clear=("$CACHE_MOVIES")
            ;;
        show|shows|tv)
            dirs_to_clear=("$CACHE_SHOWS")
            ;;
        music)
            dirs_to_clear=("$CACHE_MUSIC")
            ;;
        all)
            dirs_to_clear=("$CACHE_MOVIES" "$CACHE_SHOWS" "$CACHE_MUSIC")
            ;;
        *)
            log_error "Unknown type: $type"
            exit 1
            ;;
    esac
    
    local total_size=0
    for dir in "${dirs_to_clear[@]}"; do
        if [ -d "$dir" ]; then
            size=$(du -s "$dir" 2>/dev/null | cut -f1)
            total_size=$((total_size + size))
        fi
    done
    
    local human_size=$(numfmt --to=iec $((total_size * 1024)) 2>/dev/null || echo "${total_size}K")
    
    log_warn "This will delete $human_size of cached content!"
    log_warn "Directories: ${dirs_to_clear[*]}"
    read -p "Are you sure? (y/N) " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        for dir in "${dirs_to_clear[@]}"; do
            if [ -d "$dir" ]; then
                rm -rf "${dir:?}"/*
                log_info "Cleared: $dir"
            fi
        done
        log_info "Cache cleared."
    else
        log_info "Cancelled"
    fi
}

case "${1:-}" in
    setup)
        setup_cache
        ;;
    add)
        add_to_cache "$2" "$3"
        ;;
    remove)
        remove_from_cache "$2" "$3"
        ;;
    list)
        list_cache "$2"
        ;;
    status)
        show_status
        ;;
    sync)
        sync_cache
        ;;
    search)
        search_nas "$2"
        ;;
    clear)
        clear_cache "$2"
        ;;
    help|--help|-h|"")
        show_help
        ;;
    *)
        log_error "Unknown command: $1"
        echo "Run '$0 help' for usage"
        exit 1
        ;;
esac
