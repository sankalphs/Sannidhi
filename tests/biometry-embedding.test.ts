import { describe, expect, it } from "vitest";

import {
  EMBEDDING_DIMS,
  EMBEDDING_GRID,
  FACE_MATCH_THRESHOLD,
  averageEmbeddings,
  cosineSimilarity,
  frameStats,
  normalizeToEmbedding,
  type RawFrame,
} from "../src/lib/biometry";

function makeFrame(
  width: number,
  height: number,
  shade: (x: number, y: number) => number,
): RawFrame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = shade(x, y);
      const index = (y * width + x) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }
  return { data, width, height };
}

function gradientFrame(): RawFrame {
  return makeFrame(EMBEDDING_GRID, EMBEDDING_GRID, (x, y) => (y * EMBEDDING_GRID + x) / 3);
}

describe("normalizeToEmbedding", () => {
  it("throws frame_too_small when either dimension is under 8", () => {
    expect(() => normalizeToEmbedding(makeFrame(7, 7, () => 128))).toThrow("frame_too_small");
    expect(() => normalizeToEmbedding(makeFrame(4, 40, () => 128))).toThrow("frame_too_small");
    expect(() => normalizeToEmbedding(makeFrame(40, 4, () => 128))).toThrow("frame_too_small");
  });

  it("box-averages divisible cells in row-major order", () => {
    const frame = makeFrame(
      EMBEDDING_GRID * 2,
      EMBEDDING_GRID * 2,
      (x, y) => Math.floor(y / 2) * 10 + Math.floor(x / 2),
    );
    const embedding = normalizeToEmbedding(frame);
    expect(embedding).toHaveLength(EMBEDDING_DIMS);

    const raw = new Array<number>(EMBEDDING_DIMS);
    for (let i = 0; i < EMBEDDING_DIMS; i += 1)
      raw[i] = Math.floor(i / EMBEDDING_GRID) * 10 + (i % EMBEDDING_GRID);
    const grayscaled = raw.map((v) => v / 255);
    const norm = Math.sqrt(grayscaled.reduce((sum, v) => sum + v * v, 0));
    const expected = grayscaled.map((v) => v / norm);
    embedding.forEach((value, i) => expect(value).toBeCloseTo(expected[i], 10));
  });

  it("center-crops landscape frames to the largest centered square", () => {
    // 64x32: crop keeps x in [16, 48). Left half pure black, right half red.
    const data = new Uint8ClampedArray(64 * 32 * 4);
    for (let y = 0; y < 32; y += 1) {
      for (let x = 0; x < 64; x += 1) {
        const index = (y * 64 + x) * 4;
        data[index] = x >= 16 ? 255 : 0;
        data[index + 3] = 255;
      }
    }
    // Every cropped pixel is pure red => every grid cell is exactly 0.299 gray.
    const embedding = normalizeToEmbedding({ data, width: 64, height: 32 });
    const cell = 0.299 / Math.sqrt(EMBEDDING_DIMS * 0.299 * 0.299);
    embedding.forEach((value) => expect(value).toBeCloseTo(cell, 10));
  });

  it("center-crops portrait frames symmetrically", () => {
    const data = new Uint8ClampedArray(32 * 64 * 4);
    for (let y = 0; y < 64; y += 1) {
      for (let x = 0; x < 32; x += 1) {
        const index = (y * 32 + x) * 4;
        data[index + 1] = y >= 16 && y < 48 ? 255 : 0; // green only inside crop band
        data[index + 3] = 255;
      }
    }
    const embedding = normalizeToEmbedding({ data, width: 32, height: 64 });
    const cell = 0.587 / Math.sqrt(EMBEDDING_DIMS * 0.587 * 0.587);
    embedding.forEach((value) => expect(value).toBeCloseTo(cell, 10));
  });

  it("produces a unit-norm vector", () => {
    const embedding = normalizeToEmbedding(gradientFrame());
    const norm = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0));
    expect(norm).toBeCloseTo(1, 10);
  });
});

