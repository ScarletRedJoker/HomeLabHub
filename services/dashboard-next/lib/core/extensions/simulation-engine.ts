/**
 * Simulation Engine Extension Interface
 * 
 * Defines interfaces for physics and simulation engine integrations including
 * rigid body dynamics, collision detection, raycasting, and constraint systems.
 * Supports integration with engines like PhysX, Bullet, Havok, and custom solutions.
 * 
 * Extension Points:
 * - Implement ISimulationExtension to create a physics engine integration
 * - Implement IPhysicsWorld for world management
 * - Extend collision shape types for custom geometries
 * 
 * @module core/extensions/simulation-engine
 * 
 * @example
 * // Implementing a PhysX simulation extension
 * class PhysXExtension implements ISimulationExtension {
 *   readonly type = 'simulation-engine';
 *   
 *   async createWorld(config) {
 *     return new PhysXWorld(config);
 *   }
 * }
 */

import type { IExtension } from '../interfaces/extension';
import type { Vector3, Quaternion } from '../interfaces/rendering-service';

/**
 * Physics body types.
 */
export type BodyType = 'static' | 'kinematic' | 'dynamic';

/**
 * Collision shape types.
 */
export type ShapeType = 
  | 'box' 
  | 'sphere' 
  | 'capsule' 
  | 'cylinder' 
  | 'cone' 
  | 'convex' 
  | 'mesh' 
  | 'heightfield' 
  | 'compound';

/**
 * Collision filter groups for layer-based collision.
 */
export interface CollisionFilter {
  /** Group this body belongs to */
  group: number;
  /** Mask of groups this body collides with */
  mask: number;
}

/**
 * Physical material properties.
 */
export interface PhysicsMaterial {
  /** Material identifier */
  id: string;
  /** Friction coefficient (0-1) */
  friction: number;
  /** Static friction coefficient */
  staticFriction?: number;
  /** Bounciness/restitution (0-1) */
  restitution: number;
  /** Density in kg/m³ */
  density?: number;
  /** Friction combine mode */
  frictionCombine?: 'average' | 'minimum' | 'maximum' | 'multiply';
  /** Restitution combine mode */
  restitutionCombine?: 'average' | 'minimum' | 'maximum' | 'multiply';
}

/**
 * Collision shape definition.
 * 
 * @typeParam TParams - Shape-specific parameters type
 */
export interface CollisionShape<TParams = unknown> {
  /** Shape type */
  type: ShapeType;
  /** Local offset from body center */
  offset?: Vector3;
  /** Local rotation */
  rotation?: Quaternion;
  /** Shape-specific parameters */
  params: TParams;
  /** Material for this shape */
  material?: PhysicsMaterial;
  /** Is this a trigger (non-solid) */
  isTrigger?: boolean;
}

/**
 * Box shape parameters.
 */
export interface BoxShapeParams {
  halfExtents: Vector3;
}

/**
 * Sphere shape parameters.
 */
export interface SphereShapeParams {
  radius: number;
}

/**
 * Capsule shape parameters.
 */
export interface CapsuleShapeParams {
  radius: number;
  halfHeight: number;
  axis?: 'x' | 'y' | 'z';
}

/**
 * Convex hull shape parameters.
 */
export interface ConvexShapeParams {
  vertices: Vector3[];
}

/**
 * Triangle mesh shape parameters.
 */
export interface MeshShapeParams {
  vertices: Float32Array;
  indices: Uint32Array;
}

/**
 * Rigid body definition.
 */
export interface RigidBody {
  /** Body identifier */
  id: string;
  /** Body type */
  type: BodyType;
  /** World position */
  position: Vector3;
  /** World rotation */
  rotation: Quaternion;
  /** Collision shapes */
  shapes: CollisionShape[];
  /** Mass in kg (0 for static/kinematic) */
  mass?: number;
  /** Linear damping (0-1) */
  linearDamping?: number;
  /** Angular damping (0-1) */
  angularDamping?: number;
  /** Linear velocity */
  linearVelocity?: Vector3;
  /** Angular velocity */
  angularVelocity?: Vector3;
  /** Collision filter */
  collisionFilter?: CollisionFilter;
  /** Whether body can sleep */
  allowSleep?: boolean;
  /** Continuous collision detection */
  ccd?: boolean;
  /** Custom user data */
  userData?: Record<string, unknown>;
}

