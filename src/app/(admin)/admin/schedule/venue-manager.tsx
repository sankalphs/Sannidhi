"use client";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { Loader2, LocateFixed, MapPin, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describeConvexError } from "@/lib/client/describe-error";

type VenueRow = {
  id: Id<"venues">;
  name: string;
  capacity: number | null;
  latitude: number | null;
  longitude: number | null;
  geofenceRadiusMeters: number | null;
  slotCount: number;
};

type Draft = {
  name: string;
  capacity: string;
  latitude: string;
  longitude: string;
  radius: string;
};

const EMPTY_DRAFT: Draft = { name: "", capacity: "", latitude: "", longitude: "", radius: "100" };

function toDraft(venue: VenueRow): Draft {
  return {
    name: venue.name,
    capacity: venue.capacity?.toString() ?? "",
    latitude: venue.latitude?.toString() ?? "",
    longitude: venue.longitude?.toString() ?? "",
    radius: venue.geofenceRadiusMeters?.toString() ?? "100",
  };
}

function optionalNumber(value: string): number | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

/** Coordinates and radius on one line, or null when the venue has no geofence. */
function geofenceLabel(venue: VenueRow): string | null {
  return venue.latitude !== null && venue.longitude !== null
    ? `${venue.latitude.toFixed(4)}, ${venue.longitude.toFixed(4)} · ${venue.geofenceRadiusMeters ?? 100}\u00a0m`
    : null;
}

/** Builds mutation args from the form; coordinates and radius travel together. */
function draftToInput(draft: Draft) {
  const latitude = optionalNumber(draft.latitude);
  const longitude = optionalNumber(draft.longitude);
  const hasCoordinates = latitude !== undefined || longitude !== undefined;
  return {
    name: draft.name,
    capacity: optionalNumber(draft.capacity),
    latitude,
    longitude,
    geofenceRadiusMeters: hasCoordinates ? optionalNumber(draft.radius) : undefined,
  };
}

