#!/usr/bin/env python3
"""Interactive development console for Replit"""
import subprocess
import sys
import os
from pathlib import Path

def show_menu():
    print("\n╔═══════════════════════════════════════════╗")
    print("║  🚀 REPLIT DEVELOPMENT CONSOLE           ║")
    print("╠═══════════════════════════════════════════╣")
    print("║  VALIDATION & TESTING                    ║")
    print("╠═══════════════════════════════════════════╣")
    print("║  1) ✅ Validate for Ubuntu Deploy         ║")
    print("║  2) 🔍 Check LSP Diagnostics              ║")
    print("║  3) 📦 Check Package Manifests            ║")
    print("║  4) 🐳 Simulate Docker Builds             ║")
    print("║  5) 🧪 Run All Tests                      ║")
    print("╠═══════════════════════════════════════════╣")
    print("║  SERVICE MANAGEMENT                      ║")
    print("╠═══════════════════════════════════════════╣")
    print("║  6) 🏠 Switch to Dashboard Service        ║")
    print("║  7) 🤖 Switch to Stream Bot Service       ║")
    print("║  8) 💬 Switch to Discord Bot Service      ║")
    print("║  9) 📊 Service Health Matrix              ║")
    print("║  10) 🌐 Network & Port Validation         ║")
    print("║  11) 🚀 Full Deployment Readiness Check   ║")
    print("╠═══════════════════════════════════════════╣")
    print("║  LOGS & MONITORING                       ║")
    print("╠═══════════════════════════════════════════╣")
    print("║  12) 📋 View Dashboard Logs               ║")
    print("║  13) 📋 View Stream Bot Logs              ║")
    print("║  14) 📋 View All Recent Logs              ║")
    print("║  0) 🚪 Exit                               ║")
    print("╚═══════════════════════════════════════════╝")

def run_command(cmd, description):
    print(f"\n▶️  {description}...")
    result = subprocess.run(cmd, shell=True)
    return result.returncode == 0

def switch_to_service(service_name):
    """Switch to a service directory and show service info"""
    root = Path(__file__).parent.parent
    service_dir = root / "services" / service_name
    
    if not service_dir.exists():
        print(f"❌ Service directory not found: {service_dir}")
        return
    
    print(f"\n🔄 Switching to {service_name.title()} service")
    print(f"📁 Directory: {service_dir}")
    print("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    
    # Show README if exists
    readme = service_dir / "README.md"
    if readme.exists():
        print("\n📖 README.md:")
        subprocess.run(f"head -20 {readme}", shell=True)
        print("...")
    
    # Show package info
    print(f"\n📦 Dependencies:")
    if (service_dir / "package.json").exists():
        print("  • Node.js project (package.json)")
        subprocess.run(f"cd {service_dir} && npm list --depth=0 2>/dev/null | head -10 || echo 'Run npm install'", shell=True)
    elif (service_dir / "requirements.txt").exists():
        print("  • Python project (requirements.txt)")
        subprocess.run(f"head -10 {service_dir}/requirements.txt", shell=True)
    
    # Show available commands
    print(f"\n⚡ Quick Commands:")
    print(f"  cd {service_dir}")
    if (service_dir / "package.json").exists():
        print(f"  npm install        # Install dependencies")
        print(f"  npm run dev        # Run development server")
        print(f"  npm test           # Run tests")
    elif (service_dir / "requirements.txt").exists():
        print(f"  pip install -r requirements.txt  # Install dependencies")
        print(f"  python main.py                    # Run server")
        print(f"  pytest tests/                     # Run tests")
    
    print("\n💡 Tip: Use the console menu to run these commands")

def main():
    while True:
        show_menu()
        choice = input("\nEnter your choice: ").strip()
        
        # Validation & Testing
        if choice == '1':
            run_command("bash scripts/validate-for-ubuntu.sh", "Running full validation")
        elif choice == '2':
            run_command("python3 scripts/validation/check_lsp.py", "Checking LSP diagnostics")
        elif choice == '3':
            run_command("python3 scripts/validation/check_packages.py", "Checking packages")
        elif choice == '4':
            run_command("python3 scripts/validation/docker_simulate.py", "Simulating Docker builds")
        elif choice == '5':
            print("\n🧪 Running tests...")
            print("\n📊 Dashboard Tests:")
            subprocess.run("cd services/dashboard && python -m pytest tests/ -v --tb=short || true", shell=True)
            print("\n🤖 Stream Bot Tests:")
            subprocess.run("cd services/stream-bot && npm test 2>/dev/null || echo 'No tests configured'", shell=True)
        
        # Service Management
        elif choice == '6':
            switch_to_service("dashboard")
        elif choice == '7':
            switch_to_service("stream-bot")
        elif choice == '8':
            switch_to_service("discord-bot")
        elif choice == '9':
            run_command("python3 scripts/validation/check_services.py", "Checking service health")
        elif choice == '10':
            run_command("python3 scripts/validation/check_network.py", "Validating network configuration")
        elif choice == '11':
            run_command("python3 scripts/validation/readiness_report.py", "Generating deployment readiness report")
        
        # Logs & Monitoring
        elif choice == '12':
            print("\n📋 Dashboard Logs (press Ctrl+C to exit):")
            subprocess.run("tail -f /tmp/logs/dashboard*.log 2>/dev/null || echo '❌ No dashboard logs found'", shell=True)
        elif choice == '13':
            print("\n📋 Stream Bot Logs (press Ctrl+C to exit):")
            subprocess.run("tail -f /tmp/logs/stream-bot*.log 2>/dev/null || echo '❌ No stream-bot logs found'", shell=True)
        elif choice == '14':
            print("\n📋 All Recent Logs:")
            subprocess.run("ls -lht /tmp/logs/*.log 2>/dev/null | head -20 || echo '❌ No logs found'", shell=True)
            print("\n📋 Recent Errors:")
            subprocess.run("grep -i 'error\\|exception\\|critical' /tmp/logs/*.log 2>/dev/null | tail -20 || echo '✅ No recent errors'", shell=True)
        
        elif choice == '0':
            print("👋 Goodbye!")
            sys.exit(0)
        else:
            print("❌ Invalid choice")
        
        input("\nPress Enter to continue...")

if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")
        sys.exit(0)
