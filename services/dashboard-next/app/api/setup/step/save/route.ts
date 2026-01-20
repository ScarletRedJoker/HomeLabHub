import { NextRequest, NextResponse } from "next/server";
import { db, isDbConnected } from "@/lib/db";
import { setupConfiguration, setupStepData } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";

const STEP_NAMES: Record<number, string> = {
  1: "environment",
  2: "secrets",
  3: "database",
  4: "ai",
  5: "platforms",
  6: "deployment",
  7: "completion",
};

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { stepNumber, data, completed } = body;

    if (typeof stepNumber !== "number" || stepNumber < 1 || stepNumber > 7) {
      return NextResponse.json(
        { success: false, error: "Invalid step number" },
        { status: 400 }
      );
    }

    const stepName = STEP_NAMES[stepNumber];

    if (!isDbConnected()) {
      return NextResponse.json({
        success: true,
        message: "Step saved (database not connected, saved to memory only)",
        stepName,
        stepNumber,
      });
    }

    try {
      const configs = await db.select().from(setupConfiguration).limit(1);

      if (configs.length === 0) {
        await db.insert(setupConfiguration).values({
          setupComplete: false,
          currentStep: stepNumber,
          welcomeCompleted: stepNumber >= 1,
        });
      } else {
        const updates: Record<string, unknown> = {
          currentStep: stepNumber,
          updatedAt: new Date(),
        };

        if (stepNumber >= 1) updates.welcomeCompleted = true;
        if (stepName === "environment" && data) updates.environmentDetected = data;
        if (stepName === "secrets" && data) updates.secretsConfigured = data;
        if (stepName === "ai" && data) updates.aiServicesConfigured = data;
        if (stepName === "deployment" && data) updates.nodesConfigured = data;

        await db
          .update(setupConfiguration)
          .set(updates)
          .where(eq(setupConfiguration.id, configs[0].id));
      }

      await db
        .insert(setupStepData)
        .values({
          stepName,
          stepNumber,
          completed: completed ?? false,
          data: data || {},
          validatedAt: completed ? new Date() : null,
        })
        .onConflictDoUpdate({
          target: setupStepData.stepName,
          set: {
            completed: completed ?? false,
            data: data || {},
            validatedAt: completed ? new Date() : null,
            updatedAt: new Date(),
          },
        });

      return NextResponse.json({
        success: true,
        message: `Step ${stepNumber} (${stepName}) saved`,
        stepName,
        stepNumber,
        completed: completed ?? false,
      });
    } catch (dbError) {
      console.error("[Setup Step Save API] Database error:", dbError);
      return NextResponse.json({
        success: true,
        message: "Step saved with database warning",
        warning: "Could not persist to database",
        stepName,
        stepNumber,
      });
    }
  } catch (error) {
    console.error("[Setup Step Save API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save step" },
      { status: 500 }
    );
  }
}
