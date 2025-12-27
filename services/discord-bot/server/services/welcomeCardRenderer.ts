import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas';
import type { WelcomeCardElement, WelcomeCardTemplate } from '@shared/schema';
import { GuildMember } from 'discord.js';
import path from 'path';
import fs from 'fs';

interface RenderContext {
  username: string;
  discriminator: string;
  serverName: string;
  memberCount: number;
  avatarUrl: string;
  date: string;
}

export class WelcomeCardRenderer {
  private static instance: WelcomeCardRenderer;
  private fontLoaded = false;

  private constructor() {
    this.loadFonts();
  }

  static getInstance(): WelcomeCardRenderer {
    if (!WelcomeCardRenderer.instance) {
      WelcomeCardRenderer.instance = new WelcomeCardRenderer();
    }
    return WelcomeCardRenderer.instance;
  }

  private loadFonts() {
    if (this.fontLoaded) return;
    try {
      GlobalFonts.registerFromPath(
        path.join(process.cwd(), 'assets', 'fonts', 'Inter-Regular.ttf'),
        'Inter'
      );
      GlobalFonts.registerFromPath(
        path.join(process.cwd(), 'assets', 'fonts', 'Inter-Bold.ttf'),
        'Inter Bold'
      );
      this.fontLoaded = true;
      console.log('[WelcomeCardRenderer] Fonts loaded successfully');
    } catch (error) {
      console.log('[WelcomeCardRenderer] Using system fonts (custom fonts not found)');
    }
  }

  private interpolateVariables(text: string, context: RenderContext): string {
    return text
      .replace(/{username}/gi, context.username)
      .replace(/{user}/gi, context.username)
      .replace(/{server}/gi, context.serverName)
      .replace(/{memberCount}/gi, context.memberCount.toString())
      .replace(/{membercount}/gi, context.memberCount.toString())
      .replace(/{date}/gi, context.date)
      .replace(/{discriminator}/gi, context.discriminator);
  }

  async renderCard(
    template: WelcomeCardTemplate,
    member: GuildMember
  ): Promise<Buffer> {
    const width = template.width || 800;
    const height = template.height || 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const context: RenderContext = {
      username: member.user.username,
      discriminator: member.user.discriminator,
      serverName: member.guild.name,
      memberCount: member.guild.memberCount,
      avatarUrl: member.user.displayAvatarURL({ extension: 'png', size: 256 }),
      date: new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    };

    await this.drawBackground(ctx, template, width, height);
    await this.drawBorder(ctx, template, width, height);

    const elements: WelcomeCardElement[] = JSON.parse(template.elements || '[]');
    const sortedElements = elements.sort((a, b) => a.zIndex - b.zIndex);

    for (const element of sortedElements) {
      await this.drawElement(ctx, element, context);
    }

    return canvas.toBuffer('image/png');
  }

  async renderPreview(
    template: Partial<WelcomeCardTemplate>,
    previewData?: Partial<RenderContext>
  ): Promise<Buffer> {
    const width = template.width || 800;
    const height = template.height || 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const context: RenderContext = {
      username: previewData?.username || 'NewMember',
      discriminator: previewData?.discriminator || '0001',
      serverName: previewData?.serverName || 'My Awesome Server',
      memberCount: previewData?.memberCount || 1234,
      avatarUrl:
        previewData?.avatarUrl ||
        'https://cdn.discordapp.com/embed/avatars/0.png',
      date: new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    };

    await this.drawBackground(ctx, template as WelcomeCardTemplate, width, height);
    await this.drawBorder(ctx, template as WelcomeCardTemplate, width, height);

    const elements: WelcomeCardElement[] = JSON.parse(
      (template.elements as string) || '[]'
    );
    const sortedElements = elements.sort((a, b) => a.zIndex - b.zIndex);

    for (const element of sortedElements) {
      await this.drawElement(ctx, element, context);
    }

    return canvas.toBuffer('image/png');
  }

