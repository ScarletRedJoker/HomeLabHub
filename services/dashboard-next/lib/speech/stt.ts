/**
 * Speech-to-Text Service
 * Supports local Whisper on Windows VM with cloud fallback (OpenAI Whisper API)
 */

import OpenAI from "openai";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import { extname } from "path";

export type STTModel = "whisper-small" | "whisper-medium" | "whisper-large";

export interface STTOptions {
  language?: string;
  model?: STTModel;
  provider?: "local" | "cloud" | "auto";
  includeTimestamps?: boolean;
}

export interface TranscriptionSegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avgLogprob: number;
  compressionRatio: number;
  noSpeechProb: number;
}

export interface STTResponse {
  text: string;
  language?: string;
  duration?: number;
  provider: string;
  model: string;
  segments?: TranscriptionSegment[];
}

class SpeechToTextService {
  private openaiClient: OpenAI | null = null;
  private windowsVmIp: string;
  private whisperPort: number;

  constructor() {
    this.windowsVmIp = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";
    this.whisperPort = parseInt(process.env.WHISPER_PORT || "8766", 10);
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
      console.log("[STT] OpenAI initialized as fallback provider");
    } else {
      console.log("[STT] No valid OpenAI API key configured - cloud fallback unavailable");
    }
  }

  /**
   * Check if local Whisper service is available on Windows VM
   */
  private async checkLocalWhisperAvailable(): Promise<boolean> {
    try {
      const whisperUrl = `http://${this.windowsVmIp}:${this.whisperPort}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${whisperUrl}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      return response.ok;
    } catch (error) {
      console.log(
        `[STT] Local Whisper service at ${this.windowsVmIp}:${this.whisperPort} not available`
      );
      return false;
    }
  }

  /**
   * Transcribe audio from URL or local file
   */
  async transcribe(
    audioInput: string,
    options: STTOptions = {}
  ): Promise<STTResponse> {
    const {
      language,
      model = "whisper-medium",
      provider = "auto",
      includeTimestamps = false,
    } = options;

    if (!audioInput || audioInput.trim().length === 0) {
      throw new Error("Audio input cannot be empty");
    }

    // Check if input is a URL or file path
    const isUrl = audioInput.startsWith("http://") || audioInput.startsWith("https://");
    const isFile = !isUrl && existsSync(audioInput);

    if (!isUrl && !isFile) {
      throw new Error("Audio input must be a valid URL or file path");
    }

    console.log(
      `[STT] Transcribing audio from ${isUrl ? "URL" : "file"}: ${audioInput.substring(0, 50)}...`
    );

    // Determine which provider to use
    const targetProvider = provider === "auto" ? await this.selectBestProvider() : provider;

    if (targetProvider === "local") {
      try {
        return await this.transcribeLocal(audioInput, {
          language,
          model,
          includeTimestamps,
        });
      } catch (error) {
        console.warn(
          `[STT] Local transcription failed: ${
            error instanceof Error ? error.message : error
          }, falling back to cloud`
        );
        if (this.openaiClient) {
          return this.transcribeOpenAI(audioInput, { language, includeTimestamps });
        }
        throw error;
      }
    }

    // Fall back to OpenAI
    if (this.openaiClient) {
      return this.transcribeOpenAI(audioInput, { language, includeTimestamps });
    }

    throw new Error(
      "No STT provider available. Start local Whisper on Windows VM or add OpenAI API key."
    );
  }

  /**
   * Transcribe using local Whisper service on Windows VM
   */
  private async transcribeLocal(
    audioInput: string,
    options: {
      language?: string;
      model: STTModel;
      includeTimestamps: boolean;
    }
  ): Promise<STTResponse> {
    const whisperUrl = `http://${this.windowsVmIp}:${this.whisperPort}`;

    console.log(`[STT Local] Using ${options.model} at ${whisperUrl}`);

    let audioData: Buffer;
    let contentType = "audio/mp3";

    try {
      // Download audio if URL, otherwise read file
      if (audioInput.startsWith("http://") || audioInput.startsWith("https://")) {
        console.log(`[STT Local] Downloading audio from: ${audioInput.substring(0, 60)}...`);
        const response = await fetch(audioInput);
        if (!response.ok) {
          throw new Error(`Failed to download audio: ${response.statusText}`);
        }
        audioData = Buffer.from(await response.arrayBuffer());
        contentType = response.headers.get("content-type") || "audio/mp3";
      } else {
        console.log(`[STT Local] Reading audio file: ${audioInput}`);
        audioData = await readFile(audioInput);
        const ext = extname(audioInput).toLowerCase();
        contentType = this.getContentType(ext);
      }

      if (!audioData || audioData.length === 0) {
        throw new Error("Audio file is empty");
      }

      console.log(`[STT Local] Audio size: ${audioData.length} bytes`);

      // Create FormData for multipart upload
      const formData = new FormData();
      formData.append(
        "file",
        new Blob([new Uint8Array(audioData)], { type: contentType }),
        "audio.mp3"
      );

      if (options.language) {
        formData.append("language", options.language);
      }

      formData.append("model", this.mapModelToWhisper(options.model));

      if (options.includeTimestamps) {
        formData.append("timestamps", "true");
      }

      const response = await fetch(`${whisperUrl}/transcribe`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Whisper service error (${response.status}): ${errorText}`);
      }

      const result = await response.json() as Record<string, unknown>;

      console.log(
        `[STT Local] Transcription successful: ${(result.text as string)?.substring(0, 50)}...`
      );

      return {
        text: (result.text as string) || "",
        language: (result.language as string) || options.language,
        duration: (result.duration as number) || undefined,
        provider: "local",
        model: options.model,
        segments: (result.segments as TranscriptionSegment[]) || undefined,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes("fetch")) {
        throw new Error(
          `Cannot connect to local Whisper at ${whisperUrl}. Ensure Whisper service is running on Windows VM.`
        );
      }
      throw error;
    }
  }

  /**
   * Transcribe using OpenAI Whisper API (cloud fallback)
   */
  private async transcribeOpenAI(
    audioInput: string,
    options: { language?: string; includeTimestamps: boolean }
  ): Promise<STTResponse> {
    if (!this.openaiClient) {
      throw new Error("OpenAI client not initialized");
    }

    console.log("[STT OpenAI] Transcribing audio using OpenAI Whisper API");

    try {
      let audioBuffer: Buffer;
      let filename = "audio.mp3";

      // Handle URL or file path
      if (audioInput.startsWith("http://") || audioInput.startsWith("https://")) {
        console.log(`[STT OpenAI] Downloading audio from URL`);
        const response = await fetch(audioInput);
        if (!response.ok) {
          throw new Error(`Failed to download audio: ${response.statusText}`);
        }
        audioBuffer = Buffer.from(await response.arrayBuffer());
      } else {
        console.log(`[STT OpenAI] Reading audio file`);
        audioBuffer = await readFile(audioInput);
        filename = audioInput.split("/").pop() || "audio.mp3";
      }

      // Use fs.createReadStream for file-based approach
      const { createReadStream } = require("fs");
      const tempFile = require("path").join("/tmp", `${Date.now()}_${filename}`);
      require("fs").writeFileSync(tempFile, audioBuffer);

      try {
        // Create the transcription request with proper typing
        const transcriptionParams: Record<string, unknown> = {
          file: createReadStream(tempFile),
          model: "whisper-1",
        };

        if (options.language) {
          transcriptionParams.language = options.language;
        }

        if (options.includeTimestamps) {
          transcriptionParams.response_format = "verbose_json";
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const transcription = await (
          this.openaiClient.audio.transcriptions.create as any
        )(transcriptionParams);

        console.log(`[STT OpenAI] Transcription successful`);

        // Handle both regular and verbose JSON responses
        const transcriptionResult = transcription as Record<string, unknown>;
        
        return {
          text: (transcriptionResult.text as string) || "",
          language: (transcriptionResult.language as string) || options.language,
          duration: (transcriptionResult.duration as number) || undefined,
          provider: "openai",
          model: "whisper-1",
          segments: (transcriptionResult.segments as TranscriptionSegment[]) || undefined,
        };
      } finally {
        // Clean up temp file
        try {
          require("fs").unlinkSync(tempFile);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[STT OpenAI] Transcription failed: ${errorMessage}`);

      if (errorMessage.includes("401") || errorMessage.includes("authentication")) {
        throw new Error("OpenAI API key is invalid or expired");
      }

      throw error;
    }
  }

  /**
   * Map our model names to Whisper model identifiers
   */
  private mapModelToWhisper(model: STTModel): string {
    const mapping: Record<STTModel, string> = {
      "whisper-small": "base",
      "whisper-medium": "small",
      "whisper-large": "medium",
    };
    return mapping[model] || "small";
  }

  /**
   * Get content type from file extension
   */
  private getContentType(ext: string): string {
    const types: Record<string, string> = {
      ".mp3": "audio/mpeg",
      ".wav": "audio/wav",
      ".m4a": "audio/mp4",
      ".aac": "audio/aac",
      ".ogg": "audio/ogg",
      ".flac": "audio/flac",
      ".webm": "audio/webm",
    };
    return types[ext.toLowerCase()] || "audio/mpeg";
  }

  /**
   * Select best provider based on availability
   */
  private async selectBestProvider(): Promise<"local" | "cloud"> {
    const localAvailable = await this.checkLocalWhisperAvailable();

    if (localAvailable) {
      console.log("[STT] Auto: Using local Whisper service");
      return "local";
    }

    if (this.openaiClient) {
      console.log("[STT] Auto: Local service unavailable, using OpenAI fallback");
      return "cloud";
    }

    throw new Error("No STT provider available");
  }
}

export default SpeechToTextService;
export { SpeechToTextService };
