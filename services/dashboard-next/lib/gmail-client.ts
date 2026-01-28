import { google } from 'googleapis';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('Gmail integration not available - Replit token not found');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-mail',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('Gmail not connected - please set up Gmail integration');
  }
  return accessToken;
}

export async function getGmailClient() {
  const accessToken = await getAccessToken();

  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({
    access_token: accessToken
  });

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  body: string;
  htmlBody?: string;
  cc?: string[];
  bcc?: string[];
  replyTo?: string;
}

export async function sendEmail(message: EmailMessage): Promise<{ id: string; threadId: string }> {
  const gmail = await getGmailClient();
  
  const toAddresses = Array.isArray(message.to) ? message.to.join(', ') : message.to;
  const ccAddresses = message.cc?.join(', ') || '';
  const bccAddresses = message.bcc?.join(', ') || '';
  
  const boundary = `boundary_${Date.now()}`;
  let emailContent = [
    `MIME-Version: 1.0`,
    `To: ${toAddresses}`,
  ];
  
  if (ccAddresses) emailContent.push(`Cc: ${ccAddresses}`);
  if (bccAddresses) emailContent.push(`Bcc: ${bccAddresses}`);
  if (message.replyTo) emailContent.push(`Reply-To: ${message.replyTo}`);
  
  emailContent.push(`Subject: ${message.subject}`);
  
  if (message.htmlBody) {
    emailContent.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    emailContent.push('');
    emailContent.push(`--${boundary}`);
    emailContent.push('Content-Type: text/plain; charset="UTF-8"');
    emailContent.push('');
    emailContent.push(message.body);
    emailContent.push(`--${boundary}`);
    emailContent.push('Content-Type: text/html; charset="UTF-8"');
    emailContent.push('');
    emailContent.push(message.htmlBody);
    emailContent.push(`--${boundary}--`);
  } else {
    emailContent.push('Content-Type: text/plain; charset="UTF-8"');
    emailContent.push('');
    emailContent.push(message.body);
  }
  
  const rawMessage = Buffer.from(emailContent.join('\r\n')).toString('base64url');
  
  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: rawMessage
    }
  });
  
  return {
    id: response.data.id!,
    threadId: response.data.threadId!
  };
}

export async function getLabels(): Promise<{ id: string; name: string }[]> {
  const gmail = await getGmailClient();
  const response = await gmail.users.labels.list({ userId: 'me' });
  return response.data.labels?.map(l => ({ id: l.id!, name: l.name! })) || [];
}

export async function getMessages(labelId?: string, maxResults = 20): Promise<any[]> {
  const gmail = await getGmailClient();
  const response = await gmail.users.messages.list({
    userId: 'me',
    labelIds: labelId ? [labelId] : undefined,
    maxResults
  });
  
  if (!response.data.messages) return [];
  
  const messages = await Promise.all(
    response.data.messages.slice(0, maxResults).map(async (msg) => {
      const detail = await gmail.users.messages.get({
        userId: 'me',
        id: msg.id!,
        format: 'metadata',
        metadataHeaders: ['Subject', 'From', 'To', 'Date']
      });
      
      const headers = detail.data.payload?.headers || [];
      const getHeader = (name: string) => headers.find(h => h.name === name)?.value || '';
      
      return {
        id: msg.id,
        threadId: msg.threadId,
        subject: getHeader('Subject'),
        from: getHeader('From'),
        to: getHeader('To'),
        date: getHeader('Date'),
        snippet: detail.data.snippet,
        labelIds: detail.data.labelIds
      };
    })
  );
  
  return messages;
}

export async function checkGmailConnection(): Promise<{ connected: boolean; email?: string; error?: string }> {
  try {
    const gmail = await getGmailClient();
    const profile = await gmail.users.getProfile({ userId: 'me' });
    return { 
      connected: true, 
      email: profile.data.emailAddress || undefined 
    };
  } catch (error: any) {
    return { 
      connected: false, 
      error: error.message 
    };
  }
}