/**
 * Contact point between two bodies.
 */
export interface ContactPoint {
  /** Contact position in world space */
  position: Vector3;
  /** Contact normal (pointing from body A to B) */
  normal: Vector3;
  /** Penetration depth */
  depth: number;
  /** Impulse applied at this contact */
  impulse?: number;
}

/**
 * Contact information between two bodies.
 */
export interface Contact {
  /** First body ID */
  bodyA: string;
  /** Second body ID */
  bodyB: string;
  /** Contact points */
  points: ContactPoint[];
  /** Total impulse */
  totalImpulse?: number;
  /** Whether this is a new contact */
  isNew?: boolean;
  /** Whether contact is ending */
  isEnding?: boolean;
}

/**
 * Raycast hit result.
 */
export interface RaycastHit {
  /** Hit body ID */
  bodyId: string;
  /** Hit point in world space */
  point: Vector3;
  /** Surface normal at hit point */
  normal: Vector3;
  /** Distance from ray origin */
  distance: number;
  /** Shape index within body */
  shapeIndex?: number;
  /** Triangle index (for mesh shapes) */
  triangleIndex?: number;
  /** UV coordinates (for mesh shapes) */
  uv?: { u: number; v: number };
}

/**
 * World configuration for physics simulation.
 */
export interface WorldConfig {
  /** Gravity vector */
  gravity: Vector3;
  /** Simulation substeps per step */
  substeps?: number;
  /** Enable sleeping for inactive bodies */
  allowSleep?: boolean;
  /** Linear velocity threshold for sleeping */
  sleepLinearThreshold?: number;
  /** Angular velocity threshold for sleeping */
  sleepAngularThreshold?: number;
  /** Broad phase algorithm */
  broadPhase?: 'sap' | 'bvh' | 'grid';
  /** Solver iterations */
  solverIterations?: number;
  /** Position solver iterations */
  positionIterations?: number;
  /** World bounds (for optimization) */
  worldBounds?: {
    min: Vector3;
    max: Vector3;
  };
  /** Maximum number of bodies */
  maxBodies?: number;
  /** Enable continuous collision detection */
  ccd?: boolean;
}

/**
 * Constraint types for connecting bodies.
 */
export type ConstraintType = 
  | 'fixed' 
  | 'hinge' 
  | 'slider' 
  | 'ball-socket' 
  | 'distance' 
  | 'spring' 
  | 'cone-twist' 
  | 'generic-6dof';

/**
 * Physics constraint between two bodies.
 */
export interface Constraint {
  /** Constraint identifier */
  id: string;
  /** Constraint type */
  type: ConstraintType;
  /** First body ID */
  bodyA: string;
  /** Second body ID (null for world anchor) */
  bodyB?: string;
  /** Anchor point on body A (local space) */
  anchorA: Vector3;
  /** Anchor point on body B (local space) */
  anchorB?: Vector3;
  /** Axis for hinge/slider constraints */
  axis?: Vector3;
  /** Enable collision between connected bodies */
  collideConnected?: boolean;
  /** Constraint-specific parameters */
  params?: Record<string, number | boolean>;
}

/**
 * Force application modes.
 */
export type ForceMode = 'force' | 'impulse' | 'acceleration' | 'velocity-change';

/**
 * Query filter for spatial queries.
 */
export interface QueryFilter {
  /** Include triggers in results */
  includeTriggers?: boolean;
  /** Collision group filter */
  collisionFilter?: CollisionFilter;
  /** Maximum results to return */
  maxResults?: number;
  /** Bodies to exclude */
  excludeBodies?: string[];
}

