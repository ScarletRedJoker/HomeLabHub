# Windows VM Local AI Setup Guide

This guide covers setting up local AI services (Stable Diffusion, ComfyUI, Ollama) on your Windows VM for GPU-accelerated image/video generation accessible from the Nebula Command dashboard.

## Prerequisites

- Windows 10/11 with NVIDIA GPU (RTX 3060 or better recommended)
- Tailscale installed and connected (your VM should have IP: 100.118.44.102)
- Python 3.10.x installed (3.10 is required for best compatibility)
- At least 16GB RAM, 50GB+ free disk space

## 1. GPU Drivers & CUDA Setup

### Install NVIDIA Drivers
1. Download latest Game Ready or Studio drivers from [nvidia.com/drivers](https://www.nvidia.com/drivers)
2. Install with "Clean Installation" option checked
3. Reboot after installation

### Verify GPU Works
```powershell
nvidia-smi
```
Should show your GPU model, driver version, and CUDA version (12.x recommended).

## 2. Python Environment Setup

### Install Python 3.10 (if not installed)
1. Download from [python.org](https://www.python.org/downloads/release/python-31011/)
2. Install with "Add Python to PATH" checked
3. Verify: `python --version` should show 3.10.x

### Create Virtual Environment
```powershell
cd C:\Users\Evin\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup
mkdir ai-services
cd ai-services
python -m venv venv
.\venv\Scripts\activate
```

## 3. PyTorch Installation (CUDA 12.1)

With your venv activated:

```powershell
# Install PyTorch with CUDA 12.1 support
pip install torch==2.1.2+cu121 torchvision==0.16.2+cu121 torchaudio==2.1.2+cu121 --index-url https://download.pytorch.org/whl/cu121

# Install xformers for memory-efficient attention (optional but recommended)
pip install xformers==0.0.23.post1 --index-url https://download.pytorch.org/whl/cu121
```

### Verify PyTorch + CUDA
```powershell
python -c "import torch; print(f'PyTorch: {torch.__version__}'); print(f'CUDA available: {torch.cuda.is_available()}'); print(f'GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"None\"}')"
```

## 4. Stable Diffusion WebUI (AUTOMATIC1111)

### Installation
```powershell
cd C:\
git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui.git
cd stable-diffusion-webui
```

### Configure for Network Access
Edit `webui-user.bat` and set:
```batch
set COMMANDLINE_ARGS=--api --listen --enable-insecure-extension-access --xformers
```

The `--listen` flag makes it accessible from other machines on Tailscale.
The `--api` flag enables the REST API for dashboard integration.

### First Run
```powershell
.\webui-user.bat
```
This will download required models and dependencies (may take 10-30 minutes).

### Download Models
Place model files (`.safetensors`) in `C:\stable-diffusion-webui\models\Stable-diffusion\`

Recommended starter models:
- [DreamShaper 8](https://civitai.com/models/4384) - General purpose
- [SDXL Base](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0) - High quality
- [Realistic Vision](https://civitai.com/models/4201) - Photorealistic

### Verify Access
Once running, you should be able to access:
- Local: http://localhost:7860
- From Linode: http://100.118.44.102:7860

## 5. ComfyUI Installation (Portable Version)

### Download & Extract
1. Go to [ComfyUI Releases](https://github.com/comfyanonymous/ComfyUI/releases)
2. Download the latest `ComfyUI_windows_portable_nvidia.7z`
3. Extract to `C:\Users\Evin\Documents\ComfyUI_windows_portable`

Your folder structure should be:
```
C:\Users\Evin\Documents\ComfyUI_windows_portable\
├── ComfyUI\
├── python_embeded\
├── run_nvidia_gpu.bat
└── ...
```

### Configure for Network Access
Create a startup script `start_comfyui_network.bat` in the ComfyUI_windows_portable folder:
```batch
@echo off
cd /d C:\Users\Evin\Documents\ComfyUI_windows_portable
.\python_embeded\python.exe -s ComfyUI\main.py --listen 0.0.0.0 --port 8188
```

### Install Video Generation Extensions
For AnimateDiff video generation:
```powershell
cd C:\Users\Evin\Documents\ComfyUI_windows_portable\ComfyUI\custom_nodes
git clone https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved.git
git clone https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git
```

Download AnimateDiff models to `ComfyUI_windows_portable\ComfyUI\custom_nodes\ComfyUI-AnimateDiff-Evolved\models\`:
- [mm_sd_v15_v2.ckpt](https://huggingface.co/guoyww/animatediff/resolve/main/mm_sd_v15_v2.ckpt)

### Verify Access
- Local: http://localhost:8188
- From Linode: http://100.118.44.102:8188

## 6. Ollama Installation

### Installation
1. Download from [ollama.ai/download](https://ollama.ai/download)
2. Run the installer
3. Ollama will start automatically as a service

### Pull Models
```powershell
ollama pull llama3.2
ollama pull mistral
ollama pull codellama
```

### Configure Network Access
By default Ollama only listens on localhost. To allow Tailscale access:

1. Create/edit environment variable:
   - Open System Properties → Environment Variables
   - Add System variable: `OLLAMA_HOST=0.0.0.0:11434`

2. Restart Ollama service:
```powershell
Stop-Service "Ollama"
Start-Service "Ollama"
```

Or add to Ollama startup: Set `OLLAMA_HOST=0.0.0.0` before running.

### Verify Access
```powershell
curl http://100.118.44.102:11434/api/version
```

## 7. Auto-Start Configuration

### Option A: Windows Task Scheduler (Recommended)
Create scheduled tasks to start services at logon:

1. Open Task Scheduler
2. Create Task (not Basic Task)
3. General: Run whether user is logged on or not
4. Trigger: At startup
5. Action: Start a program

For Stable Diffusion:
- Program: `C:\stable-diffusion-webui\webui-user.bat`
- Start in: `C:\stable-diffusion-webui`

For ComfyUI:
- Program: `C:\Users\Evin\Documents\ComfyUI_windows_portable\start_comfyui_network.bat`
- Start in: `C:\Users\Evin\Documents\ComfyUI_windows_portable`

### Option B: Startup Folder
Place shortcuts in:
```
C:\Users\Evin\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup
```

## 8. Firewall Configuration

Open Windows Firewall for these ports:

```powershell
# Stable Diffusion WebUI
netsh advfirewall firewall add rule name="Stable Diffusion API" dir=in action=allow protocol=tcp localport=7860

# ComfyUI
netsh advfirewall firewall add rule name="ComfyUI API" dir=in action=allow protocol=tcp localport=8188

# Ollama
netsh advfirewall firewall add rule name="Ollama API" dir=in action=allow protocol=tcp localport=11434
```

## 9. Verify Dashboard Integration

Once all services are running, check the dashboard:

1. Go to Settings → AI Services
2. Check "Local AI Status" section
3. All three services should show as "Online":
   - Ollama: http://100.118.44.102:11434 ✓
   - Stable Diffusion: http://100.118.44.102:7860 ✓
   - ComfyUI: http://100.118.44.102:8188 ✓

### Test Image Generation
1. Go to Creative Studio → Image Generator
2. Select "Auto (Local First)" or "Stable Diffusion (Local GPU)"
3. Enter a prompt and generate

## Troubleshooting

### "CUDA out of memory"
- Close other GPU-intensive applications
- Add `--lowvram` or `--medvram` to SD WebUI COMMANDLINE_ARGS
- Reduce image resolution

### "Cannot connect to service"
1. Verify service is running (check Task Manager)
2. Check firewall rules
3. Verify Tailscale connection: `tailscale status`
4. Test local access first: http://localhost:7860

### PyTorch/xformers Version Conflicts
```powershell
# Clean reinstall
pip uninstall torch torchvision torchaudio xformers -y
pip install torch==2.1.2+cu121 torchvision==0.16.2+cu121 torchaudio==2.1.2+cu121 --index-url https://download.pytorch.org/whl/cu121
pip install xformers==0.0.23.post1 --index-url https://download.pytorch.org/whl/cu121
```

### Stable Diffusion Won't Start
- Check Python version (must be 3.10.x)
- Delete `venv` folder and let webui-user.bat recreate it
- Check for GPU driver updates

### Dashboard Can't Reach Services
1. On Windows VM, run: `netstat -an | findstr "LISTENING"`
2. Verify services are listening on 0.0.0.0 (not 127.0.0.1)
3. Check Tailscale is running on both ends

## Service URLs Reference

| Service | Local URL | Tailscale URL | Health Check |
|---------|-----------|---------------|--------------|
| Ollama | http://localhost:11434 | http://100.118.44.102:11434 | /api/version |
| SD WebUI | http://localhost:7860 | http://100.118.44.102:7860 | /sdapi/v1/options |
| ComfyUI | http://localhost:8188 | http://100.118.44.102:8188 | /system_stats |

## Complete Quick Start

After full setup, your Windows VM should:
1. Auto-start Stable Diffusion, ComfyUI, and Ollama on boot
2. Accept connections from Tailscale network
3. Be accessible from dashboard for image/video generation
4. Appear as "Online" in dashboard AI status panel

The dashboard will automatically:
- Prefer local GPU for image generation (faster, no cost, unrestricted)
- Fall back to DALL-E 3 if local services are offline
- Use Ollama for chat when available, OpenAI as fallback
