import { NextRequest, NextResponse } from "next/server";

const STREAM_BOT_API = process.env.STREAM_BOT_URL || "http://localhost:3000";

async function proxyRequest(
  req: NextRequest,
  endpoint: string,
  method: string = "GET",
  body?: any
) {
  try {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    // Forward cookies for authentication
    const cookies = req.headers.get("cookie");
    if (cookies) {
      headers["Cookie"] = cookies;
    }

    // Forward authorization header if present
    const auth = req.headers.get("authorization");
    if (auth) {
      headers["Authorization"] = auth;
    }

    const options: RequestInit = {
      method,
      headers,
      cache: "no-store",
      credentials: "include",
    };

    if (body && method !== "GET") {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${STREAM_BOT_API}${endpoint}`, options);

    // Forward set-cookie headers from response
    const responseHeaders = new Headers();
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      responseHeaders.set("Set-Cookie", setCookie);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      return NextResponse.json(error, { status: response.status, headers: responseHeaders });
    }

    const data = await response.json();
    return NextResponse.json(data, { headers: responseHeaders });
  } catch (error: any) {
    console.error(`[Stream Config API] Error proxying to ${endpoint}:`, error.message);
    return NextResponse.json(
      { error: "Failed to connect to stream-bot service", details: error.message },
      { status: 503 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const endpoint = searchParams.get("endpoint") || "/api/settings";

  return proxyRequest(req, endpoint);
}

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const endpoint = searchParams.get("endpoint") || "/api/settings";
  const body = await req.json();

  return proxyRequest(req, endpoint, "PATCH", body);
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const endpoint = searchParams.get("endpoint") || "/api/overlay/generate-token";
  const body = await req.json();

  return proxyRequest(req, endpoint, "POST", body);
}