/**
 * Physics world interface for managing simulation.
 * 
 * Extension Point: Implement this for engine-specific world management.
 */
export interface IPhysicsWorld {
  /** World identifier */
  readonly id: string;
  /** Whether simulation is paused */
  readonly isPaused: boolean;

  /**
   * Add a rigid body to the world.
   * 
   * @param body - Body to add
   */
  addBody(body: RigidBody): void;

  /**
   * Remove a rigid body from the world.
   * 
   * @param bodyId - ID of body to remove
   */
  removeBody(bodyId: string): void;

  /**
   * Get a body by ID.
   * 
   * @param bodyId - Body ID
   * @returns The body or undefined
   */
  getBody(bodyId: string): RigidBody | undefined;

  /**
   * Update body properties.
   * 
   * @param bodyId - Body ID
   * @param updates - Partial body updates
   */
  updateBody(bodyId: string, updates: Partial<RigidBody>): void;

  /**
   * Set world gravity.
   * 
   * @param gravity - Gravity vector
   */
  setGravity(gravity: Vector3): void;

  /**
   * Get current gravity.
   * 
   * @returns Gravity vector
   */
  getGravity(): Vector3;

  /**
   * Get all contacts this frame.
   * 
   * @returns Array of contacts
   */
  getContacts(): Contact[];

  /**
   * Add a constraint between bodies.
   * 
   * @param constraint - Constraint to add
   */
  addConstraint(constraint: Constraint): void;

  /**
   * Remove a constraint.
   * 
   * @param constraintId - Constraint ID
   */
  removeConstraint(constraintId: string): void;

  /**
   * Apply force to a body.
   * 
   * @param bodyId - Body ID
   * @param force - Force vector
   * @param mode - Force application mode
   * @param point - Application point (world space)
   */
  applyForce(bodyId: string, force: Vector3, mode?: ForceMode, point?: Vector3): void;

  /**
   * Apply torque to a body.
   * 
   * @param bodyId - Body ID
   * @param torque - Torque vector
   * @param mode - Force application mode
   */
  applyTorque(bodyId: string, torque: Vector3, mode?: ForceMode): void;

  /**
   * Set body position directly (for kinematic bodies).
   * 
   * @param bodyId - Body ID
   * @param position - New position
   * @param rotation - New rotation (optional)
   */
  setBodyPose(bodyId: string, position: Vector3, rotation?: Quaternion): void;

  /**
   * Get body velocity.
   * 
   * @param bodyId - Body ID
   * @returns Linear and angular velocity
   */
  getBodyVelocity(bodyId: string): { linear: Vector3; angular: Vector3 };

  /**
   * Set body velocity.
   * 
   * @param bodyId - Body ID
   * @param linear - Linear velocity
   * @param angular - Angular velocity
   */
  setBodyVelocity(bodyId: string, linear?: Vector3, angular?: Vector3): void;

  /**
   * Pause simulation.
   */
  pause(): void;

  /**
   * Resume simulation.
   */
  resume(): void;

  /**
   * Clear all bodies and constraints.
   */
  clear(): void;

  /**
   * Get all body IDs.
   * 
   * @returns Array of body IDs
   */
  getAllBodyIds(): string[];

  /**
   * Query bodies overlapping a shape.
   * 
   * @param shape - Query shape
   * @param position - Shape position
   * @param filter - Query filter
   * @returns Array of overlapping body IDs
   */
  overlapQuery?(
    shape: CollisionShape,
    position: Vector3,
    filter?: QueryFilter
  ): string[];

  /**
   * Register contact event callback.
   * 
   * @param event - Event type
   * @param callback - Event handler
   */
  onContact?(
    event: 'begin' | 'end' | 'persist',
    callback: (contact: Contact) => void
  ): void;
}

/**
 * Simulation statistics for profiling.
 */
