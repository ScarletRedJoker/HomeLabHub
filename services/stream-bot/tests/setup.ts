import { beforeAll, vi } from 'vitest';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.SESSION_SECRET = 'test-session-secret-for-security-tests';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/streambot_test';
  
  process.env.AI_INTEGRATIONS_OPENAI_API_KEY = 'test-openai-key';
  process.env.AI_INTEGRATIONS_OPENAI_BASE_URL = 'https://test.openai.com/v1';
  
  process.env.TWITCH_CLIENT_ID = '';
  process.env.TWITCH_CLIENT_SECRET = '';
  process.env.YOUTUBE_CLIENT_ID = '';
  process.env.YOUTUBE_CLIENT_SECRET = '';
  process.env.KICK_CLIENT_ID = '';
  process.env.KICK_CLIENT_SECRET = '';
});

vi.mock('openai', () => {
  return {
    default: class OpenAI {
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'Test AI response' } }]
          })
        }
      };
    },
    OpenAI: class OpenAI {
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'Test AI response' } }]
          })
        }
      };
    }
  };
});