  private async drawBackground(
    ctx: any,
    template: WelcomeCardTemplate,
    width: number,
    height: number
  ) {
    const bgType = template.backgroundType || 'solid';
    const opacity = (template.backgroundOpacity || 100) / 100;

    ctx.save();
    ctx.globalAlpha = opacity;

    if (bgType === 'solid') {
      ctx.fillStyle = template.backgroundColor || '#1a1a2e';
      ctx.fillRect(0, 0, width, height);
    } else if (bgType === 'gradient') {
      const gradientConfig = template.backgroundGradient
        ? JSON.parse(template.backgroundGradient)
        : { start: '#1a1a2e', end: '#16213e', direction: 'horizontal' };

      let gradient;
      if (gradientConfig.direction === 'vertical') {
        gradient = ctx.createLinearGradient(0, 0, 0, height);
      } else if (gradientConfig.direction === 'diagonal') {
        gradient = ctx.createLinearGradient(0, 0, width, height);
      } else {
        gradient = ctx.createLinearGradient(0, 0, width, 0);
      }
      gradient.addColorStop(0, gradientConfig.start);
      gradient.addColorStop(1, gradientConfig.end);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);
    } else if (bgType === 'image' && template.backgroundImage) {
      try {
        const bgImage = await loadImage(template.backgroundImage);
        ctx.drawImage(bgImage, 0, 0, width, height);
      } catch (error) {
        console.error('[WelcomeCardRenderer] Failed to load background image:', error);
        ctx.fillStyle = template.backgroundColor || '#1a1a2e';
        ctx.fillRect(0, 0, width, height);
      }
    }

