import { NextRequest, NextResponse } from "next/server";
import { db, isDbConnected } from "@/lib/db";
import { sql } from "drizzle-orm";

export async function GET() {
  try {
    if (!isDbConnected()) {
      return NextResponse.json({
        connected: false,
        error: "DATABASE_URL not configured",
      });
    }

    const versionResult = await db.execute(sql`SELECT version()`);
    const version = (versionResult.rows[0] as any)?.version?.split(" ").slice(0, 2).join(" ") || "Unknown";

    const tablesResult = await db.execute(sql`
      SELECT count(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);
    const tables = parseInt((tablesResult.rows[0] as any)?.count || "0", 10);

    return NextResponse.json({
      connected: true,
      version,
      tables,
      pendingMigrations: 0,
      lastMigration: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Setup Database API] Error:", error);
    return NextResponse.json({
      connected: false,
      error: error instanceof Error ? error.message : "Connection failed",
    });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "migrate") {
      return NextResponse.json({
        success: true,
        message: "Migrations are managed by Drizzle. Run 'npm run db:push' to sync schema.",
      });
    }

    if (action === "test") {
      if (!isDbConnected()) {
        return NextResponse.json({
          success: false,
          error: "Database not connected",
        });
      }

      await db.execute(sql`SELECT 1`);
      return NextResponse.json({
        success: true,
        message: "Database connection successful",
      });
    }

    return NextResponse.json(
      { success: false, error: "Unknown action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("[Setup Database API] Error:", error);
    return NextResponse.json(
      { success: false, error: "Database operation failed" },
      { status: 500 }
    );
  }
}
