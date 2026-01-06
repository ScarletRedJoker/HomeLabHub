import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import simpleGit from "simple-git";
import { statSync } from "fs";
import { join } from "path";

const NEBULA_ROOT = process.env.NEBULA_ROOT || process.cwd();

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

export async function GET(request: NextRequest) {
  if (!(await checkAuth())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const git = simpleGit(NEBULA_ROOT);
    
    const [branchSummary, log, status, remoteBranches] = await Promise.all([
      git.branch(),
      git.log({ maxCount: 1 }),
      git.status(),
      git.branch(["-r"]).catch(() => ({ all: [] })),
    ]);

    const currentBranch = branchSummary.current;
    const latestCommit = log.latest;
    
    let lastUpdateTime: string | null = null;
    try {
      const gitDir = join(NEBULA_ROOT, ".git");
      const stat = statSync(gitDir);
      lastUpdateTime = stat.mtime.toISOString();
    } catch {
      lastUpdateTime = latestCommit?.date || null;
    }

    const localBranches = branchSummary.all;
    const allRemoteBranches = remoteBranches.all
      .map((b: string) => b.replace(/^origin\//, "").trim())
      .filter((b: string) => b && !b.includes("HEAD"));

    const availableBranches = Array.from(new Set([...localBranches, ...allRemoteBranches]));

    return NextResponse.json({
      git: {
        branch: currentBranch,
        commit: latestCommit ? {
          hash: latestCommit.hash,
          shortHash: latestCommit.hash.substring(0, 7),
          message: latestCommit.message,
          author: latestCommit.author_name,
          date: latestCommit.date,
        } : null,
        lastUpdateTime,
        availableBranches,
      },
      files: {
        modified: status.modified,
        created: status.created,
        deleted: status.deleted,
        renamed: status.renamed,
        staged: status.staged,
        conflicted: status.conflicted,
        notAdded: status.not_added,
      },
      status: {
        isClean: status.isClean(),
        ahead: status.ahead,
        behind: status.behind,
        tracking: status.tracking,
      },
      root: NEBULA_ROOT,
    });
  } catch (error: any) {
    console.error("[Self API] Status error:", error);
    return NextResponse.json(
      { error: "Failed to get status", details: error.message },
      { status: 500 }
    );
  }
}
