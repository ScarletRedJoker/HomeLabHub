import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { emailCampaigns, emailTemplates } from "@/lib/db/platform-schema";
import { requireAuth, handleAuthError } from "@/lib/middleware/permissions";
import { sendEmail, checkGmailConnection } from "@/lib/gmail-client";
import { eq, desc } from "drizzle-orm";
import { randomUUID } from "crypto";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
    
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    
    if (action === "check-connection") {
      const status = await checkGmailConnection();
      return NextResponse.json(status);
    }
    
    const campaigns = await db.select().from(emailCampaigns).orderBy(desc(emailCampaigns.createdAt));
    const templates = await db.select().from(emailTemplates).orderBy(desc(emailTemplates.createdAt));
    
    return NextResponse.json({ campaigns, templates });
  } catch (error) {
    return handleAuthError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const body = await request.json();
    const { action, ...data } = body;
    
    if (action === "send") {
      const { to, subject, body: emailBody, htmlBody, templateId } = data;
      
      let finalSubject = subject;
      let finalBody = emailBody;
      let finalHtmlBody = htmlBody;
      
      if (templateId) {
        const [template] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, templateId));
        if (template) {
          finalSubject = template.subject;
          finalBody = template.bodyText;
          finalHtmlBody = template.bodyHtml || undefined;
        }
      }
      
      if (!to || !finalSubject || !finalBody) {
        return NextResponse.json({ error: "Missing required fields: to, subject, body" }, { status: 400 });
      }
      
      const result = await sendEmail({
        to: Array.isArray(to) ? to : [to],
        subject: finalSubject,
        body: finalBody,
        htmlBody: finalHtmlBody
      });
      
      const campaignId = randomUUID();
      await db.insert(emailCampaigns).values({
        id: campaignId,
        name: `Quick Send: ${finalSubject.slice(0, 30)}`,
        subject: finalSubject,
        recipientCount: Array.isArray(to) ? to.length : 1,
        status: "sent",
        sentAt: new Date(),
        createdBy: user.id,
      });
      
      return NextResponse.json({ success: true, messageId: result.id, campaignId });
    }
    
    if (action === "create-campaign") {
      const { name, subject, recipients, bodyText, bodyHtml, scheduledFor } = data;
      
      if (!name || !subject || !recipients || !bodyText) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }
      
      const recipientList = Array.isArray(recipients) ? recipients : recipients.split(',').map((r: string) => r.trim());
      const campaignId = randomUUID();
      
      await db.insert(emailCampaigns).values({
        id: campaignId,
        name,
        subject,
        bodyText,
        bodyHtml,
        recipientCount: recipientList.length,
        recipients: recipientList,
        status: scheduledFor ? "scheduled" : "draft",
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
        createdBy: user.id,
      });
      
      return NextResponse.json({ success: true, campaignId });
    }
    
    if (action === "create-template") {
      const { name, subject, bodyText, bodyHtml, category } = data;
      
      if (!name || !subject || !bodyText) {
        return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
      }
      
      const templateId = randomUUID();
      await db.insert(emailTemplates).values({
        id: templateId,
        name,
        subject,
        bodyText,
        bodyHtml,
        category: category || "general",
        createdBy: user.id,
      });
      
      return NextResponse.json({ success: true, templateId });
    }
    
    if (action === "send-campaign") {
      const { campaignId } = data;
      const [campaign] = await db.select().from(emailCampaigns).where(eq(emailCampaigns.id, campaignId));
      
      if (!campaign) {
        return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      }
      
      if (!campaign.recipients || campaign.recipients.length === 0) {
        return NextResponse.json({ error: "No recipients in campaign" }, { status: 400 });
      }
      
      let sentCount = 0;
      let failedCount = 0;
      
      for (const recipient of campaign.recipients) {
        try {
          await sendEmail({
            to: recipient,
            subject: campaign.subject,
            body: campaign.bodyText || '',
            htmlBody: campaign.bodyHtml || undefined
          });
          sentCount++;
        } catch (err) {
          failedCount++;
          console.error(`Failed to send to ${recipient}:`, err);
        }
      }
      
      await db.update(emailCampaigns)
        .set({ 
          status: "sent", 
          sentAt: new Date(),
          sentCount,
          failedCount
        })
        .where(eq(emailCampaigns.id, campaignId));
      
      return NextResponse.json({ success: true, sentCount, failedCount });
    }
    
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    console.error("[Email Campaigns] Error:", error);
    if (error.message?.includes("Gmail not connected")) {
      return NextResponse.json({ error: "Gmail integration not configured. Please connect Gmail in settings." }, { status: 503 });
    }
    return handleAuthError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAuth(request);
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const type = searchParams.get("type") || "campaign";
    
    if (!id) {
      return NextResponse.json({ error: "ID required" }, { status: 400 });
    }
    
    if (type === "template") {
      await db.delete(emailTemplates).where(eq(emailTemplates.id, id));
    } else {
      await db.delete(emailCampaigns).where(eq(emailCampaigns.id, id));
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAuthError(error);
  }
}
