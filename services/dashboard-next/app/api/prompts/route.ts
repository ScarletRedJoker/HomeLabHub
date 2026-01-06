import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { prompts } from "@/lib/db/platform-schema";
import { eq, or, ilike, sql, and } from "drizzle-orm";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

interface PromptData {
  id: string;
  userId?: string;
  name: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  isPublic: boolean;
  isBuiltin?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const CATEGORIES = ["code", "content", "image", "chat", "system"] as const;

const BUILTIN_PROMPTS: PromptData[] = [
  {
    id: "builtin-code-review",
    name: "Code Review",
    description: "Perform a comprehensive code review with suggestions for improvement",
    category: "code",
    content: `Please review the following code and provide feedback on:

1. Code quality and best practices
2. Potential bugs or issues
3. Performance optimizations
4. Security concerns
5. Readability and maintainability

Code to review:
\`\`\`
[Paste your code here]
\`\`\``,
    tags: ["review", "quality", "best-practices"],
    isPublic: true,
    isBuiltin: true,
  },
  {
    id: "builtin-bug-fix",
    name: "Bug Fix Analysis",
    description: "Analyze a bug and suggest potential fixes",
    category: "code",
    content: `I'm experiencing a bug in my application.

**Error Message:**
[Paste error message here]

**Code causing the issue:**
\`\`\`
[Paste code here]
\`\`\`

**Expected behavior:** [Describe expected behavior]

**Actual behavior:** [Describe actual behavior]

Please analyze this bug and:
1. Explain what's causing the issue
2. Provide a corrected version of the code
3. Suggest how to prevent similar bugs in the future`,
    tags: ["debugging", "bug", "fix"],
    isPublic: true,
    isBuiltin: true,
  },
  {
    id: "builtin-blog-post",
    name: "Blog Post Generator",
    description: "Generate a structured blog post on any topic",
    category: "content",
    content: `Create a detailed blog post on the following topic:

**Topic:** [Your topic here]
**Target audience:** [Target audience]
**Desired length:** [Word count]
**Tone:** [Professional/Casual/Academic]

Please include:
1. Catchy title options (3-5)
2. Introduction hook
3. Main sections with key points
4. Conclusion and call-to-action
5. SEO keywords to target`,
    tags: ["blog", "writing", "seo"],
    isPublic: true,
    isBuiltin: true,
  },
  {
    id: "builtin-image-prompt",
    name: "Image Prompt Creator",
    description: "Create detailed prompts for AI image generation",
    category: "image",
    content: `Create a detailed image generation prompt for:

**Subject:** [Main subject]
**Style:** [Art style - photorealistic, anime, oil painting, etc.]
**Mood:** [Mood/atmosphere]
**Colors:** [Color palette preferences]
**Additional details:** [Any other requirements]

Generate a detailed prompt that includes:
1. Main subject description
2. Composition and framing
3. Lighting and atmosphere
4. Style references
5. Technical parameters (aspect ratio, quality modifiers)`,
    tags: ["ai-art", "dall-e", "midjourney", "stable-diffusion"],
    isPublic: true,
    isBuiltin: true,
  },
  {
    id: "builtin-chat-persona",
    name: "Chat Bot Persona",
    description: "Create a custom persona for AI chat assistants",
    category: "chat",
    content: `Create a chat assistant persona with the following characteristics:

**Name:** [Assistant name]
**Role:** [Primary role/expertise]
**Personality:** [Key personality traits]
**Communication style:** [Formal/Casual/Technical]
**Knowledge domain:** [Areas of expertise]

The persona should:
1. Have a consistent voice and tone
2. Be helpful and engaging
3. Stay within defined boundaries
4. Handle edge cases gracefully`,
    tags: ["persona", "chatbot", "assistant"],
    isPublic: true,
    isBuiltin: true,
  },
  {
    id: "builtin-system-prompt",
    name: "System Prompt Template",
    description: "Create effective system prompts for AI applications",
    category: "system",
    content: `Create a system prompt for an AI with these requirements:

**Purpose:** [Primary function]
**Capabilities:** [What the AI can do]
**Limitations:** [What the AI should not do]
**Tone:** [Communication style]
**Output format:** [Expected response format]

The system prompt should:
1. Clearly define the AI's role
2. Set appropriate boundaries
3. Include error handling instructions
4. Specify response formatting`,
    tags: ["system-prompt", "ai-config", "instructions"],
    isPublic: true,
    isBuiltin: true,
  },
  {
    id: "builtin-code-explain",
    name: "Code Explanation",
    description: "Get a detailed explanation of how code works",
    category: "code",
    content: `Please explain the following code in detail:

\`\`\`
[Paste your code here]
\`\`\`

Please include:
1. What the code does overall
2. Step-by-step breakdown of how it works
3. Any important concepts or patterns used
4. Potential use cases
5. Suggestions for improvement`,
    tags: ["explain", "learning", "documentation"],
    isPublic: true,
    isBuiltin: true,
  },
  {
    id: "builtin-social-post",
    name: "Social Media Post",
    description: "Create engaging social media content",
    category: "content",
    content: `Create a social media post for:

**Platform:** [Twitter/LinkedIn/Instagram/etc.]
**Topic:** [Main topic]
**Goal:** [Engagement/Information/Promotion]
**Tone:** [Professional/Casual/Humorous]
**Include:** [Hashtags/Emojis/CTA]

Generate multiple versions:
1. Short version (under 280 chars)
2. Medium version (with hashtags)
3. Long version (for LinkedIn/Facebook)`,
    tags: ["social-media", "marketing", "engagement"],
    isPublic: true,
    isBuiltin: true,
  },
];

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category");
    const search = searchParams.get("search");

