import { NextRequest, NextResponse } from "next/server";
import { setupWizard, type SetupAnswers } from "@/lib/setup-wizard";

export async function GET() {
  try {
    const status = await setupWizard.getStatus();

    return NextResponse.json({
      success: true,
      ...status,
    });
  } catch (error) {
    console.error("[Setup API] GET error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to get setup status",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const answers = body as SetupAnswers;

    if (!answers.projectName) {
      return NextResponse.json(
        { success: false, error: "Project name is required" },
        { status: 400 }
      );
    }

    if (!answers.deploymentType) {
      return NextResponse.json(
        { success: false, error: "Deployment type is required" },
        { status: 400 }
      );
    }

    const result = await setupWizard.run(answers);

    return NextResponse.json({
      success: result.success,
      config: result.config,
      configPath: result.configPath,
      testResults: result.testResults,
      errors: result.errors,
    });
  } catch (error) {
    console.error("[Setup API] POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Setup failed",
      },
      { status: 500 }
    );
  }
}
