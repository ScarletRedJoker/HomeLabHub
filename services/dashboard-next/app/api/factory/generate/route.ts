import { NextResponse } from "next/server";
import OpenAI from "openai";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const openai = new OpenAI();

interface ProjectConfig {
  name: string;
  description: string;
  database: "postgresql" | "sqlite" | "none";
  auth: "session" | "jwt" | "oauth" | "none";
  styling: "tailwind" | "css" | "styled-components";
  deployment: "docker" | "serverless" | "vps";
}

interface GeneratedFile {
  path: string;
  content: string;
  language: string;
}

const templatePrompts: Record<string, string> = {
  "saas-starter": `Create a complete SaaS starter kit with:
- Next.js 14 app router structure
- User authentication system
- Stripe billing integration
- Admin dashboard components
- API key management
- Database schema for users, subscriptions, api_keys`,

  "api-service": `Create a production-ready REST API with:
- Express.js server with TypeScript
- JWT authentication middleware
- Rate limiting
- Request validation
- Error handling
- OpenAPI/Swagger documentation
- Logging with Winston`,

  "landing-page": `Create a modern marketing landing page with:
- Hero section with gradient background
- Features grid with icons
- Testimonials carousel
- Pricing table
- CTA sections
- Contact form
- Responsive design`,

  "admin-dashboard": `Create an admin dashboard with:
- Sidebar navigation
- Analytics overview with charts
- User management table
- Settings page
- Role-based access control
- Data tables with pagination`,

  "discord-bot": `Create a Discord bot with:
- Slash command handler
- Event system
- Database integration for storing data
- Moderation commands
- Utility commands
- Error handling`,

  "ecommerce-store": `Create an e-commerce store with:
- Product catalog page
- Product detail page
- Shopping cart functionality
- Checkout flow
- Order management
- Inventory tracking`,

  "chat-app": `Create a real-time chat application with:
- WebSocket connection handling
- Chat room system
- Direct messaging
- User presence indicators
- Message history
- File upload support`,

  "subscription-api": `Create a subscription management API with:
- Stripe webhook handling
- Plan management endpoints
- Usage tracking
- Customer portal integration
- Invoice history`,

  "team-portal": `Create a team collaboration portal with:
- Team member management
- Project boards
- Task assignments
- Time tracking
- Notification system`,
};

function getFileExtension(language: string): string {
  const map: Record<string, string> = {
    typescript: "ts",
    javascript: "js",
    python: "py",
    json: "json",
    yaml: "yml",
    dockerfile: "Dockerfile",
    shell: "sh",
    markdown: "md",
    html: "html",
    css: "css",
  };
  return map[language] || language;
}

async function generateWithAI(templateId: string, config: ProjectConfig): Promise<GeneratedFile[]> {
  const basePrompt = templatePrompts[templateId] || "Create a basic web application";
  
  const prompt = `You are an expert software architect. Generate a complete, production-ready project based on these requirements:

PROJECT: ${config.name}
DESCRIPTION: ${config.description || "A modern web application"}
DATABASE: ${config.database}
AUTHENTICATION: ${config.auth}
STYLING: ${config.styling}
DEPLOYMENT: ${config.deployment}

TEMPLATE REQUIREMENTS:
${basePrompt}

Generate the project files as a JSON array. Each file should have:
- path: relative file path (e.g., "src/index.ts", "package.json")
- content: complete file content (properly escaped)
- language: programming language (typescript, javascript, json, yaml, dockerfile, shell, markdown, html, css)

REQUIREMENTS:
1. Generate complete, working code - no placeholders or TODOs
2. Include package.json with all dependencies
3. Include proper TypeScript configuration if using TS
4. Include Docker configuration if deployment is docker
5. Include README.md with setup instructions
6. Use modern best practices and clean code
7. Include proper error handling
8. Add inline comments for complex logic

Return ONLY valid JSON array, no markdown formatting:
[{"path": "...", "content": "...", "language": "..."}]`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert software architect that generates complete, production-ready project files. Always return valid JSON arrays only, no markdown formatting.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 16000,
    });

    const content = response.choices[0]?.message?.content || "[]";
    
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

    const files = JSON.parse(cleanContent) as GeneratedFile[];
    return files;
  } catch (error) {
    console.error("AI generation error:", error);
    throw error;
  }
}