    let dbPrompts: PromptData[] = [];
    try {
      const results = await db.select().from(prompts);
      dbPrompts = results
        .filter((p) => {
          return p.isPublic || p.userId === user.username;
        })
        .map((p) => ({
          id: p.id,
          userId: p.userId || undefined,
          name: p.name,
          description: p.description || "",
          content: p.content,
          category: p.category,
          tags: (p.tags as string[]) || [],
          isPublic: p.isPublic ?? false,
          isBuiltin: false,
          createdAt: p.createdAt || undefined,
          updatedAt: p.updatedAt || undefined,
        }));
    } catch (dbError) {
      console.error("Failed to fetch prompts from database:", dbError);
    }

    let allPrompts = [...BUILTIN_PROMPTS, ...dbPrompts];

    if (category && category !== "all") {
      allPrompts = allPrompts.filter(
        (p) => p.category.toLowerCase() === category.toLowerCase()
      );
    }

    if (search) {
      const searchLower = search.toLowerCase();
      allPrompts = allPrompts.filter((p) => {
        const nameMatch = p.name.toLowerCase().includes(searchLower);
        const descMatch = p.description.toLowerCase().includes(searchLower);
        const tagMatch = p.tags.some((tag) =>
          tag.toLowerCase().includes(searchLower)
        );
        return nameMatch || descMatch || tagMatch;
      });
    }

    return NextResponse.json({
      prompts: allPrompts,
      categories: CATEGORIES,
    });
  } catch (error: any) {
    console.error("Error fetching prompts:", error);
    return NextResponse.json({
      prompts: BUILTIN_PROMPTS,
      categories: CATEGORIES,
    });
  }
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, description, content, category, tags, isPublic } = body;

    if (!name || !content || !category) {
      return NextResponse.json(
        { error: "Missing required fields: name, content, category" },
        { status: 400 }
      );
    }

    if (!CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }

    const [created] = await db
      .insert(prompts)
      .values({
        userId: user.username || "system",
        name,
        description: description || null,
        content,
        category,
        tags: tags || [],
        isPublic: isPublic ?? false,
      })
      .returning();

    return NextResponse.json({
      message: "Prompt created successfully",
      prompt: {
        id: created.id,
        userId: created.userId,
        name: created.name,
        description: created.description,
        content: created.content,
        category: created.category,
        tags: created.tags,
        isPublic: created.isPublic,
        isBuiltin: false,
        createdAt: created.createdAt,
        updatedAt: created.updatedAt,
      },
    }, { status: 201 });
  } catch (error: any) {
    console.error("Error creating prompt:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create prompt" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, name, description, content, category, tags, isPublic } = body;

    if (!id) {
      return NextResponse.json(
        { error: "Prompt ID is required" },
        { status: 400 }
      );
    }

    if (id.startsWith("builtin-")) {
      return NextResponse.json(
        { error: "Cannot modify built-in prompts" },
        { status: 400 }
      );
    }

    if (!name || !content || !category) {
      return NextResponse.json(
        { error: "Missing required fields: name, content, category" },
        { status: 400 }
      );
    }

    if (!CATEGORIES.includes(category)) {
      return NextResponse.json(
        { error: `Invalid category. Must be one of: ${CATEGORIES.join(", ")}` },
        { status: 400 }
      );
    }

    const [existing] = await db.select().from(prompts).where(eq(prompts.id, id));
    if (!existing) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    if (existing.userId !== user.username) {
      return NextResponse.json(
        { error: "You can only edit your own prompts" },
        { status: 403 }
      );
    }

    const [updated] = await db
      .update(prompts)
      .set({
        name,
        description: description || null,
        content,
        category,
        tags: tags || [],
        isPublic: isPublic ?? false,
        updatedAt: new Date(),
      })
      .where(eq(prompts.id, id))
      .returning();

    return NextResponse.json({
      message: "Prompt updated successfully",
      prompt: {
        id: updated.id,
        userId: updated.userId,
        name: updated.name,
        description: updated.description,
        content: updated.content,
        category: updated.category,
        tags: updated.tags,
        isPublic: updated.isPublic,
        isBuiltin: false,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (error: any) {
    console.error("Error updating prompt:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update prompt" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const promptId = searchParams.get("id");

    if (!promptId) {
      return NextResponse.json(
        { error: "Prompt ID is required" },
        { status: 400 }
      );
    }

    if (promptId.startsWith("builtin-")) {
      return NextResponse.json(
        { error: "Cannot delete built-in prompts" },
        { status: 400 }
      );
    }

    const [existing] = await db.select().from(prompts).where(eq(prompts.id, promptId));
    if (!existing) {
      return NextResponse.json({ error: "Prompt not found" }, { status: 404 });
    }

    if (existing.userId !== user.username) {
      return NextResponse.json(
        { error: "You can only delete your own prompts" },
        { status: 403 }
      );
    }

    const [deleted] = await db
      .delete(prompts)
      .where(eq(prompts.id, promptId))
      .returning();

    return NextResponse.json({
      message: "Prompt deleted successfully",
      promptId: deleted.id,
    });
  } catch (error: any) {
    console.error("Error deleting prompt:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete prompt" },
      { status: 500 }
    );
  }
}
