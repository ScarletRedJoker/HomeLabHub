"""Gmail Service for sending email notifications"""
import logging
import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Dict, Any, Optional, List
from googleapiclient.errors import HttpError
from .google_client import google_client_manager

logger = logging.getLogger(__name__)


class GmailService:
    """Gmail integration for sending email notifications"""
    
    # Email templates for different notification types
    TEMPLATES = {
        'deployment': {
            'subject': '🚀 Deployment {status}: {service_name}',
            'style': 'background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);'
        },
        'ssl_expiry': {
            'subject': '🔒 SSL Certificate Expiring: {domain}',
            'style': 'background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);'
        },
        'error': {
            'subject': '⚠️ System Alert: {error_type}',
            'style': 'background: linear-gradient(135deg, #fa709a 0%, #fee140 100%);'
        },
        'backup': {
            'subject': '💾 Backup {status}: {description}',
            'style': 'background: linear-gradient(135deg, #30cfd0 0%, #330867 100%);'
        },
        'custom': {
            'subject': '{subject}',
            'style': 'background: linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%);'
        }
    }
    
    def __init__(self):
        """Initialize Gmail Service"""
        self.client_manager = google_client_manager
    
    def _create_message(
        self,
        to: str,
        subject: str,
        body_text: str,
        body_html: Optional[str] = None,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Create email message
        
        Args:
            to: Recipient email address
            subject: Email subject
            body_text: Plain text body
            body_html: HTML body (optional)
            cc: CC recipients
            bcc: BCC recipients
            
        Returns:
            Message dictionary ready to send
        """
        if body_html:
            message = MIMEMultipart('alternative')
            text_part = MIMEText(body_text, 'plain')
            html_part = MIMEText(body_html, 'html')
            message.attach(text_part)
            message.attach(html_part)
        else:
            message = MIMEText(body_text)
        
        message['to'] = to
        message['subject'] = subject
        
        if cc:
            message['cc'] = ', '.join(cc)
        if bcc:
            message['bcc'] = ', '.join(bcc)
        
        raw_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
        return {'raw': raw_message}
    
    def _format_html_email(
        self,
        title: str,
        content: str,
        template_type: str = 'custom',
        footer_text: Optional[str] = None
    ) -> str:
        """
        Format HTML email with homelab branding
        
        Args:
            title: Email title
            content: Email content (HTML)
            template_type: Template type for styling
            footer_text: Optional footer text
            
        Returns:
            Formatted HTML string
        """
        template_style = self.TEMPLATES.get(template_type, {}).get(
            'style',
            'background: linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%);'
        )
        
        if footer_text is None:
            footer_text = "Sent from Jarvis Homelab Dashboard"
        
        html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f3f4f6; padding: 40px 20px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="{template_style} padding: 30px 40px; text-align: center;">
                            <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">{title}</h1>
                        </td>
                    </tr>
                    
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            {content}
                        </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #f9fafb; padding: 20px 40px; text-align: center; border-top: 1px solid #e5e7eb;">
                            <p style="margin: 0; color: #6b7280; font-size: 14px;">{footer_text}</p>
                            <p style="margin: 10px 0 0 0; color: #9ca3af; font-size: 12px;">
                                {datetime.utcnow().strftime('%B %d, %Y at %H:%M UTC')}
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
"""
        return html
    
    def send_email(
        self,
        to: str,
        subject: str,
        body: str,
        template_type: str = 'custom',
        html: bool = True,
        cc: Optional[List[str]] = None,
        bcc: Optional[List[str]] = None,
        **template_vars
    ) -> Dict[str, Any]:
        """
        Send email via Gmail
        
        Args:
            to: Recipient email
            subject: Email subject (can include {variables})
            body: Email body
            template_type: Template type (deployment, ssl_expiry, error, backup, custom)
            html: Whether to send HTML email
            cc: CC recipients
            bcc: BCC recipients
            **template_vars: Variables for template substitution
            
        Returns:
            Sent message details
        """
        try:
            client = self.client_manager.get_gmail_client()
            
            # Format subject using template
            template = self.TEMPLATES.get(template_type, self.TEMPLATES['custom'])
            formatted_subject = template['subject'].format(**template_vars) if template_vars else subject
            
            # Create HTML body if requested
            body_html = None
            if html:
                body_html = self._format_html_email(
                    title=formatted_subject,
                    content=body,
                    template_type=template_type
                )
            
            # Create and send message
            message = self._create_message(
                to=to,
                subject=formatted_subject,
                body_text=body,
                body_html=body_html,
                cc=cc,
                bcc=bcc
            )
            
            sent_message = client.users().messages().send(
                userId='me',
                body=message
            ).execute()
            
            logger.info(f"Email sent to {to}: {formatted_subject} (ID: {sent_message['id']})")
            
            return {
                'id': sent_message['id'],
                'threadId': sent_message['threadId'],
                'to': to,
                'subject': formatted_subject,
                'timestamp': datetime.utcnow().isoformat()
            }
        
        except HttpError as e:
            logger.error(f"Error sending email: {e}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error sending email: {e}", exc_info=True)
            raise
    
    def send_deployment_notification(
        self,
        to: str,
        service_name: str,
        status: str,
        details: str,
        deployment_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """Send deployment notification email"""
        emoji = '✅' if status.lower() == 'success' else '❌'
        
        content = f"""
<p style="font-size: 16px; color: #111827; margin-bottom: 20px;">
    Deployment of <strong>{service_name}</strong> has {status.lower()}.
</p>

<div style="background-color: #f9fafb; border-left: 4px solid #8B5CF6; padding: 20px; margin: 20px 0; border-radius: 4px;">
    <h3 style="margin: 0 0 10px 0; color: #374151; font-size: 16px;">Details:</h3>
    <p style="margin: 0; color: #4b5563; font-size: 14px; white-space: pre-wrap;">{details}</p>
</div>
"""
        
        if deployment_url:
            content += f"""
<p style="margin-top: 20px;">
    <a href="{deployment_url}" style="display: inline-block; background: linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%); color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">
        View Deployment
    </a>
</p>
"""
        
        return self.send_email(
            to=to,
            subject=f"{emoji} Deployment {status}",
            body=content,
            template_type='deployment',
            service_name=service_name,
            status=status,
            html=True
        )
    
    def send_error_notification(
        self,
        to: str,
        error_type: str,
        error_message: str,
        stack_trace: Optional[str] = None
    ) -> Dict[str, Any]:
        """Send error notification email"""
        content = f"""
<p style="font-size: 16px; color: #111827; margin-bottom: 20px;">
    A <strong>{error_type}</strong> error has occurred in your homelab.
</p>

<div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 20px; margin: 20px 0; border-radius: 4px;">
    <h3 style="margin: 0 0 10px 0; color: #7f1d1d; font-size: 16px;">Error Message:</h3>
    <p style="margin: 0; color: #991b1b; font-size: 14px; font-family: 'Courier New', monospace;">{error_message}</p>
</div>
"""
        
        if stack_trace:
            content += f"""
<details style="margin-top: 20px;">
    <summary style="cursor: pointer; color: #6b7280; font-weight: 600;">Stack Trace</summary>
    <pre style="background-color: #1f2937; color: #f3f4f6; padding: 15px; border-radius: 6px; overflow-x: auto; font-size: 12px; margin-top: 10px;">{stack_trace}</pre>
</details>
"""
        
        return self.send_email(
            to=to,
            subject="System Error Alert",
            body=content,
            template_type='error',
            error_type=error_type,
            html=True
        )


# Initialize global Gmail service
gmail_service = GmailService()
