#!/bin/bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Validation results
VALIDATION_ERRORS=0
VALIDATION_WARNINGS=0

# Function to log messages
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
    ((VALIDATION_WARNINGS++))
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
    ((VALIDATION_ERRORS++))
}

# Function to validate HTML syntax
validate_html() {
    local file="$1"
    log_info "Validating HTML: $file"
    
    # Check if file exists
    if [[ ! -f "$file" ]]; then
        log_error "HTML file not found: $file"
        return 1
    fi
    
    # Check for basic HTML structure
    if ! grep -q "<!DOCTYPE html>" "$file"; then
        log_warning "Missing DOCTYPE declaration in $file"
    fi
    
    if ! grep -q "<html" "$file"; then
        log_error "Missing <html> tag in $file"
        return 1
    fi
    
    if ! grep -q "<head>" "$file" && ! grep -q "<head " "$file"; then
        log_error "Missing <head> tag in $file"
        return 1
    fi
    
    if ! grep -q "<body>" "$file" && ! grep -q "<body " "$file"; then
        log_error "Missing <body> tag in $file"
        return 1
    fi
    
    # Check for unclosed tags (basic check)
    local open_tags=$(grep -o "<[a-zA-Z][^>]*>" "$file" | grep -v "</" | grep -v "/>" | wc -l)
    local close_tags=$(grep -o "</[a-zA-Z]*>" "$file" | wc -l)
    
    if [[ $open_tags -gt $((close_tags + 10)) ]]; then
        log_warning "Possible unclosed tags in $file (open: $open_tags, close: $close_tags)"
    fi
    
    log_success "HTML validation passed for $file"
    return 0
}

# Function to validate CSS syntax
validate_css() {
    local file="$1"
    log_info "Validating CSS: $file"
    
    if [[ ! -f "$file" ]]; then
        log_warning "CSS file not found: $file (may be optional)"
        return 0
    fi
    
    # Check for basic CSS syntax issues
    local open_braces=$(grep -o "{" "$file" | wc -l)
    local close_braces=$(grep -o "}" "$file" | wc -l)
    
    if [[ $open_braces -ne $close_braces ]]; then
        log_error "Mismatched braces in $file (open: $open_braces, close: $close_braces)"
        return 1
    fi
    
    # Check for common syntax errors
    if grep -qE ';[[:space:]]*;' "$file"; then
        log_warning "Double semicolons found in $file"
    fi
    
    log_success "CSS validation passed for $file"
    return 0
}

# Function to validate JavaScript syntax
validate_javascript() {
    local file="$1"
    log_info "Validating JavaScript: $file"
    
    if [[ ! -f "$file" ]]; then
        log_warning "JavaScript file not found: $file (may be optional)"
        return 0
    fi
    
    # Check if node is available for syntax checking
    if command -v node &> /dev/null; then
        if node -c "$file" 2>&1 | grep -q "SyntaxError"; then
            log_error "JavaScript syntax error in $file"
            node -c "$file" 2>&1
            return 1
        fi
        log_success "JavaScript syntax valid for $file"
    else
        # Basic checks without node
        local open_braces=$(grep -o "{" "$file" | wc -l)
        local close_braces=$(grep -o "}" "$file" | wc -l)
        
        if [[ $open_braces -ne $close_braces ]]; then
            log_warning "Mismatched braces in $file (open: $open_braces, close: $close_braces)"
        fi
        
        log_warning "Node.js not available, performed basic JS validation only"
    fi
    
    return 0
}

# Function to check for missing assets
check_missing_assets() {
    local site_dir="$1"
    log_info "Checking for missing assets in $site_dir"
    
    # Check for broken image references in HTML files
    find "$site_dir" -name "*.html" -type f | while read -r html_file; do
        # Extract image sources
        grep -oP '(?<=src=")[^"]*\.(?:jpg|jpeg|png|gif|svg|ico|webp)' "$html_file" 2>/dev/null | while read -r img_src; do
            # Handle absolute and relative paths
            if [[ "$img_src" =~ ^/ ]]; then
                # Absolute path from site root
                img_path="$site_dir${img_src}"
            elif [[ "$img_src" =~ ^http ]]; then
                # External URL, skip
                continue
            else
                # Relative path
                img_path="$(dirname "$html_file")/$img_src"
            fi
            
            if [[ ! -f "$img_path" ]]; then
                log_error "Missing image referenced in $html_file: $img_src"
            fi
        done
        
        # Extract CSS references
        grep -oP '(?<=href=")[^"]*\.css' "$html_file" 2>/dev/null | while read -r css_src; do
            if [[ "$css_src" =~ ^/ ]]; then
                css_path="$site_dir${css_src}"
            elif [[ "$css_src" =~ ^http ]]; then
                continue
            else
                css_path="$(dirname "$html_file")/$css_src"
            fi
            
            if [[ ! -f "$css_path" ]]; then
                log_error "Missing CSS referenced in $html_file: $css_src"
            fi
        done
        
        # Extract JavaScript references
        grep -oP '(?<=src=")[^"]*\.js' "$html_file" 2>/dev/null | while read -r js_src; do
            if [[ "$js_src" =~ ^/ ]]; then
                js_path="$site_dir${js_src}"
            elif [[ "$js_src" =~ ^http ]]; then
                continue
            else
                js_path="$(dirname "$html_file")/$js_src"
            fi
            
            if [[ ! -f "$js_path" ]]; then
                log_error "Missing JavaScript referenced in $html_file: $js_src"
            fi
        done
    done
    
    log_success "Asset reference check complete"
}

