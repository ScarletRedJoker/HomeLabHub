/**
 * Integration tests for Stream Bot service on Replit
 */
import { describe, it, expect } from 'vitest';

const BASE_URL = 'http://localhost:3000';

describe('Stream Bot Integration Tests', () => {
  
  it('should have health endpoint responding', async () => {
    const response = await fetch(`${BASE_URL}/api/health`);
    expect(response.status).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('service', 'stream-bot');
    expect(data).toHaveProperty('environment', 'replit');
    expect(data).toHaveProperty('port', 3000);
    expect(data).toHaveProperty('demoMode', true);
  });
  
  it('should show bot manager status', async () => {
    const response = await fetch(`${BASE_URL}/api/health`);
    const data = await response.json();
    
    expect(data).toHaveProperty('bot');
    expect(data.bot).toHaveProperty('status');
    expect(data.bot).toHaveProperty('totalWorkers');
  });
  
  it('should show platform connections', async () => {
    const response = await fetch(`${BASE_URL}/api/health`);
    const data = await response.json();
    
    expect(data).toHaveProperty('platforms');
    expect(data.platforms).toHaveProperty('twitch');
    expect(data.platforms).toHaveProperty('youtube');
    expect(data.platforms).toHaveProperty('kick');
  });
  
  it('should show user metrics', async () => {
    const response = await fetch(`${BASE_URL}/api/health`);
    const data = await response.json();
    
    expect(data).toHaveProperty('users');
    expect(data.users).toHaveProperty('total');
    expect(data.users).toHaveProperty('activeInstances');
  });
  
  it('should have WebSocket status', async () => {
    const response = await fetch(`${BASE_URL}/api/health`);
    const data = await response.json();
    
    expect(data).toHaveProperty('websocket');
    expect(data.websocket).toHaveProperty('status');
  });
});
