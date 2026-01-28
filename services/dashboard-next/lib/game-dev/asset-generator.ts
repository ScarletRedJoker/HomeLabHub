import { ComfyUIClient } from '@/lib/ai/providers/comfyui';
import { StableDiffusionProvider } from '@/lib/ai/providers/stable-diffusion';
import { ObjectStorageService } from '@/lib/integrations/object_storage';
import { projectManager } from './project-manager';
import type { 
  AssetType, 
  AssetGenerationRequest, 
  AssetGenerationResult,
  GameAsset 
} from './types';
import { ASSET_TYPE_CONFIGS } from './types';
import { randomUUID } from 'crypto';

export interface GenerationOptions {
  width?: number;
  height?: number;
  steps?: number;
  cfgScale?: number;
  seed?: number;
  style?: string;
  negativePrompt?: string;
}

export class GameAssetGenerator {
  private comfyClient: ComfyUIClient;
  private sdProvider: StableDiffusionProvider;
  private storage: ObjectStorageService;

  constructor() {
    this.comfyClient = new ComfyUIClient();
    this.sdProvider = new StableDiffusionProvider();
    this.storage = new ObjectStorageService();
  }

  private buildPrompt(basePrompt: string, type: AssetType, style?: string): string {
    const config = ASSET_TYPE_CONFIGS[type];
    let prompt = `${config.promptPrefix} ${basePrompt}`;
    
    if (style) {
      prompt = `${prompt}, ${style} style`;
    }

    return prompt;
  }

  private buildNegativePrompt(type: AssetType, additional?: string): string {
    const config = ASSET_TYPE_CONFIGS[type];
    if (additional) {
      return `${config.negativePrompt}, ${additional}`;
    }
    return config.negativePrompt;
  }

  async checkHealth(): Promise<{ comfyui: boolean; stableDiffusion: boolean }> {
    const [comfyHealth, sdHealth] = await Promise.all([
      this.comfyClient.health(),
      this.sdProvider.checkHealth(),
    ]);

    return {
      comfyui: comfyHealth,
      stableDiffusion: sdHealth,
    };
  }

  private async uploadToStorage(imageBase64: string, projectId: string, assetName: string): Promise<{ url: string; fileSize: number }> {
    const buffer = Buffer.from(imageBase64, 'base64');
    const fileSize = buffer.length;
    const fileName = `game-assets/${projectId}/${assetName.replace(/[^a-zA-Z0-9-_]/g, '_')}_${randomUUID()}.png`;
    
    try {
      const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
      if (!bucketId) {
        throw new Error('Object storage not configured');
      }
      
      const { Storage } = await import('@google-cloud/storage');
      const storage = new Storage({
        credentials: {
          audience: "replit",
          subject_token_type: "access_token",
          token_url: "http://127.0.0.1:1106/token",
          type: "external_account",
          credential_source: {
            url: "http://127.0.0.1:1106/credential",
            format: { type: "json", subject_token_field_name: "access_token" },
          },
          universe_domain: "googleapis.com",
        } as any,
        projectId: "",
      });
      
      const bucket = storage.bucket(bucketId);
      const file = bucket.file(fileName);
      
      await file.save(buffer, {
        contentType: 'image/png',
        metadata: { cacheControl: 'public, max-age=31536000' },
      });
      
      const publicUrl = `https://storage.googleapis.com/${bucketId}/${fileName}`;
      return { url: publicUrl, fileSize };
    } catch (error) {
      console.error('[GameAssetGenerator] Storage upload failed:', error);
      throw error;
    }
  }