    ctx.restore();
  }

  private async drawBorder(
    ctx: any,
    template: WelcomeCardTemplate,
    width: number,
    height: number
  ) {
    if (!template.borderEnabled) return;

    const borderWidth = template.borderWidth || 2;
    const borderRadius = template.borderRadius || 20;
    const borderColor = template.borderColor || '#ffffff';

    ctx.strokeStyle = borderColor;
    ctx.lineWidth = borderWidth;

    ctx.beginPath();
    ctx.roundRect(
      borderWidth / 2,
      borderWidth / 2,
      width - borderWidth,
      height - borderWidth,
      borderRadius
    );
    ctx.stroke();
  }

  private async drawElement(
    ctx: any,
    element: WelcomeCardElement,
    context: RenderContext
  ) {
    switch (element.type) {
      case 'avatar':
        await this.drawAvatar(ctx, element, context);
        break;
      case 'text':
        this.drawText(ctx, element, context);
        break;
      case 'shape':
        this.drawShape(ctx, element);
        break;
      case 'image':
        await this.drawImage(ctx, element);
        break;
    }
  }

  private async drawAvatar(
    ctx: any,
    element: WelcomeCardElement,
    context: RenderContext
  ) {
    const { x, y, width, height } = element;
    const style = element.avatarStyle || 'circle';
    const borderColor = element.avatarBorderColor || '#ffffff';
    const borderWidth = element.avatarBorderWidth || 4;

    try {
      const avatar = await loadImage(context.avatarUrl);

      ctx.save();

      if (style === 'circle') {
        ctx.beginPath();
        ctx.arc(x + width / 2, y + height / 2, width / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
      } else if (style === 'rounded') {
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, 20);
        ctx.closePath();
        ctx.clip();
      }

      ctx.drawImage(avatar, x, y, width, height);
      ctx.restore();

      if (borderWidth > 0) {
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = borderWidth;

        if (style === 'circle') {
          ctx.beginPath();
          ctx.arc(x + width / 2, y + height / 2, width / 2, 0, Math.PI * 2);
          ctx.stroke();
        } else if (style === 'rounded') {
          ctx.beginPath();
          ctx.roundRect(x, y, width, height, 20);
          ctx.stroke();
        } else {
          ctx.strokeRect(x, y, width, height);
        }
      }
    } catch (error) {
      console.error('[WelcomeCardRenderer] Failed to load avatar:', error);
      ctx.fillStyle = '#7289da';
      if (style === 'circle') {
        ctx.beginPath();
        ctx.arc(x + width / 2, y + height / 2, width / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(x, y, width, height);
      }
    }
  }

  private drawText(
    ctx: any,
    element: WelcomeCardElement,
    context: RenderContext
  ) {
    const text = this.interpolateVariables(element.text || '', context);
    const fontSize = element.fontSize || 24;
    const fontFamily = element.fontFamily || 'Inter, Arial, sans-serif';
    const fontWeight = element.fontWeight === 'bold' ? 'bold' : 'normal';
    const fontColor = element.fontColor || '#ffffff';
    const textAlign = element.textAlign || 'left';

    ctx.save();
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.fillStyle = fontColor;
    ctx.textAlign = textAlign;
    ctx.textBaseline = 'top';

    if (element.textShadow) {
      ctx.shadowColor = element.textShadowColor || 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 2;
      ctx.shadowOffsetY = 2;
    }

    let textX = element.x;
    if (textAlign === 'center') {
      textX = element.x + element.width / 2;
    } else if (textAlign === 'right') {
      textX = element.x + element.width;
    }

    const words = text.split(' ');
    let line = '';
    let lineY = element.y;
    const lineHeight = fontSize * 1.2;

    for (const word of words) {
      const testLine = line + word + ' ';
      const metrics = ctx.measureText(testLine);
      if (metrics.width > element.width && line !== '') {
        ctx.fillText(line.trim(), textX, lineY);
        line = word + ' ';
        lineY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line.trim(), textX, lineY);

    ctx.restore();
  }

  private drawShape(ctx: any, element: WelcomeCardElement) {
    const { x, y, width, height } = element;
    const shapeType = element.shapeType || 'rectangle';
    const fill = element.shapeFill || 'rgba(255,255,255,0.1)';
    const stroke = element.shapeStroke;
    const strokeWidth = element.shapeStrokeWidth || 0;
    const opacity = (element.shapeOpacity || 100) / 100;

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = fill;

    if (shapeType === 'rectangle') {
      ctx.fillRect(x, y, width, height);
      if (stroke && strokeWidth > 0) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = strokeWidth;
        ctx.strokeRect(x, y, width, height);
      }
    } else if (shapeType === 'circle') {
      ctx.beginPath();
      ctx.arc(x + width / 2, y + height / 2, Math.min(width, height) / 2, 0, Math.PI * 2);
      ctx.fill();
      if (stroke && strokeWidth > 0) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = strokeWidth;
        ctx.stroke();
      }
    } else if (shapeType === 'line') {
      ctx.strokeStyle = fill;
      ctx.lineWidth = strokeWidth || 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + width, y + height);
      ctx.stroke();
    }

    ctx.restore();
  }

  private async drawImage(ctx: any, element: WelcomeCardElement) {
    if (!element.imageUrl) return;

    try {
      const image = await loadImage(element.imageUrl);
      const opacity = (element.imageOpacity || 100) / 100;

      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.drawImage(image, element.x, element.y, element.width, element.height);
      ctx.restore();
    } catch (error) {
      console.error('[WelcomeCardRenderer] Failed to load image:', error);
    }
  }

  getDefaultTemplate(serverId: string): Partial<WelcomeCardTemplate> {
    return {
      serverId,
      name: 'Default Welcome Card',
      isActive: true,
      width: 800,
      height: 400,
      backgroundType: 'gradient',
      backgroundColor: '#1a1a2e',
      backgroundGradient: JSON.stringify({
        start: '#1a1a2e',
        end: '#16213e',
        direction: 'diagonal',
      }),
      borderEnabled: true,
      borderColor: '#7289da',
      borderWidth: 3,
      borderRadius: 20,
      welcomeMessage: 'Welcome to {server}!',
      elements: JSON.stringify([
        {
          id: 'avatar-1',
          type: 'avatar',
          x: 50,
          y: 125,
          width: 150,
          height: 150,
          zIndex: 2,
          avatarStyle: 'circle',
          avatarBorderColor: '#7289da',
          avatarBorderWidth: 4,
        },
        {
          id: 'welcome-text',
          type: 'text',
          x: 230,
          y: 100,
          width: 520,
          height: 50,
          zIndex: 3,
          text: 'Welcome to {server}!',
          fontFamily: 'Inter, Arial, sans-serif',
          fontSize: 36,
          fontColor: '#ffffff',
          fontWeight: 'bold',
          textAlign: 'left',
          textShadow: true,
          textShadowColor: 'rgba(0,0,0,0.5)',
        },
        {
          id: 'username-text',
          type: 'text',
          x: 230,
          y: 160,
          width: 520,
          height: 40,
          zIndex: 3,
          text: '{username}',
          fontFamily: 'Inter, Arial, sans-serif',
          fontSize: 28,
          fontColor: '#7289da',
          fontWeight: 'bold',
          textAlign: 'left',
        },
        {
          id: 'member-count-text',
          type: 'text',
          x: 230,
          y: 220,
          width: 520,
          height: 30,
          zIndex: 3,
          text: 'You are member #{memberCount}',
          fontFamily: 'Inter, Arial, sans-serif',
          fontSize: 18,
          fontColor: '#a0a0a0',
          fontWeight: 'normal',
          textAlign: 'left',
        },
        {
          id: 'date-text',
          type: 'text',
          x: 230,
          y: 260,
          width: 520,
          height: 25,
          zIndex: 3,
          text: '{date}',
          fontFamily: 'Inter, Arial, sans-serif',
          fontSize: 14,
          fontColor: '#808080',
          fontWeight: 'normal',
          textAlign: 'left',
        },
        {
          id: 'decorative-line',
          type: 'shape',
          x: 230,
          y: 300,
          width: 300,
          height: 3,
          zIndex: 1,
          shapeType: 'rectangle',
          shapeFill: '#7289da',
          shapeOpacity: 50,
        },
      ] as WelcomeCardElement[]),
    };
  }
}

export const welcomeCardRenderer = WelcomeCardRenderer.getInstance();
