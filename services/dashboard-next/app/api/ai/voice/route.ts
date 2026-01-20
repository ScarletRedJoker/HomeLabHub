import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

// LOCAL_AI_ONLY mode: When true, NEVER use cloud AI providers
const LOCAL_AI_ONLY = process.env.LOCAL_AI_ONLY !== "false";
const WINDOWS_VM_IP = process.env.WINDOWS_VM_TAILSCALE_IP || "100.118.44.102";

const LOCAL_AI_TROUBLESHOOTING = [
  `1. Check if Windows VM is powered on`,
  `2. Verify Tailscale connection: ping ${WINDOWS_VM_IP}`,
  `3. Start Ollama: 'ollama serve' in Windows terminal`,
  `4. Check Windows Firewall allows port 11434`,
  `5. Test: curl http://${WINDOWS_VM_IP}:11434/api/tags`,
];

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

function getOpenAIClient(): OpenAI | null {
  // In LOCAL_AI_ONLY mode, never return OpenAI client
  if (LOCAL_AI_ONLY) {
    return null;
  }
  
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const integrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  const directKey = process.env.OPENAI_API_KEY;
  // Skip dummy/placeholder keys
  const apiKey = (integrationKey && integrationKey.startsWith('sk-')) ? integrationKey : directKey;
  const projectId = process.env.OPENAI_PROJECT_ID;

  if (apiKey && apiKey.startsWith('sk-')) {
    return new OpenAI({
      baseURL: baseURL || undefined,
      apiKey: apiKey.trim(),
      ...(projectId && { project: projectId.trim() }),
    });
  }
  return null;
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const action = formData.get("action") as string;

    if (action === "transcribe") {
      const audioFile = formData.get("audio") as File;
      const provider = formData.get("provider") as string || "openai";
      
      if (!audioFile) {
        return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
      }

      if (provider === "openai") {
        // LOCAL_AI_ONLY MODE: Reject OpenAI provider
        if (LOCAL_AI_ONLY) {
          return NextResponse.json({ 
            error: "Cloud AI providers are disabled in local-only mode",
            errorCode: "LOCAL_AI_ONLY_VIOLATION",
            localAIOnly: true,
            details: "Use browser-based speech recognition instead.",
            fallback: "browser"
          }, { status: 400 });
        }
        
        const openai = getOpenAIClient();
        if (!openai) {
          return NextResponse.json({ 
            error: "OpenAI not configured. Use browser-based speech recognition for free local transcription.",
            fallback: "browser"
          }, { status: 400 });
        }

        const transcription = await openai.audio.transcriptions.create({
          file: audioFile,
          model: "whisper-1",
          response_format: "json",
        });

        return NextResponse.json({
          success: true,
          text: transcription.text,
          provider: "openai",
          model: "whisper-1",
        });
      }

      return NextResponse.json({ 
        success: true,
        text: "",
        provider: "browser",
        note: "Use browser Web Speech API for free local transcription"
      });
    }

    if (action === "synthesize") {
      const text = formData.get("text") as string;
      const voice = formData.get("voice") as string || "alloy";
      const provider = formData.get("provider") as string || "browser";

      if (!text) {
        return NextResponse.json({ error: "Text is required" }, { status: 400 });
      }

      if (provider === "openai") {
        // LOCAL_AI_ONLY MODE: Reject OpenAI provider
        if (LOCAL_AI_ONLY) {
          return NextResponse.json({ 
            error: "Cloud AI providers are disabled in local-only mode",
            errorCode: "LOCAL_AI_ONLY_VIOLATION",
            localAIOnly: true,
            details: "Use browser SpeechSynthesis instead.",
            fallback: "browser"
          }, { status: 400 });
        }
        
        const openai = getOpenAIClient();
        if (!openai) {
          return NextResponse.json({ 
            error: "OpenAI not configured. Use browser SpeechSynthesis for free local TTS.",
            fallback: "browser"
          }, { status: 400 });
        }

        const mp3Response = await openai.audio.speech.create({
          model: "tts-1",
          voice: voice as "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer",
          input: text,
        });

        const audioBuffer = await mp3Response.arrayBuffer();
        const base64Audio = Buffer.from(audioBuffer).toString("base64");

        return NextResponse.json({
          success: true,
          audio: base64Audio,
          format: "mp3",
          provider: "openai",
          model: "tts-1",
        });
      }

      return NextResponse.json({
        success: true,
        provider: "browser",
        note: "Use browser SpeechSynthesis API for free local TTS",
        text,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("Voice API error:", error);
    return NextResponse.json(
      { error: "Voice processing failed", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const openai = getOpenAIClient();
  const openaiAvailable = !LOCAL_AI_ONLY && openai !== null;

  return NextResponse.json({
    localAIOnly: LOCAL_AI_ONLY,
    speechToText: {
      providers: [
        {
          id: "browser",
          name: "Browser Web Speech API",
          description: "Free, local, privacy-focused. Uses your browser's built-in speech recognition.",
          available: true,
          free: true,
          local: true,
          recommended: LOCAL_AI_ONLY,
        },
        {
          id: "openai",
          name: "OpenAI Whisper",
          description: LOCAL_AI_ONLY 
            ? "Disabled - LOCAL_AI_ONLY mode active"
            : "Cloud-based, highly accurate, supports many languages",
          available: openaiAvailable,
          free: false,
          local: false,
          disabled: LOCAL_AI_ONLY,
        },
      ],
      defaultProvider: "browser",
    },
    textToSpeech: {
      providers: [
        {
          id: "browser",
          name: "Browser SpeechSynthesis",
          description: "Free, local, works offline. Quality varies by browser/OS.",
          available: true,
          free: true,
          local: true,
          voices: ["default"],
          recommended: LOCAL_AI_ONLY,
        },
        {
          id: "openai",
          name: "OpenAI TTS",
          description: LOCAL_AI_ONLY 
            ? "Disabled - LOCAL_AI_ONLY mode active"
            : "High-quality neural voices",
          available: openaiAvailable,
          free: false,
          local: false,
          voices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
          disabled: LOCAL_AI_ONLY,
        },
      ],
      defaultProvider: "browser",
    },
    capabilities: LOCAL_AI_ONLY ? [
      "Speech-to-text transcription (browser only)",
      "Text-to-speech synthesis (browser only)", 
      "Real-time voice input for AI chat",
      "Voice output for AI responses",
    ] : [
      "Speech-to-text transcription (local browser or cloud)",
      "Text-to-speech synthesis (local browser or cloud)", 
      "Real-time voice input for AI chat",
      "Voice output for AI responses",
    ],
  });
}
