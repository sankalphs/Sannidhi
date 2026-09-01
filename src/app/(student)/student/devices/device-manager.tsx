"use client";

import { Loader2, ShieldCheck } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { postJson } from "@/lib/client/post-json";

import {
  DEVICE_STATE_BADGE_VARIANT,
  DEVICE_STATE_LABEL,
  formatDate,
  type DeviceListItem,
  type ReplacementRequestItem,
} from "./device-state";

type Phase = "idle" | "registering" | "awaiting-code";

export function DeviceManager({
  initialDevices,
  initialRequests,
}: {
  initialDevices: DeviceListItem[];
  initialRequests: ReplacementRequestItem[];
}) {
  const router = useRouter();
  const [devices, setDevices] = useState(initialDevices);
  const [requests, setRequests] = useState(initialRequests);
  useEffect(() => {
    setDevices(initialDevices);
    setRequests(initialRequests);
  }, [initialDevices, initialRequests]);
  const [label, setLabel] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [pendingCode, setPendingCode] = useState<{ deviceId: string; code: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busyDeviceId, setBusyDeviceId] = useState<string | null>(null);
  const [replacementFor, setReplacementFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [stepUpDone, setStepUpDone] = useState(false);

  async function register() {
    setError(null);
    setPhase("registering");
    try {
      const result = await postJson("/api/devices/register", { label });
      const deviceId = typeof result.deviceId === "string" ? result.deviceId : "";
      const possessionCode = typeof result.code === "string" ? result.code : "";
      setPendingCode({ deviceId, code: possessionCode });
      setLabel("");
      setPhase("awaiting-code");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Registration failed");
      setPhase("idle");
    }
  }

  async function verify(deviceId: string) {
    if (busyDeviceId !== null) return;
    setError(null);
    setBusyDeviceId(deviceId);
    try {
      await postJson("/api/devices", { action: "verify", deviceId, code });
      setPendingCode(null);
      setCode("");
      setPhase("idle");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Verification failed");
    } finally {
      setBusyDeviceId(null);
    }
  }

  async function activate(deviceId: string) {
    setError(null);
    setBusyDeviceId(deviceId);
    try {
      await postJson("/api/devices", { action: "activate", deviceId });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Activation failed");
    } finally {
      setBusyDeviceId(null);
    }
  }

  async function activateSuccessor(deviceId: string) {
    setError(null);
    setBusyDeviceId(deviceId);
    try {
      await runStepUp();
      await postJson("/api/devices", { action: "verify-successor", deviceId });
      await postJson("/api/devices", { action: "activate", deviceId });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Replacement verification failed");
    } finally {
      setBusyDeviceId(null);
    }
  }

  async function runStepUp(): Promise<boolean> {
    const options = await fetch("/api/auth/webauthn/step-up/options", { method: "POST" });
    if (!options.ok) throw new Error("Step-up could not start");
    const assertion = await startAuthentication({ optionsJSON: await options.json() });
    const verification = await fetch("/api/auth/webauthn/step-up/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ response: assertion }),
    });
    if (!verification.ok) throw new Error("Identity re-verification failed");
    return true;
  }

  async function requestReplacement(deviceId: string) {
    setError(null);
    setBusyDeviceId(deviceId);
    try {
      if (!stepUpDone) {
        await runStepUp();
        setStepUpDone(true);
      }
      await postJson("/api/devices/replacement", { deviceId, reason });
      setReplacementFor(null);
      setReason("");
      setStepUpDone(false);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Replacement request failed");
    } finally {
      setBusyDeviceId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Your devices ({devices.length})</h2>
        {error ? <p className="text-destructive text-sm">{error}</p> : null}
        {devices.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No attendance device yet. Register the personal device you will use for check-in.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-left text-xs tracking-wide uppercase">
                <tr>
                  <th className="px-4 py-2 font-medium">Label</th>
                  <th className="px-4 py-2 font-medium">State</th>
                  <th className="px-4 py-2 font-medium">Registered</th>
                  <th className="px-4 py-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {devices.map((device) => (
                  <tr key={device._id}>
                    <td className="px-4 py-2 font-medium">
                      {device.label}
                      {device.stateReason ? (
                        <span className="text-muted-foreground block text-xs">
                          {device.stateReason}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={DEVICE_STATE_BADGE_VARIANT[device.state]}>
                        {DEVICE_STATE_LABEL[device.state]}
                      </Badge>
                    </td>
                    <td className="text-muted-foreground px-4 py-2 text-xs">
                      {formatDate(device.registeredAt)}
                    </td>
                    <td className="flex justify-end gap-2 px-4 py-2">
                      {device.state === "new" && device.replacesDeviceId !== null ? (
                        <Button
                          size="xs"
                          disabled={busyDeviceId === device._id}
                          onClick={() => void activateSuccessor(device._id)}
                        >
                          {busyDeviceId === device._id ? (
                            <Loader2 className="animate-spin" />
                          ) : null}
                          Verify &amp; activate
                        </Button>
                      ) : null}
                      {device.state === "new" && device.replacesDeviceId === null ? (
                        <Button
                          size="xs"
                          disabled={busyDeviceId === device._id}
                          onClick={() => {
                            setPendingCode({ deviceId: device._id, code: "" });
                            setPhase("awaiting-code");
                          }}
                        >
                          Enter code
                        </Button>
                      ) : null}
                      {device.state === "enrolled" ? (
                        <Button
                          size="xs"
                          disabled={busyDeviceId === device._id}
                          onClick={() => void activate(device._id)}
                        >
                          {busyDeviceId === device._id ? (
                            <Loader2 className="animate-spin" />
                          ) : null}
                          Activate
                        </Button>
                      ) : null}
                      {device.state === "active" ? (
                        <Button
                          variant="outline"
                          size="xs"
                          onClick={() => {
                            setReplacementFor(device._id);
                            setStepUpDone(false);
                            setError(null);
                          }}
                        >
                          Replace…
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {replacementFor !== null ? (
        <section className="flex flex-col gap-3 rounded-xl border p-4">
          <h3 className="font-semibold">Request device replacement</h3>
          <p className="text-muted-foreground text-sm">
            A lost or replaced device never silently becomes trusted. Verify your identity with your
            passkey, then describe why this device must be replaced. An administrator approves the
            replacement before the new device can be activated.
          </p>
          {!stepUpDone ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busyDeviceId !== null}
              onClick={async () => {
                setBusyDeviceId(replacementFor);
                try {
                  await runStepUp();
                  setStepUpDone(true);
                  setError(null);
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : "Step-up failed");
                } finally {
                  setBusyDeviceId(null);
                }
              }}
            >
              <ShieldCheck /> Verify identity with passkey
            </Button>
          ) : (
            <p className="flex items-center gap-2 text-sm">
              <Badge>identity re-verified</Badge>
              <span className="text-muted-foreground">Passkey assertion accepted.</span>
            </p>
          )}
          <textarea
            className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring min-h-20 rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
            placeholder="Why does this device need replacement?"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={!stepUpDone || reason.trim().length === 0 || busyDeviceId !== null}
              onClick={() => requestReplacement(replacementFor)}
            >
              {busyDeviceId === replacementFor ? <Loader2 className="animate-spin" /> : null}
              Submit request
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setReplacementFor(null)}>
              Cancel
            </Button>
          </div>
        </section>
      ) : null}

      {phase === "awaiting-code" && pendingCode !== null ? (
        <section className="flex flex-col gap-3 rounded-xl border p-4">
          <h3 className="font-semibold">Verify device possession</h3>
          {pendingCode.code !== "" ? (
            <p className="text-sm">
              Your one-time verification code is{" "}
              <span className="font-mono text-lg font-semibold">{pendingCode.code}</span>. It is
              valid for ten minutes and shown only once.
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              Enter the six-digit code issued when you registered this device.
            </p>
          )}
          <div className="flex items-center gap-2">
            <Input
              className="w-36 font-mono"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              placeholder="000000"
            />
            <Button
              size="sm"
              disabled={code.length !== 6 || busyDeviceId !== null}
              onClick={() => verify(pendingCode.deviceId)}
            >
              Verify
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPendingCode(null);
                setPhase("idle");
              }}
            >
              Later
            </Button>
          </div>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Register a device</h2>
        <div className="flex max-w-md items-center gap-2">
          <Input
            placeholder='Device label, e.g. "Pixel 9"'
            value={label}
            onChange={(event) => setLabel(event.target.value)}
          />
          <Button disabled={label.trim().length === 0 || phase !== "idle"} onClick={register}>
            Register
          </Button>
        </div>
        {pendingCode !== null ? (
          <p className="text-muted-foreground text-xs">
            Finish verifying your current pending device first.
          </p>
        ) : null}
      </section>

      {requests.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Replacement requests ({requests.length})</h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-left text-xs tracking-wide uppercase">
                <tr>
                  <th className="px-4 py-2 font-medium">Requested</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {requests.map((request) => (
                  <tr key={request._id}>
                    <td className="text-muted-foreground px-4 py-2 text-xs">
                      {formatDate(request.requestedAt)}
                    </td>
                    <td className="px-4 py-2">
                      <Badge
                        variant={
                          request.status === "approved"
                            ? "default"
                            : request.status === "rejected"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {request.status}
                      </Badge>
                    </td>
                    <td className="text-muted-foreground max-w-md truncate px-4 py-2">
                      {request.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
