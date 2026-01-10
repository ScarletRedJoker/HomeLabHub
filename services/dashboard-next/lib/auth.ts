import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";

export async function checkAuth(): Promise<boolean> {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return false;
  const user = await verifySession(session.value);
  return !!user;
}

export async function getUser(): Promise<{ username: string } | null> {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  const user = await verifySession(session.value);
  return user;
}
