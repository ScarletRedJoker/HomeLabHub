/**
 * Extension Loader Module
 * 
 * Provides dynamic loading and management of extensions from manifests and directories.
 * Handles dependency resolution, lifecycle management, and runtime loading/unloading.
 * 
 * @module core/extensions/extension-loader
 * 
 * @example
 * // Load extensions from manifest
 * const loader = new ExtensionLoader(serviceRegistry);
 * const extension = await loader.loadFromManifest({
 *   id: 'unity-engine',
 *   name: 'Unity Game Engine',
 *   version: '1.0.0',
 *   type: 'game-engine',
 *   entryPoint: './extensions/unity/index.js'
 * });
 * 
 * @example
 * // Load all extensions from a directory
 * const extensions = await loader.loadFromDirectory('./extensions');
 */

import type { 
  IExtension, 
  ExtensionType, 
  ExtensionState 
} from '../interfaces/extension';
import type { IServiceRegistry } from '../interfaces/service';

/**
 * Extension manifest describing an extension's metadata and entry point.
 * Used for discovering and loading extensions from configuration or directories.
 * 
 * @typeParam TConfig - Type of the extension configuration object
 */
export interface ExtensionManifest<TConfig = Record<string, unknown>> {
  /** Unique identifier for the extension */
  id: string;
  /** Human-readable extension name */
  name: string;
  /** Semantic version string */
  version: string;
  /** Extension category type */
  type: ExtensionType;
  /** Path to the extension's entry point module */
  entryPoint: string;
  /** List of extension IDs this extension depends on */
  dependencies?: string[];
  /** List of capabilities this extension provides */
  capabilities?: string[];
  /** Extension-specific configuration */
  config?: TConfig;
  /** Optional description */
  description?: string;
  /** Author information */
  author?: string;
  /** License identifier */
  license?: string;
  /** Minimum required system version */
  minSystemVersion?: string;
  /** Platforms this extension supports */
  platforms?: ('windows' | 'macos' | 'linux' | 'web' | 'mobile')[];
}

/**
 * Result of an extension loading operation.
 * 
 * @typeParam T - Type of the loaded extension
 */
export interface ExtensionLoadResult<T extends IExtension = IExtension> {
  /** Whether the load was successful */
  success: boolean;
  /** The loaded extension (if successful) */
  extension?: T;
  /** Error message (if failed) */
  error?: string;
  /** Warning messages during load */
  warnings?: string[];
  /** Time taken to load in milliseconds */
  loadTimeMs?: number;
}

/**
 * Options for loading extensions.
 */
export interface ExtensionLoadOptions {
  /** Whether to activate the extension after loading */
  activate?: boolean;
  /** Whether to validate dependencies before loading */
  validateDependencies?: boolean;
  /** Timeout for loading in milliseconds */
  timeoutMs?: number;
  /** Whether to continue loading if some extensions fail */
  continueOnError?: boolean;
}

/**
 * Information about a loaded extension.
 */
export interface LoadedExtensionInfo {
  /** The extension instance */
  extension: IExtension;
  /** The manifest used to load it */
  manifest: ExtensionManifest;
  /** Current state */
  state: ExtensionState;
  /** When it was loaded */
  loadedAt: Date;
  /** Load time in milliseconds */
  loadTimeMs: number;
}

/**
 * Dynamic extension loader that handles loading, unloading, and managing extensions.
 * Supports loading from manifests, directories, and URLs.
 * 
 * Extension Points:
 * - Override `loadModule` to customize how extension modules are loaded
 * - Override `validateManifest` to add custom validation rules
 * - Override `resolveDependencies` to customize dependency resolution
 * 
 * @example
 * // Create loader with custom options
 * const loader = new ExtensionLoader(registry);
 * 
 * // Load a single extension
 * const ext = await loader.loadFromManifest(manifest);
 * 
 * // Load all extensions from a directory
 * const exts = await loader.loadFromDirectory('./plugins');
 * 
 * // Unload an extension
 * await loader.unload('my-extension');
 */
export class ExtensionLoader {
  private readonly registry: IServiceRegistry;
  private readonly loadedExtensions: Map<string, LoadedExtensionInfo> = new Map();
  private readonly pendingLoads: Map<string, Promise<IExtension>> = new Map();

  /**
   * Create a new ExtensionLoader.
   * 
   * @param registry - Service registry for extension registration
   */
  constructor(registry: IServiceRegistry) {
    this.registry = registry;
  }

