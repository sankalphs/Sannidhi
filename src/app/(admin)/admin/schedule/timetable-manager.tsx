"use client";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { CalendarClock, Loader2, Trash2, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { describeConvexError } from "@/lib/client/describe-error";

import { DAY_NAMES, formatTimeOfDay, parseTimeOfDay, selectClasses } from "./form-controls";

type SlotRow = {
  id: Id<"timetable_slots">;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  sectionLabel: string;
  venueName: string;
  facultyName: string | null;
};

/** Weekly timetable: each slot is a section meeting in a venue, optionally pinned to a faculty member. */
export function TimetableManager({
  actorToken,
  slots,
  sections,
  venues,
  faculty,
}: {
  actorToken: string;
  slots: SlotRow[];
  sections: Array<{ id: Id<"sections">; label: string }>;
  venues: Array<{ id: Id<"venues">; name: string }>;
  faculty: Array<{ id: Id<"users">; name: string; email: string }>;
}) {
  const router = useRouter();
  const createSlot = useMutation(api.schedule.createSlot);
  const deleteSlot = useMutation(api.schedule.deleteSlot);

  const [sectionId, setSectionId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [facultyId, setFacultyId] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState("1");
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("10:00");
  const [pending, setPending] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<Id<"timetable_slots"> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const missing: string[] = [];
  if (sections.length === 0) missing.push("sections (import a roster under Courses & sections)");
  if (venues.length === 0) missing.push("venues (add one above)");

  async function run(key: string, action: () => Promise<unknown>): Promise<boolean> {
    if (pending !== null) return false;
    setPending(key);
    setError(null);
    try {
      await action();
      router.refresh();
      return true;
    } catch (cause) {
      setError(describeConvexError(cause, [], "Could not update the timetable. Please try again."));
      return false;
    } finally {
      setPending(null);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const startMinutes = parseTimeOfDay(start);
    const endMinutes = parseTimeOfDay(end);
    if (sectionId === "" || venueId === "") {
      setError("Choose a section and a venue.");
      return;
    }
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
      setError("End time must be after start time.");
      return;
    }
    await run("create", () =>
      createSlot({
        actorToken,
        sectionId: sectionId as Id<"sections">,
        venueId: venueId as Id<"venues">,
        dayOfWeek: Number(dayOfWeek),
        startMinutes,
        endMinutes,
        ...(facultyId !== "" ? { facultyId: facultyId as Id<"users"> } : {}),
      }),
    );
  }

  const byDay = DAY_NAMES.map((name, day) => ({
    name,
    slots: slots.filter((slot) => slot.dayOfWeek === day),
  })).filter((group) => group.slots.length > 0);

  return (
    <section
      className="flex flex-col gap-4 rounded-xl border p-4 sm:p-5"
      aria-labelledby="timetable-heading"
    >
      <div>
        <h2 id="timetable-heading" className="text-lg font-semibold">
          Weekly timetable ({slots.length})
        </h2>
        <p className="text-muted-foreground text-sm">
          Faculty see today&apos;s slots on their dashboard and start a session in one tap. Leave
          faculty unassigned to let whoever starts the class claim it.
        </p>
      </div>

      {missing.length > 0 ? (
        <p className="text-muted-foreground bg-muted/40 rounded-lg px-3 py-2 text-sm">
          Before scheduling, add {missing.join(" and ")}.
        </p>
      ) : (
        <form
          onSubmit={onSubmit}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6"
          data-testid="slot-form"
        >
          <label className="flex flex-col gap-1 lg:col-span-2">
            <span className="text-sm font-medium">Section</span>
            <select
              className={selectClasses}
              value={sectionId}
              onChange={(event) => setSectionId(event.target.value)}
              required
            >
              <option value="">Choose a section…</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Venue</span>
            <select
              className={selectClasses}
              value={venueId}
              onChange={(event) => setVenueId(event.target.value)}
              required
            >
              <option value="">Choose…</option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Day</span>
            <select
              className={selectClasses}
              value={dayOfWeek}
              onChange={(event) => setDayOfWeek(event.target.value)}
            >
              {DAY_NAMES.map((name, day) => (
                <option key={name} value={day}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Starts</span>
            <Input
              type="time"
              required
              value={start}
              onChange={(event) => setStart(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium">Ends</span>
            <Input
              type="time"
              required
              value={end}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 lg:col-span-2">
            <span className="text-sm font-medium">Faculty</span>
            <select
              className={selectClasses}
              value={facultyId}
              onChange={(event) => setFacultyId(event.target.value)}
            >
              <option value="">Unassigned</option>
              {faculty.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end lg:col-span-4">
            <Button type="submit" size="sm" disabled={pending !== null}>
              {pending === "create" ? <Loader2 className="animate-spin" /> : null}
              Add to timetable
            </Button>
          </div>
        </form>
      )}

      {error !== null ? (
        <p role="alert" className="text-destructive flex items-center gap-2 text-sm">
          <TriangleAlert className="size-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {slots.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nothing scheduled yet"
          description="Add a weekly slot above. Faculty can still start ad-hoc guest sessions meanwhile."
        />
      ) : (
        <div className="flex flex-col gap-4">
          {byDay.map((group) => (
            <div key={group.name} className="flex flex-col gap-2">
              <h3 className="text-muted-foreground font-mono text-xs font-medium tracking-[0.12em] uppercase">
                {group.name}
              </h3>
              <ul className="divide-y rounded-lg border">
                {group.slots.map((slot) => (
                  <li
                    key={slot.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm"
                  >
                    <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="font-mono text-xs tabular-nums">
                        {formatTimeOfDay(slot.startMinutes)}–{formatTimeOfDay(slot.endMinutes)}
                      </span>
                      <span className="font-medium">{slot.sectionLabel}</span>
                      <span className="text-muted-foreground">{slot.venueName}</span>
                      <span className="text-muted-foreground">
                        {slot.facultyName ?? "Unassigned"}
                      </span>
                    </div>
                    {confirmDeleteId === slot.id ? (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={pending !== null}
                        onClick={() =>
                          void run(`delete:${slot.id}`, () =>
                            deleteSlot({ actorToken, slotId: slot.id }),
                          ).then(() => setConfirmDeleteId(null))
                        }
                      >
                        {pending === `delete:${slot.id}` ? (
                          <Loader2 className="animate-spin" />
                        ) : null}
                        Confirm remove
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Remove ${slot.sectionLabel} on ${group.name} at ${formatTimeOfDay(slot.startMinutes)}`}
                        disabled={pending !== null}
                        onClick={() => setConfirmDeleteId(slot.id)}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
