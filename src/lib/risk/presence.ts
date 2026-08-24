export const PRESENCE_EVIDENCE_VERSION = "presence-evidence/v1";
export const LOCATION_DEFAULT_RADIUS_METERS = 250;
export const LOCATION_INCONCLUSIVE_MARGIN_METERS = 150;

const EARTH_RADIUS_METERS = 6371008.8;

export type GeoFix = {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  capturedAt?: number;
};

export type VenueGeoReference = {
  latitude?: number | null;
  longitude?: number | null;
  geofenceRadiusMeters?: number | null;
};

export type LocationConsent = "granted" | "denied" | "not_requested";

export type LocationAvailability = "ok" | "unavailable";

export type LocationOutcome =
  | { verdict: "consistent"; distanceMeters: number }
  | { verdict: "inconclusive"; distanceMeters: number }
  | { verdict: "mismatch"; distanceMeters: number }
  | { verdict: "no_reference" }
  | { verdict: "unavailable" }
  | { verdict: "not_consented" };

export function haversineMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRadians = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * toRadians;
  const dLng = (b.longitude - a.longitude) * toRadians;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const cosLat1 = Math.cos(a.latitude * toRadians);
  const cosLat2 = Math.cos(b.latitude * toRadians);
  const h = sinLat * sinLat + cosLat1 * cosLat2 * sinLng * sinLng;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function evaluateLocationConsistency(args: {
  fix: GeoFix | null;
  consent: LocationConsent;
  availability: LocationAvailability;
  venue: VenueGeoReference | null;
}): LocationOutcome {
  const { fix, consent, availability, venue } = args;

  if (consent === "denied") return { verdict: "not_consented" };
  if (availability === "unavailable" || fix === null) return { verdict: "unavailable" };
  if (venue === null || typeof venue.latitude !== "number" || typeof venue.longitude !== "number") {
    return { verdict: "no_reference" };
  }

  const radius = venue.geofenceRadiusMeters ?? LOCATION_DEFAULT_RADIUS_METERS;
  const margin = Math.max(0, fix.accuracyMeters ?? 0);
  const distanceMeters = haversineMeters(fix, {
    latitude: venue.latitude,
    longitude: venue.longitude,
  });

  if (distanceMeters - margin <= radius) return { verdict: "consistent", distanceMeters };
  if (distanceMeters - margin <= radius + LOCATION_INCONCLUSIVE_MARGIN_METERS) {
    return { verdict: "inconclusive", distanceMeters };
  }
  return { verdict: "mismatch", distanceMeters };
}
