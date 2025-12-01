# Email Service Setup

Configure email for dashboard notifications, alerts, and transactional emails.

## Overview

HomeLabHub can send emails for:
- Dashboard notifications and alerts
- Password reset links
- Scheduled report summaries
- Integration notifications (Discord, streaming events)

## Recommended: Mailgun

Mailgun is recommended for:
- Reliable transactional email delivery
- Built-in analytics and logging
- Easy API integration
- Generous free tier (5,000 emails/month)

### Step 1: Create Mailgun Account

1. Go to [mailgun.com](https://www.mailgun.com/)
2. Sign up for free account
3. Verify email address

### Step 2: Add Domain

1. Go to **Sending** → **Domains**
2. Click **Add New Domain**
3. Enter your domain: `mail.evindrake.net` (use subdomain)
4. Choose region: US or EU

### Step 3: Configure DNS Records

Add these records in Cloudflare:

#### TXT Records (SPF & DKIM)
```
Type  Name                    Value
TXT   mail                    v=spf1 include:mailgun.org ~all
TXT   smtp._domainkey.mail    (Mailgun provides this value)
TXT   mail._domainkey.mail    (Mailgun provides this value)
```

#### MX Records (for receiving)
```
Type  Name    Priority  Value
MX    mail    10        mxa.mailgun.org
MX    mail    10        mxb.mailgun.org
```

#### CNAME Record (tracking)
```
Type   Name              Value
CNAME  email.mail        mailgun.org
```

### Step 4: Verify Domain

1. Click **Verify DNS Settings** in Mailgun
2. Wait for all checks to pass (can take 24-48 hours)

### Step 5: Get API Credentials

1. Go to **Settings** → **API Security**
2. Create new API key for "HomeLabHub"
3. Note the API key and domain

### Step 6: Configure HomeLabHub

Add to your `.env` file:

```bash
# Email Configuration - Mailgun
EMAIL_PROVIDER=mailgun
MAILGUN_API_KEY=key-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MAILGUN_DOMAIN=mail.evindrake.net
MAILGUN_FROM_EMAIL=noreply@mail.evindrake.net
MAILGUN_FROM_NAME=HomeLabHub
```

### Step 7: Test Email

```bash
# Using curl to test Mailgun directly
curl -s --user "api:${MAILGUN_API_KEY}" \
  https://api.mailgun.net/v3/${MAILGUN_DOMAIN}/messages \
  -F from="HomeLabHub <noreply@mail.evindrake.net>" \
  -F to="your-email@example.com" \
  -F subject="Test from HomeLabHub" \
  -F text="This is a test email from your HomeLabHub installation."
```

## Alternative: SendGrid

If you prefer SendGrid:

### Step 1: Create SendGrid Account

1. Go to [sendgrid.com](https://sendgrid.com/)
2. Sign up for free account
3. Complete account verification

### Step 2: Authenticate Domain

1. Go to **Settings** → **Sender Authentication**
2. Click **Authenticate Your Domain**
3. Select DNS provider (Cloudflare)
4. Enter domain: `evindrake.net`

### Step 3: Add DNS Records

SendGrid will provide records similar to:

```
Type   Name                           Value
CNAME  em1234.evindrake.net          u1234567.wl123.sendgrid.net
CNAME  s1._domainkey.evindrake.net   s1.domainkey.u1234567.wl123.sendgrid.net
CNAME  s2._domainkey.evindrake.net   s2.domainkey.u1234567.wl123.sendgrid.net
```

### Step 4: Create API Key

1. Go to **Settings** → **API Keys**
2. Create new key with "Mail Send" permission
3. Save the API key securely

### Step 5: Configure HomeLabHub

```bash
# Email Configuration - SendGrid
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.xxxxxxxxxxxxxxxxxxxxxx
SENDGRID_FROM_EMAIL=noreply@evindrake.net
SENDGRID_FROM_NAME=HomeLabHub
```

## Alternative: Gmail SMTP

For personal/testing use only (limited to 500 emails/day):

### Step 1: Enable 2-Factor Authentication

1. Go to Google Account → Security
2. Enable 2-Step Verification

### Step 2: Create App Password

1. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
2. Select app: "Mail"
3. Select device: "Other (Custom name)" → "HomeLabHub"
4. Copy the 16-character password

### Step 3: Configure HomeLabHub

```bash
# Email Configuration - Gmail SMTP
EMAIL_PROVIDER=smtp
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USE_TLS=true
SMTP_USERNAME=your-email@gmail.com
SMTP_PASSWORD=xxxx-xxxx-xxxx-xxxx  # App password
EMAIL_FROM=your-email@gmail.com
EMAIL_FROM_NAME=HomeLabHub
```

## DNS Records Summary

### For evindrake.net with Mailgun

| Type | Name | Value |
|------|------|-------|
| TXT | mail | `v=spf1 include:mailgun.org ~all` |
| TXT | smtp._domainkey.mail | (from Mailgun) |
| MX | mail | `mxa.mailgun.org` (priority 10) |
| MX | mail | `mxb.mailgun.org` (priority 10) |
| CNAME | email.mail | `mailgun.org` |

### Universal SPF Record

If using multiple email services, combine SPF:
```
v=spf1 include:mailgun.org include:sendgrid.net include:_spf.google.com ~all
```

## Dashboard Email Configuration

The dashboard uses email for:

1. **Alert Notifications**: Service down/up alerts
2. **Daily Summaries**: Scheduled overview reports
3. **Security Alerts**: Failed login attempts, unusual activity

### Configure Recipients

Add to `.env`:

```bash
# Email Recipients
ALERT_EMAIL_TO=admin@example.com
DAILY_REPORT_EMAIL_TO=admin@example.com
GMAIL_DEFAULT_RECIPIENT=admin@example.com
```

### Enable Email Features

In the dashboard settings (https://host.evindrake.net/settings):

1. Navigate to **Notifications** section
2. Enable email notifications
3. Configure notification preferences

## Inbound Email Routing (Advanced)

To receive emails (e.g., support tickets, replies):

### Mailgun Inbound Routes

1. Go to **Receiving** → **Routes**
2. Create new route:
   - Match: `match_recipient(".*@support.evindrake.net")`
   - Action: Forward to webhook URL
   - URL: `https://host.evindrake.net/api/email/inbound`

### Webhook Handler

The dashboard can process inbound emails for:
- Creating support tickets
- Processing commands via email
- Logging communication

## Testing Email Configuration

### From Dashboard

1. Go to **Settings** → **Notifications**
2. Click **Send Test Email**
3. Verify email arrives

### From Command Line

```bash
# Test via dashboard container
docker exec -it homelab-dashboard python -c "
from app import create_app
from services.email import send_test_email

app = create_app()
with app.app_context():
    result = send_test_email('your-email@example.com')
    print('Test email sent!' if result else 'Email failed')
"
```

### Check Email Logs

```bash
# View email-related logs
docker compose logs homelab-dashboard | grep -i email

# Check Mailgun logs
# Visit: app.mailgun.com → Sending → Logs
```

## Troubleshooting

### Emails Not Sending

```bash
# Verify environment variables are set
docker exec homelab-dashboard printenv | grep -i mail
docker exec homelab-dashboard printenv | grep -i smtp

# Check for errors
docker compose logs homelab-dashboard | grep -i "mail\|smtp\|email" | tail -50
```

### Emails Going to Spam

1. Verify SPF record is correct
2. Verify DKIM is configured
3. Add DMARC record:
   ```
   TXT  _dmarc.evindrake.net  v=DMARC1; p=none; rua=mailto:dmarc@evindrake.net
   ```

### DNS Verification Failed

```bash
# Check DNS records
dig TXT mail.evindrake.net +short
dig MX mail.evindrake.net +short

# Wait for propagation (up to 48 hours)
```

### Rate Limiting

- Mailgun free tier: 5,000 emails/month
- SendGrid free tier: 100 emails/day
- Gmail: 500 emails/day

Monitor usage in provider dashboard.

## Environment Variables Reference

```bash
# ═══════════════════════════════════════════════════════════════════
# EMAIL CONFIGURATION
# ═══════════════════════════════════════════════════════════════════

# Provider: mailgun, sendgrid, smtp
EMAIL_PROVIDER=mailgun

# Mailgun Settings
MAILGUN_API_KEY=key-xxxxx
MAILGUN_DOMAIN=mail.evindrake.net
MAILGUN_FROM_EMAIL=noreply@mail.evindrake.net
MAILGUN_FROM_NAME=HomeLabHub

# SendGrid Settings (if using SendGrid)
SENDGRID_API_KEY=SG.xxxxx
SENDGRID_FROM_EMAIL=noreply@evindrake.net
SENDGRID_FROM_NAME=HomeLabHub

# SMTP Settings (if using generic SMTP)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USE_TLS=true
SMTP_USERNAME=your_username
SMTP_PASSWORD=your_password

# Recipients
ALERT_EMAIL_TO=admin@example.com
GMAIL_DEFAULT_RECIPIENT=admin@example.com
GMAIL_FROM_NAME=Homelab Dashboard
```
