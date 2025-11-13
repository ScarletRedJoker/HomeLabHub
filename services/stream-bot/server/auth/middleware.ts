import type { Request, Response, NextFunction } from "express";
import type { User as DbUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends DbUser {}
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: "Authentication required" });
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.isAuthenticated() && req.user && req.user.role === "admin") {
    return next();
  }
  res.status(403).json({ error: "Admin access required" });
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  next();
}
