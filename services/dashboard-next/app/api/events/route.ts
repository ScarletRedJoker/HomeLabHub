import { NextRequest, NextResponse } from "next/server";
import { eventBus, EventPayload, EventCategory, EventSeverity } from "@/lib/event-bus";
import { checkAuth } from "@/lib/auth";

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const category = searchParams.get("category") as EventCategory | null;
  const severity = searchParams.get("severity") as EventSeverity | null;
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = parseInt(searchParams.get("offset") || "0");
  const unreadOnly = searchParams.get("unreadOnly") === "true";

  try {
    const events = await eventBus.getEvents({
      category: category || undefined,
      severity: severity || undefined,
      limit,
      offset,
      unreadOnly,
    });

    const unreadCount = await eventBus.getUnreadCount();

    return NextResponse.json({
      events,
      unreadCount,
      status: eventBus.getStatus(),
    });
  } catch (error: any) {
    console.error("Failed to get events:", error);
    return NextResponse.json(
      { error: "Failed to get events", details: error.message },
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
    
    const payload: EventPayload = {
      category: body.category || "system",
      severity: body.severity || "info",
      title: body.title,
      message: body.message,
      metadata: body.metadata,
      channels: body.channels || ["dashboard"],
      userId: body.userId,
      serverId: body.serverId,
    };

    if (!payload.title || !payload.message) {
      return NextResponse.json(
        { error: "Title and message are required" },
        { status: 400 }
      );
    }

    const event = await eventBus.publish(payload);

    if (!event) {
      return NextResponse.json(
        { error: "Failed to publish event" },
        { status: 500 }
      );
    }

    return NextResponse.json({ event, success: true });
  } catch (error: any) {
    console.error("Failed to publish event:", error);
    return NextResponse.json(
      { error: "Failed to publish event", details: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { action, eventIds } = body;

    if (action === "markAllRead") {
      const success = await eventBus.markAllAsRead();
      return NextResponse.json({ success });
    }

    if (action === "markRead" && Array.isArray(eventIds)) {
      const success = await eventBus.markAsRead(eventIds);
      return NextResponse.json({ success });
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 }
    );
  } catch (error: any) {
    console.error("Failed to update events:", error);
    return NextResponse.json(
      { error: "Failed to update events", details: error.message },
      { status: 500 }
    );
  }
}
