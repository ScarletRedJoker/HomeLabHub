import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import OpenAI from "openai";

export const dynamic = "force-dynamic";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

function getOpenAIClient(): OpenAI | null {
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

  return NextResponse.json({
    speechToText: {
      providers: [
        {
          id: "browser",
          name: "Browser Web Speech API",
          description: "Free, local, privacy-focused. Uses your browser's built-in speech recognition.",
          available: true,
          free: true,
          local: true,
        },
        {
          id: "openai",
          name: "OpenAI Whisper",
          description: "Cloud-based, highly accurate, supports many languages",
          available: openai !== null,
          free: false,
          local: false,
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
        },
        {
          id: "openai",
          name: "OpenAI TTS",
          description: "High-quality neural voices",
          available: openai !== null,
          free: false,
          local: false,
          voices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
        },
      ],
      defaultProvider: "browser",
    },
    capabilities: [
      "Speech-to-text transcription (local browser or cloud)",
      "Text-to-speech synthesis (local browser or cloud)", 
      "Real-time voice input for AI chat",
      "Voice output for AI responses",
    ],
  });
}