  async generateAsset(request: AssetGenerationRequest): Promise<AssetGenerationResult> {
    try {
      const config = ASSET_TYPE_CONFIGS[request.type];
      const width = request.width || config.defaultWidth;
      const height = request.height || config.defaultHeight;

      const prompt = this.buildPrompt(request.prompt, request.type, request.style);
      const negativePrompt = this.buildNegativePrompt(request.type, request.negativePrompt);

      const [sdAvailable, comfyAvailable] = await Promise.all([
        this.sdProvider.checkHealth(),
        this.comfyClient.health(),
      ]);
      
      if (!sdAvailable && !comfyAvailable) {
        return {
          success: false,
          error: 'No AI image generators available. Please ensure the Windows VM is running with Stable Diffusion or ComfyUI.',
        };
      }

      let imageBase64: string;
      let generatedWith: string;
      let seed: number | undefined;

      if (sdAvailable) {
        const result = await this.sdProvider.txt2img({
          prompt,
          negativePrompt,
          width,
          height,
          steps: 30,
          cfgScale: 7,
          samplerName: 'DPM++ 2M Karras',
        });

        if (!result.images || result.images.length === 0) {
          if (comfyAvailable) {
            console.log('[GameAssetGenerator] SD failed, falling back to ComfyUI');
          } else {
            return { success: false, error: 'No images were generated' };
          }
        } else {
          imageBase64 = result.images[0];
          generatedWith = 'stable-diffusion';
          seed = result.info?.seed;
        }
      }

      if (!imageBase64! && comfyAvailable) {
        const result = await this.comfyClient.generateImage({
          prompt,
          negativePrompt,
          width,
          height,
          steps: 30,
          cfg: 7,
        });

        if (!result.images || result.images.length === 0) {
          return { success: false, error: 'No images were generated' };
        }
        
        imageBase64 = result.images[0];
        generatedWith = 'comfyui';
      }

      if (!imageBase64!) {
        return { success: false, error: 'Image generation failed' };
      }

      let filePath: string;
      let fileSize: number;
      
      try {
        const uploadResult = await this.uploadToStorage(imageBase64, request.projectId, request.name);
        filePath = uploadResult.url;
        fileSize = uploadResult.fileSize;
      } catch (storageError) {
        console.warn('[GameAssetGenerator] Object storage unavailable, using data URL');
        filePath = `data:image/png;base64,${imageBase64}`;
        fileSize = Math.round((imageBase64.length * 3) / 4);
      }

      const asset = await projectManager.createAsset({
        projectId: request.projectId,
        name: request.name,
        type: request.type,
        prompt: request.prompt,
        style: request.style,
        filePath,
        fileSize,
        width,
        height,
        metadata: {
          generatedWith: generatedWith!,
          seed,
          fullPrompt: prompt,
          negativePrompt,
        },
      });

      return {
        success: true,
        asset,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: `Asset generation failed: ${errorMessage}`,
      };
    }
  }

  async generateSprite(
    projectId: string,
    name: string,
    prompt: string,
    options?: GenerationOptions
  ): Promise<AssetGenerationResult> {
    return this.generateAsset({
      projectId,
      name,
      type: 'sprite',
      prompt,
      style: options?.style,
      width: options?.width,
      height: options?.height,
      negativePrompt: options?.negativePrompt,
    });
  }

  async generateTexture(
    projectId: string,
    name: string,
    prompt: string,
    options?: GenerationOptions
  ): Promise<AssetGenerationResult> {
    return this.generateAsset({
      projectId,
      name,
      type: 'texture',
      prompt,
      style: options?.style,
      width: options?.width,
      height: options?.height,
      negativePrompt: options?.negativePrompt,
    });
  }

  async generateCharacter(
    projectId: string,
    name: string,
    prompt: string,
    options?: GenerationOptions
  ): Promise<AssetGenerationResult> {
    return this.generateAsset({
      projectId,
      name,
      type: 'character',
      prompt,
      style: options?.style,
      width: options?.width,
      height: options?.height,
      negativePrompt: options?.negativePrompt,
    });
  }

  async generateBackground(
    projectId: string,
    name: string,
    prompt: string,
    options?: GenerationOptions
  ): Promise<AssetGenerationResult> {
    return this.generateAsset({
      projectId,
      name,
      type: 'background',
      prompt,
      style: options?.style,
      width: options?.width,
      height: options?.height,
      negativePrompt: options?.negativePrompt,
    });
  }

  async generateIcon(
    projectId: string,
    name: string,
    prompt: string,
    options?: GenerationOptions
  ): Promise<AssetGenerationResult> {
    return this.generateAsset({
      projectId,
      name,
      type: 'icon',
      prompt,
      style: options?.style,
      width: options?.width,
      height: options?.height,
      negativePrompt: options?.negativePrompt,
    });
  }

  async generateUI(
    projectId: string,
    name: string,
    prompt: string,
    options?: GenerationOptions
  ): Promise<AssetGenerationResult> {
    return this.generateAsset({
      projectId,
      name,
      type: 'ui',
      prompt,
      style: options?.style,
      width: options?.width,
      height: options?.height,
      negativePrompt: options?.negativePrompt,
    });
  }

  async generateTileset(
    projectId: string,
    name: string,
    prompt: string,
    options?: GenerationOptions
  ): Promise<AssetGenerationResult> {
    return this.generateAsset({
      projectId,
      name,
      type: 'tileset',
      prompt,
      style: options?.style,
      width: options?.width,
      height: options?.height,
      negativePrompt: options?.negativePrompt,
    });
  }

  async generateBatch(
    requests: AssetGenerationRequest[]
  ): Promise<AssetGenerationResult[]> {
    const results: AssetGenerationResult[] = [];
    
    for (const request of requests) {
      const result = await this.generateAsset(request);
      results.push(result);
    }

    return results;
  }
}

export const assetGenerator = new GameAssetGenerator();