function generateFallbackFiles(templateId: string, config: ProjectConfig): GeneratedFile[] {
  const files: GeneratedFile[] = [];

  files.push({
    path: "package.json",
    content: JSON.stringify({
      name: config.name,
      version: "1.0.0",
      description: config.description || `Generated ${templateId} project`,
      scripts: {
        dev: "next dev -p 3000",
        build: "next build",
        start: "next start",
        lint: "eslint . --ext .ts,.tsx",
      },
      dependencies: {
        next: "^14.0.0",
        react: "^18.2.0",
        "react-dom": "^18.2.0",
        ...(config.database === "postgresql" ? { pg: "^8.11.0", drizzle: "^0.30.0" } : {}),
        ...(config.auth !== "none" ? { "next-auth": "^4.24.0" } : {}),
        ...(config.styling === "tailwind" ? { tailwindcss: "^3.4.0" } : {}),
      },
      devDependencies: {
        typescript: "^5.0.0",
        "@types/node": "^20.0.0",
        "@types/react": "^18.2.0",
      },
    }, null, 2),
    language: "json",
  });

  files.push({
    path: "README.md",
    content: `# ${config.name}

${config.description || "A modern web application generated by Nebula Command App Factory."}

## Getting Started

\`\`\`bash
npm install
npm run dev
\`\`\`

## Features

- ${config.database !== "none" ? `Database: ${config.database}` : "No database"}
- ${config.auth !== "none" ? `Authentication: ${config.auth}` : "No authentication"}
- ${config.styling} styling
- ${config.deployment} deployment ready

## Project Structure

\`\`\`
${config.name}/
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   └── layout.tsx
│   ├── components/
│   └── lib/
├── public/
├── package.json
└── README.md
\`\`\`
`,
    language: "markdown",
  });

  files.push({
    path: "src/app/page.tsx",
    content: `export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-4">${config.name}</h1>
        <p className="text-gray-400">${config.description || "Welcome to your new project"}</p>
      </div>
    </main>
  );
}
`,
    language: "typescript",
  });

  files.push({
    path: "src/app/layout.tsx",
    content: `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "${config.name}",
  description: "${config.description || "Generated by Nebula Command"}",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
    language: "typescript",
  });

  files.push({
    path: "src/app/globals.css",
    content: `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --foreground-rgb: 255, 255, 255;
  --background-start-rgb: 0, 0, 0;
  --background-end-rgb: 0, 0, 0;
}

body {
  color: rgb(var(--foreground-rgb));
  background: linear-gradient(
    to bottom,
    transparent,
    rgb(var(--background-end-rgb))
  )
  rgb(var(--background-start-rgb));
}
`,
    language: "css",
  });

  if (config.deployment === "docker") {
    files.push({
      path: "Dockerfile",
      content: `FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT 3000
CMD ["node", "server.js"]
`,
      language: "dockerfile",
    });

    files.push({
      path: "docker-compose.yml",
      content: `version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
${config.database === "postgresql" ? `      - DATABASE_URL=postgresql://user:password@db:5432/${config.name}
    depends_on:
      - db

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
      POSTGRES_DB: ${config.name}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  postgres_data:` : ""}
`,
      language: "yaml",
    });
  }

  files.push({
    path: "tsconfig.json",
    content: JSON.stringify({
      compilerOptions: {
        target: "ES2017",
        lib: ["dom", "dom.iterable", "esnext"],
        allowJs: true,
        skipLibCheck: true,
        strict: true,
        noEmit: true,
        esModuleInterop: true,
        module: "esnext",
        moduleResolution: "bundler",
        resolveJsonModule: true,
        isolatedModules: true,
        jsx: "preserve",
        incremental: true,
        plugins: [{ name: "next" }],
        paths: {
          "@/*": ["./src/*"],
        },
      },
      include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
      exclude: ["node_modules"],
    }, null, 2),
    language: "json",
  });

  return files;
}

export async function POST(request: Request) {
  try {
    const { templateId, config } = await request.json();

    if (!templateId || !config?.name) {
      return NextResponse.json(
        { error: "Template ID and project name are required" },
        { status: 400 }
      );
    }

    let files: GeneratedFile[];

    try {
      files = await generateWithAI(templateId, config);
    } catch (aiError) {
      console.log("AI generation failed, using fallback:", aiError);
      files = generateFallbackFiles(templateId, config);
    }

    return NextResponse.json({
      success: true,
      templateId,
      projectName: config.name,
      files,
      generatedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Factory generation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate project" },
      { status: 500 }
    );
  }
}
