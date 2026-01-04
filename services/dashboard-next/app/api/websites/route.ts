import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import fs from "fs/promises";
import path from "path";

const PROJECTS_DIR = process.env.STUDIO_PROJECTS_DIR || "/opt/homelab/studio-projects";
const WEBSITES_FILE = "websites.json";

interface Website {
  id: string;
  name: string;
  domain: string;
  description: string;
  type: "portfolio" | "blog" | "landing" | "community" | "custom";
  status: "draft" | "published";
  designProjectId?: string;
  createdAt: string;
  updatedAt: string;
  settings?: {
    primaryColor?: string;
    fontFamily?: string;
    favicon?: string;
  };
}

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

async function ensureDir(dir: string) {
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

async function loadWebsites(): Promise<Website[]> {
  try {
    await ensureDir(PROJECTS_DIR);
    const filePath = path.join(PROJECTS_DIR, WEBSITES_FILE);
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      const defaultWebsites: Website[] = [
        {
          id: "scarletredjoker",
          name: "Scarlet Red Joker",
          domain: "scarletredjoker.com",
          description: "Personal portfolio website",
          type: "portfolio",
          status: "published",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "rig-city",
          name: "Rig City",
          domain: "rig-city.com",
          description: "Gaming community website",
          type: "community",
          status: "published",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        {
          id: "evindrake",
          name: "Evin Drake",
          domain: "evindrake.net",
          description: "Personal blog and homelab documentation",
          type: "blog",
          status: "draft",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ];
      await saveWebsites(defaultWebsites);
      return defaultWebsites;
    }
    throw error;
  }
}

async function saveWebsites(websites: Website[]): Promise<void> {
  await ensureDir(PROJECTS_DIR);
  const filePath = path.join(PROJECTS_DIR, WEBSITES_FILE);
  await fs.writeFile(filePath, JSON.stringify(websites, null, 2));
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const id = request.nextUrl.searchParams.get("id");
    const websites = await loadWebsites();

    if (id) {
      const website = websites.find((w) => w.id === id);
      if (!website) {
        return NextResponse.json({ error: "Website not found" }, { status: 404 });
      }
      return NextResponse.json(website);
    }

    return NextResponse.json({ websites });
  } catch (error: any) {
    console.error("Websites GET error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, domain, description, type } = body;

    if (!name || !domain) {
      return NextResponse.json({ error: "Name and domain are required" }, { status: 400 });
    }

    const websites = await loadWebsites();
    
    const id = domain.replace(/\./g, "-").toLowerCase();
    if (websites.some((w) => w.id === id)) {
      return NextResponse.json({ error: "Website already exists" }, { status: 409 });
    }

    const newWebsite: Website = {
      id,
      name,
      domain,
      description: description || "",
      type: type || "custom",
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    websites.push(newWebsite);
    await saveWebsites(websites);

    return NextResponse.json({ success: true, website: newWebsite });
  } catch (error: any) {
    console.error("Websites POST error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const websites = await loadWebsites();
    const index = websites.findIndex((w) => w.id === id);

    if (index === -1) {
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    websites[index] = {
      ...websites[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await saveWebsites(websites);

    return NextResponse.json({ success: true, website: websites[index] });
  } catch (error: any) {
    console.error("Websites PUT error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const id = request.nextUrl.searchParams.get("id");

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const websites = await loadWebsites();
    const filtered = websites.filter((w) => w.id !== id);

    if (filtered.length === websites.length) {
      return NextResponse.json({ error: "Website not found" }, { status: 404 });
    }

    await saveWebsites(filtered);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Websites DELETE error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
