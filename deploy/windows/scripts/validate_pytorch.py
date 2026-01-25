#!/usr/bin/env python3
"""
PyTorch CUDA Validator for Nebula AI Stack
Validates PyTorch installation, CUDA availability, and GPU functionality.
Returns exit codes: 0 for success, 1 for failure
"""

import sys
import subprocess
import json
from typing import Dict, Any, Optional

def get_python_version() -> Dict[str, Any]:
    """Get current Python version info."""
    return {
        "major": sys.version_info.major,
        "minor": sys.version_info.minor,
        "patch": sys.version_info.micro,
        "version": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    }

def check_pytorch() -> Dict[str, Any]:
    """Check if PyTorch is installed and working."""
    result = {
        "installed": False,
        "version": None,
        "cuda_available": False,
        "cuda_version": None,
        "cudnn_version": None,
        "gpu_count": 0,
        "gpus": [],
        "error": None
    }
    
    try:
        import torch
        result["installed"] = True
        result["version"] = torch.__version__
        result["cuda_available"] = torch.cuda.is_available()
        
        if result["cuda_available"]:
            result["cuda_version"] = torch.version.cuda
            try:
                result["cudnn_version"] = str(torch.backends.cudnn.version())
            except:
                pass
            result["gpu_count"] = torch.cuda.device_count()
            
            for i in range(result["gpu_count"]):
                props = torch.cuda.get_device_properties(i)
                gpu_info = {
                    "index": i,
                    "name": torch.cuda.get_device_name(i),
                    "total_memory_mb": props.total_memory // (1024 * 1024),
                    "major": props.major,
                    "minor": props.minor,
                    "multi_processor_count": props.multi_processor_count
                }
                result["gpus"].append(gpu_info)
                
            try:
                tensor = torch.zeros(1).cuda()
                del tensor
                result["cuda_functional"] = True
            except Exception as e:
                result["cuda_functional"] = False
                result["cuda_error"] = str(e)
        else:
            result["cuda_functional"] = False
            
    except ImportError as e:
        result["error"] = f"PyTorch not installed: {e}"
    except Exception as e:
        result["error"] = f"Error checking PyTorch: {e}"
    
    return result

def validate_environment() -> Dict[str, Any]:
    """Validate the complete AI environment."""
    python_info = get_python_version()
    pytorch_info = check_pytorch()
    
    valid_python = (
        python_info["major"] == 3 and 
        10 <= python_info["minor"] <= 12
    )
    
    valid_pytorch = (
        pytorch_info["installed"] and 
        pytorch_info["cuda_available"] and 
        pytorch_info.get("cuda_functional", False)
    )
    
    return {
        "python": python_info,
        "python_valid": valid_python,
        "pytorch": pytorch_info,
        "pytorch_valid": valid_pytorch,
        "overall_valid": valid_python and valid_pytorch
    }

def repair_pytorch(cuda_version: str = "cu121") -> bool:
    """Reinstall PyTorch with proper CUDA support."""
    print(f"\n[REPAIR] Reinstalling PyTorch with CUDA {cuda_version}...")
    
    cuda_wheel_urls = {
        "cu118": "https://download.pytorch.org/whl/cu118",
        "cu121": "https://download.pytorch.org/whl/cu121",
        "cu124": "https://download.pytorch.org/whl/cu124"
    }
    
    wheel_url = cuda_wheel_urls.get(cuda_version, cuda_wheel_urls["cu121"])
    
    try:
        subprocess.run(
            [sys.executable, "-m", "pip", "uninstall", "-y", "torch", "torchvision", "torchaudio"],
            capture_output=True,
            check=False
        )
        
        result = subprocess.run(
            [
                sys.executable, "-m", "pip", "install",
                "torch", "torchvision", "torchaudio",
                "--index-url", wheel_url
            ],
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            print(f"[OK] PyTorch reinstalled with CUDA from {wheel_url}")
            return True
        else:
            print(f"[ERROR] Failed to install PyTorch: {result.stderr}")
            return False
            
    except Exception as e:
        print(f"[ERROR] Repair failed: {e}")
        return False

def print_status(info: Dict[str, Any]) -> None:
    """Print formatted status to console."""
    py = info["python"]
    pt = info["pytorch"]
    
    print("\n" + "=" * 50)
    print("  Nebula AI Stack - PyTorch Validator")
    print("=" * 50)
    
    py_status = "[OK]" if info["python_valid"] else "[FAIL]"
    print(f"\n{py_status} Python: {py['version']}")
    if not info["python_valid"]:
        print("    Required: Python 3.10 - 3.12")
        if py["minor"] >= 14:
            print("    Warning: Python 3.14+ is NOT supported by most AI frameworks")
    
    if pt["installed"]:
        pt_status = "[OK]" if info["pytorch_valid"] else "[WARN]"
        print(f"\n{pt_status} PyTorch: {pt['version']}")
        
        if pt["cuda_available"]:
            print(f"    CUDA Version: {pt['cuda_version']}")
            print(f"    cuDNN Version: {pt['cudnn_version']}")
            print(f"    GPU Count: {pt['gpu_count']}")
            
            for gpu in pt.get("gpus", []):
                print(f"\n    GPU {gpu['index']}: {gpu['name']}")
                print(f"        Memory: {gpu['total_memory_mb']} MB")
                print(f"        Compute Capability: {gpu['major']}.{gpu['minor']}")
                
            if pt.get("cuda_functional"):
                print("\n    [OK] CUDA tensors working correctly")
            else:
                print(f"\n    [FAIL] CUDA tensor test failed: {pt.get('cuda_error', 'Unknown error')}")
        else:
            print("    [WARN] CUDA not available - GPU acceleration disabled")
    else:
        print(f"\n[FAIL] PyTorch: Not installed")
        if pt["error"]:
            print(f"    Error: {pt['error']}")
    
    print("\n" + "-" * 50)
    overall = "[OK] Environment Valid" if info["overall_valid"] else "[FAIL] Environment Needs Repair"
    print(f"  {overall}")
    print("-" * 50 + "\n")

def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="PyTorch CUDA Validator")
    parser.add_argument("--json", action="store_true", help="Output JSON instead of formatted text")
    parser.add_argument("--repair", action="store_true", help="Attempt to repair PyTorch installation")
    parser.add_argument("--cuda", default="cu121", choices=["cu118", "cu121", "cu124"],
                       help="CUDA version for repair (default: cu121)")
    parser.add_argument("--quiet", action="store_true", help="Only return exit code, no output")
    
    args = parser.parse_args()
    
    if args.repair:
        success = repair_pytorch(args.cuda)
        if success:
            info = validate_environment()
            if not args.quiet:
                if args.json:
                    print(json.dumps(info, indent=2))
                else:
                    print_status(info)
            sys.exit(0 if info["overall_valid"] else 1)
        else:
            sys.exit(1)
    
    info = validate_environment()
    
    if args.quiet:
        sys.exit(0 if info["overall_valid"] else 1)
    
    if args.json:
        print(json.dumps(info, indent=2))
    else:
        print_status(info)
    
    sys.exit(0 if info["overall_valid"] else 1)

if __name__ == "__main__":
    main()
