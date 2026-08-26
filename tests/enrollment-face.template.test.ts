import { describe, expect, it } from "vitest";

import { EMBEDDING_DIMS } from "@/lib/biometry/constants";
import { createFaceTemplateRef, validateFaceEmbedding } from "@/lib/enrollment/face-template";

function validEmbedding(): number[] {
  return Array.from({ length: EMBEDDING_DIMS }, (_, i) => (i % 7) / 7);
}

describe("validateFaceEmbedding", () => {
  it("accepts a finite vector of exactly EMBEDDING_DIMS components", () => {
    expect(EMBEDDING_DIMS).toBe(576);
    expect(validateFaceEmbedding(validEmbedding())).toBeNull();
    expect(validateFaceEmbedding(validEmbedding().map((v) => -v))).toBeNull();
  });

  it("rejects vectors whose length differs from EMBEDDING_DIMS", () => {
    expect(validateFaceEmbedding([])).toBe("invalid_embedding");
    expect(validateFaceEmbedding(validEmbedding().slice(0, -1))).toBe("invalid_embedding");
    expect(validateFaceEmbedding([...validEmbedding(), 0.5])).toBe("invalid_embedding");
  });

  it("rejects non-finite component values", () => {
    const withNaN = validEmbedding();
    withNaN[10] = Number.NaN;
    expect(validateFaceEmbedding(withNaN)).toBe("invalid_embedding");

    const withInfinity = validEmbedding();
    withInfinity[20] = Number.POSITIVE_INFINITY;
    expect(validateFaceEmbedding(withInfinity)).toBe("invalid_embedding");

    const withNegativeInfinity = validEmbedding();
    withNegativeInfinity[30] = Number.NEGATIVE_INFINITY;
    expect(validateFaceEmbedding(withNegativeInfinity)).toBe("invalid_embedding");
  });

  it("rejects non-array input", () => {
    expect(validateFaceEmbedding(undefined)).toBe("invalid_embedding");
    expect(validateFaceEmbedding(null)).toBe("invalid_embedding");
    expect(validateFaceEmbedding("576 numbers")).toBe("invalid_embedding");
    expect(validateFaceEmbedding({ length: EMBEDDING_DIMS })).toBe("invalid_embedding");
  });
});

describe("createFaceTemplateRef", () => {
  it("mints opaque refs shaped like face-template/ref-<32 lowercase hex>", () => {
    expect(createFaceTemplateRef()).toMatch(/^face-template\/ref-[0-9a-f]{32}$/);
  });

  it("mints a fresh ref on every call", () => {
    const seen = new Set(Array.from({ length: 8 }, () => createFaceTemplateRef()));
    expect(seen.size).toBe(8);
  });
});
