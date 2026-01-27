/**
 * Text-to-Speech Service
 * Supports local Windows node (XTTS, Piper) via HTTP API with fallback to cloud (OpenAI TTS)
 */

import OpenAI from "openai";

export type TTSModel = "xtts" | "piper" | "edge-tts" | "openai";
export type TTSVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer" | string;

export interface TTSOptions {
  voice?: TTSVoice;
  language?: string;
  speed?: number;
  model?: TTSModel;
  provider?: "local" | "cloud" | "auto";
}

export interface TTSResponse {
  audioUrl?: string;
  audioBuffer?: Buffer;
  provider: string;
  model: string;
  durationMs?: number;
}

class TextToSpeechService {
  private openaiClient: OpenAI | null = null;
  private windowsVmIp: string;
  private ttsPort: number;
  private cacheDir: string;

  constructor() {
    this.windowsVmIp = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
    this.ttsPort = parseInt(process.env.TTS_PORT || "8767", 10);
    this.cacheDir = process.env.TTS_CACHE_DIR || "/tmp/tts-cache";
    this.initOpenAI();
  }

  private initOpenAI(): void {
    const integrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    const directKey = process.env.OPENAI_API_KEY;
    // Skip dummy/placeholder keys
    const apiKey = (integrationKey && integrationKey.startsWith('sk-')) ? integrationKey : directKey;
    const projectId = process.env.OPENAI_PROJECT_ID;
    if (apiKey && apiKey.startsWith("sk-")) {
      this.openaiClient = new OpenAI({
        apiKey: apiKey.trim(),
        ...(projectId && { project: projectId.trim() }),
      });
      const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build' || 
                          (!process.env.DATABASE_URL && process.env.NODE_ENV === 'production');
      if (!isBuildTime) {
        console.log("[TTS] OpenAI initialized as fallback provider");
      }
    } else {
      const isBuildTime = process.env.NEXT_PHASE === 'phase-production-build' || 
                          (!process.env.DATABASE_URL && process.env.NODE_ENV === 'production');
      if (!isBuildTime) {
        console.log("[TTS] No valid OpenAI API key configured - cloud fallback unavailable");
      }
    }
  }

