import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { isWhiteKey, keyRangeForCount, midiToPitch, type KeyCount } from "@piano-helper/shared";

export type HandOverlay = {
  side: "rh" | "lh";
  /** midi → finger (1 thumb … 5 pinky): where each finger rests. */
  shape: Record<number, number>;
  /** Finger that plays now. */
  active: number | null;
  faded?: boolean;
};

type Props = {
  /** Draws a hand over the keys, fingertips on the keys they cover. */
  hand?: HandOverlay | null;
  keyCount?: KeyCount;
  targets?: number[];
  /** Keys coming up after the current one — drawn as a faint outline so the hand can get ready. */
  upcoming?: number[];
  hitMidi?: number | null;
  missMidi?: number | null;
  fingerings?: Record<number, number>;
  shape?: Record<number, number>;
  showFingering?: boolean;
  /** Letter names on keys. Off in simple view so the player learns positions, not labels. */
  showNames?: boolean;
  memoryLevel?: number;
  onPlay?: (midi: number) => void;
  compact?: boolean;
};

type Span = { from: number; to: number };

const MIN_WHITE = 34;
const MAX_WHITE = 56;

function whitesBetween(from: number, to: number) {
  let n = 0;
  for (let m = from; m <= to; m += 1) if (isWhiteKey(m)) n += 1;
  return n;
}

/** A span of `whites` white keys centred on `center`, clamped to the instrument. */
function spanAround(center: number, whites: number, keyCount: KeyCount): Span {
  const full = keyRangeForCount(keyCount);
  let from = center;
  let to = center;
  while (whitesBetween(from, to) < whites && (from > full.from || to < full.to)) {
    if (from > full.from) from -= 1;
    if (whitesBetween(from, to) < whites && to < full.to) to += 1;
  }
  while (from > full.from && !isWhiteKey(from)) from -= 1;
  while (to < full.to && !isWhiteKey(to)) to += 1;
  return { from, to };
}

