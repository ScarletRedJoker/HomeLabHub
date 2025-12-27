import { Router, Request, Response } from 'express';
import { db } from '../db';
import { welcomeCardTemplates, botSettings } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { welcomeCardRenderer } from '../services/welcomeCardRenderer';

const router = Router();

router.get('/servers/:serverId/welcome-cards', async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    
    const templates = await db
      .select()
      .from(welcomeCardTemplates)
      .where(eq(welcomeCardTemplates.serverId, serverId));
    
    res.json(templates);
  } catch (error) {
    console.error('[WelcomeCards] Error fetching templates:', error);
    res.status(500).json({ error: 'Failed to fetch welcome card templates' });
  }
});

router.get('/servers/:serverId/welcome-cards/active', async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    
    const [template] = await db
      .select()
      .from(welcomeCardTemplates)
      .where(
        and(
          eq(welcomeCardTemplates.serverId, serverId),
          eq(welcomeCardTemplates.isActive, true)
        )
      )
      .limit(1);
    
    if (!template) {
      return res.json(null);
    }
    
    res.json(template);
  } catch (error) {
    console.error('[WelcomeCards] Error fetching active template:', error);
    res.status(500).json({ error: 'Failed to fetch active template' });
  }
});

router.get('/servers/:serverId/welcome-cards/:id', async (req: Request, res: Response) => {
  try {
    const { serverId, id } = req.params;
    
    const [template] = await db
      .select()
      .from(welcomeCardTemplates)
      .where(
        and(
          eq(welcomeCardTemplates.serverId, serverId),
          eq(welcomeCardTemplates.id, parseInt(id))
        )
      );
    
    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.json(template);
  } catch (error) {
    console.error('[WelcomeCards] Error fetching template:', error);
    res.status(500).json({ error: 'Failed to fetch template' });
  }
});

router.post('/servers/:serverId/welcome-cards', async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const templateData = req.body;
    
    if (templateData.isActive) {
      await db
        .update(welcomeCardTemplates)
        .set({ isActive: false })
        .where(eq(welcomeCardTemplates.serverId, serverId));
    }
    
    const [newTemplate] = await db
      .insert(welcomeCardTemplates)
      .values({
        ...templateData,
        serverId,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    
    res.status(201).json(newTemplate);
  } catch (error) {
    console.error('[WelcomeCards] Error creating template:', error);
    res.status(500).json({ error: 'Failed to create template' });
  }
});

router.put('/servers/:serverId/welcome-cards/:id', async (req: Request, res: Response) => {
  try {
    const { serverId, id } = req.params;
    const templateData = req.body;
    
    if (templateData.isActive) {
      await db
        .update(welcomeCardTemplates)
        .set({ isActive: false })
        .where(
          and(
            eq(welcomeCardTemplates.serverId, serverId),
            eq(welcomeCardTemplates.isActive, true)
          )
        );
    }
    
    const [updated] = await db
      .update(welcomeCardTemplates)
      .set({
        ...templateData,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(welcomeCardTemplates.serverId, serverId),
          eq(welcomeCardTemplates.id, parseInt(id))
        )
      )
      .returning();
    
    if (!updated) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.json(updated);
  } catch (error) {
    console.error('[WelcomeCards] Error updating template:', error);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

router.delete('/servers/:serverId/welcome-cards/:id', async (req: Request, res: Response) => {
  try {
    const { serverId, id } = req.params;
    
    const [deleted] = await db
      .delete(welcomeCardTemplates)
      .where(
        and(
          eq(welcomeCardTemplates.serverId, serverId),
          eq(welcomeCardTemplates.id, parseInt(id))
        )
      )
      .returning();
    
    if (!deleted) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('[WelcomeCards] Error deleting template:', error);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

router.post('/servers/:serverId/welcome-cards/:id/activate', async (req: Request, res: Response) => {
  try {
    const { serverId, id } = req.params;
    
    await db
      .update(welcomeCardTemplates)
      .set({ isActive: false })
      .where(eq(welcomeCardTemplates.serverId, serverId));
    
    const [activated] = await db
      .update(welcomeCardTemplates)
      .set({ isActive: true, updatedAt: new Date() })
      .where(
        and(
          eq(welcomeCardTemplates.serverId, serverId),
          eq(welcomeCardTemplates.id, parseInt(id))
        )
      )
      .returning();
    
    if (!activated) {
      return res.status(404).json({ error: 'Template not found' });
    }
    
    res.json(activated);
  } catch (error) {
    console.error('[WelcomeCards] Error activating template:', error);
    res.status(500).json({ error: 'Failed to activate template' });
  }
});

router.post('/servers/:serverId/welcome-cards/preview', async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const templateData = req.body;
    
    const previewBuffer = await welcomeCardRenderer.renderPreview(templateData);
    
    res.set('Content-Type', 'image/png');
    res.send(previewBuffer);
  } catch (error) {
    console.error('[WelcomeCards] Error generating preview:', error);
    res.status(500).json({ error: 'Failed to generate preview' });
  }
});

router.post('/servers/:serverId/welcome-cards/create-default', async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    
    const existing = await db
      .select()
      .from(welcomeCardTemplates)
      .where(eq(welcomeCardTemplates.serverId, serverId));
    
    if (existing.length > 0) {
      return res.json({ message: 'Templates already exist', templates: existing });
    }
    
    const defaultTemplate = welcomeCardRenderer.getDefaultTemplate(serverId);
    
    const [newTemplate] = await db
      .insert(welcomeCardTemplates)
      .values({
        ...defaultTemplate as any,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();
    
    res.status(201).json(newTemplate);
  } catch (error) {
    console.error('[WelcomeCards] Error creating default template:', error);
    res.status(500).json({ error: 'Failed to create default template' });
  }
});

router.get('/servers/:serverId/welcome-settings', async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    
    const [settings] = await db
      .select({
        welcomeEnabled: botSettings.welcomeEnabled,
        welcomeChannelId: botSettings.welcomeChannelId,
      })
      .from(botSettings)
      .where(eq(botSettings.serverId, serverId));
    
    res.json(settings || { welcomeEnabled: false, welcomeChannelId: null });
  } catch (error) {
    console.error('[WelcomeCards] Error fetching welcome settings:', error);
    res.status(500).json({ error: 'Failed to fetch welcome settings' });
  }
});

router.put('/servers/:serverId/welcome-settings', async (req: Request, res: Response) => {
  try {
    const { serverId } = req.params;
    const { welcomeEnabled, welcomeChannelId } = req.body;
    
    const [existing] = await db
      .select()
      .from(botSettings)
      .where(eq(botSettings.serverId, serverId));
    
    if (existing) {
      await db
        .update(botSettings)
        .set({ welcomeEnabled, welcomeChannelId })
        .where(eq(botSettings.serverId, serverId));
    } else {
      await db.insert(botSettings).values({
        serverId,
        welcomeEnabled,
        welcomeChannelId,
      });
    }
    
    res.json({ success: true, welcomeEnabled, welcomeChannelId });
  } catch (error) {
    console.error('[WelcomeCards] Error updating welcome settings:', error);
    res.status(500).json({ error: 'Failed to update welcome settings' });
  }
});

export default router;
