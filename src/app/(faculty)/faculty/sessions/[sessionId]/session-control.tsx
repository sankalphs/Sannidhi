"use client";

import { api } from "../../../../../../convex/_generated/api";
import type { Id } from "../../../../../../convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { useMutation } from "convex/react";
import { ArrowLeft, Pause, Play, Square } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { LiveBoard } from "./live-board";
import { QrPanel } from "./qr-panel";

export type BoardSnapshot = FunctionReturnType<typeof api.classSessions.getBoard>;

type SessionStatus = "active" | "paused" | "closed";
type ControlAction = "pause" | "close" | "restart";

function describeError(cause: unknown): string {
  if (typeof cause === "object" && cause !== null && "data" in cause) {
    const data = (cause as { data?: unknown }).data;
    if (typeof data === "string") {
      if (data === "session_not_active") {
        return "This session is no longer active.";
      }
      if (data === "session_already_closed") {
        return "This session is already closed.";
      }
      if (data === "session_not_restartable") {
        return "Only paused or closed sessions can be restarted.";
      }
      if (data === "session_window_closed") {
        return "The session window has closed. Restart to open a new one.";
      }
      if (data === "unauthorized") {
        return "You are not authorized to manage this session.";
      }
      return data;
    }
  }
  return "Something went wrong. Please try again.";
}

function StatusBadge({ status }: { status: SessionStatus }) {
  if (status === "active") return <Badge>Active</Badge>;
  if (status === "paused") return <Badge variant="secondary">Paused</Badge>;
  return <Badge variant="outline">Closed</Badge>;
}

export function SessionControl({
  actorToken,
  sessionId,
  initialSnapshot,
}: {
  actorToken: string;
  sessionId: Id<"class_sessions">;
  initialSnapshot: BoardSnapshot;
}) {
  const router = useRouter();
  const pause = useMutation(api.classSessions.pause);
  const close = useMutation(api.classSessions.close);
  const restart = useMutation(api.classSessions.restart);
  const [pending, setPending] = useState<ControlAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const session = initialSnapshot.session;

  async function run(action: ControlAction) {
    if (pending !== null) return;
    setPending(action);
    setError(null);
    try {
      if (action === "pause") {
        await pause({ actorToken, sessionId });
      } else if (action === "close") {
        await close({ actorToken, sessionId });
      } else {
        await restart({ actorToken, sessionId });
      }
      router.refresh();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/faculty/sessions"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" />
        All sessions
      </Link>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {session.courseCode} {session.courseTitle}
            </h1>
            {session.kind === "guest" ? <Badge variant="outline">Guest</Badge> : null}
            <StatusBadge status={session.status} />
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {session.sectionName} · {session.venueName}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {session.status === "active" ? (
            <Button
              variant="outline"
              data-testid="pause-session"
              onClick={() => void run("pause")}
              disabled={pending !== null}
            >
              <Pause />
              Pause
            </Button>
          ) : null}
          {session.status === "paused" || session.status === "closed" ? (
            <Button
              data-testid="restart-session"
              onClick={() => void run("restart")}
              disabled={pending !== null}
            >
              <Play />
              Restart window
            </Button>
          ) : null}
          {session.status === "active" || session.status === "paused" ? (
            <Button
              variant="destructive"
              data-testid="close-session"
              onClick={() => void run("close")}
              disabled={pending !== null}
            >
              <Square />
              Close session
            </Button>
          ) : null}
        </div>
      </div>
      {error !== null ? (
        <p className="text-destructive text-sm" data-testid="control-error" role="alert">
          {error}
        </p>
      ) : null}
      <div className="grid items-start gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <QrPanel actorToken={actorToken} sessionId={sessionId} sessionStatus={session.status} />
        <LiveBoard
          actorToken={actorToken}
          sessionId={sessionId}
          initialSnapshot={initialSnapshot}
        />
      </div>
    </div>
  );
}
