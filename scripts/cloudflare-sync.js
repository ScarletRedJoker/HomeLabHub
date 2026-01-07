#!/usr/bin/env node
/**
 * Cloudflare DNS Sync Script
 * Creates DNS records with HYBRID proxying:
 * - Media services: DNS-only (proxied:false) for full bandwidth
 * - Protected services: Cloudflare proxy (proxied:true) for DDoS protection
 * 
 * Usage: CLOUDFLARE_API_TOKEN=xxx DOMAIN=yourdomain.com node cloudflare-sync.js [--verify]
 * 
 * Environment Variables:
 * - CLOUDFLARE_API_TOKEN: Your Cloudflare API token
 * - DOMAIN: Your domain name
 * - ENABLED_PROFILES: Comma-separated list of enabled profiles (e.g., "torrents,gamestream,monitoring")
 *                     If not set, all profiles are enabled
 * 
 * Flags:
 * - --verify: Enable DNS verification after syncing records
 */

import https from 'https';
import dns from 'dns';
import { execSync } from 'child_process';

const CLOUDFLARE_API = 'https://api.cloudflare.com/client/v4';

const DEFAULT_RETRY_OPTIONS = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
};

class CloudflareSync {
  constructor(apiToken, retryOptions = {}) {
    this.apiToken = apiToken;
    this.retryOptions = { ...DEFAULT_RETRY_OPTIONS, ...retryOptions };
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async request(method, endpoint, body = null) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.retryOptions.maxRetries; attempt++) {
      try {
        return await this._makeRequest(method, endpoint, body);
      } catch (error) {
        lastError = error;
        
        const isRetryable = this._isRetryableError(error);
        const isLastAttempt = attempt === this.retryOptions.maxRetries;
        
        if (!isRetryable || isLastAttempt) {
          throw new Error(`API request failed after ${attempt + 1} attempt(s): ${error.message}`);
        }
        
        const delay = Math.min(
          this.retryOptions.baseDelayMs * Math.pow(2, attempt),
          this.retryOptions.maxDelayMs
        );
        
        console.log(`  ⚠ Request failed (attempt ${attempt + 1}/${this.retryOptions.maxRetries + 1}), retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }

  _isRetryableError(error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('rate limit') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('enotfound') ||
      message.includes('socket hang up') ||
      message.includes('5') // 5xx errors
    );
  }

  _makeRequest(method, endpoint, body = null) {
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
        timeout: 30000,
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
              const errorMessages = json.errors.map(e => `${e.code}: ${e.message}`).join(', ');
              reject(new Error(errorMessages));
            }
          } catch (e) {
            reject(new Error(`Failed to parse API response: ${e.message}`));
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.on('error', (err) => {
        reject(new Error(`Network error: ${err.message}`));
      });

      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  async getZoneId(zoneName) {
    const zones = await this.request('GET', `/zones?name=${zoneName}`);
    if (zones.length === 0) {
      throw new Error(`Zone "${zoneName}" not found. Ensure the domain is added to your Cloudflare account.`);
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

  async deleteRecord(zoneId, recordId) {
    return await this.request('DELETE', `/zones/${zoneId}/dns_records/${recordId}`);
  }
}

function getPublicIP() {
  const sources = [
    'https://api.ipify.org',
    'https://ifconfig.me',
    'https://icanhazip.com',
  ];
  
  for (const source of sources) {
    try {
      const ip = execSync(`curl -s --max-time 10 ${source}`, { encoding: 'utf8' }).trim();
      if (ip && /^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
        return ip;
      }
    } catch {
      continue;
    }
  }
  
  throw new Error('Could not determine public IP from any source');
}

async function verifyDNS(fqdn, expectedIP, timeout = 5000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ success: false, error: 'DNS lookup timeout' });
    }, timeout);

    dns.resolve4(fqdn, (err, addresses) => {
      clearTimeout(timer);
      
      if (err) {
        resolve({ success: false, error: `DNS error: ${err.code}` });
        return;
      }
      
      if (addresses.includes(expectedIP)) {
        resolve({ success: true, resolved: addresses });
      } else {
        resolve({ 
          success: false, 
          error: `IP mismatch: expected ${expectedIP}, got ${addresses.join(', ')}`,
          resolved: addresses 
        });
      }
    });
  });
}

function parseEnabledProfiles() {
  const profilesEnv = process.env.ENABLED_PROFILES;
  if (!profilesEnv) {
    return null;
  }
  return profilesEnv.split(',').map(p => p.trim().toLowerCase()).filter(Boolean);
}

function isProfileEnabled(subdomain, enabledProfiles) {
  if (!enabledProfiles) {
    return true;
  }
  
  if (!subdomain.profile) {
    return true;
  }
  
  return enabledProfiles.includes(subdomain.profile.toLowerCase());
}

// HYBRID SUBDOMAIN CONFIGURATION
// proxied: false = DNS-only (direct connection, full bandwidth for streaming)
// proxied: true = Cloudflare proxy (DDoS protection, but bandwidth limited)
// profile: optional profile name for conditional creation
const SUBDOMAINS = [
  // === MEDIA SERVICES (DNS-only for FULL BANDWIDTH) ===
  { name: 'plex', description: 'Plex Media Server', proxied: false, profile: null },
  { name: 'jellyfin', description: 'Jellyfin Community Sharing', proxied: false, profile: null },
  { name: 'gamestream', description: 'Sunshine Game Streaming', proxied: false, profile: 'gamestream' },
  
  // === HOME AUTOMATION (DNS-only for low latency) ===
  { name: 'home', description: 'Home Assistant', proxied: false, profile: null },
  
  // === DASHBOARD & API (Can use proxy - low bandwidth) ===
  { name: 'dashboard', description: 'Nebula Command Dashboard', proxied: true, profile: null },
  { name: 'api', description: 'API/Webhooks', proxied: true, profile: null },
  { name: 'auth', description: 'Authelia SSO', proxied: true, profile: null },
  
  // === PROTECTED SERVICES (Cloudflare proxy for security) ===
  { name: 'torrent', description: 'qBittorrent (protected)', proxied: true, profile: 'torrents' },
  { name: 'storage', description: 'MinIO Console (protected)', proxied: true, profile: null },
  { name: 's3', description: 'MinIO S3 API (protected)', proxied: true, profile: null },
  { name: 'vnc', description: 'Remote Desktop (protected)', proxied: true, profile: null },
  { name: 'ssh', description: 'Web SSH Terminal (protected)', proxied: true, profile: null },
  { name: 'vms', description: 'Cockpit VM Manager (protected)', proxied: true, profile: null },
];

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    verify: args.includes('--verify'),
    help: args.includes('--help') || args.includes('-h'),
  };
}

function printHelp() {
  console.log(`
Cloudflare DNS Sync Script

Usage: node cloudflare-sync.js [options]

Options:
  --verify    Enable DNS verification after syncing records
  --help, -h  Show this help message

Environment Variables:
  CLOUDFLARE_API_TOKEN  Required. Your Cloudflare API token
  DOMAIN                Required. Your domain name (e.g., example.com)
  ENABLED_PROFILES      Optional. Comma-separated list of enabled profiles
                        (e.g., "torrents,gamestream,monitoring")
                        If not set, all services are synced

Profiles:
  torrents    - torrent subdomain
  gamestream  - gamestream subdomain
`);
}

async function main() {
  const args = parseArgs();
  
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const domain = process.env.DOMAIN;
  const enabledProfiles = parseEnabledProfiles();

  if (!apiToken) {
    console.error('Error: CLOUDFLARE_API_TOKEN environment variable required');
    console.error('Hint: Create an API token at https://dash.cloudflare.com/profile/api-tokens');
    process.exit(1);
  }

  if (!domain || domain === 'example.com') {
    console.error('Error: DOMAIN environment variable must be set to your actual domain');
    process.exit(1);
  }

  console.log('=== Cloudflare DNS Sync (Hybrid Mode) ===\n');
  
  if (enabledProfiles) {
    console.log(`Enabled profiles: ${enabledProfiles.join(', ')}`);
  } else {
    console.log('All profiles enabled (ENABLED_PROFILES not set)');
  }
  
  if (args.verify) {
    console.log('DNS verification: ENABLED\n');
  } else {
    console.log('DNS verification: DISABLED (use --verify to enable)\n');
  }
  
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

  const stats = {
    synced: 0,
    created: 0,
    updated: 0,
    skipped: 0,
    unchanged: 0,
    verificationResults: [],
  };

  async function processSubdomain(subdomain, serverIP, domain, zoneId, cf, recordMap, stats, enabledProfiles, shouldVerify) {
    const fqdn = `${subdomain.name}.${domain}`;
    
    if (!isProfileEnabled(subdomain, enabledProfiles)) {
      console.log(`  ⊘ ${fqdn} - SKIPPED (profile "${subdomain.profile}" not enabled)`);
      stats.skipped++;
      return;
    }

    const existing = recordMap[fqdn];
    const proxyStatus = subdomain.proxied ? 'proxied' : 'DNS-only';

    const newRecord = {
      type: 'A',
      name: fqdn,
      content: serverIP,
      ttl: subdomain.proxied ? 1 : 300,
      proxied: subdomain.proxied,
    };

    let action = 'unchanged';

    if (existing) {
      // If existing record is a different type (e.g., CNAME), delete it first
      if (existing.type !== 'A') {
        console.log(`  ⚠ ${fqdn} has ${existing.type} record, replacing with A record`);
        await cf.deleteRecord(zoneId, existing.id);
        console.log(`  + Creating ${fqdn} -> ${serverIP} (${proxyStatus})`);
        await cf.createRecord(zoneId, newRecord);
        stats.updated++;
        stats.synced++;
        action = 'updated';
      } else if (existing.content !== serverIP || existing.proxied !== subdomain.proxied) {
        console.log(`  ↻ Updating ${fqdn} -> ${serverIP} (${proxyStatus})`);
        await cf.updateRecord(zoneId, existing.id, newRecord);
        stats.updated++;
        stats.synced++;
        action = 'updated';
      } else {
        console.log(`  ✓ ${fqdn} - OK`);
        stats.unchanged++;
      }
    } else {
      console.log(`  + Creating ${fqdn} -> ${serverIP} (${proxyStatus})`);
      await cf.createRecord(zoneId, newRecord);
      stats.created++;
      stats.synced++;
      action = 'created';
    }

    if (shouldVerify && action !== 'unchanged') {
      console.log(`    Verifying DNS propagation...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const result = await verifyDNS(fqdn, serverIP);
      stats.verificationResults.push({ fqdn, ...result });
      
      if (result.success) {
        console.log(`    ✓ DNS verified: ${fqdn} -> ${result.resolved.join(', ')}`);
      } else {
        console.log(`    ⚠ DNS not yet propagated: ${result.error}`);
      }
    }
  }

  console.log('\n--- DNS-only (Full Bandwidth for Streaming) ---');
  for (const subdomain of SUBDOMAINS.filter(s => !s.proxied)) {
    await processSubdomain(subdomain, serverIP, domain, zoneId, cf, recordMap, stats, enabledProfiles, args.verify);
  }

  console.log('\n--- Cloudflare Proxied (DDoS Protection) ---');
  for (const subdomain of SUBDOMAINS.filter(s => s.proxied)) {
    await processSubdomain(subdomain, serverIP, domain, zoneId, cf, recordMap, stats, enabledProfiles, args.verify);
  }

  console.log('\n' + '='.repeat(50));
  console.log('                    SUMMARY');
  console.log('='.repeat(50));
  console.log(`  Total records processed: ${SUBDOMAINS.length}`);
  console.log(`  ├─ Created:   ${stats.created}`);
  console.log(`  ├─ Updated:   ${stats.updated}`);
  console.log(`  ├─ Unchanged: ${stats.unchanged}`);
  console.log(`  └─ Skipped:   ${stats.skipped} (profile disabled)`);
  
  if (args.verify && stats.verificationResults.length > 0) {
    console.log('\n  DNS Verification Results:');
    const verified = stats.verificationResults.filter(r => r.success).length;
    const failed = stats.verificationResults.filter(r => !r.success).length;
    console.log(`  ├─ Verified:  ${verified}`);
    console.log(`  └─ Pending:   ${failed} (may need time to propagate)`);
    
    if (failed > 0) {
      console.log('\n  Pending DNS records:');
      for (const result of stats.verificationResults.filter(r => !r.success)) {
        console.log(`    - ${result.fqdn}: ${result.error}`);
      }
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('\nIMPORTANT: For DNS-only subdomains, ensure your router forwards:');
  console.log('  - TCP 80 -> homelab:80 (HTTP -> HTTPS redirect)');
  console.log('  - TCP 443 -> homelab:443 (HTTPS/TLS)');
  console.log('  - TCP 32400 -> homelab:32400 (Plex direct, optional)');
  console.log('\nMedia services now have FULL BANDWIDTH - no Cloudflare throttling!');
}

main().catch(err => {
  console.error('\n❌ Error:', err.message);
  console.error('\nTroubleshooting:');
  console.error('  - Verify CLOUDFLARE_API_TOKEN has Zone.DNS permissions');
  console.error('  - Ensure DOMAIN matches a zone in your Cloudflare account');
  console.error('  - Check your internet connection');
  process.exit(1);
});
