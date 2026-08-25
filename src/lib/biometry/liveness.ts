import { LIVENESS_BRIGHTNESS_MIN, LIVENESS_MIN_FRAMES, LIVENESS_MOTION_FLOOR } from "./constants";

export type LivenessAssessment = {
  verdict: "live" | "static" | "insufficient";
  motionScore: number;
  brightnessScore: number;
  frameCount: number;
};

export function assessLiveness(
  frames: { vector: number[]; meanLuminance: number }[],
): LivenessAssessment {
  const frameCount = frames.length;
  let brightnessSum = 0;
  for (const frame of frames) brightnessSum += frame.meanLuminance;
  const brightnessScore = frameCount > 0 ? brightnessSum / frameCount : 0;

  let pairDeltaSum = 0;
  for (let i = 1; i < frameCount; i += 1) {
    const a = frames[i - 1].vector;
    const b = frames[i].vector;
    let deltaSum = 0;
    for (let j = 0; j < a.length; j += 1) deltaSum += Math.abs(a[j] - b[j]);
    pairDeltaSum += deltaSum / a.length;
  }
  const motionScore = frameCount > 1 ? pairDeltaSum / (frameCount - 1) : 0;

  if (frameCount < LIVENESS_MIN_FRAMES || brightnessScore < LIVENESS_BRIGHTNESS_MIN) {
    return { verdict: "insufficient", motionScore, brightnessScore, frameCount };
  }
  if (motionScore < LIVENESS_MOTION_FLOOR) {
    return { verdict: "static", motionScore, brightnessScore, frameCount };
  }
  return { verdict: "live", motionScore, brightnessScore, frameCount };
}
