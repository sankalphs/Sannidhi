"use client";

import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

const DURATIONS = [30, 45, 60, 90];

const selectClasses =
  "border-input flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50";

function describeError(cause: unknown): string {
  if (typeof cause === "object" && cause !== null && "data" in cause) {
    const data = (cause as { data?: unknown }).data;
    if (typeof data === "string") {
      if (data === "session_already_active") {
        return "A session is already running for this section.";
      }
      if (data === "unauthorized") {
        return "You are not authorized to start a session.";
      }
      return data;
    }
  }
  return "Something went wrong. Please try again.";
}

export function GuestSessionDialog({ actorToken }: { actorToken: string }) {
  const router = useRouter();
  const startGuest = useMutation(api.classSessions.startGuest);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const optionsResult = useQuery(
    api.classSessions.listSessionOptions,
    open ? { actorToken } : "skip",
  );
  const [courseId, setCourseId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [venueId, setVenueId] = useState("");
  const [windowMinutes, setWindowMinutes] = useState("45");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const courses = optionsResult?.courses ?? [];
  const venues = optionsResult?.venues ?? [];
  const sections = useMemo(() => {
    if (optionsResult === undefined || courseId === "") return [];
    return optionsResult.sections.filter((s) => s.courseId === courseId);
  }, [optionsResult, courseId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (open) return;
    setCourseId("");
    setSectionId("");
    setVenueId("");
    setWindowMinutes("45");
    setError(null);
    setCreating(false);
  }, [open]);

  useEffect(() => {
    if (!open || optionsResult === undefined) return;
    if (courseId === "" && optionsResult.courses.length > 0) {
      setCourseId(optionsResult.courses[0].id);
    }
    if (venueId === "" && optionsResult.venues.length > 0) {
      setVenueId(optionsResult.venues[0].id);
    }
  }, [open, optionsResult, courseId, venueId]);

  useEffect(() => {
    const firstValid = sections.some((section) => section.id === sectionId)
      ? sectionId
      : (sections[0]?.id ?? "");
    if (firstValid !== sectionId) {
      setSectionId(firstValid);
    }
  }, [sections, sectionId]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating || courseId === "" || sectionId === "" || venueId === "") return;
    setCreating(true);
    setError(null);
    try {
      const result = await startGuest({
        actorToken,
        courseId: courseId as Id<"courses">,
        sectionId: sectionId as Id<"sections">,
        venueId: venueId as Id<"venues">,
        windowMinutes: Number(windowMinutes),
      });
      setOpen(false);
      router.push(`/faculty/sessions/${result.sessionId}`);
    } catch (cause) {
      setError(describeError(cause));
      setCreating(false);
    }
  }

  const readyToCreate =
    !creating &&
    courseId !== "" &&
    sectionId !== "" &&
    venueId !== "" &&
    optionsResult !== undefined;

  return (
    <>
      <Button variant="outline" data-testid="start-guest-session" onClick={() => setOpen(true)}>
        <Plus />
        Start guest session
      </Button>
      <dialog
        ref={dialogRef}
        aria-label="Start guest session"
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) setOpen(false);
        }}
        className="bg-background relative m-auto w-[calc(100%-2rem)] max-w-md rounded-xl border p-6 shadow-lg backdrop:bg-black/60"
      >
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Close"
          className="absolute top-3 right-3"
          onClick={() => setOpen(false)}
        >
          <X />
        </Button>
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold">Start guest session</h2>
          <p className="text-muted-foreground text-sm">
            Run an ad-hoc session outside your timetable.
          </p>
        </div>
        <form className="mt-4 flex flex-col gap-4" onSubmit={handleCreate}>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="guest-course" className="text-sm font-medium">
              Course
            </label>
            <select
              id="guest-course"
              data-testid="guest-course"
              className={selectClasses}
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
              disabled={optionsResult === undefined}
            >
              {optionsResult === undefined ? (
                <option value="">Loading…</option>
              ) : (
                courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.label}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="guest-section" className="text-sm font-medium">
              Section
            </label>
            <select
              id="guest-section"
              data-testid="guest-section"
              className={selectClasses}
              value={sectionId}
              onChange={(event) => setSectionId(event.target.value)}
              disabled={courseId === "" || sections.length === 0}
            >
              {sections.length === 0 ? (
                <option value="">No sections available</option>
              ) : (
                sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.label}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="guest-venue" className="text-sm font-medium">
              Venue
            </label>
            <select
              id="guest-venue"
              data-testid="guest-venue"
              className={selectClasses}
              value={venueId}
              onChange={(event) => setVenueId(event.target.value)}
              disabled={optionsResult === undefined}
            >
              {optionsResult === undefined ? (
                <option value="">Loading…</option>
              ) : (
                venues.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venue.label}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="guest-duration" className="text-sm font-medium">
              Duration
            </label>
            <select
              id="guest-duration"
              data-testid="guest-duration"
              className={selectClasses}
              value={windowMinutes}
              onChange={(event) => setWindowMinutes(event.target.value)}
            >
              {DURATIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} minutes
                </option>
              ))}
            </select>
          </div>
          {error !== null ? (
            <p className="text-destructive text-sm" data-testid="guest-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" data-testid="create-guest-session" disabled={!readyToCreate}>
              <Plus />
              Create
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}
