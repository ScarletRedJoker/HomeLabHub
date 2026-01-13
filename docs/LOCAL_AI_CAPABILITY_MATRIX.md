# Local AI Capability Matrix

## Overview

This document defines the complete AI capability requirements for the Nebula Command local AI deployment running on RTX 3060 (12GB VRAM). Models are organized by capability with specific VRAM budgets and quantization recommendations.

## Hardware Constraints

| Resource | Available | Notes |
|----------|-----------|-------|
| GPU | RTX 3060 | 12GB VRAM, CUDA 12.x |
| System RAM | 32GB | Shared with KVM host |
| Storage | 500GB+ | NVMe recommended for models |

## VRAM Budget Strategy

With 12GB VRAM, only one major model can be loaded at a time. Strategy:
1. **Preload models on-demand** - Unload inactive models after timeout
2. **Use quantized versions** - Q4_K_M provides good balance of quality/size
3. **Schedule GPU-intensive tasks** - Avoid concurrent image + LLM inference

---

## Capability 1: Chat & Reasoning

### Primary Models (Pick One Active)

| Model | Params | Quantization | VRAM | Speed | Use Case |
|-------|--------|--------------|------|-------|----------|
| llama3.2:3b | 3B | Q4_K_M | 2.5GB | Fast | Quick responses, mobile |
| llama3.1:8b | 8B | Q4_K_M | 5GB | Medium | General assistant |
| mistral:7b | 7B | Q4_K_M | 4.5GB | Fast | Balanced quality/speed |
| qwen2.5:7b | 7B | Q4_K_M | 5GB | Medium | Multilingual, reasoning |
| deepseek-r1:8b | 8B | Q4_K_M | 5.5GB | Medium | Advanced reasoning, planning |

### Installation Commands
```bash
ollama pull llama3.2:3b
ollama pull llama3.1:8b
ollama pull mistral:7b
ollama pull qwen2.5:7b
ollama pull deepseek-r1:8b
```

---

## Capability 2: Code Generation & Analysis

### Primary Models

| Model | Params | Quantization | VRAM | Use Case |
|-------|--------|--------------|------|----------|
| deepseek-coder-v2:16b | 16B | Q4_K_M | 10GB | Best code quality, large context |
| codellama:13b | 13B | Q4_K_M | 8GB | Good balance |
| qwen2.5-coder:7b | 7B | Q4_K_M | 5GB | Fast, multilingual code |
| starcoder2:7b | 7B | Q4_K_M | 5GB | Fill-in-middle, completions |

### Installation Commands
```bash
ollama pull deepseek-coder-v2:16b
ollama pull codellama:13b
ollama pull qwen2.5-coder:7b
ollama pull starcoder2:7b
```

### Recommended Configuration
- **Primary**: `deepseek-coder-v2:16b` - Best quality for serious development
- **Fallback**: `qwen2.5-coder:7b` - Fast for inline completions
- **Context**: 32K tokens for full file analysis

---

## Capability 3: Embeddings & RAG

### Embedding Models

| Model | Dimensions | VRAM | Use Case |
|-------|------------|------|----------|
| nomic-embed-text | 768 | 0.5GB | Fast, general purpose |
| mxbai-embed-large | 1024 | 1GB | High quality retrieval |
| all-minilm | 384 | 0.3GB | Lightweight, CPU-friendly |

### Installation Commands
```bash
ollama pull nomic-embed-text
ollama pull mxbai-embed-large
ollama pull all-minilm
```

### Usage
- Can run alongside LLMs (low VRAM footprint)
- Use for: code search, documentation indexing, semantic file search

---

## Capability 4: Image Generation

### Stable Diffusion Models

| Model | Type | VRAM | Resolution | Use Case |
|-------|------|------|------------|----------|
| DreamShaper 8 | SD 1.5 | 4GB | 512x512 | General, fast |
| Realistic Vision 6 | SD 1.5 | 4GB | 512x512 | Photorealistic |
| SDXL Base | SDXL | 8GB | 1024x1024 | High quality |
| FLUX.1-dev | FLUX | 10GB+ | Variable | State-of-art |

### Recommended Setup
- **Primary**: DreamShaper 8 - Fast, versatile
- **Quality**: SDXL when time permits
- **Note**: FLUX requires significant VRAM, may conflict with LLMs

### Auto1111 API Configuration
```bash
--api --listen --xformers --opt-sdp-attention
```

---

## Capability 5: Video Generation

### ComfyUI Workflows

| Workflow | Models Required | VRAM | Duration | Use Case |
|----------|-----------------|------|----------|----------|
| AnimateDiff | SD 1.5 + Motion | 6GB | 2-4s clips | Quick animations |
| SVD (Stable Video Diffusion) | SVD-XT | 8GB | 4s clips | Image-to-video |
| CogVideoX | CogVideo | 12GB+ | 6s clips | Text-to-video |

