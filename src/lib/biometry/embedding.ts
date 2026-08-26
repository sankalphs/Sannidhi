import { EMBEDDING_DIMS, EMBEDDING_GRID } from "./constants";

export type RawFrame = { data: Uint8ClampedArray | number[]; width: number; height: number };

function grayscaleGrid(frame: RawFrame): number[] {
  if (Math.min(frame.width, frame.height) < 8) throw new Error("frame_too_small");

  const side = Math.min(frame.width, frame.height);
  const offsetX = Math.floor((frame.width - side) / 2);
  const offsetY = Math.floor((frame.height - side) / 2);

  const grid = new Array<number>(EMBEDDING_DIMS).fill(0);
  const cellSize = side / EMBEDDING_GRID;
  for (let gy = 0; gy < EMBEDDING_GRID; gy += 1) {
    const yStart = offsetY + Math.floor(gy * cellSize);
    const yEnd = offsetY + Math.floor((gy + 1) * cellSize);
    for (let gx = 0; gx < EMBEDDING_GRID; gx += 1) {
      const xStart = offsetX + Math.floor(gx * cellSize);
      const xEnd = offsetX + Math.floor((gx + 1) * cellSize);
      let sum = 0;
      let count = 0;
      for (let y = yStart; y < yEnd; y += 1) {
        for (let x = xStart; x < xEnd; x += 1) {
          const index = (y * frame.width + x) * 4;
          sum +=
            (0.299 * frame.data[index] +
              0.587 * frame.data[index + 1] +
              0.114 * frame.data[index + 2]) /
            255;
          count += 1;
        }
      }
      grid[gy * EMBEDDING_GRID + gx] = count > 0 ? sum / count : 0;
    }
  }
  return grid;
}

export function l2Normalize(vector: number[]): number[] {
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (norm === 0) return [...vector];
  return vector.map((value) => value / norm);
}

export function normalizeToEmbedding(frame: RawFrame): number[] {
  return l2Normalize(grayscaleGrid(frame));
}

// Absolute luminance survives only here — normalizeToEmbedding erases magnitude.
export function frameStats(frame: RawFrame): { meanLuminance: number } {
  const grid = grayscaleGrid(frame);
  let sum = 0;
  for (const value of grid) sum += value;
  return { meanLuminance: sum / grid.length };
}

export function averageEmbeddings(vectors: number[][]): number[] {
  if (vectors.length === 0) throw new Error("no_embeddings_to_average");
  const dims = vectors[0].length;
  const mean = new Array<number>(dims).fill(0);
  for (const vector of vectors) {
    for (let i = 0; i < dims; i += 1) mean[i] += vector[i] / vectors.length;
  }
  return l2Normalize(mean);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error("embedding_length_mismatch");
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
