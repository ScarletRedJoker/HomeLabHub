/**
 * OBS WebSocket Controller - Remote control of OBS Studio for streaming
 * Enables integration with AI-generated content for the Nebula Command platform
 */

import { EventEmitter } from 'events';
import OBSWebSocket from 'obs-websocket-js';

export interface OBSConfig {
  host: string;
  port: number;
  password?: string;
  autoReconnect: boolean;
  reconnectInterval: number;
}

export interface OBSScene {
  name: string;
  index: number;
  sources: OBSSource[];
}

export interface OBSSource {
  name: string;
  type: string;
  visible: boolean;
  locked: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
  settings: Record<string, any>;
}

export interface StreamStatus {
  streaming: boolean;
  recording: boolean;
  virtualCam: boolean;
  streamTime: number;
  fps: number;
  kbitsPerSec: number;
  totalFrames: number;
  droppedFrames: number;
}

export interface AIOverlayConfig {
  url?: string;
  html?: string;
  width: number;
  height: number;
  fps?: number;
  css?: string;
  refreshOnShow?: boolean;
}

export interface SceneAutomationRule {
  id: string;
  name: string;
  trigger: AutomationTrigger;
  action: AutomationAction;
  enabled: boolean;
  cooldownMs?: number;
  lastTriggered?: Date;
}

export interface AutomationTrigger {
  type: 'game_detection' | 'audio_level' | 'chat_command' | 'ai_event' | 'timer' | 'stream_event';
  config: Record<string, any>;
}

export interface AutomationAction {
  type: 'switch_scene' | 'toggle_source' | 'update_source' | 'start_recording' | 'run_script';
  config: Record<string, any>;
}

export type OBSEventType = 
  | 'connected'
  | 'disconnected'
  | 'scene_changed'
  | 'source_updated'
  | 'stream_started'
  | 'stream_stopped'
  | 'recording_started'
  | 'recording_stopped'
  | 'source_created'
  | 'source_removed'
  | 'automation_triggered'
  | 'error';

export interface OBSEvent {
  type: OBSEventType;
  timestamp: Date;
  data?: any;
}

export class OBSController extends EventEmitter {
  private obs: OBSWebSocket;
  private config: OBSConfig | null = null;
  private connected: boolean = false;
  private reconnecting: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private automationRules: Map<string, SceneAutomationRule> = new Map();
  private aiOverlays: Map<string, { sceneName: string; sourceName: string; config: AIOverlayConfig }> = new Map();
  private pipelineSubscriptions: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    super();
    this.obs = new OBSWebSocket();
    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.obs.on('ConnectionOpened', () => {
      this.connected = true;
      this.reconnecting = false;
      this.emitEvent('connected', { host: this.config?.host, port: this.config?.port });
    });

    this.obs.on('ConnectionClosed', () => {
      const wasConnected = this.connected;
      this.connected = false;
      this.emitEvent('disconnected', { wasConnected });
      
      if (this.config?.autoReconnect && wasConnected && !this.reconnecting) {
        this.scheduleReconnect();
      }
    });

    this.obs.on('ConnectionError', (error) => {
      this.emitEvent('error', { message: 'Connection error', error: error.message });
    });

    this.obs.on('CurrentProgramSceneChanged', (data) => {
      this.emitEvent('scene_changed', { sceneName: data.sceneName });
      this.processAutomationTriggers({ type: 'stream_event', event: 'scene_changed', sceneName: data.sceneName });
    });

    this.obs.on('SceneItemEnableStateChanged', (data) => {
      this.emitEvent('source_updated', { 
        sceneName: data.sceneName,
        sceneItemId: data.sceneItemId,
        enabled: data.sceneItemEnabled
      });
    });

    this.obs.on('StreamStateChanged', (data) => {
      if (data.outputActive) {
        this.emitEvent('stream_started', { state: data.outputState });
        this.processAutomationTriggers({ type: 'stream_event', event: 'stream_started' });
      } else {
        this.emitEvent('stream_stopped', { state: data.outputState });
        this.processAutomationTriggers({ type: 'stream_event', event: 'stream_stopped' });
      }
    });

