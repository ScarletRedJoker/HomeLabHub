import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Verify service token
    const serviceToken = request.headers.get('X-Service-Token');
    const expectedToken = process.env.SERVICE_AUTH_TOKEN;
    
    if (!expectedToken || serviceToken !== expectedToken) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { platform, user_email } = body;

    if (!platform || !user_email) {
      return NextResponse.json(
        { success: false, message: 'Missing platform or user_email' },
        { status: 400 }
      );
    }

    // Log the notification (in production, this could send an email)
    console.log(`[TokenExpiry] Notification received: ${user_email} needs to re-authenticate ${platform}`);

    // In the future, this could:
    // - Send an email via SendGrid/SMTP
    // - Create an in-app notification
    // - Send a Discord DM via the bot

    return NextResponse.json({
      success: true,
      message: `Token expiry notification logged for ${user_email}`,
      results: {
        logged: true,
        platform,
        user_email,
      },
    });
  } catch (error: any) {
    console.error('[TokenExpiry] Error processing notification:', error);
    return NextResponse.json(
      { success: false, message: error.message },
      { status: 500 }
    );
  }
}