### Required Custom Nodes
- ComfyUI-AnimateDiff-Evolved
- ComfyUI-VideoHelperSuite
- ComfyUI-Manager

### Model Downloads
```
# AnimateDiff
https://huggingface.co/guoyww/animatediff/resolve/main/mm_sd_v15_v2.ckpt

# SVD-XT (higher quality)
https://huggingface.co/stabilityai/stable-video-diffusion-img2vid-xt/resolve/main/svd_xt.safetensors
```

---

## Capability 6: Audio & Speech

### Whisper (Speech-to-Text)

| Model | Size | VRAM | Speed | Accuracy |
|-------|------|------|-------|----------|
| whisper:tiny | 39M | 0.5GB | Very Fast | Basic |
| whisper:base | 74M | 0.8GB | Fast | Good |
| whisper:small | 244M | 1.5GB | Medium | Very Good |
| whisper:medium | 769M | 3GB | Slow | Excellent |

### Installation
```bash
ollama pull whisper:small
```

### Voice Synthesis (TTS)
- **Recommended**: Coqui XTTS-v2 (Docker container)
- **Alternative**: OpenVoice (local voices)

---

## Capability 7: Training & Fine-Tuning

### LoRA Training Requirements

| Component | Requirement |
|-----------|-------------|
| Base Model | LLaMA 3.1 8B or smaller |
| Training Framework | Unsloth or PEFT |
| VRAM | 10GB minimum |
| Dataset Format | JSONL with instruction/response |

### Recommended Tools
1. **Unsloth** - 2x faster LoRA training, fits in 12GB
2. **Text Generation WebUI** - Training tab for simple fine-tuning
3. **LLaMA-Factory** - GUI for training management

### Setup Script
```powershell
# Install Unsloth on Windows
pip install "unsloth[cu121-ampere-torch240] @ git+https://github.com/unslothai/unsloth.git"
```

---

## GPU Scheduling Rules

### Concurrency Matrix

| Active Task | Can Run Concurrently |
|-------------|---------------------|
| Ollama Chat (8B) | Embeddings, Light tasks |
| Ollama Code (16B) | Nothing - uses 10GB |
| SD Image Gen | Nothing - uses 4-8GB |
| ComfyUI Video | Nothing - uses 8-12GB |
| Training | Nothing - exclusive |

### VRAM Thresholds

```yaml
thresholds:
  idle_unload_after: 300  # seconds
  max_concurrent_vram: 10GB  # leave 2GB buffer
  preload_on_boot:
    - llama3.2:3b  # Quick responses
    - nomic-embed-text  # Always-on embeddings
```

---

## Model Storage Layout

```
C:\Users\Evin\
├── .ollama\
│   └── models\          # Ollama model storage (~100GB)
├── stable-diffusion-webui\
│   └── models\
│       ├── Stable-diffusion\  # SD checkpoints
│       ├── Lora\              # LoRA adapters
│       └── VAE\               # VAE models
└── ComfyUI_windows_portable\
    └── ComfyUI\
        └── models\
            ├── checkpoints\
            ├── loras\
            └── animatediff_models\
```

---

## Quick Reference: Model Selection by Task

| Task | Model | VRAM | Command |
|------|-------|------|---------|
| Quick chat | llama3.2:3b | 2.5GB | `ollama run llama3.2:3b` |
| Deep reasoning | deepseek-r1:8b | 5.5GB | `ollama run deepseek-r1:8b` |
| Code generation | deepseek-coder-v2:16b | 10GB | `ollama run deepseek-coder-v2:16b` |
| Fast code assist | qwen2.5-coder:7b | 5GB | `ollama run qwen2.5-coder:7b` |
| Document search | nomic-embed-text | 0.5GB | (via API) |
| Image generation | DreamShaper 8 | 4GB | (SD WebUI API) |
| Video generation | AnimateDiff | 6GB | (ComfyUI API) |
| Transcription | whisper:small | 1.5GB | `ollama run whisper:small` |

---

## Initial Setup Checklist

- [ ] Pull core Ollama models: `llama3.2:3b`, `qwen2.5-coder:7b`, `nomic-embed-text`
- [ ] Download DreamShaper 8 for SD WebUI
- [ ] Install AnimateDiff extension for ComfyUI
- [ ] Configure OLLAMA_HOST=0.0.0.0 for network access
- [ ] Set up Windows Task Scheduler for auto-start
- [ ] Test API endpoints from Linode dashboard

## Scaling to Multi-GPU / Cluster

When adding additional compute:
1. Each node runs its own Ollama/SD instance
2. Register nodes in `node_registry` table with capabilities
3. Job controller routes requests based on VRAM availability
4. Shared model cache via MinIO for fast distribution
