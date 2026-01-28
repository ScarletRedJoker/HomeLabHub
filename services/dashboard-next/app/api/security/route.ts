import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import { userService } from "@/lib/services/user-service";
import * as dns from "dns";
import * as net from "net";
import * as https from "https";
import * as http from "http";
import { promisify } from "util";

const dnsResolve = promisify(dns.resolve);
const dnsReverse = promisify(dns.reverse);
const dnsResolve4 = promisify(dns.resolve4);
const dnsResolve6 = promisify(dns.resolve6);
const dnsResolveMx = promisify(dns.resolveMx);
const dnsResolveTxt = promisify(dns.resolveTxt);
const dnsResolveNs = promisify(dns.resolveNs);
const dnsResolveCname = promisify(dns.resolveCname);

async function checkAdminAuth(): Promise<{ authorized: boolean; isAdmin: boolean }> {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return { authorized: false, isAdmin: false };
  
  const sessionData = await verifySession(session.value);
  if (!sessionData) return { authorized: false, isAdmin: false };
  
  if (sessionData.userId) {
    const user = await userService.getUserById(sessionData.userId);
    if (!user || !user.isActive) return { authorized: false, isAdmin: false };
    return { authorized: true, isAdmin: user.role === "admin" };
  }
  
  const user = await userService.getUserByUsername(sessionData.username);
  if (!user || !user.isActive) {
    if (sessionData.username === process.env.ADMIN_USERNAME) {
      return { authorized: true, isAdmin: true };
    }
    return { authorized: false, isAdmin: false };
  }
  
  return { authorized: true, isAdmin: user.role === "admin" };
}

async function scanPort(host: string, port: number, timeout = 3000): Promise<{ port: number; open: boolean; service?: string }> {
  const commonPorts: Record<number, string> = {
    21: "FTP",
    22: "SSH",
    23: "Telnet",
    25: "SMTP",
    53: "DNS",
    80: "HTTP",
    110: "POP3",
    143: "IMAP",
    443: "HTTPS",
    465: "SMTPS",
    587: "SMTP/Submission",
    993: "IMAPS",
    995: "POP3S",
    3306: "MySQL",
    3389: "RDP",
    5432: "PostgreSQL",
    6379: "Redis",
    8080: "HTTP-Alt",
    8443: "HTTPS-Alt",
    27017: "MongoDB",
  };

  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);

    socket.on("connect", () => {
      socket.destroy();
      resolve({ port, open: true, service: commonPorts[port] });
    });

    socket.on("timeout", () => {
      socket.destroy();
      resolve({ port, open: false });
    });

    socket.on("error", () => {
      socket.destroy();
      resolve({ port, open: false });
    });

    socket.connect(port, host);
  });
}

