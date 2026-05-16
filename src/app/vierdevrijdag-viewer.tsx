"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type NostrEvent = {
  id: string;
  pubkey: string;
  kind: number;
  created_at: number;
  tags: string[][];
};

type EventOption = {
  key: string;
  type: string;
  title: string;
  image: string;
  start: number;
  end?: number;
  updatedAt: number;
};

type TimerState = "idle" | "running";
type TimerTone = "light" | "dark";
type TimerLayout = {
  x: number;
  y: number;
  scale: number;
};
type ControlLayout = {
  x: number;
  y: number;
};

const RELAYS = [
  "wss://nos.lol",
  "wss://relay.damus.io",
  "wss://relay.nsec.app",
  "wss://relay.primal.net",
];

const FILTER = {
  kinds: [31923],
  "#t": ["Wonders of Work event"],
  limit: 100,
};

const SELECTED_TYPE_STORAGE_KEY = "zeepkist.selectedEventType";
const SESSION_MINUTES_STORAGE_KEY = "zeepkist.sessionMinutes";
const TIMER_LAYOUT_STORAGE_KEY = "zeepkist.timerLayout.v4";
const CONTROL_LAYOUT_STORAGE_KEY = "zeepkist.controlLayout.v1";
const DEFAULT_SESSION_MINUTES = 5;
const MAX_SESSION_MINUTES = 99;
const MIN_TIMER_SCALE = 0.1;
const MAX_TIMER_SCALE = 2.5;
const DEFAULT_TIMER_LAYOUT = { x: 50, y: 48, scale: 0.25 };
const DEFAULT_CONTROL_LAYOUT = { x: 50, y: 92 };
const MAX_DISPLAY_SECONDS = 99 * 60 + 99;

function getTag(event: NostrEvent, name: string) {
  return event.tags.find((tag) => tag[0] === name)?.[1] ?? "";
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function startOfTodayInSeconds() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.floor(today.getTime() / 1000);
}

function eventTypeFromTitle(title: string) {
  return title.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
}

function dedupeLatest(events: NostrEvent[]) {
  const latestByAddress = new Map<string, NostrEvent>();

  for (const event of events) {
    const dTag = getTag(event, "d") || event.id;
    const key = `${event.pubkey}:${event.kind}:${dTag}`;
    const cached = latestByAddress.get(key);

    if (!cached || event.created_at > cached.created_at) {
      latestByAddress.set(key, event);
    }
  }

  return [...latestByAddress.values()];
}

function toEventOption(event: NostrEvent): EventOption | null {
  const title = getTag(event, "title");
  const image = getTag(event, "image");
  const start = Number(getTag(event, "start"));
  const end = Number(getTag(event, "end"));

  if (!title || !image || !Number.isFinite(start)) return null;

  const type = eventTypeFromTitle(title);

  return {
    key: `${event.pubkey}:${event.kind}:${getTag(event, "d") || event.id}`,
    type,
    title,
    image,
    start,
    end: Number.isFinite(end) ? end : undefined,
    updatedAt: event.created_at,
  };
}

function firstUpcomingPerType(events: NostrEvent[]) {
  const optionsByType = new Map<string, EventOption>();

  for (const event of dedupeLatest(events)) {
    const option = toEventOption(event);
    if (!option) continue;

    const end = option.end ?? option.start;
    if (end < startOfTodayInSeconds()) continue;

    const typeKey = normalize(option.type);
    const current = optionsByType.get(typeKey);

    if (!current || option.start < current.start) {
      optionsByType.set(typeKey, option);
    }
  }

  return [...optionsByType.values()].sort((a, b) => a.start - b.start);
}

