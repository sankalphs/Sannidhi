export { explainDecision } from "./explain";
export {
  MANUAL_ATTESTATION_IDENTITY_SOURCE,
  MANUAL_ATTESTATION_PRESENCE_SOURCE,
  RISK_ANOMALY_FLAG_THRESHOLD,
  RISK_REASON_CODES,
  decide,
  outcomeToAttendanceState,
} from "./engine";
export type { AttendanceState } from "./engine";
export {
  LOCATION_DEFAULT_RADIUS_METERS,
  LOCATION_INCONCLUSIVE_MARGIN_METERS,
  PRESENCE_EVIDENCE_VERSION,
  evaluateLocationConsistency,
  haversineMeters,
} from "./presence";
export type {
  GeoFix,
  LocationAvailability,
  LocationConsent,
  LocationOutcome,
  VenueGeoReference,
} from "./presence";
export {
  challengePresenceSignal,
  deviceTrustSignal,
  failurePresenceSignal,
  geolocationSignal,
  identitySessionSignal,
  manualAttestationSignals,
} from "./signals";
export { RISK_POLICY_VERSION, SIGNAL_STATUSES } from "./types";
export type {
  AnomalyContext,
  DecisionExplanation,
  RiskExplanationTier,
  RiskInput,
  SignalStatus,
} from "./types";
