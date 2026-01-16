import { NextRequest, NextResponse } from "next/server";
import { setupWizard } from "@/lib/setup-wizard";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, target, user } = body as {
      type: "ssh" | "api" | "gpu";
      target: string;
      user?: string;
    };

    if (!type || !target) {
      return NextResponse.json(
        { success: false, error: "type and target are required" },
        { status: 400 }
      );
    }

    const validTypes = ["ssh", "api", "gpu"];
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { success: false, error: `Invalid type. Must be one of: ${validTypes.join(", ")}` },
        { status: 400 }
      );
    }

    const result = await setupWizard.testConnection(type, target, { user });

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error("[Setup Test API] error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Test failed",
      },
      { status: 500 }
    );
  }
}