/** Create, edit, and delete the institution's venues, including their check-in geofence. */
export function VenueManager({ actorToken, venues }: { actorToken: string; venues: VenueRow[] }) {
  const router = useRouter();
  const createVenue = useMutation(api.schedule.createVenue);
  const updateVenue = useMutation(api.schedule.updateVenue);
  const deleteVenue = useMutation(api.schedule.deleteVenue);

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<Id<"venues"> | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<Id<"venues"> | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof Draft) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setDraft((current) => ({ ...current, [field]: event.target.value }));

  async function run(key: string, action: () => Promise<unknown>): Promise<boolean> {
    if (pending !== null) return false;
    setPending(key);
    setError(null);
    try {
      await action();
      router.refresh();
      return true;
    } catch (cause) {
      setError(describeConvexError(cause, [], "Could not save the venue. Please try again."));
      return false;
    } finally {
      setPending(null);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = draftToInput(draft);
    const ok = await run("save", () =>
      editingId === null
        ? createVenue({ actorToken, ...input })
        : updateVenue({ actorToken, venueId: editingId, ...input }),
    );
    if (ok) {
      setDraft(EMPTY_DRAFT);
      setEditingId(null);
    }
  }

  function fillCurrentLocation() {
    if (!("geolocation" in navigator)) {
      setError("This browser cannot share its location. Enter coordinates manually.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDraft((current) => ({
          ...current,
          latitude: position.coords.latitude.toFixed(6),
          longitude: position.coords.longitude.toFixed(6),
        }));
        setLocating(false);
      },
      () => {
        setError("Location permission was denied. Enter coordinates manually.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15_000 },
    );
  }

  return (
    <section
      className="flex flex-col gap-4 rounded-xl border p-4 sm:p-5"
      aria-labelledby="venues-heading"
    >
      <div>
        <h2 id="venues-heading" className="text-lg font-semibold">
          Venues ({venues.length})
        </h2>
        <p className="text-muted-foreground text-sm">
          Add each room where attendance is taken. With coordinates, check-ins outside the geofence
          are escalated by the risk engine.
        </p>
      </div>

      <form
        onSubmit={onSubmit}
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
        data-testid="venue-form"
      >
        <label className="flex flex-col gap-1 lg:col-span-2">
          <span className="text-sm font-medium">Name</span>
          <Input required value={draft.name} onChange={set("name")} placeholder="Lecture Hall 1" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Capacity</span>
          <Input
            inputMode="numeric"
            value={draft.capacity}
            onChange={set("capacity")}
            placeholder="Optional"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Latitude</span>
          <Input
            inputMode="decimal"
            value={draft.latitude}
            onChange={set("latitude")}
            placeholder="Optional"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Longitude</span>
          <Input
            inputMode="decimal"
            value={draft.longitude}
            onChange={set("longitude")}
            placeholder="Optional"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">Geofence (m)</span>
          <Input inputMode="numeric" value={draft.radius} onChange={set("radius")} />
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-6">
          <Button type="submit" size="sm" disabled={pending !== null}>
            {pending === "save" ? <Loader2 className="animate-spin" /> : null}
            {editingId === null ? "Add venue" : "Save changes"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={fillCurrentLocation}
            disabled={locating}
          >
            {locating ? <Loader2 className="animate-spin" /> : <LocateFixed />}
            Use my current location
          </Button>
          {editingId !== null ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setEditingId(null);
                setDraft(EMPTY_DRAFT);
                setError(null);
              }}
            >
              Cancel editing
            </Button>
          ) : null}
        </div>
      </form>

      {error !== null ? (
        <p role="alert" className="text-destructive flex items-center gap-2 text-sm">
          <TriangleAlert className="size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {venues.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No venues yet"
          description="Add your first classroom above, then schedule classes in it below."
        />
      ) : (
        <div className="relative overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-left text-xs tracking-wide uppercase">
              <tr>
                <th className="px-4 py-2 font-medium">Venue</th>
                <th className="hidden px-4 py-2 font-medium sm:table-cell">Capacity</th>
                <th className="hidden px-4 py-2 font-medium sm:table-cell">Geofence</th>
                <th className="hidden px-4 py-2 font-medium sm:table-cell">Weekly slots</th>
                <th className="px-4 py-2 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {venues.map((venue) => (
                <tr key={venue.id}>
                  <td className="cell-wrap px-4 py-2 font-medium">
                    {venue.name}
                    <span className="text-muted-foreground block text-xs font-normal sm:hidden">
                      {venue.capacity !== null ? `${venue.capacity} seats · ` : ""}
                      {venue.slotCount} weekly {venue.slotCount === 1 ? "slot" : "slots"}
                      <span className="block font-mono">
                        {geofenceLabel(venue) ?? "No geofence"}
                      </span>
                    </span>
                  </td>
                  <td className="text-muted-foreground hidden px-4 py-2 sm:table-cell">
                    {venue.capacity ?? "—"}
                  </td>
                  <td className="text-muted-foreground hidden px-4 py-2 font-mono text-xs sm:table-cell">
                    {geofenceLabel(venue) ?? "Not set"}
                  </td>
                  <td className="hidden px-4 py-2 sm:table-cell">{venue.slotCount}</td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Edit ${venue.name}`}
                        onClick={() => {
                          setEditingId(venue.id);
                          setDraft(toDraft(venue));
                          setConfirmDeleteId(null);
                          setError(null);
                        }}
                      >
                        <Pencil />
                      </Button>
                      {confirmDeleteId === venue.id ? (
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={pending !== null}
                          onClick={() =>
                            void run(`delete:${venue.id}`, () =>
                              deleteVenue({ actorToken, venueId: venue.id }),
                            ).then(() => setConfirmDeleteId(null))
                          }
                        >
                          {pending === `delete:${venue.id}` ? (
                            <Loader2 className="animate-spin" />
                          ) : null}
                          Confirm delete
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label={`Delete ${venue.name}`}
                          onClick={() => setConfirmDeleteId(venue.id)}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
