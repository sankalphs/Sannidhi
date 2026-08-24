import { describe, expect, it } from "vitest";

import {
  LOCATION_DEFAULT_RADIUS_METERS,
  PRESENCE_EVIDENCE_VERSION,
  evaluateLocationConsistency,
  haversineMeters,
  type GeoFix,
  type LocationOutcome,
} from "@/lib/risk";

const VENUE = { latitude: 12.9352, longitude: 77.5336 };

function fixNorthOfVenue(degrees: number): GeoFix {
  return { latitude: VENUE.latitude + degrees, longitude: VENUE.longitude };
}

function evaluate(
  fix: GeoFix | null,
  venue: Parameters<typeof evaluateLocationConsistency>[0]["venue"],
) {
  return evaluateLocationConsistency({ fix, consent: "granted", availability: "ok", venue });
}

describe("haversineMeters", () => {
  it("returns roughly 22 m for a 0.0002-degree latitude gap", () => {
    const a = { latitude: 12.9352, longitude: 77.5336 };
    const b = { latitude: 12.9354, longitude: 77.5336 };
    const meters = haversineMeters(a, b);
    expect(meters).toBeGreaterThan(15);
    expect(meters).toBeLessThan(35);
  });

  it("returns zero for the same point", () => {
    const a = { latitude: 12.9352, longitude: 77.5336 };
    expect(haversineMeters(a, a)).toBe(0);
  });

  it("is symmetric", () => {
    const a = { latitude: 12.9352, longitude: 77.5336 };
    const b = { latitude: 12.94, longitude: 77.61 };
    expect(haversineMeters(a, b)).toBeCloseTo(haversineMeters(b, a), 9);
  });
});

describe("evaluateLocationConsistency gating", () => {
  it("reports not_consented on denied consent even with fix and venue", () => {
    const outcome = evaluateLocationConsistency({
      fix: fixNorthOfVenue(0),
      consent: "denied",
      availability: "ok",
      venue: VENUE,
    });
    expect(outcome).toEqual({ verdict: "not_consented" });
  });

  it("evaluates not_requested consent normally", () => {
    const outcome = evaluateLocationConsistency({
      fix: fixNorthOfVenue(0.0001),
      consent: "not_requested",
      availability: "ok",
      venue: VENUE,
    });
    expect(outcome.verdict).toBe("consistent");
  });

  it("reports unavailable when availability is unavailable or fix is null", () => {
    const unavailable = evaluateLocationConsistency({
      fix: fixNorthOfVenue(0),
      consent: "granted",
      availability: "unavailable",
      venue: VENUE,
    });
    const nullFix = evaluateLocationConsistency({
      fix: null,
      consent: "granted",
      availability: "ok",
      venue: VENUE,
    });
    expect(unavailable).toEqual({ verdict: "unavailable" });
    expect(nullFix).toEqual({ verdict: "unavailable" });
  });

  it("reports no_reference when venue coordinates are absent or null", () => {
    const fix = fixNorthOfVenue(0.01);
    expect(evaluate(fix, null)).toEqual({ verdict: "no_reference" });
    expect(evaluate(fix, {})).toEqual({ verdict: "no_reference" });
    expect(evaluate(fix, { latitude: 12.93, longitude: null })).toEqual({
      verdict: "no_reference",
    });
    expect(evaluate(fix, { latitude: null, longitude: 77.53 })).toEqual({
      verdict: "no_reference",
    });
  });

  it("checks gates in order: consent before availability before reference", () => {
    const outcome = evaluateLocationConsistency({
      fix: null,
      consent: "denied",
      availability: "unavailable",
      venue: null,
    });
    expect(outcome).toEqual({ verdict: "not_consented" });
  });
});