  /**
   * Check if local TTS service is available on Windows VM
   */
  private async checkLocalTTSAvailable(model: TTSModel): Promise<boolean> {
    if (model === "openai") return false;

    try {
      const ttsUrl = `http://${this.windowsVmIp}:${this.ttsPort}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${ttsUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      return response.ok;
    } catch (error) {
      console.log(
        `[TTS] Local TTS service at ${this.windowsVmIp}:${this.ttsPort} not available`
      );
      return false;
    }
  }

  /**
   * Synthesize text to speech
   */
  async synthesize(text: string, options: TTSOptions = {}): Promise<TTSResponse> {
    const {
      voice = "nova",
      language = "en",
      speed = 1.0,
      model = "piper",
      provider = "auto",
    } = options;

    if (!text || text.trim().length === 0) {
      throw new Error("Text cannot be empty");
    }

    if (speed < 0.25 || speed > 4.0) {
      throw new Error("Speed must be between 0.25 and 4.0");
    }

    // Determine which provider to use
    const targetProvider =
      provider === "auto" ? await this.selectBestProvider(model) : provider;

    if (targetProvider === "local") {
      try {
        return await this.synthesizeLocal(text, {
          voice,
          language,
          speed,
          model,
        });
      } catch (error) {
        console.warn(
          `[TTS] Local synthesis failed: ${error instanceof Error ? error.message : error}, falling back to cloud`
        );
        if (this.openaiClient) {
          return this.synthesizeOpenAI(text, { voice, speed });
        }
        throw error;
      }
    }

    // Fall back to OpenAI
    if (this.openaiClient) {
      return this.synthesizeOpenAI(text, { voice, speed });
    }

    throw new Error(
      "No TTS provider available. Start local TTS service on Windows VM or add OpenAI API key."
    );
  }

  /**
   * Synthesize using local service on Windows VM
   */
  private async synthesizeLocal(
    text: string,
    options: {
      voice: TTSVoice;
      language: string;
      speed: number;
      model: TTSModel;
    }
  ): Promise<TTSResponse> {
    const ttsUrl = `http://${this.windowsVmIp}:${this.ttsPort}`;

    console.log(`[TTS Local] Using ${options.model} at ${ttsUrl}`);
    console.log(
      `[TTS Local] Text: "${text.substring(0, 50)}${text.length > 50 ? "..." : ""}"`
    );

    let endpoint = "";
    let payload: Record<string, unknown> = {
      text,
      language: options.language,
      speed: options.speed,
    };

    switch (options.model) {
      case "xtts":
        endpoint = "/tts/xtts";
        payload.speaker = options.voice || "default";
        break;
      case "piper":
        endpoint = "/tts/piper";
        payload.voice = options.voice || "en_US-amy-medium";
        break;
      case "edge-tts":
        endpoint = "/tts/edge";
        payload.voice_name = options.voice || "en-US-AriaNeural";
        break;
      default:
        throw new Error(`Unsupported local model: ${options.model}`);
    }

    try {
      const response = await fetch(`${ttsUrl}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`TTS service error (${response.status}): ${errorText}`);
      }

      const audioBuffer = await response.arrayBuffer();

      if (!audioBuffer || audioBuffer.byteLength === 0) {
        throw new Error("Received empty audio from local TTS service");
      }

      const buffer = Buffer.from(audioBuffer);
      const durationMs = this.estimateAudioDuration(buffer);

      console.log(
        `[TTS Local] Successfully synthesized ${buffer.length} bytes (est. ${durationMs}ms)`
      );

      return {
        audioBuffer: buffer,
        provider: "local",
        model: options.model,
        durationMs,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes("fetch")) {
        throw new Error(
          `Cannot connect to local TTS at ${ttsUrl}. Ensure TTS service is running on Windows VM.`
        );
      }
      throw error;
    }
  }

  /**
   * Synthesize using OpenAI TTS API (cloud fallback)
   */
  private async synthesizeOpenAI(
    text: string,
    options: { voice: TTSVoice; speed: number }
  ): Promise<TTSResponse> {
    if (!this.openaiClient) {
      throw new Error("OpenAI client not initialized");
    }

    const voice = (
      ["alloy", "echo", "fable", "onyx", "nova", "shimmer"].includes(
        String(options.voice)
      )
        ? options.voice
        : "nova"
    ) as TTSVoice;

    console.log(`[TTS OpenAI] Synthesizing with voice: ${voice}`);

    try {
      const response = await this.openaiClient.audio.speech.create({
        model: "tts-1-hd",
        voice: voice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer",
        input: text,
        speed: options.speed,
      });

      const audioBuffer = Buffer.from(await response.arrayBuffer());
      const durationMs = this.estimateAudioDuration(audioBuffer);

      console.log(`[TTS OpenAI] Successfully synthesized ${audioBuffer.length} bytes`);

      return {
        audioBuffer,
        provider: "openai",
        model: "tts-1-hd",
        durationMs,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[TTS OpenAI] Synthesis failed: ${errorMessage}`);

      if (errorMessage.includes("401") || errorMessage.includes("authentication")) {
        throw new Error("OpenAI API key is invalid or expired");
      }

      throw error;
    }
  }

  /**
   * Estimate audio duration from MP3 buffer (rough estimation)
   * Real duration can only be determined by decoding the audio
   */
  private estimateAudioDuration(buffer: Buffer): number {
    // For MP3: estimate ~128 kbps bitrate average
    // For WAV: check header or estimate similarly
    // This is a rough estimate - actual duration requires audio decoding

    if (buffer.length < 100) return 0;

    // Check for MP3 frame header (0xFF 0xFB or 0xFF 0xFA)
    if (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
      // MP3 detected - estimate with 128 kbps average
      return Math.round((buffer.length * 8) / (128 * 1000));
    }

    // WAV file - check sample rate from header
    if (
      buffer.length > 36 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WAVE"
    ) {
      const sampleRate = buffer.readUInt32LE(24);
      const byteRate = buffer.readUInt32LE(28);
      if (byteRate > 0) {
        const dataSize = buffer.length - 44; // Approximate
        return Math.round((dataSize / byteRate) * 1000);
      }
    }

    // Fallback estimate
    return Math.round((buffer.length * 8) / (128 * 1000));
  }

  /**
   * Select best provider based on availability
   */
  private async selectBestProvider(model: TTSModel): Promise<"local" | "cloud"> {
    const localAvailable = await this.checkLocalTTSAvailable(model);

    if (localAvailable) {
      console.log(`[TTS] Auto: Using local ${model} service`);
      return "local";
    }

    if (this.openaiClient) {
      console.log("[TTS] Auto: Local service unavailable, using OpenAI fallback");
      return "cloud";
    }

    throw new Error("No TTS provider available");
  }

  /**
   * Save audio buffer to file for storage
   */
  saveAudioFile(buffer: Buffer, filename: string): string {
    const fs = require("fs");
    const path = require("path");

    const dir = this.cacheDir;
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const filepath = path.join(dir, filename);
    fs.writeFileSync(filepath, buffer);
    return filepath;
  }
}

export default TextToSpeechService;
export { TextToSpeechService };
