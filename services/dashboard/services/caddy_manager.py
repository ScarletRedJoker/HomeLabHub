"""
Caddyfile Manager
Programmatically manage Caddy reverse proxy configuration
"""

import logging
import os
import re
from typing import Dict, List, Optional
from pathlib import Path
from dataclasses import dataclass
from typing import Tuple

logger = logging.getLogger(__name__)


@dataclass
class CaddyChunk:
    """Represents a chunk of Caddyfile content"""
    raw: str  # Original text
    kind: str  # "global", "service", or "other"
    domain: Optional[str] = None  # For service chunks


class CaddyManager:
    """Manage Caddyfile for reverse proxy configuration using chunk-based parsing"""
    
    def __init__(self, caddyfile_path: str = 'Caddyfile'):
        self.caddyfile_path = caddyfile_path
        self.chunks: List[CaddyChunk] = []
        self.load_config()
    
    def load_config(self) -> List[CaddyChunk]:
        """Load the current Caddyfile configuration into chunks"""
        if not os.path.exists(self.caddyfile_path):
            logger.warning(f"Caddyfile not found: {self.caddyfile_path}")
            self.chunks = []
            return self.chunks
        
        try:
            with open(self.caddyfile_path, 'r') as f:
                content = f.read()
            
            # Parse into ordered chunks
            self.chunks = self._parse_chunks(content)
            service_count = sum(1 for c in self.chunks if c.kind == 'service')
            logger.info(f"Loaded Caddyfile with {service_count} service chunks and {len(self.chunks)} total chunks")
            return self.chunks
        except Exception as e:
            logger.error(f"Error loading Caddyfile: {e}")
            raise
    
    def _strip_inline_comment(self, line: str) -> str:
        """
        Strip inline comments from a line (# or //).
        Preserves comments inside strings and URLs (http://, https://).
        
        Rules:
        - # anywhere outside quotes is a comment
        - // preceded by whitespace outside quotes is a comment
        - // not preceded by whitespace is preserved (for URLs)
        """
        in_quotes = False
        quote_char = None
        
        for i, char in enumerate(line):
            # Track quoted strings
            if char in ('"', "'"):
                if not in_quotes:
                    in_quotes = True
                    quote_char = char
                elif char == quote_char:
                    in_quotes = False
                    quote_char = None
            
            # Check for comment markers outside quotes
            if not in_quotes:
                # # is always a comment
                if char == '#':
                    return line[:i]
                
                # // is a comment only if preceded by whitespace
                if i < len(line) - 1 and line[i:i+2] == '//':
                    # Check if preceded by whitespace (or start of line)
                    if i == 0 or line[i-1] in (' ', '\t'):
                        return line[:i]
        
        return line
    
    def _count_braces(self, line: str) -> tuple[int, int]:
        """Count opening and closing braces in a line (outside strings)"""
        in_quotes = False
        quote_char = None
        open_count = 0
        close_count = 0
        
        for char in line:
            # Track quoted strings
            if char in ('"', "'"):
                if not in_quotes:
                    in_quotes = True
                    quote_char = char
                elif char == quote_char:
                    in_quotes = False
                    quote_char = None
            
            # Count braces outside quotes
            if not in_quotes:
                if char == '{':
                    open_count += 1
                elif char == '}':
                    close_count += 1
        
        return open_count, close_count
    
    def _parse_blocks(self, content: str) -> List[str]:
        """
        Parse Caddyfile using brace-balanced lexer approach.
        
        Uses brace depth tracking for robust parsing:
        - Strips inline comments before processing
        - Tracks brace depth to determine block boundaries
        - Preserves annotations and comments for idempotent round-trips
        - Handles all whitespace and comment variations
        """
        blocks = []
        current_block_lines = []
        pending_lines = []  # Annotations/comments before next block
        
        depth = 0
        in_global_block = False
        global_block_seen = False
        
        for line in content.split('\n'):
            original_line = line
            stripped = line.strip()
            
            # Skip empty lines before any blocks
            if not stripped and depth == 0 and not global_block_seen:
                continue
            
            # Skip preamble comments
            if stripped.startswith('#') and depth == 0 and not global_block_seen:
                continue
            
            # Strip inline comments for depth counting
            line_no_comment = self._strip_inline_comment(line).rstrip()
            stripped_no_comment = line_no_comment.strip()
            
            # Count braces
            open_braces, close_braces = self._count_braces(line_no_comment)
            
            # Detect global options block (first non-comment line that's just '{')
            if not global_block_seen and depth == 0 and stripped_no_comment == '{':
                in_global_block = True
                global_block_seen = True
                depth += open_braces - close_braces
                
                # If global block closes on same line, we're done
                if depth == 0:
                    in_global_block = False
                continue
            
            # Inside global block - skip lines but track depth
            if in_global_block:
                depth += open_braces - close_braces
                if depth == 0:
                    in_global_block = False
                continue
            
            # After global block, before any service blocks
            if depth == 0:
                # Check if this starts a service block (domain + '{' at column 0)
                if not line.startswith(' ') and not line.startswith('\t') and '{' in line_no_comment:
                    # Save previous block if exists
                    if current_block_lines:
                        blocks.append('\n'.join(current_block_lines))
                    
                    # Separate comments (annotations) from directives in pending_lines
                    annotations = []
                    directives = []
                    for pending_line in pending_lines:
                        if pending_line.strip().startswith('#'):
                            annotations.append(pending_line)
                        else:
                            directives.append(pending_line)
                    
                    # Flush directives as standalone blocks
                    if directives:
                        blocks.append('\n'.join(directives))
                    
                    # Start new block with only comment annotations
                    current_block_lines = annotations + [original_line]
                    pending_lines = []
                    
                    depth += open_braces - close_braces
                else:
                    # Annotation, directive, or import before service block
                    if stripped:  # Skip empty lines
                        pending_lines.append(original_line)
            else:
                # Inside a service block
                current_block_lines.append(original_line)
                depth += open_braces - close_braces
                
                # Block complete when depth returns to 0
                if depth == 0:
                    blocks.append('\n'.join(current_block_lines))
                    current_block_lines = []
        
        # Save any remaining block
        if current_block_lines:
            blocks.append('\n'.join(current_block_lines))
        
        # Flush any trailing directives/imports/comments as standalone blocks
        if pending_lines:
            blocks.append('\n'.join(pending_lines))
        
        return blocks
    
    def _parse_chunks(self, content: str) -> List[CaddyChunk]:
        """
        Parse Caddyfile content into classified chunks.
        
        Wraps _parse_blocks and creates CaddyChunk objects with:
        - kind: "global", "service", or "other"
        - domain: extracted domain for service chunks
        - raw: original text content
        
        Note: _parse_blocks() skips the global block, so we extract it manually first.
        """
        chunks = []
        
        # Step 1: Manually extract global block if present (since _parse_blocks skips it)
        # Scan for the first non-comment, non-empty line to detect global block
        global_lines = []
        depth = 0
        found_global_start = False
        
        for line in content.split('\n'):
            stripped = line.strip()
            line_no_comment = self._strip_inline_comment(line).rstrip()
            stripped_no_comment = line_no_comment.strip()
            
            # Skip empty lines and comments before finding anything
            if not found_global_start and (not stripped or stripped.startswith('#')):
                continue
            
            # Check if this is the start of a global block (just '{')
            if not found_global_start and stripped_no_comment == '{':
                found_global_start = True
                global_lines.append(line)
                open_braces, close_braces = self._count_braces(line_no_comment)
                depth = open_braces - close_braces
                
                if depth == 0:
                    # Global block opened and closed on same line
                    break
                continue
            
            # If we're inside the global block, collect lines
            if found_global_start:
                global_lines.append(line)
                open_braces, close_braces = self._count_braces(line_no_comment)
                depth += open_braces - close_braces
                
                if depth == 0:
                    # End of global block
                    break
            else:
                # First non-comment line isn't '{', so no global block
                break
        
        if global_lines:
            chunks.append(CaddyChunk(
                raw='\n'.join(global_lines),
                kind="global"
            ))
        
        # Step 2: Parse and classify all other blocks (services, imports, snippets, etc.)
        blocks = self._parse_blocks(content)
        
        for block in blocks:
            stripped = block.strip()
            if not stripped:
                continue
            
            # Extract first non-comment line
            first_line = None
            for line in block.split('\n'):
                if line.strip() and not line.strip().startswith('#'):
                    first_line = line
                    break
            
            if not first_line:
                # Block is all comments
                chunks.append(CaddyChunk(raw=block, kind="other"))
                continue
            
            # Check if it's a service block (domain + brace)
            if '{' in first_line and not first_line.strip().startswith('{'):
                # Extract domain(s) before the opening brace
                domain_part = first_line.split('{')[0].strip()
                # Handle multi-domain: site1.com, site2.com
                domains = [d.strip() for d in domain_part.split(',')]
                primary_domain = domains[0] if domains else None
                
                chunks.append(CaddyChunk(
                    raw=block,
                    kind="service",
                    domain=primary_domain
                ))
            elif first_line.strip().startswith(('import', 'handle_path')):
                # Import or handle_path directive
                chunks.append(CaddyChunk(raw=block, kind="other"))
            elif '{' in first_line:
                # Snippet definition
                chunks.append(CaddyChunk(raw=block, kind="other"))
            else:
                # Standalone directive or comment
                chunks.append(CaddyChunk(raw=block, kind="other"))
        
        return chunks
    
    def serialize_state(self) -> str:
        """Serialize current in-memory chunks to Caddyfile format string"""
        # Separate global and other chunks
        global_chunks = [c for c in self.chunks if c.kind == "global"]
        other_chunks = [c for c in self.chunks if c.kind != "global"]
        
        parts = []
        
        # Global block(s) first
        if global_chunks:
            for chunk in global_chunks:
                parts.append(chunk.raw)
        else:
            # Default global block if none exists
            parts.append("{\n    email {$ACME_EMAIL}\n}")
        
        # Add blank line after global
        parts.append("")
        
        # All other chunks
        chunk_texts = [c.raw for c in other_chunks]
        parts.append('\n\n'.join(chunk_texts))
        
        return '\n'.join(parts) + '\n'
    
    def load_from_string(self, caddy_content: str) -> bool:
        """Load Caddyfile configuration from string into memory"""
        try:
            self.chunks = self._parse_chunks(caddy_content)
            service_count = sum(1 for c in self.chunks if c.kind == 'service')
            logger.info(f"Loaded Caddyfile with {service_count} service chunks and {len(self.chunks)} total chunks")
            return True
        except Exception as e:
            logger.error(f"Error loading Caddyfile from string: {e}")
            raise
    
    def write_to_file(self, file_path: str) -> bool:
        """Write current in-memory state to specified file path atomically"""
        try:
            # Write to temporary file first
            temp_path = f"{file_path}.tmp"
            with open(temp_path, 'w') as f:
                f.write(self.serialize_state())
                f.flush()
                os.fsync(f.fileno())
            
            # Atomically replace original
            os.replace(temp_path, file_path)
            
            # Fsync directory to ensure rename is persisted
            dir_fd = os.open(os.path.dirname(file_path) or '.', os.O_RDONLY)
            try:
                os.fsync(dir_fd)
            finally:
                os.close(dir_fd)
            
            logger.info(f"Wrote Caddyfile config to {file_path}")
            return True
        except Exception as e:
            logger.error(f"Error writing Caddyfile to {file_path}: {e}")
            raise
    
    def save_config(self, validate: bool = True) -> bool:
        """
        Save the current configuration to Caddyfile using two-phase commit.
        
        Two-Phase Commit Process:
        1. Write to temporary file
        2. Optionally validate configuration
        3. Atomic rename to replace original
        4. Rollback on failure
        
        Args:
            validate: Whether to run 'caddy validate' before committing (default: True)
        
        Returns:
            True if successful, False otherwise
        """
        temp_path = f"{self.caddyfile_path}.tmp"
        backup_path = f"{self.caddyfile_path}.backup"
        
        try:
            # Phase 1: Prepare - Write to temporary file
            logger.info("Phase 1: Writing configuration to temporary file")
            serialized = self.serialize_state()
            with open(temp_path, 'w') as f:
                f.write(serialized)
                f.flush()
                os.fsync(f.fileno())
            
            # Phase 1.5: Validate (optional)
            if validate:
                logger.info("Phase 1.5: Validating configuration")
                if not self._validate_caddy_config(temp_path):
                    logger.error("Configuration validation failed, aborting save")
                    os.remove(temp_path)
                    return False
            
            # Phase 2: Commit - Create backup and atomically replace
            logger.info("Phase 2: Committing configuration")
            
            # Backup existing file
            if os.path.exists(self.caddyfile_path):
                with open(self.caddyfile_path, 'r') as src:
                    with open(backup_path, 'w') as dst:
                        dst.write(src.read())
                logger.info(f"Created backup at {backup_path}")
            
            # Atomic rename
            os.replace(temp_path, self.caddyfile_path)
            
            # Fsync directory to ensure rename is persisted
            dir_fd = os.open(os.path.dirname(self.caddyfile_path) or '.', os.O_RDONLY)
            try:
                os.fsync(dir_fd)
            finally:
                os.close(dir_fd)
            
            logger.info(f"Successfully saved Caddyfile configuration to {self.caddyfile_path}")
            return True
            
        except Exception as e:
            logger.error(f"Error during save_config: {e}")
            # Cleanup temp file if it exists
            if os.path.exists(temp_path):
                try:
                    os.remove(temp_path)
                except:
                    pass
            raise
    
    def _validate_caddy_config(self, config_path: str) -> bool:
        """
        Validate Caddyfile configuration using 'caddy validate'.
        
        Args:
            config_path: Path to the Caddyfile to validate
        
        Returns:
            True if valid, False otherwise
        """
        try:
            import subprocess
            result = subprocess.run(
                ['docker', 'exec', 'caddy', 'caddy', 'validate', '--config', f'/etc/caddy/{os.path.basename(config_path)}'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                logger.info("Caddy configuration validation passed")
                return True
            else:
                logger.error(f"Caddy configuration validation failed: {result.stderr}")
                return False
        except subprocess.TimeoutExpired:
            logger.error("Caddy validation timed out")
            return False
        except FileNotFoundError:
            logger.warning("Docker not available, skipping validation")
            return True  # Allow save without validation if Docker unavailable
        except Exception as e:
            logger.error(f"Error validating Caddy config: {e}")
            return False
    
    def add_service(self, domain: str, target_url: str, custom_config: Optional[str] = None) -> bool:
        """
        Add a new service to Caddyfile
        
        Args:
            domain: The domain/subdomain for the service
            target_url: The internal service URL (e.g., http://service-name:5000)
            custom_config: Optional custom Caddy configuration
        """
        # Check if domain already exists
        if self.get_service(domain):
            logger.warning(f"Service with domain {domain} already exists")
            return False
        
        if custom_config:
            block = custom_config
        else:
            # Standard reverse proxy configuration
            block = f"""{domain} {{
    reverse_proxy {target_url}
    
    header {{
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "strict-origin-when-cross-origin"
    }}
    
    log {{
        output file /var/log/caddy/{domain}.log
        format json
    }}
}}"""
        
        # Add as a service chunk
        self.chunks.append(CaddyChunk(
            raw=block,
            kind="service",
            domain=domain
        ))
        logger.info(f"Added service: {domain} -> {target_url}")
        return True
    
    def remove_service(self, domain: str) -> bool:
        """Remove a service from Caddyfile"""
        original_count = len(self.chunks)
        self.chunks = [
            chunk for chunk in self.chunks 
            if not (chunk.kind == "service" and chunk.domain == domain)
        ]
        
        if len(self.chunks) < original_count:
            logger.info(f"Removed service: {domain}")
            return True
        else:
            logger.warning(f"Service {domain} not found")
            return False
    
    def get_service(self, domain: str) -> Optional[str]:
        """Get the configuration block for a specific domain"""
        for chunk in self.chunks:
            if chunk.kind == "service" and chunk.domain == domain:
                return chunk.raw
        return None
    
    def list_domains(self) -> List[str]:
        """List all configured domains"""
        domains = []
        for chunk in self.chunks:
            if chunk.kind == "service" and chunk.domain:
                domains.append(chunk.domain)
        return domains
    
    def update_service(self, domain: str, target_url: str, custom_config: Optional[str] = None) -> bool:
        """Update an existing service configuration"""
        if not self.remove_service(domain):
            return False
        return self.add_service(domain, target_url, custom_config)
    
    def reload_caddy(self) -> bool:
        """Reload Caddy configuration (requires Docker exec or API)"""
        try:
            import subprocess
            # Reload Caddy via Docker
            result = subprocess.run(
                ['docker', 'exec', 'caddy', 'caddy', 'reload', '--config', '/etc/caddy/Caddyfile'],
                capture_output=True,
                text=True,
                timeout=10
            )
            
            if result.returncode == 0:
                logger.info("Caddy reloaded successfully")
                return True
            else:
                logger.error(f"Failed to reload Caddy: {result.stderr}")
                return False
        except Exception as e:
            logger.error(f"Error reloading Caddy: {e}")
            return False
