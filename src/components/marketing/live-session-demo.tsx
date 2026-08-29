"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { VerdictStamp, type Verdict } from "@/components/marketing/verdict-stamp";

const ROTATE_MS = 8000;
const FEED_TICK_MS = 2600;
const MAX_FEED_ROWS = 5;
const QR_SIZE = 21;

const TOKEN_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

const ROSTER = [
  { name: "Aarav Patel", id: "CS21001" },
  { name: "Priya Menon", id: "CS21007" },
  { name: "Rohan Shetty", id: "CS21012" },
  { name: "Ananya Iyer", id: "CS21019" },
  { name: "Vikram Rao", id: "CS21023" },
  { name: "Meera Krishnan", id: "CS21031" },
  { name: "Devika Nair", id: "CS21034" },
  { name: "Arjun Deshpande", id: "CS21040" },
  { name: "Ishita Bose", id: "CS21045" },
  { name: "Kabir Malhotra", id: "CS21052" },
] as const;

// Mostly accepts — honest students are the norm; step-ups and flags are rare.
const VERDICT_POOL: Verdict[] = [
  "accept",
  "accept",
  "accept",
  "accept",
  "accept",
  "accept",
  "accept",
  "step-up",
  "flag",
];

type FeedEntry = {
  key: number;
  name: string;
  id: string;
  at: string;
  verdict: Verdict;
};

function hashString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mintToken(): string {
  let token = "";
  for (let i = 0; i < 8; i += 1) {
    token += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)];
    if (i === 3) token += "-";
  }
  return token;
}

function clockNow(): string {
  return new Date().toLocaleTimeString("en-IN", { hour12: false });
}

/** Deterministic pseudo-QR modules derived from the current token. */
function useQrModules(token: string): boolean[] {
  return useMemo(() => {
    const random = mulberry32(hashString(token));
    const modules = new Array<boolean>(QR_SIZE * QR_SIZE).fill(false);
    const inFinder = (row: number, col: number) =>
      (row < 7 && col < 7) || (row < 7 && col >= QR_SIZE - 7) || (row >= QR_SIZE - 7 && col < 7);
    for (let row = 0; row < QR_SIZE; row += 1) {
      for (let col = 0; col < QR_SIZE; col += 1) {
        if (inFinder(row, col)) continue;
        if (row === 6 || col === 6) {
          modules[row * QR_SIZE + col] = (row + col) % 2 === 0;
          continue;
        }
        modules[row * QR_SIZE + col] = random() < 0.46;
      }
    }
    return modules;
  }, [token]);
}

function FinderPattern({ x, y }: { x: number; y: number }) {
  const cells: React.ReactNode[] = [];
  for (let row = 0; row < 7; row += 1) {
    for (let col = 0; col < 7; col += 1) {
      const edge = row === 0 || row === 6 || col === 0 || col === 6;
      const core = row >= 2 && row <= 4 && col >= 2 && col <= 4;
      if (!edge && !core) continue;
      cells.push(
        <rect
          key={`${row}-${col}`}
          x={x + col}
          y={y + row}
          width={1}
          height={1}
          fill="currentColor"
        />,
      );
    }
  }
  return <>{cells}</>;
}

