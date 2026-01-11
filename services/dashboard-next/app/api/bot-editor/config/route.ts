import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const { bot, config, commands } = await request.json();

    if (!bot || !config) {
      return NextResponse.json(
        { error: "Bot type and config are required" },
        { status: 400 }
      );
    }

    const result = await db.execute(sql`
      INSERT INTO bot_configs (bot_type, config, commands, updated_at)
      VALUES (${bot}, ${JSON.stringify(config)}::jsonb, ${JSON.stringify(commands)}::jsonb, NOW())
      ON CONFLICT (bot_type) DO UPDATE SET
        config = ${JSON.stringify(config)}::jsonb,
        commands = ${JSON.stringify(commands)}::jsonb,
        updated_at = NOW()
      RETURNING id, bot_type, is_running, updated_at
    `);

    return NextResponse.json({
      success: true,
      message: "Bot configuration saved",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("Save bot config error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save bot configuration" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const botType = searchParams.get("bot");

    if (botType) {
      const result = await db.execute(sql`
        SELECT * FROM bot_configs WHERE bot_type = ${botType}
      `);
      
      if (result.rows.length === 0) {
        return NextResponse.json({ 
          config: null,
          commands: [],
          isRunning: false 
        });
      }
      
      return NextResponse.json(result.rows[0]);
    }

    const result = await db.execute(sql`
      SELECT * FROM bot_configs ORDER BY updated_at DESC
    `);

    return NextResponse.json({ configs: result.rows });
  } catch (error: any) {
    console.error("Get bot config error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get bot configuration" },
      { status: 500 }
    );
  }
}