    this.obs.on('RecordStateChanged', (data) => {
      if (data.outputActive) {
        this.emitEvent('recording_started', { state: data.outputState, path: data.outputPath });
      } else {
        this.emitEvent('recording_stopped', { state: data.outputState, path: data.outputPath });
      }
    });

    this.obs.on('SceneItemCreated', (data) => {
      this.emitEvent('source_created', { 
        sceneName: data.sceneName,
        sourceName: data.sourceName,
        sceneItemId: data.sceneItemId
      });
    });

    this.obs.on('SceneItemRemoved', (data) => {
      this.emitEvent('source_removed', { 
        sceneName: data.sceneName,
        sourceName: data.sourceName,
        sceneItemId: data.sceneItemId
      });
    });
  }

  private emitEvent(type: OBSEventType, data?: any): void {
    const event: OBSEvent = { type, timestamp: new Date(), data };
    this.emit(type, event);
    this.emit('event', event);
  }

  private scheduleReconnect(): void {
    if (this.reconnecting || !this.config) return;
    
    this.reconnecting = true;
    const interval = this.config.reconnectInterval || 5000;
    
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect(this.config!);
      } catch (error) {
        this.scheduleReconnect();
      }
    }, interval);
  }

  async connect(config: OBSConfig): Promise<void> {
    this.config = config;
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    try {
      const url = `ws://${config.host}:${config.port}`;
      await this.obs.connect(url, config.password);
      this.connected = true;
      this.reconnecting = false;
    } catch (error: any) {
      this.connected = false;
      throw new Error(`Failed to connect to OBS: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnecting = false;
    
    Array.from(this.pipelineSubscriptions.values()).forEach(timer => {
      clearInterval(timer);
    });
    this.pipelineSubscriptions.clear();

    if (this.connected) {
      await this.obs.disconnect();
      this.connected = false;
    }
  }

  getConnectionStatus(): { connected: boolean; host?: string; port?: number; reconnecting: boolean } {
    return {
      connected: this.connected,
      host: this.config?.host,
      port: this.config?.port,
      reconnecting: this.reconnecting
    };
  }

  async getScenes(): Promise<OBSScene[]> {
    this.ensureConnected();

    const response = await this.obs.call('GetSceneList');
    const scenes: OBSScene[] = [];

    for (let i = 0; i < response.scenes.length; i++) {
      const scene = response.scenes[i] as any;
      const sources = await this.getSources(scene.sceneName);
      scenes.push({
        name: scene.sceneName,
        index: scene.sceneIndex ?? i,
        sources
      });
    }

    return scenes;
  }

  async setCurrentScene(sceneName: string): Promise<void> {
    this.ensureConnected();
    await this.obs.call('SetCurrentProgramScene', { sceneName });
  }

  async getSources(sceneName: string): Promise<OBSSource[]> {
    this.ensureConnected();

    const response = await this.obs.call('GetSceneItemList', { sceneName });
    const sources: OBSSource[] = [];

    for (const item of response.sceneItems as any[]) {
      const transform = await this.obs.call('GetSceneItemTransform', {
        sceneName,
        sceneItemId: item.sceneItemId
      });

      let settings: Record<string, any> = {};
      try {
        const inputSettings = await this.obs.call('GetInputSettings', { inputName: item.sourceName });
        settings = inputSettings.inputSettings as Record<string, any>;
      } catch {
      }

      sources.push({
        name: item.sourceName,
        type: item.inputKind || item.sourceType || 'unknown',
        visible: item.sceneItemEnabled,
        locked: item.sceneItemLocked,
        position: {
          x: (transform.sceneItemTransform as any).positionX || 0,
          y: (transform.sceneItemTransform as any).positionY || 0
        },
        size: {
          width: (transform.sceneItemTransform as any).width || 0,
          height: (transform.sceneItemTransform as any).height || 0
        },
        settings
      });
    }

    return sources;
  }

  async setSourceVisibility(sceneName: string, sourceName: string, visible: boolean): Promise<void> {
    this.ensureConnected();

    const sceneItemId = await this.getSceneItemId(sceneName, sourceName);
    await this.obs.call('SetSceneItemEnabled', {
      sceneName,
      sceneItemId,
      sceneItemEnabled: visible
    });
  }

  async setSourceSettings(sceneName: string, sourceName: string, settings: Record<string, any>): Promise<void> {
    this.ensureConnected();

    await this.obs.call('SetInputSettings', {
      inputName: sourceName,
      inputSettings: settings
    });
  }

  async createSource(
    sceneName: string, 
    sourceName: string, 
    sourceType: string, 
    settings: Record<string, any>
  ): Promise<number> {
    this.ensureConnected();

    const response = await this.obs.call('CreateInput', {
      sceneName,
      inputName: sourceName,
      inputKind: sourceType,
      inputSettings: settings
    });

    return response.sceneItemId;
  }

  async removeSource(sceneName: string, sourceName: string): Promise<void> {
    this.ensureConnected();

    const sceneItemId = await this.getSceneItemId(sceneName, sourceName);
    await this.obs.call('RemoveSceneItem', {
      sceneName,
      sceneItemId
    });
  }

  async getStreamStatus(): Promise<StreamStatus> {
    this.ensureConnected();

    const [streamStatus, recordStatus, virtualCamStatus, stats] = await Promise.all([
      this.obs.call('GetStreamStatus'),
      this.obs.call('GetRecordStatus'),
      this.obs.call('GetVirtualCamStatus').catch(() => ({ outputActive: false })),
      this.obs.call('GetStats')
    ]);

    return {
      streaming: streamStatus.outputActive,
      recording: recordStatus.outputActive,
      virtualCam: (virtualCamStatus as any).outputActive || false,
      streamTime: streamStatus.outputDuration || 0,
      fps: (stats as any).activeFps || 0,
      kbitsPerSec: (streamStatus as any).outputBytes ? Math.round(((streamStatus as any).outputBytes * 8) / 1000) : 0,
      totalFrames: (stats as any).renderTotalFrames || 0,
      droppedFrames: (stats as any).renderSkippedFrames || 0
    };
  }

  async startStreaming(): Promise<void> {
    this.ensureConnected();
    await this.obs.call('StartStream');
  }

  async stopStreaming(): Promise<void> {
    this.ensureConnected();
    await this.obs.call('StopStream');
  }

  async startRecording(): Promise<void> {
    this.ensureConnected();
    await this.obs.call('StartRecord');
  }

  async stopRecording(): Promise<void> {
    this.ensureConnected();
    await this.obs.call('StopRecord');
  }

  async setSourcePosition(sceneName: string, sourceName: string, x: number, y: number): Promise<void> {
    this.ensureConnected();

    const sceneItemId = await this.getSceneItemId(sceneName, sourceName);
    await this.obs.call('SetSceneItemTransform', {
      sceneName,
      sceneItemId,
      sceneItemTransform: {
        positionX: x,
        positionY: y
      }
    });
  }

  async setSourceSize(sceneName: string, sourceName: string, width: number, height: number): Promise<void> {
    this.ensureConnected();

    const sceneItemId = await this.getSceneItemId(sceneName, sourceName);
    const currentTransform = await this.obs.call('GetSceneItemTransform', { sceneName, sceneItemId });
    
    const sourceWidth = (currentTransform.sceneItemTransform as any).sourceWidth || 1;
    const sourceHeight = (currentTransform.sceneItemTransform as any).sourceHeight || 1;
    
    await this.obs.call('SetSceneItemTransform', {
      sceneName,
      sceneItemId,
      sceneItemTransform: {
        scaleX: width / sourceWidth,
        scaleY: height / sourceHeight
      }
    });
  }

  async takeScreenshot(sourceName?: string, format: string = 'png'): Promise<string> {
    this.ensureConnected();

    const response = await this.obs.call('GetSourceScreenshot', {
      sourceName: sourceName || (await this.getCurrentSceneName()),
      imageFormat: format,
      imageWidth: 1920,
      imageHeight: 1080
    });

    return response.imageData;
  }

  async createAIOverlay(name: string, config: AIOverlayConfig): Promise<void> {
    this.ensureConnected();

    const currentScene = await this.getCurrentSceneName();
    const sourceName = `AI_Overlay_${name}`;

    const browserSettings: Record<string, any> = {
      width: config.width,
      height: config.height,
      fps: config.fps || 30,
      fps_custom: true,
      reroute_audio: false
    };

    if (config.url) {
      browserSettings.url = config.url;
    } else if (config.html) {
      browserSettings.is_local_file = false;
      browserSettings.url = `data:text/html;charset=utf-8,${encodeURIComponent(config.html)}`;
    }

    if (config.css) {
      browserSettings.css = config.css;
    }

    if (config.refreshOnShow !== undefined) {
      browserSettings.refresh_browser_on_scene_change = config.refreshOnShow;
    }

    await this.createSource(currentScene, sourceName, 'browser_source', browserSettings);
    
    this.aiOverlays.set(name, {
      sceneName: currentScene,
      sourceName,
      config
    });
  }

  async updateAIOverlay(name: string, content: string | { url?: string; html?: string }): Promise<void> {
    this.ensureConnected();

    const overlay = this.aiOverlays.get(name);
    if (!overlay) {
      throw new Error(`AI overlay '${name}' not found`);
    }

    let settings: Record<string, any>;
    
    if (typeof content === 'string') {
      settings = {
        url: `data:text/html;charset=utf-8,${encodeURIComponent(content)}`
      };
    } else if (content.url) {
      settings = { url: content.url };
    } else if (content.html) {
      settings = {
        url: `data:text/html;charset=utf-8,${encodeURIComponent(content.html)}`
      };
    } else {
      throw new Error('Invalid content: provide url or html');
    }

    await this.setSourceSettings(overlay.sceneName, overlay.sourceName, settings);
    
    await this.obs.call('PressInputPropertiesButton', {
      inputName: overlay.sourceName,
      propertyName: 'refreshnocache'
    }).catch(() => {});
  }

  async setAIVideoSource(name: string, rtmpUrl: string): Promise<void> {
    this.ensureConnected();

    const currentScene = await this.getCurrentSceneName();
    const sourceName = `AI_Video_${name}`;

    const existingSources = await this.getSources(currentScene);
    const existingSource = existingSources.find(s => s.name === sourceName);

    if (existingSource) {
      await this.setSourceSettings(currentScene, sourceName, {
        input: rtmpUrl,
        is_local_file: false,
        restart_on_activate: true,
        hw_decode: true
      });
    } else {
      await this.createSource(currentScene, sourceName, 'ffmpeg_source', {
        input: rtmpUrl,
        is_local_file: false,
        restart_on_activate: true,
        hw_decode: true
      });
    }
  }

  async syncWithPipeline(pipelineId: string, pollingIntervalMs: number = 1000): Promise<void> {
    if (this.pipelineSubscriptions.has(pipelineId)) {
      clearInterval(this.pipelineSubscriptions.get(pipelineId)!);
    }

    const pollPipeline = async () => {
      try {
        const response = await fetch(`/api/ai/video/pipeline/${pipelineId}/status`);
        if (response.ok) {
          const status = await response.json();
          
          if (status.outputUrl) {
            await this.setAIVideoSource(pipelineId, status.outputUrl);
          }
          
          if (status.overlayHtml) {
            const overlayName = `pipeline_${pipelineId}`;
            if (!this.aiOverlays.has(overlayName)) {
              await this.createAIOverlay(overlayName, {
                width: 1920,
                height: 1080,
                html: status.overlayHtml
              });
            } else {
              await this.updateAIOverlay(overlayName, status.overlayHtml);
            }
          }
        }
      } catch (error) {
      }
    };

    const timer = setInterval(pollPipeline, pollingIntervalMs);
    this.pipelineSubscriptions.set(pipelineId, timer);
    
    await pollPipeline();
  }

  unsyncFromPipeline(pipelineId: string): void {
    const timer = this.pipelineSubscriptions.get(pipelineId);
    if (timer) {
      clearInterval(timer);
      this.pipelineSubscriptions.delete(pipelineId);
    }
  }

  createSceneAutomation(rules: SceneAutomationRule[]): void {
    for (const rule of rules) {
      this.automationRules.set(rule.id, rule);
    }
  }

  removeSceneAutomation(ruleId: string): boolean {
    return this.automationRules.delete(ruleId);
  }

  getSceneAutomations(): SceneAutomationRule[] {
    return Array.from(this.automationRules.values());
  }

  enableAutomation(ruleId: string, enabled: boolean): void {
    const rule = this.automationRules.get(ruleId);
    if (rule) {
      rule.enabled = enabled;
      this.automationRules.set(ruleId, rule);
    }
  }

  async triggerSceneSwitch(trigger: { 
    type: 'game_detection' | 'audio_level' | 'chat_command' | 'ai_event' | 'timer' | 'stream_event';
    data: any;
  }): Promise<void> {
    await this.processAutomationTriggers(trigger);
  }

  private async processAutomationTriggers(trigger: { type: string; [key: string]: any }): Promise<void> {
    const now = new Date();

    const rules = Array.from(this.automationRules.values());
    for (const rule of rules) {
      if (!rule.enabled) continue;
      if (rule.trigger.type !== trigger.type) continue;
      
      if (rule.cooldownMs && rule.lastTriggered) {
        const elapsed = now.getTime() - rule.lastTriggered.getTime();
        if (elapsed < rule.cooldownMs) continue;
      }

      const matches = this.matchTriggerConditions(rule.trigger, trigger);
      if (!matches) continue;

      try {
        await this.executeAutomationAction(rule.action);
        rule.lastTriggered = now;
        this.automationRules.set(rule.id, rule);
        
        this.emitEvent('automation_triggered', {
          ruleId: rule.id,
          ruleName: rule.name,
          trigger: trigger.type,
          action: rule.action.type
        });
      } catch (error: any) {
        this.emitEvent('error', {
          message: `Automation '${rule.name}' failed`,
          error: error.message
        });
      }
    }
  }

  private matchTriggerConditions(ruleTrigger: AutomationTrigger, eventTrigger: any): boolean {
    switch (ruleTrigger.type) {
      case 'game_detection':
        return ruleTrigger.config.games?.includes(eventTrigger.game);
        
      case 'audio_level':
        const threshold = ruleTrigger.config.threshold || -30;
        const level = eventTrigger.level || -60;
        if (ruleTrigger.config.above) {
          return level > threshold;
        }
        return level < threshold;
        
      case 'chat_command':
        return ruleTrigger.config.commands?.includes(eventTrigger.command);
        
      case 'ai_event':
        return ruleTrigger.config.events?.includes(eventTrigger.event);
        
      case 'timer':
        return true;
        
      case 'stream_event':
        return ruleTrigger.config.events?.includes(eventTrigger.event);
        
      default:
        return false;
    }
  }

  private async executeAutomationAction(action: AutomationAction): Promise<void> {
    switch (action.type) {
      case 'switch_scene':
        await this.setCurrentScene(action.config.sceneName);
        break;
        
      case 'toggle_source':
        await this.setSourceVisibility(
          action.config.sceneName,
          action.config.sourceName,
          action.config.visible
        );
        break;
        
      case 'update_source':
        await this.setSourceSettings(
          action.config.sceneName,
          action.config.sourceName,
          action.config.settings
        );
        break;
        
      case 'start_recording':
        if (action.config.start) {
          await this.startRecording();
        } else {
          await this.stopRecording();
        }
        break;
        
      case 'run_script':
        break;
    }
  }

  private async getSceneItemId(sceneName: string, sourceName: string): Promise<number> {
    const response = await this.obs.call('GetSceneItemId', { sceneName, sourceName });
    return response.sceneItemId;
  }

  private async getCurrentSceneName(): Promise<string> {
    const response = await this.obs.call('GetCurrentProgramScene');
    return response.currentProgramSceneName;
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('Not connected to OBS WebSocket');
    }
  }
}

let obsControllerInstance: OBSController | null = null;

export function getOBSController(): OBSController {
  if (!obsControllerInstance) {
    obsControllerInstance = new OBSController();
  }
  return obsControllerInstance;
}

export default OBSController;
