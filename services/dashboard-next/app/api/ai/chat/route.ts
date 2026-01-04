import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

function getOpenAIClient() {
  const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  
  if (baseURL && apiKey) {
    return new OpenAI({ baseURL, apiKey });
  }
  
  const directKey = process.env.OPENAI_API_KEY;
  if (directKey) {
    return new OpenAI({ apiKey: directKey });
  }
  
  throw new Error("OpenAI not configured");
}

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

const systemPrompt = `You are Jarvis, an AI assistant for HomeLabHub - a comprehensive homelab management platform.

**YOUR ROLE:**
You help users manage their homelab by providing information, suggestions, and actionable commands.

**SERVICES OVERVIEW:**
- Linode Server: Discord Bot (port 4000), Stream Bot (port 3000), Dashboard, PostgreSQL, Redis, Caddy
- Home Server: Plex (port 32400), Home Assistant (port 8123), MinIO, Tailscale

**WHAT YOU CAN HELP WITH:**
1. Explain how to check container status (user goes to Services page)
2. Explain how to deploy (user goes to Deploy page or clicks Quick Actions)
3. Explain how to check server metrics (user goes to Servers page)
4. Generate code and debug issues
5. Answer questions about homelab setup and configuration
6. Provide Docker commands, SSH commands, and configuration help

**GUIDELINES:**
1. Be helpful and concise
2. Use markdown for formatting
3. When users ask about status, guide them to the appropriate dashboard page
4. For complex operations, explain the steps
5. Never include raw action tags or executable commands in your response - just explain what to do

**EXAMPLE RESPONSES:**
- "To check your containers, go to the **Services** page where you'll see all Docker containers with their status."
- "To deploy to Linode, use the **Quick Actions** on the dashboard or go to the **Deploy** page."
- "Server metrics are available on the **Servers** page with real-time CPU, RAM, and disk usage."

You're a knowledgeable assistant focused on helping users understand and manage their homelab!`;

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { message, history = [] } = await request.json();

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    const openai = getOpenAIClient();
    
    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...history.slice(-10).map((m: any) => ({ role: m.role, content: m.content })),
      { role: "user", content: message },
    ];

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages,
      temperature: 0.7,
      max_tokens: 2000,
    });

    let responseContent = completion.choices[0]?.message?.content || "";

    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const codeBlocks: { language: string; code: string }[] = [];
    let match;

    while ((match = codeBlockRegex.exec(responseContent)) !== null) {
      codeBlocks.push({
        language: match[1] || "plaintext",
        code: match[2].trim(),
      });
    }

    return NextResponse.json({
      response: responseContent,
      codeBlocks: codeBlocks.length > 0 ? codeBlocks : undefined,
    });
  } catch (error: any) {
    console.error("AI Chat error:", error);
    return NextResponse.json(
      { error: "Failed to process request", details: error.message },
      { status: 500 }
    );
  }
}
