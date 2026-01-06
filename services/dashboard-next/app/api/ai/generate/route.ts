import { NextRequest, NextResponse } from "next/server";
import { aiOrchestrator } from "@/lib/ai-orchestrator";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

type GenerationType = "file" | "component" | "api" | "full-project";

interface GenerateRequest {
  description: string;
  type: GenerationType;
  language: string;
  framework?: string;
  additionalContext?: string;
}

const codeGenerationSystemPrompt = `You are an expert code generation AI assistant. Your role is to generate high-quality, production-ready code based on user descriptions.

**CODE GENERATION BEST PRACTICES:**
1. Write clean, readable, and well-structured code
2. Follow the conventions and best practices for the specified language/framework
3. Include proper error handling where appropriate
4. Use meaningful variable and function names
5. Add TypeScript types when generating TypeScript/JavaScript code
6. Include necessary imports at the top of the file
7. Keep code modular and maintainable

**OUTPUT FORMAT:**
Always respond with a JSON object containing:
- "code": The generated code as a string
- "filePath": Suggested file path for the code (e.g., "src/components/Button.tsx")
- "explanation": Brief explanation of what the code does
- "dependencies": Array of any npm/pip packages that need to be installed (if any)

**IMPORTANT:**
- Generate complete, working code - not pseudocode or placeholders
- Match the specified language and framework exactly
- For React components, use functional components with hooks
- For Python, follow PEP 8 style guidelines
- For Node.js/Express, use modern ES6+ syntax`;

const typeSpecificPrompts: Record<GenerationType, string> = {
  file: `Generate a complete, standalone file that implements the described functionality.`,
  component: `Generate a reusable UI component with props interface, proper styling hooks, and clear documentation. Include any necessary sub-components.`,
  api: `Generate a complete API endpoint/route with:
- Request validation
- Error handling with proper status codes
- Response typing
- Any necessary middleware setup`,
  "full-project": `Generate a project structure with multiple files. For each file, provide the complete code. Include:
- Main entry point
- Configuration files
- Core functionality
- Basic documentation in code comments`,
};

const languageHints: Record<string, string> = {
  react: "Use React 18+ with TypeScript, functional components, and hooks. Use Tailwind CSS for styling.",
  python: "Use Python 3.10+ syntax. Follow PEP 8 guidelines. Use type hints.",
  nodejs: "Use Node.js with ES6+ modules. Use async/await for async operations.",
  nextjs: "Use Next.js 14+ App Router patterns. Use server components where appropriate.",
  express: "Use Express.js with TypeScript. Include proper middleware and error handling.",
  flask: "Use Flask with Blueprints for modular code. Include proper error handlers.",
  discord: "Use discord.js v14+ with slash commands. Include proper permission checks.",
};

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: GenerateRequest = await request.json();
    const { description, type, language, framework, additionalContext } = body;

    if (!description || !type || !language) {
      return NextResponse.json(
        { error: "Missing required fields: description, type, language" },
        { status: 400 }
      );
    }

    const typePrompt = typeSpecificPrompts[type] || typeSpecificPrompts.file;
    const langHint = languageHints[language.toLowerCase()] || "";

    const userPrompt = `
**GENERATION TYPE:** ${type}
**LANGUAGE/FRAMEWORK:** ${language}${framework ? ` (${framework})` : ""}

**DESCRIPTION:**
${description}

${additionalContext ? `**ADDITIONAL CONTEXT:**\n${additionalContext}` : ""}

${typePrompt}

${langHint ? `**LANGUAGE-SPECIFIC GUIDELINES:**\n${langHint}` : ""}

Please generate the code and respond with a valid JSON object containing "code", "filePath", "explanation", and "dependencies" fields.`;

    const response = await aiOrchestrator.chat({
      messages: [
        { role: "system", content: codeGenerationSystemPrompt },
        { role: "user", content: userPrompt },
      ],
      config: {
        temperature: 0.3,
        maxTokens: 4000,
      },
    });

    let parsedResponse;
    try {
      const content = response.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedResponse = JSON.parse(jsonMatch[0]);
      } else {
        parsedResponse = {
          code: content,
          filePath: `generated.${getFileExtension(language)}`,
          explanation: "Generated code based on your description",
          dependencies: [],
        };
      }
    } catch {
      parsedResponse = {
        code: response.content,
        filePath: `generated.${getFileExtension(language)}`,
        explanation: "Generated code based on your description",
        dependencies: [],
      };
    }

    return NextResponse.json({
      ...parsedResponse,
      provider: response.provider,
      model: response.model,
      usage: response.usage,
      generationType: type,
      language,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Code generation error:", error);
    return NextResponse.json(
      { error: "Failed to generate code", details: error.message },
      { status: 500 }
    );
  }
}

function getFileExtension(language: string): string {
  const extensions: Record<string, string> = {
    react: "tsx",
    nextjs: "tsx",
    typescript: "ts",
    javascript: "js",
    python: "py",
    nodejs: "js",
    express: "ts",
    flask: "py",
    discord: "ts",
    go: "go",
    rust: "rs",
    java: "java",
    cpp: "cpp",
    c: "c",
  };
  return extensions[language.toLowerCase()] || "txt";
}