async function checkSSL(hostname: string): Promise<any> {
  return new Promise((resolve) => {
    const options = {
      hostname,
      port: 443,
      method: "GET",
      rejectUnauthorized: false,
      timeout: 10000,
    };

    const req = https.request(options, (res) => {
      const socket = res.socket as any;
      const cert = socket.getPeerCertificate();
      
      if (cert && Object.keys(cert).length > 0) {
        const validFrom = new Date(cert.valid_from);
        const validTo = new Date(cert.valid_to);
        const now = new Date();
        const daysUntilExpiry = Math.floor((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        resolve({
          valid: socket.authorized,
          issuer: cert.issuer,
          subject: cert.subject,
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          daysUntilExpiry,
          expired: daysUntilExpiry < 0,
          expiringSoon: daysUntilExpiry > 0 && daysUntilExpiry < 30,
          serialNumber: cert.serialNumber,
          fingerprint: cert.fingerprint,
          protocol: socket.getProtocol?.() || "unknown",
        });
      } else {
        resolve({ valid: false, error: "No certificate found" });
      }
    });

    req.on("error", (err) => {
      resolve({ valid: false, error: err.message });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({ valid: false, error: "Connection timeout" });
    });

    req.end();
  });
}

async function checkSecurityHeaders(url: string): Promise<any> {
  return new Promise((resolve) => {
    const parsedUrl = new URL(url.startsWith("http") ? url : `https://${url}`);
    const client = parsedUrl.protocol === "https:" ? https : http;
    
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      path: parsedUrl.pathname || "/",
      method: "HEAD",
      timeout: 10000,
    };

    const req = client.request(options, (res) => {
      const headers = res.headers;
      const securityHeaders = {
        "Strict-Transport-Security": {
          present: !!headers["strict-transport-security"],
          value: headers["strict-transport-security"] || null,
          recommendation: "max-age=31536000; includeSubDomains; preload",
        },
        "X-Content-Type-Options": {
          present: !!headers["x-content-type-options"],
          value: headers["x-content-type-options"] || null,
          recommendation: "nosniff",
        },
        "X-Frame-Options": {
          present: !!headers["x-frame-options"],
          value: headers["x-frame-options"] || null,
          recommendation: "DENY or SAMEORIGIN",
        },
        "X-XSS-Protection": {
          present: !!headers["x-xss-protection"],
          value: headers["x-xss-protection"] || null,
          recommendation: "1; mode=block",
        },
        "Content-Security-Policy": {
          present: !!headers["content-security-policy"],
          value: headers["content-security-policy"] || null,
          recommendation: "Define a strict CSP policy",
        },
        "Referrer-Policy": {
          present: !!headers["referrer-policy"],
          value: headers["referrer-policy"] || null,
          recommendation: "strict-origin-when-cross-origin",
        },
        "Permissions-Policy": {
          present: !!headers["permissions-policy"],
          value: headers["permissions-policy"] || null,
          recommendation: "Define feature permissions",
        },
      };

      const presentCount = Object.values(securityHeaders).filter(h => h.present).length;
      const score = Math.round((presentCount / Object.keys(securityHeaders).length) * 100);

      resolve({
        url,
        statusCode: res.statusCode,
        headers: securityHeaders,
        score,
        grade: score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : score >= 20 ? "D" : "F",
      });
    });

    req.on("error", (err) => {
      resolve({ url, error: err.message });
    });

    req.on("timeout", () => {
      req.destroy();
      resolve({ url, error: "Connection timeout" });
    });

    req.end();
  });
}

async function dnsLookup(hostname: string): Promise<any> {
  const results: any = { hostname };
  
  try {
    results.a = await dnsResolve4(hostname).catch(() => []);
    results.aaaa = await dnsResolve6(hostname).catch(() => []);
    results.mx = await dnsResolveMx(hostname).catch(() => []);
    results.txt = await dnsResolveTxt(hostname).catch(() => []);
    results.ns = await dnsResolveNs(hostname).catch(() => []);
    results.cname = await dnsResolveCname(hostname).catch(() => []);
    
    if (results.a.length > 0) {
      results.reverse = await dnsReverse(results.a[0]).catch(() => []);
    }
  } catch (err: any) {
    results.error = err.message;
  }
  
  return results;
}

async function checkVulnerabilities(url: string): Promise<any> {
  const vulnerabilities: any[] = [];
  const parsedUrl = new URL(url.startsWith("http") ? url : `https://${url}`);
  
  const headersResult = await checkSecurityHeaders(url);
  if (!headersResult.error) {
    if (!headersResult.headers["Strict-Transport-Security"]?.present) {
      vulnerabilities.push({
        severity: "high",
        type: "missing-hsts",
        title: "Missing HSTS Header",
        description: "HTTP Strict Transport Security header is not set. This can leave users vulnerable to downgrade attacks.",
      });
    }
    
    if (!headersResult.headers["X-Content-Type-Options"]?.present) {
      vulnerabilities.push({
        severity: "medium",
        type: "missing-xcto",
        title: "Missing X-Content-Type-Options",
        description: "X-Content-Type-Options header is not set. This can allow MIME-type sniffing attacks.",
      });
    }
    
    if (!headersResult.headers["Content-Security-Policy"]?.present) {
      vulnerabilities.push({
        severity: "high",
        type: "missing-csp",
        title: "Missing Content Security Policy",
        description: "No CSP header found. This increases the risk of XSS attacks.",
      });
    }
    
    if (!headersResult.headers["X-Frame-Options"]?.present) {
      vulnerabilities.push({
        severity: "medium",
        type: "missing-xfo",
        title: "Missing X-Frame-Options",
        description: "X-Frame-Options header is not set. This can allow clickjacking attacks.",
      });
    }
  }
  
  if (parsedUrl.protocol === "https:") {
    const sslResult = await checkSSL(parsedUrl.hostname);
    if (sslResult.expired) {
      vulnerabilities.push({
        severity: "critical",
        type: "ssl-expired",
        title: "SSL Certificate Expired",
        description: `The SSL certificate expired on ${sslResult.validTo}`,
      });
    } else if (sslResult.expiringSoon) {
      vulnerabilities.push({
        severity: "warning",
        type: "ssl-expiring",
        title: "SSL Certificate Expiring Soon",
        description: `The SSL certificate will expire in ${sslResult.daysUntilExpiry} days`,
      });
    }
    
    if (!sslResult.valid && !sslResult.expired) {
      vulnerabilities.push({
        severity: "high",
        type: "ssl-invalid",
        title: "SSL Certificate Invalid",
        description: sslResult.error || "The SSL certificate is not trusted",
      });
    }
  } else {
    vulnerabilities.push({
      severity: "high",
      type: "no-https",
      title: "Not Using HTTPS",
      description: "The site is not using HTTPS, which means all traffic is unencrypted.",
    });
  }
  
  return {
    url,
    vulnerabilities,
    summary: {
      critical: vulnerabilities.filter(v => v.severity === "critical").length,
      high: vulnerabilities.filter(v => v.severity === "high").length,
      medium: vulnerabilities.filter(v => v.severity === "medium").length,
      warning: vulnerabilities.filter(v => v.severity === "warning").length,
      total: vulnerabilities.length,
    },
  };
}

export async function GET(request: NextRequest) {
  const auth = await checkAdminAuth();
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!auth.isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  return NextResponse.json({
    message: "Security scanning API",
    endpoints: {
      "POST /api/security": "Run security scans",
      "POST /api/security?action=port-scan": "Port scan a host",
      "POST /api/security?action=ssl-check": "Check SSL certificate",
      "POST /api/security?action=headers": "Check security headers",
      "POST /api/security?action=dns": "DNS lookup",
      "POST /api/security?action=vulnerability-scan": "Basic vulnerability scan",
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await checkAdminAuth();
  if (!auth.authorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!auth.isAdmin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const body = await request.json();

    switch (action) {
      case "port-scan": {
        const { host, ports } = body;
        if (!host) {
          return NextResponse.json({ error: "Host is required" }, { status: 400 });
        }
        
        const portsToScan = ports || [21, 22, 23, 25, 53, 80, 110, 143, 443, 465, 587, 993, 995, 3306, 3389, 5432, 6379, 8080, 8443];
        const results = await Promise.all(portsToScan.map((port: number) => scanPort(host, port)));
        const openPorts = results.filter(r => r.open);
        
        return NextResponse.json({
          host,
          scannedPorts: portsToScan.length,
          openPorts: openPorts.length,
          results: openPorts,
          allResults: results,
        });
      }

      case "ssl-check": {
        const { hostname } = body;
        if (!hostname) {
          return NextResponse.json({ error: "Hostname is required" }, { status: 400 });
        }
        
        const result = await checkSSL(hostname);
        return NextResponse.json(result);
      }

      case "headers": {
        const { url } = body;
        if (!url) {
          return NextResponse.json({ error: "URL is required" }, { status: 400 });
        }
        
        const result = await checkSecurityHeaders(url);
        return NextResponse.json(result);
      }

      case "dns": {
        const { hostname } = body;
        if (!hostname) {
          return NextResponse.json({ error: "Hostname is required" }, { status: 400 });
        }
        
        const result = await dnsLookup(hostname);
        return NextResponse.json(result);
      }

      case "vulnerability-scan": {
        const { url } = body;
        if (!url) {
          return NextResponse.json({ error: "URL is required" }, { status: 400 });
        }
        
        const result = await checkVulnerabilities(url);
        return NextResponse.json(result);
      }

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("[Security API] Error:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
