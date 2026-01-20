import { NextRequest } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

const WINDOWS_AGENT_URL = process.env.WINDOWS_AGENT_URL || "http://100.118.44.102:9765";

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const downloadId = searchParams.get("id");

  const encoder = new TextEncoder();
  let isActive = true;

  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (event: string, data: any) => {
        if (!isActive) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const pollProgress = async () => {
        while (isActive) {
          try {
            const headers: Record<string, string> = {
              "Content-Type": "application/json",
              "Accept": "application/json",
            };
            const agentToken = process.env.NEBULA_AGENT_TOKEN;
            if (agentToken) {
              headers["Authorization"] = `Bearer ${agentToken}`;
            }

            const url = downloadId 
              ? `${WINDOWS_AGENT_URL}/api/models/downloads/${downloadId}`
              : `${WINDOWS_AGENT_URL}/api/models/downloads`;

            const response = await fetch(url, {
              headers,
              signal: AbortSignal.timeout(5000),
            });

            if (!response.ok) {
              sendEvent("error", { error: "Failed to fetch progress" });
              await new Promise(r => setTimeout(r, 5000));
              continue;
            }

            const data = await response.json();

            if (downloadId) {
              const download = data.download || data;
              sendEvent("progress", {
                id: download.id || downloadId,
                filename: download.filename,
                status: download.status,
                progress: download.progress || 0,
                bytesDownloaded: download.bytesDownloaded || download.bytes_downloaded || 0,
                totalBytes: download.totalBytes || download.total_bytes || 0,
                speed: download.speed || 0,
                eta: download.eta || 0,
                error: download.error,
              });

              if (download.status === "completed" || download.status === "failed" || download.status === "cancelled") {
                sendEvent("complete", download);
                isActive = false;
                controller.close();
                return;
              }
            } else {
              const downloads = data.downloads || [];
              sendEvent("downloads", {
                downloads: downloads.map((d: any) => ({
                  id: d.id,
                  filename: d.filename,
                  type: d.type,
                  status: d.status,
                  progress: d.progress || 0,
                  bytesDownloaded: d.bytesDownloaded || d.bytes_downloaded || 0,
                  totalBytes: d.totalBytes || d.total_bytes || 0,
                  speed: d.speed || 0,
                  eta: d.eta || 0,
                  error: d.error,
                })),
                activeCount: data.activeCount || data.active_count || 0,
              });
            }
          } catch (error: any) {
            if (error.name !== "AbortError") {
              sendEvent("error", { error: error.message });
            }
          }

          await new Promise(r => setTimeout(r, 1000));
        }
      };

      sendEvent("connected", { message: "SSE connection established" });
      pollProgress();
    },
    cancel() {
      isActive = false;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
