import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPg from "connect-pg-simple";
import cors from "cors";
import rateLimit from "express-rate-limit";
import passport from "./auth/passport-oauth-config";
import { registerRoutes } from "./routes";
import { pool } from "./db";
import { getEnv } from "./env";

const PgSession = connectPg(session);

export async function createServer() {
  const app = express();

  app.set('trust proxy', 1);

  const NODE_ENV = getEnv('NODE_ENV', 'test');
  const SESSION_SECRET = getEnv('SESSION_SECRET', 'test-session-secret');

  process.env.NODE_ENV = NODE_ENV;
  app.set('env', NODE_ENV);

  app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));

  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Too many login attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use('/api/', apiLimiter);
  app.use('/auth/', authLimiter);

  const sessionMiddleware = session({
    store: new PgSession({
      pool: pool as any,
      tableName: "user_sessions",
      createTableIfMissing: true,
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: NODE_ENV === "production",
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  });

  app.use(sessionMiddleware);
  app.use(passport.initialize());
  app.use(passport.session());

  await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
  });

  return app;
}