  /**
   * Load an extension from a manifest definition.
   * Handles dependency resolution, module loading, and initialization.
   * 
   * @typeParam T - Expected extension type
   * @param manifest - Extension manifest describing the extension
   * @param options - Loading options
   * @returns Promise resolving to the loaded extension
   * @throws Error if loading fails or dependencies are unmet
   * 
   * @example
   * const extension = await loader.loadFromManifest<IGameEngineExtension>({
   *   id: 'unity-engine',
   *   name: 'Unity',
   *   version: '2023.3',
   *   type: 'game-engine',
   *   entryPoint: './unity/index.js',
   *   dependencies: ['rendering-core']
   * });
   */
  async loadFromManifest<T extends IExtension = IExtension>(
    manifest: ExtensionManifest,
    options: ExtensionLoadOptions = {}
  ): Promise<T> {
    const startTime = Date.now();
    const { 
      activate = true, 
      validateDependencies = true,
      timeoutMs = 30000 
    } = options;

    if (this.pendingLoads.has(manifest.id)) {
      return this.pendingLoads.get(manifest.id) as Promise<T>;
    }

    if (this.loadedExtensions.has(manifest.id)) {
      return this.loadedExtensions.get(manifest.id)!.extension as T;
    }

    const loadPromise = this.doLoad<T>(manifest, {
      activate,
      validateDependencies,
      timeoutMs
    }, startTime);

    this.pendingLoads.set(manifest.id, loadPromise);

    try {
      const extension = await loadPromise;
      return extension;
    } finally {
      this.pendingLoads.delete(manifest.id);
    }
  }

  /**
   * Load all extensions from a directory.
   * Scans for manifest files and loads each extension.
   * 
   * @param path - Directory path containing extensions
   * @param options - Loading options
   * @returns Promise resolving to array of loaded extensions
   * 
   * @example
   * const extensions = await loader.loadFromDirectory('./extensions', {
   *   continueOnError: true,
   *   activate: true
   * });
   */
  async loadFromDirectory(
    path: string,
    options: ExtensionLoadOptions = {}
  ): Promise<IExtension[]> {
    const { continueOnError = false } = options;
    const manifests = await this.discoverManifests(path);
    const extensions: IExtension[] = [];
    const errors: Error[] = [];

    const sortedManifests = this.sortByDependencies(manifests);

    for (const manifest of sortedManifests) {
      try {
        const extension = await this.loadFromManifest(manifest, options);
        extensions.push(extension);
      } catch (error) {
        if (continueOnError) {
          errors.push(error instanceof Error ? error : new Error(String(error)));
        } else {
          throw error;
        }
      }
    }

    if (errors.length > 0) {
      console.warn(`Failed to load ${errors.length} extensions:`, errors);
    }

    return extensions;
  }

