import { describe, expect, it } from "vitest";

import { normalizeVenueInput, rangesOverlap } from "../convex/schedule";

describe("normalizeVenueInput", () => {
  it("trims the name and keeps optional fields absent", () => {
    expect(normalizeVenueInput({ name: "  Lecture Hall 1 " })).toEqual({ name: "Lecture Hall 1" });
  });

  it("requires coordinates as a pair and defaults the geofence to 100 m", () => {
    expect(() => normalizeVenueInput({ name: "Lab", latitude: 12.9 })).toThrow(/both latitude/);
    expect(normalizeVenueInput({ name: "Lab", latitude: 12.9, longitude: 77.5 })).toMatchObject({
      geofenceRadiusMeters: 100,
    });
  });

  it("rejects out-of-range values and a radius without coordinates", () => {
    expect(() => normalizeVenueInput({ name: "Lab", latitude: 91, longitude: 0 })).toThrow();
    expect(() => normalizeVenueInput({ name: "Lab", latitude: 0, longitude: 181 })).toThrow();
    expect(() =>
      normalizeVenueInput({ name: "Lab", latitude: 0, longitude: 0, geofenceRadiusMeters: 5 }),
    ).toThrow();
    expect(() => normalizeVenueInput({ name: "Lab", geofenceRadiusMeters: 50 })).toThrow(
      /needs venue coordinates/,
    );
    expect(() => normalizeVenueInput({ name: "Lab", capacity: 0 })).toThrow();
    expect(() => normalizeVenueInput({ name: "Lab", capacity: Number.NaN })).toThrow();
    expect(() => normalizeVenueInput({ name: "L" })).toThrow();
  });
});

describe("rangesOverlap", () => {
  const nine = { startMinutes: 540, endMinutes: 600 };

  it("treats ranges as half-open so back-to-back classes do not clash", () => {
    expect(rangesOverlap(nine, { startMinutes: 600, endMinutes: 660 })).toBe(false);
    expect(rangesOverlap(nine, { startMinutes: 480, endMinutes: 540 })).toBe(false);
  });

  it("detects partial and full overlap", () => {
    expect(rangesOverlap(nine, { startMinutes: 570, endMinutes: 630 })).toBe(true);
    expect(rangesOverlap(nine, { startMinutes: 500, endMinutes: 700 })).toBe(true);
  });
});
