import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const { name, html, css, js, projectId } = await request.json();

    if (!name || !html) {
      return NextResponse.json(
        { error: "Name and HTML are required" },
        { status: 400 }
      );
    }

    const result = await db.execute(sql`
      INSERT INTO website_builds (name, html, css, js, version, created_at, updated_at)
      VALUES (${name}, ${html}, ${css || ""}, ${js || ""}, 1, NOW(), NOW())
      ON CONFLICT (name) DO UPDATE SET
        html = ${html},
        css = ${css || ""},
        js = ${js || ""},
        version = website_builds.version + 1,
        updated_at = NOW()
      RETURNING id, name, version, created_at, updated_at
    `);

    return NextResponse.json({
      success: true,
      message: "Website saved successfully",
      data: result.rows[0],
    });
  } catch (error: any) {
    console.error("Save website error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to save website" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get("name");

    if (name) {
      const result = await db.execute(sql`
        SELECT * FROM website_builds WHERE name = ${name}
      `);
      
      if (result.rows.length === 0) {
        return NextResponse.json({ error: "Website not found" }, { status: 404 });
      }
      
      return NextResponse.json(result.rows[0]);
    }

    const result = await db.execute(sql`
      SELECT id, name, version, created_at, updated_at 
      FROM website_builds 
      ORDER BY updated_at DESC
      LIMIT 50
    `);

    return NextResponse.json({ websites: result.rows });
  } catch (error: any) {
    console.error("Get websites error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to get websites" },
      { status: 500 }
    );
  }
}
