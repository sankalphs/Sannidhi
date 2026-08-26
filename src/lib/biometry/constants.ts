// Must stay in sync with convex/challenges.ts FACE_EMBEDDING_VERSION.
export const FACE_EMBEDDING_VERSION = "faceembed/v1";

export const EMBEDDING_GRID = 24;
export const EMBEDDING_DIMS = EMBEDDING_GRID * EMBEDDING_GRID;

export const FACE_MATCH_THRESHOLD = 0.92;

export const LIVENESS_MIN_FRAMES = 6;
export const LIVENESS_MOTION_FLOOR = 0.004;
export const LIVENESS_BRIGHTNESS_MIN = 0.02;

export const CAPTURE_FRAME_COUNT = 10;
export const CAPTURE_INTERVAL_MS = 160;
