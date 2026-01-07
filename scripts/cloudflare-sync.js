#!/usr/bin/env node
/**
 * Cloudflare DNS Sync Script
 * Creates DNS records with HYBRID proxying:
 * - Media services: DNS-only (proxied:false) for full bandwidth
 * - Protected services: Cloudflare proxy (proxied:true) for DDoS protection
 * 
 * Usage: CLOUDFLARE_API_TOKEN=xxx DOMAIN=yourdomain.com node cloudflare-sync.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';

class CloudflareSync {
  constructor(apiToken) {
    this.apiToken = apiToken;
  }

  async request(method, endpoint, body = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(`${CLOUDFLARE_API}${endpoint}`);
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method,
        headers: {
          'Authorization': `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (json.success) {
              resolve(json.result);
            } else {
              reject(new Error(json.errors.map(e => e.message).join(', ')));
            }
          } catch (e) {
            reject(e);
          }
        });
      });

      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async getZoneId(zoneName) {
    const zones = await this.request('GET', `/zones?name=${zoneName}`);
    if (zones.length === 0) {
      throw new Error(`Zone ${zoneName} not found`);
    }
    return zones[0].id;
  }

  async getRecords(zoneId) {
    return await this.request('GET', `/zones/${zoneId}/dns_records?per_page=100`);
  }

  async createRecord(zoneId, record) {
    return await this.request('POST', `/zones/${zoneId}/dns_records`, record);
  }

  async updateRecord(zoneId, recordId, record) {
    return await this.request('PUT', `/zones/${zoneId}/dns_records/${recordId}`, record);
  }
}

function getPublicIP() {
  try {
    return execSync('curl -s https://api.ipify.org', { encoding: 'utf8' }).trim();
  } catch {
    try {
      return execSync('curl -s https://ifconfig.me', { encoding: 'utf8' }).trim();
    } catch {
      throw new Error('Could not determine public IP');
    }
  }
}

// HYBRID SUBDOMAIN CONFIGURATION
// proxied: false = DNS-only (direct connection, full bandwidth for streaming)
// proxied: true = Cloudflare proxy (DDoS protection, but bandwidth limited)
const SUBDOMAINS = [
  // === MEDIA SERVICES (DNS-only for FULL BANDWIDTH) ===
  { name: 'plex', description: 'Plex Media Server', proxied: false },
  { name: 'jellyfin', description: 'Jellyfin Community Sharing', proxied: false },
  { name: 'gamestream', description: 'Sunshine Game Streaming', proxied: false },
  
  // === HOME AUTOMATION (DNS-only for low latency) ===
  { name: 'home', description: 'Home Assistant', proxied: false },
  
  // === DASHBOARD & API (Can use proxy - low bandwidth) ===
  { name: 'dashboard', description: 'Nebula Command Dashboard', proxied: true },
  { name: 'api', description: 'API/Webhooks', proxied: true },
  { name: 'auth', description: 'Authelia SSO', proxied: true },
  
  // === PROTECTED SERVICES (Cloudflare proxy for security) ===
  { name: 'torrent', description: 'qBittorrent (protected)', proxied: true },
  { name: 'storage', description: 'MinIO Console (protected)', proxied: true },
  { name: 's3', description: 'MinIO S3 API (protected)', proxied: true },
  { name: 'vnc', description: 'Remote Desktop (protected)', proxied: true },
  { name: 'ssh', description: 'Web SSH Terminal (protected)', proxied: true },
  { name: 'vms', description: 'Cockpit VM Manager (protected)', proxied: true },
];

async function main() {
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const domain = process.env.DOMAIN;

  if (!apiToken) {
    console.error('Error: CLOUDFLARE_API_TOKEN environment variable required');
    process.exit(1);
  }

  if (!domain || domain === 'example.com') {
    console.error('Error: DOMAIN environment variable must be set to your actual domain');
    process.exit(1);
  }

  console.log('=== Cloudflare DNS Sync (Hybrid Mode) ===\n');
  
  console.log('Detecting public IP...');
  const serverIP = getPublicIP();
  console.log(`Server IP: ${serverIP}\n`);

  const cf = new CloudflareSync(apiToken);

  console.log(`Getting zone ID for ${domain}...`);
  const zoneId = await cf.getZoneId(domain);
  console.log(`Zone ID: ${zoneId}\n`);

  console.log('Fetching existing DNS records...');
  const existingRecords = await cf.getRecords(zoneId);
  const recordMap = {};
  for (const record of existingRecords) {
    recordMap[record.name] = record;
  }

  console.log('\n--- DNS-only (Full Bandwidth for Streaming) ---');
  for (const subdomain of SUBDOMAINS.filter(s => !s.proxied)) {
    const fqdn = `${subdomain.name}.${domain}`;
    const existing = recordMap[fqdn];

    const newRecord = {
      type: 'A',
      name: fqdn,
      content: serverIP,
      ttl: 300,
      proxied: false,
    };

    if (existing) {
      if (existing.content !== serverIP || existing.proxied !== false) {
        console.log(`  Updating ${fqdn} -> ${serverIP} (DNS-only)`);
        await cf.updateRecord(zoneId, existing.id, newRecord);
      } else {
        console.log(`  ${fqdn} - OK`);
      }
    } else {
      console.log(`  Creating ${fqdn} -> ${serverIP} (DNS-only)`);
      await cf.createRecord(zoneId, newRecord);
    }
  }

  console.log('\n--- Cloudflare Proxied (DDoS Protection) ---');
  for (const subdomain of SUBDOMAINS.filter(s => s.proxied)) {
    const fqdn = `${subdomain.name}.${domain}`;
    const existing = recordMap[fqdn];

    const newRecord = {
      type: 'A',
      name: fqdn,
      content: serverIP,
      ttl: 1, // Auto TTL for proxied records
      proxied: true,
    };

    if (existing) {
      if (existing.content !== serverIP || existing.proxied !== true) {
        console.log(`  Updating ${fqdn} -> ${serverIP} (proxied)`);
        await cf.updateRecord(zoneId, existing.id, newRecord);
      } else {
        console.log(`  ${fqdn} - OK`);
      }
    } else {
      console.log(`  Creating ${fqdn} -> ${serverIP} (proxied)`);
      await cf.createRecord(zoneId, newRecord);
    }
  }

  console.log('\n=== DNS Sync Complete ===\n');
  console.log('IMPORTANT: For DNS-only subdomains, ensure your router forwards:');
  console.log('  - TCP 80 -> homelab:80 (HTTP -> HTTPS redirect)');
  console.log('  - TCP 443 -> homelab:443 (HTTPS/TLS)');
  console.log('  - TCP 32400 -> homelab:32400 (Plex direct, optional)');
  console.log('\nMedia services now have FULL BANDWIDTH - no Cloudflare throttling!');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
