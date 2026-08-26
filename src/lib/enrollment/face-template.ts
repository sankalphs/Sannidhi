import { EMBEDDING_DIMS } from "../biometry/constants";

export const FACE_TEMPLATE_REF_PREFIX = "face-template/ref-";

/**
 * Shared by the Convex mutation and the HTTP route; returns the error code to
 * report, or null when the vector is a usable enrollment embedding.
 */
export function validateFaceEmbedding(embedding: unknown): "invalid_embedding" | null {
  if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMS) {
    return "invalid_embedding";
  }
  if (embedding.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    return "invalid_embedding";
  }
  return null;
}

/** Opaque pointer stored in place of biometric data; never encodes the embedding itself. */
export function createFaceTemplateRef(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return (
    FACE_TEMPLATE_REF_PREFIX +
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  );
}
