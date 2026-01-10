import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { eventSubscriptions } from "@/lib/db/platform-schema";
import { eq } from "drizzle-orm";
import { checkAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const subs = await db.select().from(eventSubscriptions);
    return NextResponse.json({ subscriptions: subs });
  } catch (error: any) {
    console.error("Failed to get subscriptions:", error);
    return NextResponse.json(
      { error: "Failed to get subscriptions", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    
    const [subscription] = await db.insert(eventSubscriptions).values({
      channel: body.channel,
      webhookUrl: body.webhookUrl,
      email: body.email,
      categories: body.categories || [],
      severities: body.severities || [],
      enabled: body.enabled ?? true,
    }).returning();

    return NextResponse.json({ subscription, success: true });
  } catch (error: any) {
    console.error("Failed to create subscription:", error);
    return NextResponse.json(
      { error: "Failed to create subscription", details: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await request.json();
    
    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }

    await db.delete(eventSubscriptions).where(eq(eventSubscriptions.id, id));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete subscription:", error);
    return NextResponse.json(
      { error: "Failed to delete subscription", details: error.message },
      { status: 500 }
    );
  }
}