export interface SimulationStats {
  /** Bodies in simulation */
  bodyCount: number;
  /** Active (non-sleeping) bodies */
  activeBodyCount: number;
  /** Constraints count */
  constraintCount: number;
  /** Contacts this frame */
  contactCount: number;
  /** Simulation step time (ms) */
  stepTimeMs: number;
  /** Broad phase time (ms) */
  broadPhaseTimeMs?: number;
  /** Narrow phase time (ms) */
  narrowPhaseTimeMs?: number;
  /** Solver time (ms) */
  solverTimeMs?: number;
  /** Memory usage (bytes) */
  memoryUsage?: number;
}

/**
 * Simulation Engine Extension interface.
 * Implement this to integrate a physics/simulation engine.
 * 
 * Extension Points:
 * - createWorld: Factory for physics worlds
 * - step: Custom simulation stepping
 * - raycast: Custom raycasting implementation
 * 
 * @example
 * class BulletPhysicsExtension implements ISimulationExtension {
 *   readonly id = 'bullet-physics';
 *   readonly name = 'Bullet Physics';
 *   readonly version = '3.25';
 *   readonly type = 'simulation-engine';
 *   
 *   async createWorld(config) {
 *     return new BulletWorld(config);
 *   }
 * }
 */
export interface ISimulationExtension extends IExtension {
  /** Extension type is always 'simulation-engine' */
  readonly type: 'simulation-engine';

  /**
   * Create a new physics world.
   * 
   * @param config - World configuration
   * @returns Promise resolving to the created world
   */
  createWorld(config: WorldConfig): Promise<IPhysicsWorld>;

  /**
   * Step the simulation forward.
   * 
   * @param deltaTime - Time step in seconds
   */
  step(deltaTime: number): void;

  /**
   * Cast a ray and return the first hit.
   * 
   * @param origin - Ray origin
   * @param direction - Ray direction (normalized)
   * @param maxDistance - Maximum ray distance
   * @param filter - Query filter
   * @returns Hit result or null
   */
  raycast(
    origin: Vector3,
    direction: Vector3,
    maxDistance?: number,
    filter?: QueryFilter
  ): RaycastHit | null;

  /**
   * Cast a ray and return all hits.
   * 
   * @param origin - Ray origin
   * @param direction - Ray direction
   * @param maxDistance - Maximum distance
   * @param filter - Query filter
   * @returns Array of hits
   */
  raycastAll?(
    origin: Vector3,
    direction: Vector3,
    maxDistance?: number,
    filter?: QueryFilter
  ): RaycastHit[];

  /**
   * Get the active physics world.
   * 
   * @returns Current world or undefined
   */
  getActiveWorld?(): IPhysicsWorld | undefined;

  /**
   * Get simulation statistics.
   * 
   * @returns Current simulation stats
   */
  getStats?(): SimulationStats;

  /**
   * Create a physics material.
   * 
   * @param material - Material definition
   * @returns Material ID
   */
  createMaterial?(material: PhysicsMaterial): string;

  /**
   * Set fixed time step for deterministic simulation.
   * 
   * @param timeStep - Fixed time step in seconds
   */
  setFixedTimeStep?(timeStep: number): void;

  /**
   * Get supported features.
   * 
   * @returns Supported simulation features
   */
  getSupportedFeatures?(): SimulationFeatures;
}

/**
 * Simulation engine feature support.
 */
export interface SimulationFeatures {
  /** Supports continuous collision detection */
  ccd: boolean;
  /** Supports convex hull generation */
  convexHullGeneration: boolean;
  /** Supports mesh colliders */
  meshColliders: boolean;
  /** Supports heightfield terrain */
  heightfieldTerrain: boolean;
  /** Supports soft bodies */
  softBodies: boolean;
  /** Supports cloth simulation */
  cloth: boolean;
  /** Supports fluid simulation */
  fluids: boolean;
  /** Supports vehicle physics */
  vehicles: boolean;
  /** Supports character controllers */
  characterControllers: boolean;
  /** Maximum bodies per world */
  maxBodies: number;
  /** Supported constraint types */
  constraintTypes: ConstraintType[];
}
