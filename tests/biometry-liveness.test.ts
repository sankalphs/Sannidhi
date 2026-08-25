import { describe, expect, it } from "vitest";

import {
  LIVENESS_BRIGHTNESS_MIN,
  LIVENESS_MOTION_FLOOR,
  assessLiveness,
} from "../src/lib/biometry";

const DIMS = 24;

function unitVector(base: number[]): number[] {
  const norm = Math.sqrt(base.reduce((sum, value) => sum + value * value, 0));
  return base.map((value) => value / norm);
}

function frames(count: number, options?: { delta?: number; meanLuminance?: number }) {
  const delta = options?.delta ?? 0;
  const meanLuminance = options?.meanLuminance ?? 0.5;
  const base = unitVector(Array.from({ length: DIMS }, (_, i) => (i % 3) + 1));
  const shifted = base.map((value) => value + delta);
  return Array.from({ length: count }, (_, i) => ({
    vector: i % 2 === 0 ? base : shifted,
    meanLuminance,
  }));
}

describe("assessLiveness", () => {
  it("calls a static presentation when consecutive frames are identical", () => {
    const assessment = assessLiveness(frames(8));
    expect(assessment.verdict).toBe("static");
    expect(assessment.motionScore).toBe(0);
    expect(assessment.frameCount).toBe(8);
    expect(assessment.brightnessScore).toBeCloseTo(0.5, 10);
  });

  it("calls a live presentation when motion clears the floor", () => {
    const assessment = assessLiveness(frames(10, { delta: 0.05 }));
    expect(LIVENESS_MOTION_FLOOR).toBeLessThan(0.05);
    expect(assessment.verdict).toBe("live");
    expect(assessment.motionScore).toBeGreaterThan(LIVENESS_MOTION_FLOOR);
  });

  it("marks too-few frames insufficient even with motion", () => {
    const assessment = assessLiveness(frames(5, { delta: 0.05 }));
    expect(assessment.frameCount).toBeLessThan(6);
    expect(assessment.verdict).toBe("insufficient");
  });

  it("marks dark captures insufficient regardless of motion", () => {
    expect(LIVENESS_BRIGHTNESS_MIN).toBeGreaterThan(0.01);
    const assessment = assessLiveness(frames(10, { delta: 0.05, meanLuminance: 0.01 }));
    expect(assessment.verdict).toBe("insufficient");
    expect(assessment.brightnessScore).toBeCloseTo(0.01, 10);
  });

  it("checks brightness before motion so a dark static scene is still insufficient", () => {
    const assessment = assessLiveness(frames(8, { meanLuminance: 0.001 }));
    expect(assessment.verdict).toBe("insufficient");
  });

  it("reports zero motion for empty input as insufficient", () => {
    const assessment = assessLiveness([]);
    expect(assessment.verdict).toBe("insufficient");
    expect(assessment.motionScore).toBe(0);
    expect(assessment.frameCount).toBe(0);
  });
});