  /**
   * Unload an extension and clean up its resources.
   * Calls the extension's unregister method and removes it from the registry.
   * 
   * @param extensionId - ID of the extension to unload
   * @throws Error if extension is not loaded or has dependents
   * 
   * @example
   * await loader.unload('unity-engine');
   */
  async unload(extensionId: string): Promise<void> {
    const info = this.loadedExtensions.get(extensionId);
    if (!info) {
      throw new Error(`Extension not loaded: ${extensionId}`);
    }

    const dependents = this.getDependents(extensionId);
    if (dependents.length > 0) {
      throw new Error(
        `Cannot unload ${extensionId}: required by ${dependents.join(', ')}`
      );
    }

    try {
      await info.extension.unregister(this.registry);
      this.loadedExtensions.delete(extensionId);
    } catch (error) {
      throw new Error(
        `Failed to unload extension ${extensionId}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get all currently loaded extensions.
   * 
   * @returns Array of loaded extensions
   */
  getLoaded(): IExtension[] {
    return Array.from(this.loadedExtensions.values())
      .map(info => info.extension);
  }

  /**
   * Get loaded extensions by type.
   * 
   * @typeParam T - Expected extension type
   * @param type - Extension type to filter by
   * @returns Array of matching extensions
   */
  getLoadedByType<T extends IExtension = IExtension>(
    type: ExtensionType
  ): T[] {
    return Array.from(this.loadedExtensions.values())
      .filter(info => info.extension.type === type)
      .map(info => info.extension as T);
  }

  /**
   * Check if an extension is loaded.
   * 
   * @param extensionId - Extension ID to check
   * @returns True if the extension is loaded
   */
  isLoaded(extensionId: string): boolean {
    return this.loadedExtensions.has(extensionId);
  }

  /**
   * Get information about a loaded extension.
   * 
   * @param extensionId - Extension ID
   * @returns Extension info or undefined if not loaded
   */
  getInfo(extensionId: string): LoadedExtensionInfo | undefined {
    return this.loadedExtensions.get(extensionId);
  }

  private async doLoad<T extends IExtension>(
    manifest: ExtensionManifest,
    options: ExtensionLoadOptions,
    startTime: number
  ): Promise<T> {
    this.validateManifest(manifest);

    if (options.validateDependencies && manifest.dependencies) {
      await this.resolveDependencies(manifest.dependencies);
    }

    const ExtensionClass = await this.loadModule(manifest.entryPoint);
    const extension = new ExtensionClass() as T;

    if (extension.id !== manifest.id) {
      console.warn(
        `Extension ID mismatch: manifest says ${manifest.id}, extension says ${extension.id}`
      );
    }

    if (options.activate) {
      await extension.register(this.registry);
    }

    if (manifest.config && extension.configure) {
      await extension.configure(manifest.config);
    }

    const loadTimeMs = Date.now() - startTime;

    this.loadedExtensions.set(manifest.id, {
      extension,
      manifest,
      state: options.activate ? 'active' : 'loaded',
      loadedAt: new Date(),
      loadTimeMs
    });

    return extension;
  }

  /**
   * Validate an extension manifest.
   * Override to add custom validation rules.
   * 
   * @param manifest - Manifest to validate
   * @throws Error if validation fails
   */
  protected validateManifest(manifest: ExtensionManifest): void {
    if (!manifest.id) {
      throw new Error('Extension manifest must have an id');
    }
    if (!manifest.name) {
      throw new Error('Extension manifest must have a name');
    }
    if (!manifest.version) {
      throw new Error('Extension manifest must have a version');
    }
    if (!manifest.type) {
      throw new Error('Extension manifest must have a type');
    }
    if (!manifest.entryPoint) {
      throw new Error('Extension manifest must have an entryPoint');
    }
  }

  /**
   * Load an extension module from its entry point.
   * Override to customize module loading (e.g., for different environments).
   * 
   * @param entryPoint - Path or URL to the module
   * @returns Promise resolving to the extension class constructor
   */
  protected async loadModule(
    entryPoint: string
  ): Promise<new () => IExtension> {
    try {
      const module = await import(entryPoint);
      return module.default || module.Extension || module;
    } catch (error) {
      throw new Error(
        `Failed to load extension module from ${entryPoint}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Resolve and load extension dependencies.
   * Override to customize dependency resolution logic.
   * 
   * @param dependencies - List of dependency IDs
   * @throws Error if any dependency cannot be resolved
   */
  protected async resolveDependencies(dependencies: string[]): Promise<void> {
    for (const depId of dependencies) {
      if (!this.loadedExtensions.has(depId)) {
        throw new Error(
          `Missing dependency: ${depId}. Load it before loading dependent extensions.`
        );
      }
    }
  }

  /**
   * Discover extension manifests in a directory.
   * 
   * @param path - Directory to scan
   * @returns Array of discovered manifests
   */
  protected async discoverManifests(path: string): Promise<ExtensionManifest[]> {
    const manifests: ExtensionManifest[] = [];
    
    try {
      const fs = await import('fs/promises');
      const pathModule = await import('path');
      
      const entries = await fs.readdir(path, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const manifestPath = pathModule.join(path, entry.name, 'manifest.json');
          try {
            const content = await fs.readFile(manifestPath, 'utf-8');
            const manifest = JSON.parse(content) as ExtensionManifest;
            manifest.entryPoint = pathModule.join(path, entry.name, manifest.entryPoint);
            manifests.push(manifest);
          } catch {
            // No manifest in this directory, skip
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to scan directory ${path}:`, error);
    }

    return manifests;
  }

  /**
   * Sort manifests by dependency order (topological sort).
   * 
   * @param manifests - Manifests to sort
   * @returns Sorted manifests
   */
  protected sortByDependencies(manifests: ExtensionManifest[]): ExtensionManifest[] {
    const sorted: ExtensionManifest[] = [];
    const visited = new Set<string>();
    const manifestMap = new Map(manifests.map(m => [m.id, m]));

    const visit = (manifest: ExtensionManifest) => {
      if (visited.has(manifest.id)) return;
      visited.add(manifest.id);

      for (const depId of manifest.dependencies || []) {
        const dep = manifestMap.get(depId);
        if (dep) {
          visit(dep);
        }
      }

      sorted.push(manifest);
    };

    for (const manifest of manifests) {
      visit(manifest);
    }

    return sorted;
  }

  /**
   * Get extensions that depend on the given extension.
   * 
   * @param extensionId - Extension ID to check
   * @returns Array of dependent extension IDs
   */
  private getDependents(extensionId: string): string[] {
    const dependents: string[] = [];
    
    this.loadedExtensions.forEach((info, id) => {
      if (info.manifest.dependencies?.includes(extensionId)) {
        dependents.push(id);
      }
    });
    
    return dependents;
  }
}
