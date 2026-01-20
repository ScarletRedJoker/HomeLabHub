import { NextRequest, NextResponse } from "next/server";
import { db, isDbConnected } from "@/lib/db";
import { setupConfiguration, setupStepData } from "@/lib/db/platform-schema";
import { eq, sql } from "drizzle-orm";

interface ValidationResult {
  step: string;
  valid: boolean;
  required: boolean;
  errors: string[];
  warnings: string[];
}

async function runValidation(): Promise<{ canComplete: boolean; errors: string[]; warnings: string[] }> {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!process.env.DATABASE_URL) {
    errors.push("DATABASE_URL is not configured - database is required");
  } else if (isDbConnected()) {
    try {
      await db.execute(sql`SELECT 1`);
    } catch {
      errors.push("Database connection failed");
    }
  }

  if (!process.env.DISCORD_TOKEN) {
    warnings.push("DISCORD_TOKEN not configured - Discord bot will not work");
  }

  if (!process.env.DISCORD_CLIENT_ID) {
    warnings.push("DISCORD_CLIENT_ID not configured - Discord OAuth will not work");
  }

  return {
    canComplete: errors.length === 0,
    errors,
    warnings,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { features, summary, environment, ollamaEndpoint, serverConfigs, skipValidation } = body;

    if (!skipValidation) {
      const validation = await runValidation();
      if (!validation.canComplete) {
        return NextResponse.json({
          success: false,
          error: "Setup cannot be completed due to validation errors",
          errors: validation.errors,
          warnings: validation.warnings,
        }, { status: 400 });
      }
    }

    const setupData = {
      environment: environment || "unknown",
      ollamaEndpoint: ollamaEndpoint || null,
      serverConfigs: serverConfigs || {},
      completedAt: new Date().toISOString(),
    };

    if (isDbConnected()) {
      try {
        const configs = await db.select().from(setupConfiguration).limit(1);
        
        if (configs.length === 0) {
          await db.insert(setupConfiguration).values({
            setupComplete: true,
            currentStep: 7,
            welcomeCompleted: true,
            featuresEnabled: features || ["dashboard", "ai", "discord", "streaming"],
            nodesConfigured: serverConfigs || {},
            aiServicesConfigured: { ollamaEndpoint },
            completedAt: new Date(),
          });
        } else {
          await db
            .update(setupConfiguration)
            .set({
              setupComplete: true,
              currentStep: 7,
              featuresEnabled: features || ["dashboard", "ai", "discord", "streaming"],
              nodesConfigured: serverConfigs || {},
              aiServicesConfigured: { ollamaEndpoint },
              completedAt: new Date(),
              updatedAt: new Date(),
            })
            .where(eq(setupConfiguration.id, configs[0].id));
        }

        await db
          .insert(setupStepData)
          .values({
            stepName: "completion",
            stepNumber: 7,
            completed: true,
            data: { summary, ...setupData },
            validatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: setupStepData.stepName,
            set: {
              completed: true,
              data: { summary, ...setupData },
              validatedAt: new Date(),
              updatedAt: new Date(),
            },
          });
      } catch (dbError) {
        console.error("[Setup Complete API] Database error:", dbError);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Setup completed successfully",
      configuration: setupData,
      redirectTo: "/",
    });
  } catch (error) {
    console.error("[Setup Complete API] Error:", error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to complete setup" },
      { status: 500 }
    );
  }
}
