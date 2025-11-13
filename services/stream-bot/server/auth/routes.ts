import { Router } from "express";
import passport from "./passport-config";
import bcrypt from "bcryptjs";
import { db } from "../db";
import { users, botConfigs, botInstances } from "@shared/schema";
import { signupSchema, loginSchema } from "@shared/schema";
import { eq } from "drizzle-orm";

const router = Router();

router.post("/signup", async (req, res) => {
  try {
    const validatedData = signupSchema.parse(req.body);
    const { email, password } = validatedData;

    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email.toLowerCase()),
    });

    if (existingUser) {
      return res.status(400).json({ error: "Email already registered" });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [newUser] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        role: "user",
        isActive: true,
      })
      .returning();

    await db.insert(botConfigs).values({
      userId: newUser.id,
      intervalMode: "manual",
      fixedIntervalMinutes: 30,
      randomMinMinutes: 15,
      randomMaxMinutes: 60,
      aiModel: "gpt-5-mini",
      aiPromptTemplate:
        "Generate a fun, interesting, and engaging fact similar to a Snapple fact. Keep it under 200 characters.",
      aiTemperature: 1,
      enableChatTriggers: true,
      chatKeywords: ["!snapple", "!fact"],
      activePlatforms: [],
      isActive: false,
    });

    await db.insert(botInstances).values({
      userId: newUser.id,
      status: "stopped",
    });

    req.login(newUser, (err) => {
      if (err) {
        console.error("Login error after signup:", err);
        return res.status(500).json({ error: "Failed to log in after signup" });
      }

      const userResponse = {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role,
        isActive: newUser.isActive,
        createdAt: newUser.createdAt,
      };

      res.status(201).json(userResponse);
    });
  } catch (error: any) {
    console.error("Signup error:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create account" });
  }
});

router.post("/login", (req, res, next) => {
  try {
    const validatedData = loginSchema.parse(req.body);
    
    passport.authenticate("local", (err: any, user: any, info: any) => {
      if (err) {
        console.error("Login error:", err);
        return res.status(500).json({ error: "Login failed" });
      }

      if (!user) {
        return res.status(401).json({ error: info?.message || "Invalid credentials" });
      }

      req.login(user, (loginErr) => {
        if (loginErr) {
          console.error("Session creation error:", loginErr);
          return res.status(500).json({ error: "Failed to create session" });
        }

        const userResponse = {
          id: user.id,
          email: user.email,
          role: user.role,
          isActive: user.isActive,
          createdAt: user.createdAt,
        };

        res.json(userResponse);
      });
    })(req, res, next);
  } catch (error: any) {
    console.error("Login validation error:", error);
    if (error.name === "ZodError") {
      return res.status(400).json({ error: "Invalid input", details: error.errors });
    }
    res.status(500).json({ error: "Login failed" });
  }
});

router.post("/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.status(500).json({ error: "Failed to log out" });
    }
    res.json({ message: "Logged out successfully" });
  });
});

router.get("/me", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const userResponse = {
    id: req.user!.id,
    email: req.user!.email,
    role: req.user!.role,
    isActive: req.user!.isActive,
    createdAt: req.user!.createdAt,
  };

  res.json(userResponse);
});

router.post("/change-password", async (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: "Current and new passwords are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.user!.id));

    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);

    if (!isValidPassword) {
      return res.status(401).json({ error: "Current password is incorrect" });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);

    await db
      .update(users)
      .set({ passwordHash: newPasswordHash, updatedAt: new Date() })
      .where(eq(users.id, req.user!.id));

    res.json({ message: "Password changed successfully" });
  } catch (error) {
    console.error("Password change error:", error);
    res.status(500).json({ error: "Failed to change password" });
  }
});

export default router;