describe("frameStats", () => {
  it("reports absolute pre-normalization luminance on the crop grid", () => {
    const stats = frameStats(makeFrame(48, 48, () => 255));
    expect(stats.meanLuminance).toBeCloseTo(1, 10);
    expect(frameStats(makeFrame(48, 48, () => 0)).meanLuminance).toBe(0);

    // Half black / half white => mean 0.5 regardless of normalization.
    const half = makeFrame(48, 48, (_x, y) => (y < 24 ? 255 : 0));
    expect(frameStats(half).meanLuminance).toBeCloseTo(0.5, 10);
  });

  it("ignores pixels outside the centered square crop", () => {
    // White only in the vertical center band that survives cropping of a tall frame.
    const data = new Uint8ClampedArray(32 * 64 * 4);
    for (let y = 16; y < 48; y += 1) {
      for (let x = 0; x < 32; x += 1) {
        const index = (y * 32 + x) * 4;
        data[index] = 255;
        data[index + 1] = 255;
        data[index + 2] = 255;
        data[index + 3] = 255;
      }
    }
    expect(frameStats({ data, width: 32, height: 64 }).meanLuminance).toBeCloseTo(1, 10);
  });
});

describe("averageEmbeddings", () => {
  it("returns the renormalized elementwise mean", () => {
    const a = [3, 0];
    const b = [0, 1];
    const averaged = averageEmbeddings([a, b]);
    // Mean is [1.5, 0.5]; renormalizing gives 1.5/sqrt(2.5), 0.5/sqrt(2.5).
    const norm = Math.sqrt(1.5 * 1.5 + 0.5 * 0.5);
    expect(averaged[0]).toBeCloseTo(1.5 / norm, 10);
    expect(averaged[1]).toBeCloseTo(0.5 / norm, 10);
    expect(Math.sqrt(averaged[0] ** 2 + averaged[1] ** 2)).toBeCloseTo(1, 10);
  });

  it("is identity up to normalization for repeated identical vectors", () => {
    const averaged = averageEmbeddings([
      [0, 2],
      [0, 2],
      [0, 2],
    ]);
    expect(averaged[0]).toBeCloseTo(0, 10);
    expect(averaged[1]).toBeCloseTo(1, 10);
  });

  it("throws on an empty list", () => {
    expect(() => averageEmbeddings([])).toThrow();
  });
});

describe("cosineSimilarity", () => {
  it("scores identical vectors as 1 and opposite vectors as -1", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
    expect(cosineSimilarity([1, 2], [-1, -2])).toBeCloseTo(-1, 10);
  });

  it("scores orthogonal vectors as 0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  it("guards zero-norm vectors to 0", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });

  it("throws on length mismatch", () => {
    expect(() => cosineSimilarity([1, 2], [1, 2, 3])).toThrow();
  });
});

describe("capture stability across independent runs", () => {
  const SIZE = 96;

  // Stable large bright square on mid-gray, plus a tiny dark dot whose position
  // encodes animation phase. Everything else in the scene never changes.
  function animatedFrame(phase: number): RawFrame {
    return makeFrame(SIZE, SIZE, (x, y) => {
      const inSquare = x >= 14 && x < 82 && y >= 14 && y < 82;
      const dotX = 30 + (phase % 10) * 3;
      const dotY = 44 + (phase % 2);
      const inDot = x >= dotX && x < dotX + 2 && y >= dotY && y < dotY + 2;
      if (inDot) return 10;
      return inSquare ? 235 : 120;
    });
  }

  function captureRun(startPhase: number): number[] {
    const samples: number[][] = [];
    for (let step = 0; step < 10; step += 1) {
      samples.push(normalizeToEmbedding(animatedFrame(startPhase + step)));
    }
    return averageEmbeddings(samples);
  }

  it("two independent captures of the same animated scene match well above threshold", () => {
    const first = captureRun(0);
    const second = captureRun(3);
    const similarity = cosineSimilarity(first, second);
    expect(similarity).toBeGreaterThan(FACE_MATCH_THRESHOLD);
    expect(similarity).toBeGreaterThan(0.999);
  });
});
