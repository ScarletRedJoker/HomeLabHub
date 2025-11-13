import { Request, Response, NextFunction } from "express";
import { dbStorage as storage } from "../database-storage";

export async function isDeveloperMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const developerId = req.user!.id;
    
    const developer = await storage.getDeveloper(developerId);
    
    if (!developer || !developer.isActive) {
      return res.status(403).json({ error: "Developer access required" });
    }
    
    next();
  } catch (error) {
    console.error("Developer auth middleware error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

export async function logDeveloperAction(
  developerId: string,
  action: string,
  metadata?: any,
  req?: Request
): Promise<void> {
  try {
    await storage.createDeveloperAuditLog({
      developerId,
      action,
      metadata: metadata ? JSON.stringify(metadata) : null,
      ipAddress: req?.ip || req?.socket.remoteAddress || null,
      userAgent: req?.get('user-agent') || null
    });
  } catch (error) {
    console.error("Failed to log developer action:", error);
  }
}
