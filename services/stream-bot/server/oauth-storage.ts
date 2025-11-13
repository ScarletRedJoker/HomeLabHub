/**
 * In-memory storage for OAuth state/PKCE parameters during the flow
 * These are temporary and only needed for the duration of the OAuth callback
 */

interface OAuthSession {
  userId: string;
  state: string;
  codeVerifier?: string; // PKCE
  platform: string;
  createdAt: number;
}

const sessions = new Map<string, OAuthSession>();

// Clean up old sessions every 10 minutes
setInterval(() => {
  const now = Date.now();
  const maxAge = 10 * 60 * 1000; // 10 minutes
  
  for (const [state, session] of sessions.entries()) {
    if (now - session.createdAt > maxAge) {
      sessions.delete(state);
    }
  }
}, 10 * 60 * 1000);

export const oauthStorage = {
  /**
   * Store OAuth session for callback verification
   */
  set(state: string, session: Omit<OAuthSession, 'state' | 'createdAt'>): void {
    sessions.set(state, {
      ...session,
      state,
      createdAt: Date.now(),
    });
  },

  /**
   * Retrieve and remove OAuth session
   */
  get(state: string): OAuthSession | null {
    const session = sessions.get(state);
    if (session) {
      sessions.delete(state); // One-time use
      return session;
    }
    return null;
  },

  /**
   * Check if state exists (for debugging)
   */
  has(state: string): boolean {
    return sessions.has(state);
  },
};
