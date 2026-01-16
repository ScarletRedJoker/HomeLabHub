import { NextRequest, NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { cookies } from "next/headers";
import {
  MotionCaptureConfig,
  PoseData,
  GestureResult,
  ControlNetPoseData,
  OpenPoseKeypoints,
  HandData,
  FaceData,
  MotionCaptureStatus,
} from "@/lib/motion-capture";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type MotionAction =
  | "start_capture"
  | "stop_capture"
  | "pause_capture"
  | "resume_capture"
  | "get_status"
  | "get_pose"
  | "get_hands"
  | "get_face"
  | "export_controlnet"
  | "export_openpose"
  | "detect_gesture"
  | "calibrate"
  | "set_config";

interface MotionRequest {
  action: MotionAction;
  config?: Partial<MotionCaptureConfig>;
  frameId?: string;
  poseData?: PoseData;
  width?: number;
  height?: number;
  gestureName?: string;
  inputSource?: string;
}

interface MotionResponse {
  success: boolean;
  data?: any;
  error?: string;
  timestamp: string;
}

interface MotionCaptureState {
  status: MotionCaptureStatus;
  config: MotionCaptureConfig | null;
  lastPose: PoseData | null;
  lastHands: HandData[] | null;
  lastFace: FaceData | null;
  frameCount: number;
  startedAt: Date | null;
}

const DEFAULT_CONFIG: MotionCaptureConfig = {
  inputType: "webcam",
  modelType: "pose",
  smoothing: 0.5,
  minConfidence: 0.5,
  trackingMode: "realtime",
  frameRate: 30,
  maxHistoryFrames: 60,
  enableSegmentation: false,
  enableWorldLandmarks: false,
};

let captureState: MotionCaptureState = {
  status: "idle",
  config: null,
  lastPose: null,
  lastHands: null,
  lastFace: null,
  frameCount: 0,
  startedAt: null,
};

async function checkAuth() {
  const cookieStore = await cookies();
  const session = cookieStore.get("session");
  if (!session?.value) return null;
  return await verifySession(session.value);
}

function validateAction(action: string): action is MotionAction {
  const validActions: MotionAction[] = [
    "start_capture",
    "stop_capture",
    "pause_capture",
    "resume_capture",
    "get_status",
    "get_pose",
    "get_hands",
    "get_face",
    "export_controlnet",
    "export_openpose",
    "detect_gesture",
    "calibrate",
    "set_config",
  ];
  return validActions.includes(action as MotionAction);
}

function createResponse(success: boolean, data?: any, error?: string): NextResponse<MotionResponse> {
  return NextResponse.json({
    success,
    data,
    error,
    timestamp: new Date().toISOString(),
  });
}

function convertToControlNetFormat(pose: PoseData, width: number, height: number): ControlNetPoseData {
  const keypoints2d: number[] = [];

  for (const landmark of pose.landmarks) {
    keypoints2d.push(landmark.x * width);
    keypoints2d.push(landmark.y * height);
    keypoints2d.push(landmark.visibility);
  }

  return {
    version: "1.0",
    width,
    height,
    people: [
      {
        pose_keypoints_2d: keypoints2d,
      },
    ],
  };
}

function convertToOpenPoseFormat(pose: PoseData): OpenPoseKeypoints {
  const OPENPOSE_MAPPING = [
    0, -1, 12, 14, 16, 11, 13, 15, 24, 26, 28, 23, 25, 27, 5, 2, 8, 7,
  ];

  const keypoints2d: number[] = [];
  const keypoints3d: number[] = [];

  for (const mappedIdx of OPENPOSE_MAPPING) {
    if (mappedIdx >= 0 && mappedIdx < pose.landmarks.length) {
      const lm = pose.landmarks[mappedIdx];
      keypoints2d.push(lm.x, lm.y, lm.visibility);
      if (pose.worldLandmarks && pose.worldLandmarks[mappedIdx]) {
        const wlm = pose.worldLandmarks[mappedIdx];
        keypoints3d.push(wlm.x, wlm.y, wlm.z, wlm.visibility);
      } else {
        keypoints3d.push(lm.x, lm.y, lm.z, lm.visibility);
      }
    } else {
      keypoints2d.push(0, 0, 0);
      keypoints3d.push(0, 0, 0, 0);
    }
  }

  return {
    version: 1,
    people: [
      {
        person_id: [-1],
        pose_keypoints_2d: keypoints2d,
        face_keypoints_2d: [],
        hand_left_keypoints_2d: [],
        hand_right_keypoints_2d: [],
        pose_keypoints_3d: keypoints3d,
        face_keypoints_3d: [],
        hand_left_keypoints_3d: [],
        hand_right_keypoints_3d: [],
      },
    ],
  };
}

function detectGestureFromPose(pose: PoseData, gestureName?: string): GestureResult | null {
  if (!pose.landmarks || pose.landmarks.length === 0) {
    return null;
  }

  const findLandmark = (name: string) => pose.landmarks.find((l) => l.name === name);

  const rightWrist = findLandmark("right_wrist");
  const rightElbow = findLandmark("right_elbow");
  const rightShoulder = findLandmark("right_shoulder");
  const leftWrist = findLandmark("left_wrist");
  const leftElbow = findLandmark("left_elbow");
  const leftShoulder = findLandmark("left_shoulder");
  const nose = findLandmark("nose");

  if (rightWrist && rightShoulder && rightWrist.y < rightShoulder.y && rightWrist.visibility > 0.7) {
    if (!gestureName || gestureName === "wave") {
      return {
        gesture: "wave",
        confidence: rightWrist.visibility,
        landmarks: [rightWrist, rightElbow!, rightShoulder].filter(Boolean) as any[],
      };
    }
  }

  if (
    rightWrist &&
    leftWrist &&
    rightWrist.y < (rightShoulder?.y || 0.5) &&
    leftWrist.y < (leftShoulder?.y || 0.5)
  ) {
    if (!gestureName || gestureName === "hands_up") {
      return {
        gesture: "hands_up",
        confidence: Math.min(rightWrist.visibility, leftWrist.visibility),
        landmarks: [rightWrist, leftWrist],
      };
    }
  }

  if (rightWrist && leftWrist && nose) {
    const armsCrossed =
      Math.abs(rightWrist.x - leftWrist.x) < 0.15 &&
      rightWrist.y > nose.y &&
      leftWrist.y > nose.y;
    if (armsCrossed && (!gestureName || gestureName === "arms_crossed")) {
      return {
        gesture: "arms_crossed",
        confidence: 0.7,
        landmarks: [rightWrist, leftWrist],
      };
    }
  }

  if (rightWrist && rightElbow && rightShoulder) {
    const armExtended =
      Math.abs(rightWrist.y - rightElbow.y) < 0.1 &&
      Math.abs(rightElbow.y - rightShoulder.y) < 0.1;
    if (armExtended && (!gestureName || gestureName === "pointing")) {
      return {
        gesture: "pointing",
        confidence: rightWrist.visibility,
        landmarks: [rightWrist, rightElbow, rightShoulder],
      };
    }
  }

  return null;
}

async function callNebulaAgent(endpoint: string, method: string, body?: any): Promise<any> {
  const host = process.env.NEBULA_AGENT_HOST || "100.118.44.102";
  const port = process.env.NEBULA_AGENT_PORT || "9765";
  const token = process.env.NEBULA_AGENT_TOKEN;

  const url = `http://${host}:${port}${endpoint}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      throw new Error(`Agent request failed: ${response.status}`);
    }

    return await response.json();
  } catch (error: any) {
    console.error("[Motion API] Agent call failed:", error.message);
    throw error;
  }
}

export async function POST(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: MotionRequest = await request.json();
    const { action } = body;

    if (!action) {
      return createResponse(false, undefined, "Missing required field: action");
    }

    if (!validateAction(action)) {
      return createResponse(false, undefined, `Invalid action: ${action}`);
    }

    console.log(`[Motion API] Action: ${action} by user: ${user.username}`);

    switch (action) {
      case "start_capture": {
        if (captureState.status === "capturing") {
          return createResponse(false, undefined, "Capture already in progress");
        }

        const config: MotionCaptureConfig = {
          ...DEFAULT_CONFIG,
          ...body.config,
        };

        captureState = {
          status: "initializing",
          config,
          lastPose: null,
          lastHands: null,
          lastFace: null,
          frameCount: 0,
          startedAt: new Date(),
        };

        try {
          await callNebulaAgent("/api/motion/start", "POST", { config });
          captureState.status = "capturing";
          return createResponse(true, {
            message: "Motion capture started",
            config,
            startedAt: captureState.startedAt,
          });
        } catch (agentError: any) {
          captureState.status = "capturing";
          return createResponse(true, {
            message: "Motion capture started (simulated mode)",
            config,
            simulated: true,
            startedAt: captureState.startedAt,
          });
        }
      }

      case "stop_capture": {
        if (captureState.status === "idle" || captureState.status === "stopped") {
          return createResponse(false, undefined, "No capture in progress");
        }

        try {
          await callNebulaAgent("/api/motion/stop", "POST", {});
        } catch {}

        const summary = {
          frameCount: captureState.frameCount,
          duration: captureState.startedAt
            ? Date.now() - captureState.startedAt.getTime()
            : 0,
        };

        captureState.status = "stopped";
        captureState.startedAt = null;

        return createResponse(true, {
          message: "Motion capture stopped",
          summary,
        });
      }

      case "pause_capture": {
        if (captureState.status !== "capturing") {
          return createResponse(false, undefined, "Capture is not running");
        }
        captureState.status = "paused";
        return createResponse(true, { message: "Motion capture paused" });
      }

      case "resume_capture": {
        if (captureState.status !== "paused") {
          return createResponse(false, undefined, "Capture is not paused");
        }
        captureState.status = "capturing";
        return createResponse(true, { message: "Motion capture resumed" });
      }

      case "get_status": {
        return createResponse(true, {
          status: captureState.status,
          config: captureState.config,
          frameCount: captureState.frameCount,
          startedAt: captureState.startedAt,
          hasLastPose: captureState.lastPose !== null,
          hasLastHands: captureState.lastHands !== null,
          hasLastFace: captureState.lastFace !== null,
        });
      }

      case "get_pose": {
        if (captureState.status !== "capturing" && captureState.status !== "paused") {
          return createResponse(false, undefined, "Capture is not active");
        }

        try {
          const response = await callNebulaAgent("/api/motion/pose", "GET");
          if (response.pose) {
            captureState.lastPose = response.pose;
            captureState.frameCount++;
          }
          return createResponse(true, { pose: response.pose || captureState.lastPose });
        } catch {
          const mockPose: PoseData = {
            timestamp: Date.now(),
            landmarks: [
              { x: 0.5, y: 0.3, z: 0, visibility: 0.9, name: "nose" },
              { x: 0.45, y: 0.5, z: 0, visibility: 0.85, name: "left_shoulder" },
              { x: 0.55, y: 0.5, z: 0, visibility: 0.85, name: "right_shoulder" },
              { x: 0.4, y: 0.65, z: 0, visibility: 0.8, name: "left_elbow" },
              { x: 0.6, y: 0.65, z: 0, visibility: 0.8, name: "right_elbow" },
              { x: 0.35, y: 0.8, z: 0, visibility: 0.75, name: "left_wrist" },
              { x: 0.65, y: 0.8, z: 0, visibility: 0.75, name: "right_wrist" },
            ],
            confidence: 0.85,
          };
          captureState.lastPose = mockPose;
          captureState.frameCount++;
          return createResponse(true, { pose: mockPose, simulated: true });
        }
      }

      case "get_hands": {
        if (captureState.status !== "capturing" && captureState.status !== "paused") {
          return createResponse(false, undefined, "Capture is not active");
        }

        try {
          const response = await callNebulaAgent("/api/motion/hands", "GET");
          if (response.hands) {
            captureState.lastHands = response.hands;
          }
          return createResponse(true, { hands: response.hands || captureState.lastHands });
        } catch {
          return createResponse(true, { hands: captureState.lastHands, simulated: true });
        }
      }

      case "get_face": {
        if (captureState.status !== "capturing" && captureState.status !== "paused") {
          return createResponse(false, undefined, "Capture is not active");
        }

        try {
          const response = await callNebulaAgent("/api/motion/face", "GET");
          if (response.face) {
            captureState.lastFace = response.face;
          }
          return createResponse(true, { face: response.face || captureState.lastFace });
        } catch {
          return createResponse(true, { face: captureState.lastFace, simulated: true });
        }
      }

      case "export_controlnet": {
        const pose = body.poseData || captureState.lastPose;
        if (!pose) {
          return createResponse(false, undefined, "No pose data available");
        }

        const width = body.width || 512;
        const height = body.height || 512;
        const controlnetData = convertToControlNetFormat(pose, width, height);

        return createResponse(true, {
          format: "controlnet",
          data: controlnetData,
          width,
          height,
        });
      }

      case "export_openpose": {
        const pose = body.poseData || captureState.lastPose;
        if (!pose) {
          return createResponse(false, undefined, "No pose data available");
        }

        const openPoseData = convertToOpenPoseFormat(pose);

        return createResponse(true, {
          format: "openpose",
          data: openPoseData,
        });
      }

      case "detect_gesture": {
        const pose = body.poseData || captureState.lastPose;
        if (!pose) {
          return createResponse(false, undefined, "No pose data available for gesture detection");
        }

        const gesture = detectGestureFromPose(pose, body.gestureName);

        return createResponse(true, {
          detected: gesture !== null,
          gesture,
        });
      }

      case "calibrate": {
        try {
          const response = await callNebulaAgent("/api/motion/calibrate", "POST", {});
          return createResponse(true, {
            message: "Calibration complete",
            result: response,
          });
        } catch {
          return createResponse(true, {
            message: "Calibration complete (simulated)",
            simulated: true,
          });
        }
      }

      case "set_config": {
        if (!body.config) {
          return createResponse(false, undefined, "Config is required");
        }

        const newConfig: MotionCaptureConfig = {
          ...(captureState.config || DEFAULT_CONFIG),
          ...body.config,
        };

        captureState.config = newConfig;

        try {
          await callNebulaAgent("/api/motion/config", "POST", { config: newConfig });
        } catch {}

        return createResponse(true, {
          message: "Configuration updated",
          config: newConfig,
        });
      }

      default:
        return createResponse(false, undefined, `Unhandled action: ${action}`);
    }
  } catch (error: any) {
    console.error("[Motion API] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const user = await checkAuth();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json({
      status: captureState.status,
      config: captureState.config,
      frameCount: captureState.frameCount,
      startedAt: captureState.startedAt,
      hasLastPose: captureState.lastPose !== null,
      hasLastHands: captureState.lastHands !== null,
      hasLastFace: captureState.lastFace !== null,
      supportedGestures: ["wave", "hands_up", "arms_crossed", "pointing"],
      exportFormats: ["controlnet", "openpose"],
    });
  } catch (error: any) {
    console.error("[Motion API] GET Error:", error);
    return NextResponse.json(
      { error: "Failed to get motion capture status", details: error.message },
      { status: 500 }
    );
  }
}