export function PianoKeyboard({
  hand = null,
  keyCount = 88,
  targets = [],
  upcoming = [],
  hitMidi = null,
  missMidi = null,
  fingerings = {},
  shape = {},
  showFingering = true,
  showNames = true,
  memoryLevel = 0,
  onPlay,
  compact = false,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [wrapWidth, setWrapWidth] = useState(720);
  const [boardHeight, setBoardHeight] = useState(240);
  const spanRef = useRef<{ span: Span; fit: number; keyCount: KeyCount } | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      setWrapWidth(el.clientWidth - 24);
      if (boardRef.current) setBoardHeight(boardRef.current.clientHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const baseWhite = compact ? 30 : wrapWidth < 520 ? 40 : 46;
  const fitWhites = Math.max(8, Math.min(compact ? 22 : 24, Math.floor(wrapWidth / baseWhite)));

  // Keep the keyboard still while the targets stay in view. Recentre only when a
  // target leaves the visible span, so each key stays where the hand learned it.
  const { from, to } = useMemo(() => {
    const kept = spanRef.current;
    const wanted = [...targets, ...upcoming.slice(0, 2)];
    const inside = (s: Span) => wanted.every((m) => m > s.from && m < s.to);
    if (kept && kept.fit === fitWhites && kept.keyCount === keyCount && inside(kept.span)) return kept.span;
    const pool = targets.length ? targets : wanted;
    const center = pool.length ? Math.round(pool.reduce((a, b) => a + b, 0) / pool.length) : 60;
    let next = spanAround(center, fitWhites, keyCount);
    if (!inside(next) && pool.length) {
      // Very wide chord: grow the span so every target is visible (the wrap scrolls if needed).
      const lo = Math.min(...pool) - 2;
      const hi = Math.max(...pool) + 2;
      const full = keyRangeForCount(keyCount);
      next = { from: Math.max(full.from, Math.min(next.from, lo)), to: Math.min(full.to, Math.max(next.to, hi)) };
    }
    spanRef.current = { span: next, fit: fitWhites, keyCount };
    return next;
  }, [targets, upcoming, fitWhites, keyCount]);

  const whites: number[] = [];
  for (let midi = from; midi <= to; midi += 1) if (isWhiteKey(midi)) whites.push(midi);
  const whiteW = Math.max(MIN_WHITE * (compact ? 0.8 : 1), Math.min(MAX_WHITE, Math.floor(wrapWidth / whites.length)));
  const width = whites.length * whiteW;

  useEffect(() => {
    wrapRef.current?.querySelector(".white-key.target, .black-key.target")?.scrollIntoView({
      inline: "nearest",
      block: "nearest",
    });
  }, [targets]);

  const classFor = (midi: number, kind: "white-key" | "black-key") =>
    [
      kind,
      midi === 60 && kind === "white-key" ? "middle-c" : "",
      targets.includes(midi) ? "target" : upcoming.includes(midi) ? "next" : "",
      hitMidi === midi ? "hit" : "",
      missMidi === midi ? "miss" : "",
    ]
      .filter(Boolean)
      .join(" ");

  const blackNodes: { midi: number; left: number }[] = [];
  let whiteIndex = 0;
  for (let midi = from; midi <= to; midi += 1) {
    if (isWhiteKey(midi)) {
      whiteIndex += 1;
      continue;
    }
    blackNodes.push({ midi, left: whiteIndex * whiteW - whiteW * 0.31 });
  }

  const xCenter = (midi: number) => {
    let i = 0;
    for (let m = from; m < midi; m += 1) if (isWhiteKey(m)) i += 1;
    return isWhiteKey(midi) ? i * whiteW + whiteW / 2 : i * whiteW;
  };

  const hideNames = !showNames || memoryLevel >= 2;
  const hidePlay = memoryLevel >= 1;
  const fingerOn = (midi: number) => fingerings[midi] ?? shape[midi];

  const label = (midi: number) => (
    <>
      {!hideNames && <span className="key-name">{midiToPitch(midi)}</span>}
      {!showNames && midi === 60 && <span className="key-name c-mark">middle C</span>}
      {showFingering && !hand && fingerOn(midi) ? (
        <span className={`fingering ${fingerings[midi] ? "now" : "home"}`}>{fingerOn(midi)}</span>
      ) : null}
    </>
  );

  return (
    <div ref={wrapRef} className={`keyboard-wrap ${compact ? "compact" : ""} memory-${memoryLevel}`}>
      <div
        ref={boardRef}
        className={`keyboard${hand ? " with-hand" : ""}`}
        style={{ width, ["--white-w" as string]: `${whiteW}px` }}
      >
        {whites.map((midi) => (
          <button
            type="button"
            key={midi}
            className={classFor(midi, "white-key")}
            title={midiToPitch(midi)}
            onPointerDown={(e) => {
              e.preventDefault();
              onPlay?.(midi);
            }}
          >
            {label(midi)}
            {!hidePlay && targets.includes(midi) ? <span className="play-tag">Play</span> : null}
          </button>
        ))}
        {blackNodes.map(({ midi, left }) => (
          <button
            type="button"
            key={midi}
            className={classFor(midi, "black-key")}
            style={{ left }}
            title={midiToPitch(midi)}
            onPointerDown={(e) => {
              e.preventDefault();
              onPlay?.(midi);
            }}
          >
            {label(midi)}
          </button>
        ))}
        {hand && <HandLayer hand={hand} from={from} to={to} whiteW={whiteW} height={boardHeight} xCenter={xCenter} />}
      </div>
    </div>
  );
}

function HandLayer({
  hand,
  from,
  to,
  whiteW,
  height,
  xCenter,
}: {
  hand: HandOverlay;
  from: number;
  to: number;
  whiteW: number;
  height: number;
  xCenter: (midi: number) => number;
}) {
  const palmH = height < 200 ? 40 : 52;
  const whiteH = height - 4;
  const tips = Object.entries(hand.shape)
    .map(([m, f]) => ({ midi: Number(m), finger: f }))
    .filter((t) => t.midi >= from && t.midi <= to && t.finger >= 1 && t.finger <= 5)
    .map((t) => ({
      ...t,
      x: xCenter(t.midi),
      // White-key tips sit above the key label; black-key tips near the black key's front.
      y: isWhiteKey(t.midi) ? whiteH * 0.7 : whiteH * 0.62 * 0.72,
    }));
  if (!tips.length) return null;
  const xs = tips.map((t) => t.x);
  const spread = Math.max(...xs) - Math.min(...xs);
  const palmX = (Math.max(...xs) + Math.min(...xs)) / 2;
  const palmY = height + palmH * 0.45;
  const knuckleGap = Math.min(whiteW * 0.85, Math.max(whiteW * 0.5, spread / 4));
  // Screen left-to-right: right hand is thumb…pinky, left hand pinky…thumb.
  const slot = (f: number) => (hand.side === "rh" ? f - 1 : 5 - f) - 2;
  const finger = Math.max(12, Math.min(24, whiteW * 0.44));
  const r = Math.max(10, Math.min(16, whiteW * 0.3));

  return (
    <svg
      className={`hand-layer ${hand.faded ? "faded" : ""}`}
      width="100%"
      height={height + palmH}
      style={{ height: height + palmH }}
      aria-hidden
    >
      <ellipse
        className="hand-skin"
        cx={palmX}
        cy={palmY + palmH * 0.2}
        rx={Math.max(spread / 2 + whiteW * 0.55, whiteW * 1.6)}
        ry={palmH * 0.62}
      />
      {tips.map((t) => {
        const bx = palmX + slot(t.finger) * knuckleGap;
        const by = palmY - (t.finger === 1 ? -palmH * 0.05 : palmH * 0.3);
        return (
          <line
            key={`b${t.finger}`}
            className="hand-skin finger-bone-line"
            x1={bx}
            y1={by}
            x2={t.x}
            y2={t.y}
            strokeWidth={finger}
            strokeLinecap="round"
          />
        );
      })}
      {tips.map((t) => {
        const active = hand.active === t.finger;
        return (
          <g key={`t${t.finger}`} className={`hand-tip f${t.finger}${active ? " active" : ""}`}>
            {active && <circle cx={t.x} cy={t.y} r={r + 7} className="tip-glow" />}
            <circle cx={t.x} cy={t.y} r={active ? r + 2 : r} />
            <text x={t.x} y={t.y + 0.5} textAnchor="middle" dominantBaseline="central" fontSize={active ? r * 1.25 : r * 1.05}>
              {t.finger}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
