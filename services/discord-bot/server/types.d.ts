import { type DiscordUser } from "@shared/schema";

declare global {
  namespace Express {
    interface User extends DiscordUser {}
  }
}

export {};