describe("radius and margin semantics", () => {
  it("uses the default radius when geofenceRadiusMeters is undefined", () => {
    const near = evaluate(fixNorthOfVenue(0.002), VENUE);
    const midBand = evaluate(fixNorthOfVenue(0.003), VENUE);

    const nearDistance = haversineMeters(fixNorthOfVenue(0.002), VENUE);
    expect(nearDistance).toBeLessThan(LOCATION_DEFAULT_RADIUS_METERS);
    expect(near).toEqual({ verdict: "consistent", distanceMeters: nearDistance });

    const midDistance = haversineMeters(fixNorthOfVenue(0.003), VENUE);
    expect(midDistance).toBeGreaterThan(LOCATION_DEFAULT_RADIUS_METERS);
    expect(midDistance).toBeLessThanOrEqual(LOCATION_DEFAULT_RADIUS_METERS + 150);
    expect(midBand.verdict).toBe("inconclusive");
    expect(midBand).toEqual({ verdict: "inconclusive", distanceMeters: midDistance });

    const beyond = evaluate(fixNorthOfVenue(0.006), VENUE);
    const beyondDistance = haversineMeters(fixNorthOfVenue(0.006), VENUE);
    expect(beyondDistance).toBeGreaterThan(LOCATION_DEFAULT_RADIUS_METERS + 150);
    expect(beyond.verdict).toBe("mismatch");
    expect(beyond).toEqual({ verdict: "mismatch", distanceMeters: beyondDistance });
  });

  it("honors an explicit geofence radius", () => {
    const venue = { ...VENUE, geofenceRadiusMeters: 100 };
    const dLat = 0.001;
    const fix = fixNorthOfVenue(dLat);
    const distance = haversineMeters(fix, venue);
    expect(distance).toBeGreaterThan(100);
    expect(distance).toBeLessThanOrEqual(250);
    expect(evaluate(fix, venue).verdict).toBe("inconclusive");
  });

  it("accuracy margin pulls a mismatch into consistent at tight boundaries", () => {
    const venue = { ...VENUE, geofenceRadiusMeters: 100 };
    const fix = fixNorthOfVenue(0.004);
    const d = haversineMeters(fix, VENUE);
    expect(d).toBeGreaterThan(400);

    const insideByMargin = evaluate({ ...fix, accuracyMeters: Math.round(d) - 20 }, venue);
    expect(insideByMargin).toEqual({
      verdict: "consistent",
      distanceMeters: d,
    });
  });

  it("accuracy margin lands in the inconclusive band between radius and margin", () => {
    const venue = { ...VENUE, geofenceRadiusMeters: 100 };
    const fix = fixNorthOfVenue(0.004);
    const d = haversineMeters(fix, VENUE);

    const inconclusive = evaluate({ ...fix, accuracyMeters: Math.round(d) - 200 }, venue);
    expect(inconclusive.verdict).toBe("inconclusive");
    expect(inconclusive).toMatchObject({ distanceMeters: d });
  });

  it("still reports mismatch once distance exceeds radius plus accuracy margin", () => {
    const venue = { ...VENUE, geofenceRadiusMeters: 100 };
    const fix = fixNorthOfVenue(0.004);
    const d = haversineMeters(fix, VENUE);

    const mismatch = evaluate({ ...fix, accuracyMeters: Math.round(d) - 300 }, venue);
    expect(Math.round(d) - 300).toBeGreaterThan(100);
    expect(mismatch.verdict).toBe("mismatch");
    expect((mismatch as Extract<LocationOutcome, { verdict: "mismatch" }>).distanceMeters).toBe(d);
  });

  it("clamps negative accuracy to a zero margin", () => {
    const venue = { ...VENUE, geofenceRadiusMeters: 100 };
    const fix = fixNorthOfVenue(0.002);
    const d = haversineMeters(fix, VENUE);
    expect(d).toBeGreaterThan(150);

    const clamped = evaluate({ ...fix, accuracyMeters: -50 }, venue);
    expect(clamped.verdict).not.toBe("consistent");
  });

  it("exposes the presence evidence version constant", () => {
    expect(PRESENCE_EVIDENCE_VERSION).toBe("presence-evidence/v1");
  });
});