# Function to check image optimization
check_image_optimization() {
    local site_dir="$1"
    log_info "Checking image sizes in $site_dir"
    
    # Find large images (>1MB)
    find "$site_dir" -type f \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" \) | while read -r img; do
        size=$(stat -f%z "$img" 2>/dev/null || stat -c%s "$img" 2>/dev/null || echo 0)
        size_mb=$((size / 1024 / 1024))
        
        if [[ $size_mb -gt 1 ]]; then
            log_warning "Large image file (${size_mb}MB): $img - consider optimization"
        fi
    done
    
    log_success "Image size check complete"
}

# Function to validate site structure
validate_site_structure() {
    local site_dir="$1"
    log_info "Validating site structure for $site_dir"
    
    # Check if index.html exists
    if [[ ! -f "$site_dir/index.html" ]]; then
        log_error "Missing index.html in $site_dir"
        return 1
    fi
    
    # Check if CSS directory exists
    if [[ -d "$site_dir/css" ]]; then
        log_success "CSS directory found"
    else
        log_warning "No CSS directory found in $site_dir"
    fi
    
    # Check if JS directory exists
    if [[ -d "$site_dir/js" ]]; then
        log_success "JavaScript directory found"
    else
        log_warning "No JavaScript directory found in $site_dir"
    fi
    
    # Check for favicon
    if [[ -f "$site_dir/favicon.ico" ]] || [[ -f "$site_dir/assets/favicon.ico" ]]; then
        log_success "Favicon found"
    else
        log_warning "No favicon found in $site_dir"
    fi
    
    return 0
}

# Main validation function
validate_static_site() {
    local site_dir="$1"
    local site_name=$(basename "$site_dir")
    
    echo ""
    echo "========================================"
    echo "Validating Static Site: $site_name"
    echo "========================================"
    echo ""
    
    # Validate site structure
    validate_site_structure "$site_dir"
    
    # Validate all HTML files
    find "$site_dir" -name "*.html" -type f | while read -r html_file; do
        validate_html "$html_file"
    done
    
    # Validate all CSS files
    find "$site_dir" -name "*.css" -type f | while read -r css_file; do
        validate_css "$css_file"
    done
    
    # Validate all JavaScript files
    find "$site_dir" -name "*.js" -type f | while read -r js_file; do
        validate_javascript "$js_file"
    done
    
    # Check for missing assets
    check_missing_assets "$site_dir"
    
    # Check image optimization
    check_image_optimization "$site_dir"
    
    echo ""
    echo "========================================"
    echo "Validation Summary for $site_name"
    echo "========================================"
    echo -e "Errors:   ${RED}$VALIDATION_ERRORS${NC}"
    echo -e "Warnings: ${YELLOW}$VALIDATION_WARNINGS${NC}"
    echo ""
    
    if [[ $VALIDATION_ERRORS -gt 0 ]]; then
        log_error "Validation failed with $VALIDATION_ERRORS errors"
        return 1
    elif [[ $VALIDATION_WARNINGS -gt 0 ]]; then
        log_warning "Validation passed with $VALIDATION_WARNINGS warnings"
        return 0
    else
        log_success "Validation passed with no errors or warnings"
        return 0
    fi
}

# Usage information
usage() {
    echo "Usage: $0 <site_directory>"
    echo ""
    echo "Example:"
    echo "  $0 services/static-site"
    echo "  $0 services/rig-city-site"
    exit 1
}

# Main script
if [[ $# -lt 1 ]]; then
    usage
fi

SITE_DIR="$1"

if [[ ! -d "$SITE_DIR" ]]; then
    log_error "Directory not found: $SITE_DIR"
    exit 1
fi

# Run validation
validate_static_site "$SITE_DIR"
exit_code=$?

exit $exit_code