function fetchRelayEvents(relay: string, timeoutMs = 7500) {
  return new Promise<NostrEvent[]>((resolve) => {
    const events: NostrEvent[] = [];
    const subscriptionId = `events-${crypto.randomUUID()}`;
    const socket = new WebSocket(relay);
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      socket.close();
      resolve(events);
    };

    const timeout = window.setTimeout(finish, timeoutMs);

    socket.addEventListener("open", () => {
      socket.send(JSON.stringify(["REQ", subscriptionId, FILTER]));
    });

    socket.addEventListener("message", (message) => {
      try {
        const data = JSON.parse(String(message.data));

        if (data[0] === "EVENT" && data[2]) {
          events.push(data[2]);
        }

        if (data[0] === "EOSE" || data[0] === "CLOSED") {
          finish();
        }
      } catch {
        // Ignore malformed relay messages and keep listening.
      }
    });

    socket.addEventListener("error", finish);
  });
}

function formatEventDate(seconds: number) {
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "short",
  }).format(new Date(seconds * 1000));
}

function formatTime(totalSeconds: number) {
  const absoluteSeconds = Math.min(Math.abs(totalSeconds), MAX_DISPLAY_SECONDS);
  const minutes = Math.floor(absoluteSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (absoluteSeconds % 60)
    .toString()
    .padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function getStoredEventType() {
  if (typeof window === "undefined") return "";

  return window.localStorage.getItem(SELECTED_TYPE_STORAGE_KEY) ?? "";
}

function saveStoredEventType(type: string) {
  window.localStorage.setItem(SELECTED_TYPE_STORAGE_KEY, type);
}

function getStoredSessionMinutes() {
  if (typeof window === "undefined") return DEFAULT_SESSION_MINUTES;

  const value = Number(window.localStorage.getItem(SESSION_MINUTES_STORAGE_KEY));

  return Number.isFinite(value)
    ? Math.min(MAX_SESSION_MINUTES, Math.max(1, value))
    : DEFAULT_SESSION_MINUTES;
}

function saveStoredSessionMinutes(minutes: number) {
  window.localStorage.setItem(SESSION_MINUTES_STORAGE_KEY, String(minutes));
}

function getStoredTimerLayout(): TimerLayout {
  if (typeof window === "undefined") return DEFAULT_TIMER_LAYOUT;

  try {
    const value = JSON.parse(
      window.localStorage.getItem(TIMER_LAYOUT_STORAGE_KEY) ?? "null",
    );

    if (
      typeof value?.x === "number" &&
      typeof value?.y === "number" &&
      typeof value?.scale === "number"
    ) {
      return {
        x: Math.min(100, Math.max(0, value.x)),
        y: Math.min(100, Math.max(0, value.y)),
        scale: Math.min(MAX_TIMER_SCALE, Math.max(MIN_TIMER_SCALE, value.scale)),
      };
    }
  } catch {
    return DEFAULT_TIMER_LAYOUT;
  }

  return DEFAULT_TIMER_LAYOUT;
}

function saveStoredTimerLayout(layout: TimerLayout) {
  window.localStorage.setItem(TIMER_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
}

function getStoredControlLayout(): ControlLayout {
  if (typeof window === "undefined") return DEFAULT_CONTROL_LAYOUT;

  try {
    const value = JSON.parse(
      window.localStorage.getItem(CONTROL_LAYOUT_STORAGE_KEY) ?? "null",
    );

    if (typeof value?.x === "number" && typeof value?.y === "number") {
      return {
        x: Math.min(100, Math.max(0, value.x)),
        y: Math.min(100, Math.max(0, value.y)),
      };
    }
  } catch {
    return DEFAULT_CONTROL_LAYOUT;
  }

  return DEFAULT_CONTROL_LAYOUT;
}

function saveStoredControlLayout(layout: ControlLayout) {
  window.localStorage.setItem(
    CONTROL_LAYOUT_STORAGE_KEY,
    JSON.stringify(layout),
  );
}

export default function VierDeVrijdagViewer() {
  const timerRef = useRef<HTMLButtonElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const dropdownButtonRef = useRef<HTMLButtonElement>(null);
  const timerDragOffsetRef = useRef({ x: 0, y: 0 });
  const controlsDragOffsetRef = useRef({ x: 0, y: 0 });
  const [events, setEvents] = useState<EventOption[]>([]);
  const [eventsLoaded, setEventsLoaded] = useState(false);
  const [storageReady, setStorageReady] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [selectedType, setSelectedType] = useState("");
  const [sessionMinutes, setSessionMinutes] = useState(
    DEFAULT_SESSION_MINUTES,
  );
  const [timerState, setTimerState] = useState<TimerState>("idle");
  const [remainingSeconds, setRemainingSeconds] = useState(
    DEFAULT_SESSION_MINUTES * 60,
  );
  const [timerTone, setTimerTone] = useState<TimerTone>("light");
  const [timerLayout, setTimerLayout] = useState<TimerLayout>(
    DEFAULT_TIMER_LAYOUT,
  );
  const [controlLayout, setControlLayout] = useState<ControlLayout>(
    DEFAULT_CONTROL_LAYOUT,
  );

  const selectedEvent = useMemo(
    () =>
      events.find((event) => normalize(event.type) === selectedType) ??
      events[0],
    [events, selectedType],
  );

  const selectedValue = selectedEvent ? normalize(selectedEvent.type) : "";
  const selectedIndex = Math.max(
    0,
    events.findIndex((event) => normalize(event.type) === selectedValue),
  );

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const storedMinutes = getStoredSessionMinutes();

      setSelectedType(getStoredEventType());
      setSessionMinutes(storedMinutes);
      setRemainingSeconds(storedMinutes * 60);
      setTimerLayout(getStoredTimerLayout());
      setControlLayout(getStoredControlLayout());
      setStorageReady(true);
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadEvents() {
      const results = await Promise.allSettled(
        RELAYS.map((relay) => fetchRelayEvents(relay)),
      );
      const relayEvents = results.flatMap((result) =>
        result.status === "fulfilled" ? result.value : [],
      );
      const nextEvents = firstUpcomingPerType(relayEvents);

      if (cancelled) return;

      setEvents(nextEvents);
      setEventsLoaded(true);
      setSelectedType((current) => {
        const stored = getStoredEventType();
        const preferred = current || stored;

        if (nextEvents.some((event) => normalize(event.type) === preferred)) {
          return preferred;
        }

        const vierDeVrijdag = nextEvents.find((event) =>
          normalize(event.type).includes("vierdevrijdag"),
        );

        return vierDeVrijdag
          ? normalize(vierDeVrijdag.type)
          : normalize(nextEvents[0]?.type ?? "");
      });
    }

    loadEvents();
    const interval = window.setInterval(loadEvents, 2 * 60 * 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!selectedEvent?.image) return;

    let cancelled = false;
    const image = new Image();

    image.crossOrigin = "anonymous";
    image.src = selectedEvent.image;
    image.onload = () => {
      if (cancelled) return;

      try {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) return;

        canvas.width = 24;
        canvas.height = 24;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        let brightness = 0;

        for (let index = 0; index < pixels.data.length; index += 4) {
          brightness +=
            pixels.data[index] * 0.299 +
            pixels.data[index + 1] * 0.587 +
            pixels.data[index + 2] * 0.114;
        }

        const average = brightness / (pixels.data.length / 4);
        setTimerTone(average > 140 ? "dark" : "light");
      } catch {
        setTimerTone("light");
      }
    };
    image.onerror = () => {
      if (!cancelled) setTimerTone("light");
    };

    return () => {
      cancelled = true;
    };
  }, [selectedEvent?.image]);

  useEffect(() => {
    if (timerState !== "running") return;

    const interval = window.setInterval(() => {
      setRemainingSeconds((seconds) => seconds - 1);
    }, 1000);

    return () => window.clearInterval(interval);
  }, [timerState]);

  const updateSessionLength = useCallback((minutes: number) => {
    const difference = minutes - sessionMinutes;
    const nextMinutes = Math.min(MAX_SESSION_MINUTES, Math.max(1, minutes));

    setSessionMinutes(nextMinutes);
    saveStoredSessionMinutes(nextMinutes);

    if (timerState === "idle") {
      setRemainingSeconds(nextMinutes * 60);
    } else if (difference !== 0) {
      setRemainingSeconds((seconds) => seconds + difference * 60);
    }
  }, [sessionMinutes, timerState]);

  useEffect(() => {
    function adjustTimerPosition(deltaX: number, deltaY: number) {
      setTimerLayout((layout) => {
        const next = clampTimerPosition(layout.x + deltaX, layout.y + deltaY);
        const nextLayout = { ...layout, ...next };
        saveStoredTimerLayout(nextLayout);
        return nextLayout;
      });
    }

    function adjustTimerScale(delta: number) {
      setTimerLayout((layout) => {
        const maxScale = maxScaleForViewport(layout.scale);
        const nextLayout = {
          ...layout,
          scale: Math.min(
            maxScale,
            Math.max(MIN_TIMER_SCALE, layout.scale + delta),
          ),
        };
        saveStoredTimerLayout(nextLayout);
        return nextLayout;
      });
    }

    function openEventSelect() {
      setHighlightedIndex(selectedIndex);
      setDropdownOpen(true);
      dropdownButtonRef.current?.focus();
    }

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;

      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      if (dropdownOpen) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setHighlightedIndex((index) => Math.min(events.length - 1, index + 1));
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          setHighlightedIndex((index) => Math.max(0, index - 1));
          return;
        }

        if (
          event.key === "Enter" ||
          event.key === " " ||
          event.code === "Space"
        ) {
          event.preventDefault();
          const eventOption = events[highlightedIndex];
          if (eventOption) selectEventType(normalize(eventOption.type));
          setDropdownOpen(false);
          dropdownButtonRef.current?.blur();
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          setDropdownOpen(false);
          dropdownButtonRef.current?.blur();
        }

        return;
      }

      if (event.repeat) return;

      if (event.key === "Enter") {
        event.preventDefault();
        setTimerState((state) => {
          if (state === "idle") {
            setRemainingSeconds(sessionMinutes * 60);
            return "running";
          }

          setRemainingSeconds(sessionMinutes * 60);
          return "idle";
        });
        return;
      }

      if (event.key === " " || event.code === "Space") {
        event.preventDefault();
        openEventSelect();
        return;
      }

      if (event.key === "+" || event.key === "=") {
        event.preventDefault();
        updateSessionLength(sessionMinutes + 1);
        return;
      }

      if (event.key === "-" || event.key === "_") {
        event.preventDefault();
        updateSessionLength(sessionMinutes - 1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        adjustTimerPosition(0, -2);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        adjustTimerPosition(0, 2);
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        adjustTimerPosition(-2, 0);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        adjustTimerPosition(2, 0);
        return;
      }

      if (event.key.toLowerCase() === "w") {
        event.preventDefault();
        adjustTimerScale(0.05);
        return;
      }

      if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        adjustTimerScale(-0.05);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    dropdownOpen,
    events,
    highlightedIndex,
    selectedIndex,
    sessionMinutes,
    timerState,
    updateSessionLength,
  ]);

  function selectEventType(type: string) {
    setSelectedType(type);
    saveStoredEventType(type);
  }

  function toggleSession() {
    if (timerState === "idle") {
      setRemainingSeconds(sessionMinutes * 60);
      setTimerState("running");
      return;
    }

    setTimerState("idle");
    setRemainingSeconds(sessionMinutes * 60);
  }

  function clampTimerPosition(x: number, y: number) {
    const rect = timerRef.current?.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const halfWidth = rect
      ? Math.min(50, (rect.width / viewportWidth) * 50)
      : 15;
    const halfHeight = rect
      ? Math.min(50, (rect.height / viewportHeight) * 50)
      : 8;

    return {
      x: Math.min(100 - halfWidth, Math.max(halfWidth, x)),
      y: Math.min(100 - halfHeight, Math.max(halfHeight, y)),
    };
  }

  function maxScaleForViewport(startScale: number) {
    const rect = timerRef.current?.getBoundingClientRect();

    if (!rect) return MAX_TIMER_SCALE;

    const maxWidthScale = startScale * (window.innerWidth / rect.width);
    const maxHeightScale = startScale * (window.innerHeight / rect.height);

    return Math.max(
      MIN_TIMER_SCALE,
      Math.min(MAX_TIMER_SCALE, maxWidthScale, maxHeightScale),
    );
  }

  function moveTimer(clientX: number, clientY: number) {
    const next = clampTimerPosition(
      (clientX / window.innerWidth) * 100 - timerDragOffsetRef.current.x,
      (clientY / window.innerHeight) * 100 - timerDragOffsetRef.current.y,
    );

    setTimerLayout((layout) => {
      const nextLayout = { ...layout, ...next };
      saveStoredTimerLayout(nextLayout);
      return nextLayout;
    });
  }

  function startTimerDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if ((event.target as HTMLElement).dataset.resizeHandle === "true") return;

    const rect = event.currentTarget.getBoundingClientRect();
    timerDragOffsetRef.current = {
      x:
        ((event.clientX - (rect.left + rect.width / 2)) / window.innerWidth) *
        100,
      y:
        ((event.clientY - (rect.top + rect.height / 2)) / window.innerHeight) *
        100,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragTimer(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;

    moveTimer(event.clientX, event.clientY);
  }

  function stopTimerDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function clampControlsPosition(x: number, y: number) {
    const rect = controlsRef.current?.getBoundingClientRect();
    const halfWidth = rect
      ? Math.min(50, (rect.width / window.innerWidth) * 50)
      : 20;
    const halfHeight = rect
      ? Math.min(50, (rect.height / window.innerHeight) * 50)
      : 5;

    return {
      x: Math.min(100 - halfWidth, Math.max(halfWidth, x)),
      y: Math.min(100 - halfHeight, Math.max(halfHeight, y)),
    };
  }

  function moveControls(clientX: number, clientY: number) {
    const next = clampControlsPosition(
      (clientX / window.innerWidth) * 100 - controlsDragOffsetRef.current.x,
      (clientY / window.innerHeight) * 100 - controlsDragOffsetRef.current.y,
    );

    setControlLayout(next);
    saveStoredControlLayout(next);
  }

  function startControlsDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;

    const rect = event.currentTarget.getBoundingClientRect();
    controlsDragOffsetRef.current = {
      x:
        ((event.clientX - (rect.left + rect.width / 2)) / window.innerWidth) *
        100,
      y:
        ((event.clientY - (rect.top + rect.height / 2)) / window.innerHeight) *
        100,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function dragControls(event: ReactPointerEvent<HTMLDivElement>) {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;

    moveControls(event.clientX, event.clientY);
  }

  function stopControlsDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function resizeTimer(startY: number) {
    const startScale = timerLayout.scale;
    const maxScale = maxScaleForViewport(startScale);
    const scaleRange = maxScale - MIN_TIMER_SCALE;
    const resizeDistance = Math.max(120, window.innerHeight * 0.28);

    const onMove = (event: PointerEvent) => {
      const delta = event.clientY - startY;
      const nextScale = startScale + (delta / resizeDistance) * scaleRange;
      const clampedScale = Math.min(
        maxScale,
        Math.max(MIN_TIMER_SCALE, nextScale),
      );

      setTimerLayout((layout) => {
        const nextLayout = { ...layout, scale: clampedScale };

        saveStoredTimerLayout(nextLayout);
        return nextLayout;
      });
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
  }

  const timerToneClass =
    timerTone === "light"
      ? "bg-white/10 text-white/58 shadow-[0_8px_24px_rgba(0,0,0,0.45)] ring-white/10 drop-shadow-[0_6px_16px_rgba(0,0,0,0.48)]"
      : "bg-black/10 text-black/58 shadow-[0_8px_24px_rgba(255,255,255,0.24)] ring-black/10 drop-shadow-[0_6px_16px_rgba(255,255,255,0.3)]";
  const timerExpiredClass =
    remainingSeconds < 0
      ? timerTone === "light"
        ? "animate-pulse !text-red-500 shadow-[0_0_45px_rgba(255,255,255,0.95),0_0_120px_rgba(239,68,68,0.75)] ring-2 ring-red-400/80"
        : "animate-pulse !text-red-700 shadow-[0_0_45px_rgba(0,0,0,0.85),0_0_120px_rgba(239,68,68,0.6)] ring-2 ring-red-800/70"
      : "";
  const timerWarningClass =
    remainingSeconds >= 0 && remainingSeconds <= 60
      ? timerTone === "light"
        ? "animate-pulse shadow-[0_0_45px_rgba(255,255,255,0.85),0_0_120px_rgba(255,255,255,0.55)] ring-2 ring-white/55"
        : "animate-pulse shadow-[0_0_45px_rgba(0,0,0,0.75),0_0_120px_rgba(0,0,0,0.45)] ring-2 ring-black/45"
      : "";
  const showControls = storageReady && eventsLoaded && events.length > 0;
  const dropdownListPositionClass =
    controlLayout.y < 50
      ? "top-[calc(100%+0.5rem)]"
      : "bottom-[calc(100%+0.5rem)]";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#130922] text-white">
      {selectedEvent ? (
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${selectedEvent.image})` }}
        />
      ) : (
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,#c58a2a,#68133c_48%,#130922_84%)]" />
      )}

      <div className="absolute inset-0 bg-black/10" />

      {timerState === "running" ? (
        <button
          ref={timerRef}
          type="button"
          aria-label="Sleep timer"
          onPointerDown={startTimerDrag}
          onPointerMove={dragTimer}
          onPointerUp={stopTimerDrag}
          onPointerCancel={stopTimerDrag}
          className="absolute grid cursor-grab touch-none place-items-center border-0 bg-transparent p-0 active:cursor-grabbing"
          style={{
            left: `${timerLayout.x}%`,
            top: `${timerLayout.y}%`,
            transform: "translate(-50%, -50%)",
          }}
        >
          <time
            className={`relative rounded-2xl px-[4vw] pb-[3vw] pt-[1.5vw] font-mono font-black leading-none tracking-[0.08em] ring-1 transition ${timerToneClass} ${timerWarningClass} ${timerExpiredClass}`}
            style={{ fontSize: `clamp(3.5rem, ${24 * timerLayout.scale}vw, ${24 * timerLayout.scale}rem)` }}
          >
            {formatTime(remainingSeconds)}
            <span
              data-resize-handle="true"
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                resizeTimer(event.clientY);
              }}
              className="absolute bottom-3 left-1/2 flex h-5 w-24 -translate-x-1/2 cursor-ns-resize items-center justify-center rounded-md border border-current/35 bg-current/15 opacity-80"
            >
              <span className="h-1 w-14 rounded-full bg-current opacity-70" />
            </span>
          </time>
        </button>
      ) : null}

      {showControls ? <div
        className="absolute z-10 w-[calc(100vw-2rem)] max-w-6xl touch-none sm:w-[calc(100vw-3.5rem)]"
        style={{
          left: `${controlLayout.x}%`,
          top: `${controlLayout.y}%`,
          transform: "translate(-50%, -50%)",
        }}
      >
        <div
          ref={controlsRef}
          onPointerDown={startControlsDrag}
          onPointerMove={dragControls}
          onPointerUp={stopControlsDrag}
          onPointerCancel={stopControlsDrag}
          className="flex w-full cursor-grab flex-wrap items-center gap-2 rounded-xl border border-white/20 bg-[#2d1232]/65 p-2 shadow-[0_4px_14px_rgba(0,0,0,0.35)] backdrop-blur-xl active:cursor-grabbing sm:p-3"
        >
          <div className="relative min-w-0 flex-[1_1_320px]">
            <button
              ref={dropdownButtonRef}
              type="button"
              aria-haspopup="listbox"
              aria-expanded={dropdownOpen}
              aria-label="Event type"
              onClick={() => {
                setHighlightedIndex(selectedIndex);
                setDropdownOpen((open) => !open);
              }}
              className="min-h-11 w-full truncate rounded-lg border border-white/20 bg-[#f8d37a]/90 py-2.5 pl-4 pr-14 text-left text-sm font-black text-[#281028] outline-none ring-0 transition focus:border-white/80 focus:bg-[#ffe39a]"
            >
              {selectedEvent
                ? `${formatEventDate(selectedEvent.start)} - ${selectedEvent.type}`
                : "Events laden..."}
            </button>
            <span className="pointer-events-none absolute inset-y-0 right-4 grid place-items-center text-[#281028]">
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                className="size-5"
                fill="currentColor"
              >
                <path d="M5.3 7.3a1 1 0 0 1 1.4 0L10 10.6l3.3-3.3a1 1 0 1 1 1.4 1.4l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 0-1.4Z" />
              </svg>
            </span>
            {dropdownOpen ? (
              <div
                role="listbox"
                className={`absolute left-0 z-20 max-h-80 w-full overflow-y-auto rounded-lg border border-white/20 bg-[#f8d37a] p-1 text-[#281028] shadow-2xl shadow-black/45 ${dropdownListPositionClass}`}
              >
                {events.map((event, index) => {
                  const value = normalize(event.type);
                  const isHighlighted = index === highlightedIndex;
                  const isSelected = value === selectedValue;

                  return (
                    <button
                      key={event.key}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      onClick={() => {
                        selectEventType(value);
                        setDropdownOpen(false);
                      }}
                      className={`block w-full rounded-md px-3 py-2 text-left text-sm font-black ${
                        isHighlighted ? "bg-[#2d1232] text-[#ffe39a]" : ""
                      } ${isSelected && !isHighlighted ? "bg-[#7d1747]/15" : ""}`}
                    >
                      {formatEventDate(event.start)} - {event.type}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="flex min-h-11 flex-[0_1_auto] overflow-hidden rounded-lg border border-[#ffd86c]/40 bg-[#7d1747]/85 shadow-lg shadow-black/25">
            <button
              type="button"
              aria-label="Sessie korter"
              onClick={() => updateSessionLength(sessionMinutes - 1)}
              disabled={sessionMinutes <= 1}
              className="w-10 text-lg font-black text-[#ffe39a] transition hover:bg-white/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35"
            >
              -
            </button>
            <div className="grid min-w-16 place-items-center border-x border-[#ffd86c]/25 px-2 text-sm font-black text-[#ffe39a]">
              {sessionMinutes} min
            </div>
            <button
              type="button"
              aria-label="Sessie langer"
              onClick={() => updateSessionLength(sessionMinutes + 1)}
              disabled={sessionMinutes >= MAX_SESSION_MINUTES}
              className="w-10 text-lg font-black text-[#ffe39a] transition hover:bg-white/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35"
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={toggleSession}
            className="min-h-11 w-24 flex-none rounded-lg bg-[#f7c948] px-5 py-2.5 text-sm font-black text-[#2d1232] shadow-lg shadow-black/30 transition hover:bg-[#ffe39a] active:scale-[0.98]"
          >
            {timerState === "running" ? "Klaar" : "Start"}
          </button>
        </div>
      </div> : null}
    </main>
  );
}
