/**
 * Repository Manager - Git operations for AI Developer
 * Handles diff generation, commit, apply, and rollback operations
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import path from 'path';
import { aiLogger } from '../logger';

const execAsync = promisify(exec);

export interface DiffStats {
  additions: number;
  deletions: number;
  hunks: number;
  files: number;
}

export interface FilePatch {
  filePath: string;
  patchType: 'create' | 'modify' | 'delete' | 'rename';
  originalContent: string | null;
  newContent: string | null;
  diffUnified: string;
  diffStats: DiffStats;
}

export interface CommitResult {
  success: boolean;
  commitHash?: string;
  error?: string;
}

export interface RollbackResult {
  success: boolean;
  restoredFiles: string[];
  error?: string;
}

const WORKSPACE_ROOT = process.cwd();

export class RepoManager {
  private workingDir: string;

  constructor(workingDir?: string) {
    this.workingDir = workingDir || WORKSPACE_ROOT;
  }

  async getCurrentBranch(): Promise<string> {
    try {
      const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
        cwd: this.workingDir,
      });
      return stdout.trim();
    } catch {
      return 'unknown';
    }
  }

  async getHeadCommit(): Promise<string> {
    try {
      const { stdout } = await execAsync('git rev-parse HEAD', {
        cwd: this.workingDir,
      });
      return stdout.trim();
    } catch {
      return '';
    }
  }

  async getStatus(): Promise<{ modified: string[]; added: string[]; deleted: string[]; untracked: string[] }> {
    try {
      const { stdout } = await execAsync('git status --porcelain', {
        cwd: this.workingDir,
      });

      const modified: string[] = [];
      const added: string[] = [];
      const deleted: string[] = [];
      const untracked: string[] = [];

      stdout.trim().split('\n').filter(Boolean).forEach(line => {
        const status = line.substring(0, 2);
        const file = line.substring(3);

        if (status.includes('M')) modified.push(file);
        if (status.includes('A')) added.push(file);
        if (status.includes('D')) deleted.push(file);
        if (status === '??') untracked.push(file);
      });

      return { modified, added, deleted, untracked };
    } catch {
      return { modified: [], added: [], deleted: [], untracked: [] };
    }
  }

  async getDiff(filePath?: string, staged = false): Promise<string> {
    try {
      let command = staged ? 'git diff --staged' : 'git diff';
      if (filePath) {
        command += ` -- "${filePath}"`;
      }

      const { stdout } = await execAsync(command, {
        cwd: this.workingDir,
        maxBuffer: 50 * 1024 * 1024,
      });

      return stdout;
    } catch {
      return '';
    }
  }

  async generatePatch(filePath: string, newContent: string): Promise<FilePatch> {
    const context = aiLogger.startRequest('ollama', 'generate_patch', { filePath });
    const fullPath = path.join(this.workingDir, filePath);

    let originalContent: string | null = null;
    let patchType: 'create' | 'modify' | 'delete' | 'rename' = 'create';

    try {
      originalContent = await fs.readFile(fullPath, 'utf-8');
      patchType = newContent ? 'modify' : 'delete';
    } catch {
      patchType = 'create';
    }

    const tempOriginal = `/tmp/patch_orig_${Date.now()}`;
    const tempNew = `/tmp/patch_new_${Date.now()}`;

    try {
      await fs.writeFile(tempOriginal, originalContent || '', 'utf-8');
      await fs.writeFile(tempNew, newContent || '', 'utf-8');

      const { stdout } = await execAsync(
        `diff -u "${tempOriginal}" "${tempNew}" || true`,
        { maxBuffer: 10 * 1024 * 1024 }
      );

      const diffLines = stdout.split('\n');
      let additions = 0;
      let deletions = 0;
      let hunks = 0;

      for (const line of diffLines) {
        if (line.startsWith('+') && !line.startsWith('+++')) additions++;
        if (line.startsWith('-') && !line.startsWith('---')) deletions++;
        if (line.startsWith('@@')) hunks++;
      }

      const patch: FilePatch = {
        filePath,
        patchType,
        originalContent,
        newContent,
        diffUnified: stdout.replace(tempOriginal, `a/${filePath}`).replace(tempNew, `b/${filePath}`),
        diffStats: {
          additions,
          deletions,
          hunks,
          files: 1,
        },
      };

      aiLogger.endRequest(context, true, {
        patchType,
        additions,
        deletions,
      });

      return patch;
    } finally {
      await fs.unlink(tempOriginal).catch(() => {});
      await fs.unlink(tempNew).catch(() => {});
    }
  }

  async applyPatch(patch: FilePatch): Promise<{ success: boolean; error?: string }> {
    const context = aiLogger.startRequest('ollama', 'apply_patch', { filePath: patch.filePath, patchType: patch.patchType });
    const fullPath = path.join(this.workingDir, patch.filePath);

    try {
      if (patch.patchType === 'delete') {
        await fs.unlink(fullPath);
      } else {
        await fs.mkdir(path.dirname(fullPath), { recursive: true });
        await fs.writeFile(fullPath, patch.newContent || '', 'utf-8');
      }

      aiLogger.endRequest(context, true, {});

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      aiLogger.logError(context, errorMessage);

      return { success: false, error: errorMessage };
    }
  }

  async rollbackPatch(patch: FilePatch): Promise<{ success: boolean; error?: string }> {
    const context = aiLogger.startRequest('ollama', 'rollback_patch', { filePath: patch.filePath });
    const fullPath = path.join(this.workingDir, patch.filePath);

    try {
      if (patch.patchType === 'create') {
        await fs.unlink(fullPath);
      } else if (patch.originalContent !== null) {
        await fs.writeFile(fullPath, patch.originalContent, 'utf-8');
      }

      aiLogger.endRequest(context, true, {});

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      aiLogger.logError(context, errorMessage);

      return { success: false, error: errorMessage };
    }
  }

  async stageFiles(files: string[]): Promise<{ success: boolean; error?: string }> {
    try {
      const fileList = files.map(f => `"${f}"`).join(' ');
      await execAsync(`git add ${fileList}`, { cwd: this.workingDir });
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async commit(message: string, author?: string): Promise<CommitResult> {
    const context = aiLogger.startRequest('ollama', 'git_commit', { message });

    try {
      let command = `git commit -m "${message.replace(/"/g, '\\"')}"`;
      
      if (author) {
        command += ` --author="${author}"`;
      }

      const { stdout } = await execAsync(command, { cwd: this.workingDir });
      
      const commitHashMatch = stdout.match(/\[.+\s([a-f0-9]+)\]/);
      const commitHash = commitHashMatch ? commitHashMatch[1] : undefined;

      aiLogger.endRequest(context, true, { 
        commitHash,
      });

      return { success: true, commitHash };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      aiLogger.logError(context, errorMessage);

      return { success: false, error: errorMessage };
    }
  }

  async rollbackToCommit(commitHash: string): Promise<RollbackResult> {
    const context = aiLogger.startRequest('ollama', 'git_rollback', { commitHash });

    try {
      const { stdout: diffFiles } = await execAsync(
        `git diff --name-only ${commitHash}..HEAD`,
        { cwd: this.workingDir }
      );

      const files = diffFiles.trim().split('\n').filter(Boolean);

      await execAsync(`git checkout ${commitHash} -- .`, { cwd: this.workingDir });

      aiLogger.endRequest(context, true, { 
        restoredFiles: files.length,
      });

      return { success: true, restoredFiles: files };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      aiLogger.logError(context, errorMessage);

      return { success: false, restoredFiles: [], error: errorMessage };
    }
  }

  async getFileHistory(filePath: string, limit = 10): Promise<Array<{
    hash: string;
    author: string;
    date: string;
    message: string;
  }>> {
    try {
      const { stdout } = await execAsync(
        `git log --pretty=format:'%H|%an|%ad|%s' --date=short -n ${limit} -- "${filePath}"`,
        { cwd: this.workingDir }
      );

      return stdout.trim().split('\n').filter(Boolean).map(line => {
        const [hash, author, date, message] = line.split('|');
        return { hash, author, date, message };
      });
    } catch {
      return [];
    }
  }

  async getFileAtCommit(filePath: string, commitHash: string): Promise<string | null> {
    try {
      const { stdout } = await execAsync(
        `git show ${commitHash}:"${filePath}"`,
        { cwd: this.workingDir, maxBuffer: 10 * 1024 * 1024 }
      );
      return stdout;
    } catch {
      return null;
    }
  }

  async createBranch(branchName: string): Promise<{ success: boolean; error?: string }> {
    try {
      await execAsync(`git checkout -b ${branchName}`, { cwd: this.workingDir });
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async switchBranch(branchName: string): Promise<{ success: boolean; error?: string }> {
    try {
      await execAsync(`git checkout ${branchName}`, { cwd: this.workingDir });
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async listBranches(): Promise<string[]> {
    try {
      const { stdout } = await execAsync('git branch --list', { cwd: this.workingDir });
      return stdout.trim().split('\n').map(b => b.replace(/^\*?\s+/, ''));
    } catch {
      return [];
    }
  }

  async createJobBranch(jobId: string, prefix: string = 'ai-dev'): Promise<{ success: boolean; branchName?: string; error?: string }> {
    const context = aiLogger.startRequest('ollama', 'create_job_branch', { jobId, prefix });

    try {
      const timestamp = Date.now();
      const branchName = `${prefix}/${jobId}-${timestamp}`;
      
      await execAsync(`git checkout -b "${branchName}"`, { cwd: this.workingDir });
      
      aiLogger.endRequest(context, true, { branchName });

      return { success: true, branchName };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(context, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  async mergeJobBranch(branchName: string, targetBranch: string): Promise<{ success: boolean; error?: string }> {
    const context = aiLogger.startRequest('ollama', 'merge_job_branch', { branchName, targetBranch });

    try {
      await execAsync(`git checkout "${targetBranch}"`, { cwd: this.workingDir });
      await execAsync(`git merge "${branchName}" --no-ff -m "Merge AI Developer job branch: ${branchName}"`, { cwd: this.workingDir });
      
      aiLogger.endRequest(context, true, {});

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(context, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  async deleteJobBranch(branchName: string): Promise<{ success: boolean; error?: string }> {
    const context = aiLogger.startRequest('ollama', 'delete_job_branch', { branchName });

    try {
      await execAsync(`git branch -D "${branchName}"`, { cwd: this.workingDir });
      
      aiLogger.endRequest(context, true, {});

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      aiLogger.logError(context, errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  async branchExists(branchName: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(`git rev-parse --verify "${branchName}"`, { cwd: this.workingDir });
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }
}

export const repoManager = new RepoManager();