export function LiveSessionDemo() {
  const [token, setToken] = useState("SANN-2026");
  const [feed, setFeed] = useState<FeedEntry[]>([]);
  const entryKey = useRef(0);
  const rosterIndex = useRef(Math.floor(Math.random() * ROSTER.length));
  const verdictIndex = useRef(Math.floor(Math.random() * VERDICT_POOL.length));

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const appendEntry = () => {
      const student = ROSTER[rosterIndex.current % ROSTER.length];
      const verdict = VERDICT_POOL[verdictIndex.current % VERDICT_POOL.length];
      rosterIndex.current += 1;
      verdictIndex.current += 1;
      entryKey.current += 1;
      setFeed((current) =>
        [
          { key: entryKey.current, name: student.name, id: student.id, at: clockNow(), verdict },
          ...current,
        ].slice(0, MAX_FEED_ROWS),
      );
    };

    if (reducedMotion) {
      setToken("SANN-2026");
      for (let i = 0; i < 4; i += 1) appendEntry();
      return;
    }

    const rotate = () => setToken(mintToken());
    const rotateTimer = window.setInterval(rotate, ROTATE_MS);
    const feedTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") appendEntry();
    }, FEED_TICK_MS);
    appendEntry();
    return () => {
      window.clearInterval(rotateTimer);
      window.clearInterval(feedTimer);
    };
  }, []);

  const modules = useQrModules(token);

  return (
    <div className="border-primary/60 bg-primary text-primary-foreground shadow-primary/40 overflow-hidden rounded-xl border shadow-[0_24px_60px_-24px]">
      <div className="border-primary-foreground/15 flex items-center justify-between border-b px-5 py-3.5">
        <div className="flex flex-col">
          <span className="font-mono text-[11px] tracking-[0.14em] uppercase opacity-70">
            CS204 · Data Structures
          </span>
          <span className="text-sm font-medium">Tuesday · 09:30 · Seminar Hall 2</span>
        </div>
        <span className="bg-chalk text-chalk-foreground inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-mono text-[11px] font-semibold tracking-[0.12em] uppercase">
          <span className="relative flex size-2 motion-reduce:animate-none">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex size-2 rounded-full bg-current" />
          </span>
          Live
        </span>
      </div>

      <div className="flex flex-col items-center gap-6 px-5 py-5 sm:flex-row sm:gap-8">
        <div className="flex w-full flex-col items-center gap-3 sm:w-auto">
          <div className="rounded-lg bg-white p-2.5 text-[oklch(0.25_0.03_170)] shadow-inner">
            <svg
              viewBox={`0 0 ${QR_SIZE} ${QR_SIZE}`}
              className="size-28 sm:size-32"
              role="img"
              aria-label="Animated preview of a rotating session QR code"
              shapeRendering="crispEdges"
            >
              <rect width={QR_SIZE} height={QR_SIZE} fill="white" />
              <g>
                {modules.map((filled, index) =>
                  filled ? (
                    <rect
                      key={index}
                      x={index % QR_SIZE}
                      y={Math.floor(index / QR_SIZE)}
                      width={1}
                      height={1}
                      fill="currentColor"
                    />
                  ) : null,
                )}
                <FinderPattern x={0} y={0} />
                <FinderPattern x={QR_SIZE - 7} y={0} />
                <FinderPattern x={0} y={QR_SIZE - 7} />
              </g>
            </svg>
          </div>
          <div
            aria-hidden="true"
            className="flex w-full flex-col items-center gap-1.5"
            data-testid="demo-qr-token"
          >
            <span className="font-mono text-sm font-semibold tracking-[0.18em]">{token}</span>
            <div className="bg-primary-foreground/20 h-1 w-full overflow-hidden rounded-full">
              <div
                key={token}
                className="bg-chalk h-full rounded-full motion-reduce:[animation:none]"
                style={{
                  animation: "demo-countdown 8s linear forwards",
                  transformOrigin: "left",
                }}
              />
            </div>
            <span className="font-mono text-[10px] tracking-[0.1em] uppercase opacity-60">
              Rotates every 8s
            </span>
          </div>
        </div>

        <div className="flex w-full min-w-0 flex-1 flex-col gap-1.5">
          <p className="font-mono text-[11px] tracking-[0.14em] uppercase opacity-70">
            Verification board
          </p>
          <ul aria-hidden="true" className="flex flex-col">
            {feed.map((entry) => (
              <li
                key={entry.key}
                className="border-primary-foreground/10 flex items-center justify-between gap-3 border-b py-2 last:border-b-0"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">{entry.name}</span>
                  <span className="font-mono text-[11px] opacity-60">
                    {entry.id} · {entry.at}
                  </span>
                </div>
                <VerdictStamp
                  verdict={entry.verdict}
                  className="border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground shrink-0"
                />
              </li>
            ))}
            {feed.length === 0 ? (
              <li className="text-sm opacity-60">Waiting for check-ins…</li>
            ) : null}
          </ul>
        </div>
      </div>
    </div>
  );
}
