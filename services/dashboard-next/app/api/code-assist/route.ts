import { NextResponse } from "next/server";
import OpenAI from "openai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) {
    const integrationKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
    const directKey = process.env.OPENAI_API_KEY;
    const apiKey = (integrationKey && integrationKey.startsWith('sk-')) ? integrationKey : directKey;
    const projectId = process.env.OPENAI_PROJECT_ID;
    
    openai = new OpenAI({
      apiKey: apiKey?.trim(),
      ...(projectId && { project: projectId.trim() }),
    });
  }
  return openai;
}

type AssistMode = "refactor" | "explain" | "debug" | "optimize" | "document" | "convert" | "suggest";

interface AssistRequest {
  code: string;
  mode: AssistMode;
  language: string;
  targetLanguage?: string;
  customPrompt?: string;
}

const modePrompts: Record<AssistMode, string> = {
  refactor: `You are an expert code refactoring assistant. Analyze the provided code and refactor it to be:
- More readable and maintainable
- Following best practices for the language
- Using modern syntax and patterns
- DRY (Don't Repeat Yourself)
- Clean and well-structured

Return the refactored code with brief inline comments explaining major changes.`,

  explain: `You are an expert code explainer. Analyze the provided code and provide:
- A clear, step-by-step explanation of what the code does
- Explanation of any complex logic or algorithms used
- Description of the inputs and outputs
- Any potential issues or edge cases
- Best practices being followed or violated

Be thorough but concise.`,

  debug: `You are an expert debugging assistant. Analyze the provided code and:
- Identify any bugs, errors, or potential issues
- Look for logic errors, off-by-one errors, null checks, etc.
- Check for security vulnerabilities
- Find performance issues
- Provide fixed code if bugs are found

Return the corrected code and explain each fix.`,

  optimize: `You are an expert code optimization specialist. Analyze the provided code and:
- Identify performance bottlenecks
- Suggest algorithmic improvements
- Reduce time and space complexity where possible
- Optimize memory usage
- Improve execution speed

Return optimized code with explanations of improvements made.`,

  document: `You are an expert technical documentation writer. Add comprehensive documentation to the code:
- Add JSDoc/docstring comments to functions
- Add inline comments for complex logic
- Document parameters and return values
- Add type annotations if applicable
- Include usage examples where helpful

Return the fully documented code.`,

  convert: `You are an expert polyglot programmer. Convert the provided code to the target language:
- Maintain the same functionality and logic
- Use idiomatic patterns for the target language
- Handle language-specific differences appropriately
- Preserve comments and documentation
- Use equivalent libraries/functions

Return the converted code with notes on any significant changes.`,

  suggest: `You are an expert code reviewer. Analyze the provided code and suggest improvements:
- Code quality improvements
- Better patterns or approaches
- Security enhancements
- Performance tips
- Maintainability suggestions
- Testing recommendations

Provide 5-8 specific, actionable suggestions.`,
};

export async function POST(request: Request) {
  try {
    const { code, mode, language, targetLanguage, customPrompt }: AssistRequest = await request.json();

    if (!code || !mode) {
      return NextResponse.json(
        { error: "Code and mode are required" },
        { status: 400 }
      );
    }

    let systemPrompt = modePrompts[mode] || modePrompts.refactor;
    
    if (mode === "convert" && targetLanguage) {
      systemPrompt = `${systemPrompt}\n\nConvert from ${language} to ${targetLanguage}.`;
    }

    const userPrompt = `Language: ${language}
${customPrompt ? `Additional instructions: ${customPrompt}\n` : ""}
Code to analyze:
\`\`\`${language}
${code}
\`\`\`

${mode === "suggest" 
  ? "Provide your response as a JSON object with a 'suggestions' array of strings."
  : mode === "explain" 
    ? "Provide your response as a JSON object with an 'explanation' string."
    : "Provide your response as a JSON object with 'code' (the result code) and 'explanation' (brief explanation of changes) fields."
}`;

    const response = await getOpenAI().chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: systemPrompt + "\n\nAlways respond with valid JSON only, no markdown formatting.",
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content || "{}";
    
    let cleanContent = content.trim();
    if (cleanContent.startsWith("```json")) {
      cleanContent = cleanContent.slice(7);
    }
    if (cleanContent.startsWith("```")) {
      cleanContent = cleanContent.slice(3);
    }
    if (cleanContent.endsWith("```")) {
      cleanContent = cleanContent.slice(0, -3);
    }
    cleanContent = cleanContent.trim();

    let result;
    try {
      result = JSON.parse(cleanContent);
    } catch {
      if (mode === "explain") {
        result = { explanation: cleanContent };
      } else if (mode === "suggest") {
        result = { suggestions: [cleanContent] };
      } else {
        result = { code: cleanContent, explanation: "Code processed successfully" };
      }
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Code assist error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process code" },
      { status: 500 }
    );
  }
}
