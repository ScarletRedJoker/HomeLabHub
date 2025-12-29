"""
Nebula Studio Package Service
Multi-language package management for Python (pip), Node.js (npm), Rust (cargo), and Go
"""
import os
import re
import json
import subprocess
import logging
import urllib.request
import urllib.parse
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass, asdict
from enum import Enum

logger = logging.getLogger(__name__)


class PackageManager(Enum):
    PIP = "pip"
    NPM = "npm"
    CARGO = "cargo"
    GO = "go"


@dataclass
class Package:
    name: str
    version: str
    latest_version: Optional[str] = None
    description: Optional[str] = None
    homepage: Optional[str] = None
    license: Optional[str] = None
    is_outdated: bool = False
    manager: str = "pip"
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


LANGUAGE_MANAGERS = {
    'python': PackageManager.PIP,
    'nodejs': PackageManager.NPM,
    'typescript': PackageManager.NPM,
    'rust': PackageManager.CARGO,
    'go': PackageManager.GO,
}

DEPS_FILES = {
    PackageManager.PIP: 'requirements.txt',
    PackageManager.NPM: 'package.json',
    PackageManager.CARGO: 'Cargo.toml',
    PackageManager.GO: 'go.mod',
}


class PackageService:
    """Multi-language package management service"""
    
    def __init__(self):
        self.cache: Dict[str, Dict[str, Any]] = {}
    
    def get_manager_for_language(self, language: str) -> Optional[PackageManager]:
        """Get package manager for a language"""
        return LANGUAGE_MANAGERS.get(language.lower())
    
    def get_deps_file(self, manager: PackageManager) -> str:
        """Get dependencies file for a package manager"""
        return DEPS_FILES.get(manager, 'requirements.txt')
    
    def parse_requirements_txt(self, content: str) -> List[Package]:
        """Parse Python requirements.txt file"""
        packages = []
        for line in content.strip().split('\n'):
            line = line.strip()
            if not line or line.startswith('#') or line.startswith('-'):
                continue
            
            match = re.match(r'^([a-zA-Z0-9_-]+)([<>=!~]+(.*))?$', line)
            if match:
                name = match.group(1)
                version = match.group(3) if match.group(3) else '*'
                packages.append(Package(
                    name=name,
                    version=version,
                    manager='pip'
                ))
        
        return packages
    
    def parse_package_json(self, content: str) -> List[Package]:
        """Parse Node.js package.json file"""
        packages = []
        try:
            data = json.loads(content)
            deps = data.get('dependencies', {})
            deps.update(data.get('devDependencies', {}))
            
            for name, version in deps.items():
                version = version.lstrip('^~')
                packages.append(Package(
                    name=name,
                    version=version,
                    manager='npm'
                ))
        except json.JSONDecodeError:
            logger.error("Failed to parse package.json")
        
        return packages
    
    def parse_cargo_toml(self, content: str) -> List[Package]:
        """Parse Rust Cargo.toml file"""
        packages = []
        in_deps = False
        
        for line in content.split('\n'):
            line = line.strip()
            
            if line.startswith('[dependencies]') or line.startswith('[dev-dependencies]'):
                in_deps = True
                continue
            elif line.startswith('[') and in_deps:
                in_deps = False
                continue
            
            if in_deps and '=' in line:
                match = re.match(r'^([a-zA-Z0-9_-]+)\s*=\s*["\']?([^"\']+)["\']?', line)
                if match:
                    name = match.group(1)
                    version_str = match.group(2)
                    
                    if version_str.startswith('{'):
                        version_match = re.search(r'version\s*=\s*["\']([^"\']+)["\']', version_str)
                        version = version_match.group(1) if version_match else '*'
                    else:
                        version = version_str
                    
                    packages.append(Package(
                        name=name,
                        version=version,
                        manager='cargo'
                    ))
        
        return packages
    
    def parse_go_mod(self, content: str) -> List[Package]:
        """Parse Go go.mod file"""
        packages = []
        in_require = False
        
        for line in content.split('\n'):
            line = line.strip()
            
            if line.startswith('require ('):
                in_require = True
                continue
            elif line == ')' and in_require:
                in_require = False
                continue
            elif line.startswith('require ') and not in_require:
                parts = line.replace('require ', '').split()
                if len(parts) >= 2:
                    packages.append(Package(
                        name=parts[0],
                        version=parts[1].lstrip('v'),
                        manager='go'
                    ))
                continue
            
            if in_require:
                parts = line.split()
                if len(parts) >= 2:
                    packages.append(Package(
                        name=parts[0],
                        version=parts[1].lstrip('v'),
                        manager='go'
                    ))
        
        return packages
    
    def parse_packages(self, content: str, manager: PackageManager) -> List[Package]:
        """Parse packages from dependency file content"""
        if manager == PackageManager.PIP:
            return self.parse_requirements_txt(content)
        elif manager == PackageManager.NPM:
            return self.parse_package_json(content)
        elif manager == PackageManager.CARGO:
            return self.parse_cargo_toml(content)
        elif manager == PackageManager.GO:
            return self.parse_go_mod(content)
        return []
    
    def search_pypi(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        """Search PyPI for packages"""
        try:
            url = f"https://pypi.org/search/?q={urllib.parse.quote(query)}"
            results = []
            
            api_url = f"https://pypi.org/pypi/{urllib.parse.quote(query)}/json"
            try:
                req = urllib.request.Request(api_url, headers={'User-Agent': 'NebulaStudio/1.0'})
                with urllib.request.urlopen(req, timeout=10) as response:
                    data = json.loads(response.read().decode())
                    info = data.get('info', {})
                    results.append({
                        'name': info.get('name', query),
                        'version': info.get('version', ''),
                        'description': info.get('summary', ''),
                        'homepage': info.get('home_page', info.get('project_url', '')),
                        'license': info.get('license', ''),
                        'manager': 'pip'
                    })
            except:
                pass
            
            search_url = f"https://pypi.org/simple/"
            try:
                req = urllib.request.Request(search_url, headers={'User-Agent': 'NebulaStudio/1.0'})
                with urllib.request.urlopen(req, timeout=10) as response:
                    content = response.read().decode()
                    matches = re.findall(r'href="[^"]*">([^<]+)</a>', content)
                    query_lower = query.lower()
                    for match in matches[:500]:
                        if query_lower in match.lower():
                            if not any(r['name'] == match for r in results):
                                results.append({
                                    'name': match,
                                    'version': '',
                                    'description': '',
                                    'manager': 'pip'
                                })
                            if len(results) >= limit:
                                break
            except Exception as e:
                logger.error(f"Error searching PyPI simple: {e}")
            
            return results[:limit]
            
        except Exception as e:
            logger.error(f"Error searching PyPI: {e}")
            return []
    
    def search_npm(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        """Search npm registry for packages"""
        try:
            url = f"https://registry.npmjs.org/-/v1/search?text={urllib.parse.quote(query)}&size={limit}"
            req = urllib.request.Request(url, headers={'User-Agent': 'NebulaStudio/1.0'})
            
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode())
                
            results = []
            for obj in data.get('objects', []):
                pkg = obj.get('package', {})
                results.append({
                    'name': pkg.get('name', ''),
                    'version': pkg.get('version', ''),
                    'description': pkg.get('description', ''),
                    'homepage': pkg.get('links', {}).get('homepage', ''),
                    'license': '',
                    'manager': 'npm'
                })
            
            return results
            
        except Exception as e:
            logger.error(f"Error searching npm: {e}")
            return []
    
    def search_crates(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        """Search crates.io for Rust packages"""
        try:
            url = f"https://crates.io/api/v1/crates?q={urllib.parse.quote(query)}&per_page={limit}"
            req = urllib.request.Request(url, headers={'User-Agent': 'NebulaStudio/1.0'})
            
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode())
            
            results = []
            for crate in data.get('crates', []):
                results.append({
                    'name': crate.get('name', ''),
                    'version': crate.get('newest_version', crate.get('max_version', '')),
                    'description': crate.get('description', ''),
                    'homepage': crate.get('homepage', f"https://crates.io/crates/{crate.get('name', '')}"),
                    'license': crate.get('license', ''),
                    'manager': 'cargo'
                })
            
            return results
            
        except Exception as e:
            logger.error(f"Error searching crates.io: {e}")
            return []
    
    def search_go_packages(self, query: str, limit: int = 20) -> List[Dict[str, Any]]:
        """Search Go packages via pkg.go.dev"""
        try:
            url = f"https://pkg.go.dev/search?q={urllib.parse.quote(query)}&limit={limit}"
            results = []
            
            if query.startswith('github.com/') or query.startswith('golang.org/'):
                results.append({
                    'name': query,
                    'version': 'latest',
                    'description': f'Go package: {query}',
                    'homepage': f'https://pkg.go.dev/{query}',
                    'license': '',
                    'manager': 'go'
                })
            
            common_prefixes = ['github.com/', 'golang.org/x/', 'google.golang.org/']
            for prefix in common_prefixes:
                results.append({
                    'name': f'{prefix}{query}',
                    'version': 'latest',
                    'description': f'Search for {query} on {prefix}',
                    'homepage': f'https://pkg.go.dev/{prefix}{query}',
                    'license': '',
                    'manager': 'go'
                })
            
            return results[:limit]
            
        except Exception as e:
            logger.error(f"Error searching Go packages: {e}")
            return []
    
    def search_packages(self, query: str, manager: PackageManager, limit: int = 20) -> List[Dict[str, Any]]:
        """Search packages for a specific manager"""
        if manager == PackageManager.PIP:
            return self.search_pypi(query, limit)
        elif manager == PackageManager.NPM:
            return self.search_npm(query, limit)
        elif manager == PackageManager.CARGO:
            return self.search_crates(query, limit)
        elif manager == PackageManager.GO:
            return self.search_go_packages(query, limit)
        return []
    
    def get_package_info_pypi(self, name: str) -> Optional[Dict[str, Any]]:
        """Get package info from PyPI"""
        try:
            url = f"https://pypi.org/pypi/{urllib.parse.quote(name)}/json"
            req = urllib.request.Request(url, headers={'User-Agent': 'NebulaStudio/1.0'})
            
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode())
            
            info = data.get('info', {})
            return {
                'name': info.get('name', name),
                'version': info.get('version', ''),
                'description': info.get('summary', ''),
                'long_description': info.get('description', ''),
                'homepage': info.get('home_page', info.get('project_url', '')),
                'license': info.get('license', ''),
                'author': info.get('author', ''),
                'keywords': info.get('keywords', ''),
                'requires_python': info.get('requires_python', ''),
                'manager': 'pip'
            }
            
        except Exception as e:
            logger.error(f"Error getting PyPI package info: {e}")
            return None
    
    def get_package_info_npm(self, name: str) -> Optional[Dict[str, Any]]:
        """Get package info from npm"""
        try:
            url = f"https://registry.npmjs.org/{urllib.parse.quote(name)}"
            req = urllib.request.Request(url, headers={'User-Agent': 'NebulaStudio/1.0'})
            
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode())
            
            latest = data.get('dist-tags', {}).get('latest', '')
            latest_info = data.get('versions', {}).get(latest, {})
            
            return {
                'name': data.get('name', name),
                'version': latest,
                'description': data.get('description', ''),
                'long_description': latest_info.get('readme', data.get('readme', '')),
                'homepage': data.get('homepage', ''),
                'license': data.get('license', ''),
                'author': data.get('author', {}).get('name', '') if isinstance(data.get('author'), dict) else str(data.get('author', '')),
                'keywords': ', '.join(data.get('keywords', [])),
                'repository': data.get('repository', {}).get('url', '') if isinstance(data.get('repository'), dict) else str(data.get('repository', '')),
                'manager': 'npm'
            }
            
        except Exception as e:
            logger.error(f"Error getting npm package info: {e}")
            return None
    
    def get_package_info_crates(self, name: str) -> Optional[Dict[str, Any]]:
        """Get package info from crates.io"""
        try:
            url = f"https://crates.io/api/v1/crates/{urllib.parse.quote(name)}"
            req = urllib.request.Request(url, headers={'User-Agent': 'NebulaStudio/1.0'})
            
            with urllib.request.urlopen(req, timeout=10) as response:
                data = json.loads(response.read().decode())
            
            crate = data.get('crate', {})
            versions = data.get('versions', [])
            latest_version = versions[0] if versions else {}
            
            return {
                'name': crate.get('name', name),
                'version': crate.get('newest_version', crate.get('max_version', '')),
                'description': crate.get('description', ''),
                'long_description': crate.get('readme', ''),
                'homepage': crate.get('homepage', f"https://crates.io/crates/{name}"),
                'license': latest_version.get('license', ''),
                'repository': crate.get('repository', ''),
                'downloads': crate.get('downloads', 0),
                'manager': 'cargo'
            }
            
        except Exception as e:
            logger.error(f"Error getting crates.io package info: {e}")
            return None
    
    def get_package_info(self, name: str, manager: PackageManager) -> Optional[Dict[str, Any]]:
        """Get detailed package info"""
        if manager == PackageManager.PIP:
            return self.get_package_info_pypi(name)
        elif manager == PackageManager.NPM:
            return self.get_package_info_npm(name)
        elif manager == PackageManager.CARGO:
            return self.get_package_info_crates(name)
        elif manager == PackageManager.GO:
            return {
                'name': name,
                'version': 'latest',
                'description': f'Go package: {name}',
                'homepage': f'https://pkg.go.dev/{name}',
                'manager': 'go'
            }
        return None
    
    def get_latest_version_pypi(self, name: str) -> Optional[str]:
        """Get latest version from PyPI"""
        try:
            url = f"https://pypi.org/pypi/{urllib.parse.quote(name)}/json"
            req = urllib.request.Request(url, headers={'User-Agent': 'NebulaStudio/1.0'})
            
            with urllib.request.urlopen(req, timeout=5) as response:
                data = json.loads(response.read().decode())
                return data.get('info', {}).get('version')
        except:
            return None
    
    def get_latest_version_npm(self, name: str) -> Optional[str]:
        """Get latest version from npm"""
        try:
            url = f"https://registry.npmjs.org/{urllib.parse.quote(name)}/latest"
            req = urllib.request.Request(url, headers={'User-Agent': 'NebulaStudio/1.0'})
            
            with urllib.request.urlopen(req, timeout=5) as response:
                data = json.loads(response.read().decode())
                return data.get('version')
        except:
            return None
    
    def get_latest_version_crates(self, name: str) -> Optional[str]:
        """Get latest version from crates.io"""
        try:
            url = f"https://crates.io/api/v1/crates/{urllib.parse.quote(name)}"
            req = urllib.request.Request(url, headers={'User-Agent': 'NebulaStudio/1.0'})
            
            with urllib.request.urlopen(req, timeout=5) as response:
                data = json.loads(response.read().decode())
                return data.get('crate', {}).get('newest_version')
        except:
            return None
    
    def get_latest_version(self, name: str, manager: PackageManager) -> Optional[str]:
        """Get latest version of a package"""
        if manager == PackageManager.PIP:
            return self.get_latest_version_pypi(name)
        elif manager == PackageManager.NPM:
            return self.get_latest_version_npm(name)
        elif manager == PackageManager.CARGO:
            return self.get_latest_version_crates(name)
        return None
    
    def check_outdated(self, packages: List[Package], manager: PackageManager) -> List[Package]:
        """Check which packages are outdated"""
        updated_packages = []
        
        for pkg in packages:
            latest = self.get_latest_version(pkg.name, manager)
            if latest:
                pkg.latest_version = latest
                current = pkg.version.lstrip('^~>=<!')
                if current != '*' and current != latest:
                    pkg.is_outdated = True
            updated_packages.append(pkg)
        
        return updated_packages
    
    def generate_install_command(self, package_name: str, version: Optional[str], manager: PackageManager) -> str:
        """Generate install command for a package"""
        if manager == PackageManager.PIP:
            if version and version != 'latest':
                return f"pip install {package_name}=={version}"
            return f"pip install {package_name}"
        
        elif manager == PackageManager.NPM:
            if version and version != 'latest':
                return f"npm install {package_name}@{version}"
            return f"npm install {package_name}"
        
        elif manager == PackageManager.CARGO:
            if version and version != 'latest':
                return f"cargo add {package_name}@{version}"
            return f"cargo add {package_name}"
        
        elif manager == PackageManager.GO:
            if version and version != 'latest':
                return f"go get {package_name}@v{version}"
            return f"go get {package_name}@latest"
        
        return ""
    
    def generate_uninstall_command(self, package_name: str, manager: PackageManager) -> str:
        """Generate uninstall command for a package"""
        if manager == PackageManager.PIP:
            return f"pip uninstall -y {package_name}"
        elif manager == PackageManager.NPM:
            return f"npm uninstall {package_name}"
        elif manager == PackageManager.CARGO:
            return f"cargo remove {package_name}"
        elif manager == PackageManager.GO:
            return f"go mod edit -droprequire {package_name} && go mod tidy"
        return ""
    
    def add_to_requirements_txt(self, content: str, package_name: str, version: Optional[str]) -> str:
        """Add package to requirements.txt content"""
        lines = content.strip().split('\n') if content.strip() else []
        
        for i, line in enumerate(lines):
            if line.strip().startswith(package_name):
                if version and version != 'latest':
                    lines[i] = f"{package_name}=={version}"
                else:
                    lines[i] = package_name
                return '\n'.join(lines)
        
        if version and version != 'latest':
            lines.append(f"{package_name}=={version}")
        else:
            lines.append(package_name)
        
        return '\n'.join(lines)
    
    def remove_from_requirements_txt(self, content: str, package_name: str) -> str:
        """Remove package from requirements.txt content"""
        lines = content.strip().split('\n') if content.strip() else []
        lines = [line for line in lines if not line.strip().startswith(package_name)]
        return '\n'.join(lines)
    
    def add_to_package_json(self, content: str, package_name: str, version: Optional[str]) -> str:
        """Add package to package.json content"""
        try:
            data = json.loads(content) if content.strip() else {}
            if 'dependencies' not in data:
                data['dependencies'] = {}
            
            ver = f"^{version}" if version and version != 'latest' else "latest"
            data['dependencies'][package_name] = ver
            
            return json.dumps(data, indent=2)
        except:
            return content
    
    def remove_from_package_json(self, content: str, package_name: str) -> str:
        """Remove package from package.json content"""
        try:
            data = json.loads(content)
            if 'dependencies' in data and package_name in data['dependencies']:
                del data['dependencies'][package_name]
            if 'devDependencies' in data and package_name in data['devDependencies']:
                del data['devDependencies'][package_name]
            
            return json.dumps(data, indent=2)
        except:
            return content
    
    def add_to_cargo_toml(self, content: str, package_name: str, version: Optional[str]) -> str:
        """Add package to Cargo.toml content"""
        lines = content.split('\n')
        in_deps = False
        deps_end = -1
        
        for i, line in enumerate(lines):
            if line.strip().startswith('[dependencies]'):
                in_deps = True
                continue
            elif line.strip().startswith('[') and in_deps:
                deps_end = i
                break
            elif in_deps and line.strip().startswith(package_name):
                ver = version if version and version != 'latest' else '*'
                lines[i] = f'{package_name} = "{ver}"'
                return '\n'.join(lines)
        
        ver = version if version and version != 'latest' else '*'
        new_line = f'{package_name} = "{ver}"'
        
        if deps_end > 0:
            lines.insert(deps_end, new_line)
        elif in_deps:
            lines.append(new_line)
        else:
            lines.append('\n[dependencies]')
            lines.append(new_line)
        
        return '\n'.join(lines)
    
    def remove_from_cargo_toml(self, content: str, package_name: str) -> str:
        """Remove package from Cargo.toml content"""
        lines = content.split('\n')
        lines = [line for line in lines if not line.strip().startswith(package_name + ' =') and not line.strip().startswith(package_name + '=')]
        return '\n'.join(lines)
    
    def add_to_go_mod(self, content: str, package_name: str, version: Optional[str]) -> str:
        """Add package to go.mod content"""
        ver = f"v{version}" if version and version != 'latest' else "latest"
        
        if 'require (' in content:
            content = content.replace('require (', f'require (\n\t{package_name} {ver}')
        elif 'require' in content:
            lines = content.split('\n')
            lines.append(f'require {package_name} {ver}')
            content = '\n'.join(lines)
        else:
            content += f'\n\nrequire {package_name} {ver}'
        
        return content
    
    def remove_from_go_mod(self, content: str, package_name: str) -> str:
        """Remove package from go.mod content"""
        lines = content.split('\n')
        lines = [line for line in lines if package_name not in line]
        return '\n'.join(lines)
    
    def update_deps_file(
        self,
        content: str,
        package_name: str,
        version: Optional[str],
        manager: PackageManager,
        action: str = 'add'
    ) -> str:
        """Update dependencies file content"""
        if action == 'add':
            if manager == PackageManager.PIP:
                return self.add_to_requirements_txt(content, package_name, version)
            elif manager == PackageManager.NPM:
                return self.add_to_package_json(content, package_name, version)
            elif manager == PackageManager.CARGO:
                return self.add_to_cargo_toml(content, package_name, version)
            elif manager == PackageManager.GO:
                return self.add_to_go_mod(content, package_name, version)
        
        elif action == 'remove':
            if manager == PackageManager.PIP:
                return self.remove_from_requirements_txt(content, package_name)
            elif manager == PackageManager.NPM:
                return self.remove_from_package_json(content, package_name)
            elif manager == PackageManager.CARGO:
                return self.remove_from_cargo_toml(content, package_name)
            elif manager == PackageManager.GO:
                return self.remove_from_go_mod(content, package_name)
        
        return content


package_service = PackageService()
