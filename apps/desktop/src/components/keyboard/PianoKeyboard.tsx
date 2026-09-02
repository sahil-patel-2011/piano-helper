import { useEffect, useMemo } from "react";
import { isWhiteKey, keyRangeForCount, midiToPitch, type KeyCount } from "@piano-helper/shared";

type Props = {
  keyCount?: KeyCount;
  targets?: number[];
  hitMidi?: number | null;
  missMidi?: number | null;
  fingerings?: Record<number, number>;
  shape?: Record<number, number>;
  showFingering?: boolean;
  memoryLevel?: number;
  onPlay?: (midi: number) => void;
  compact?: boolean;
};

function windowAround(targets: number[], keyCount: KeyCount): { from: number; to: number } {
  const full = keyRangeForCount(keyCount);
  const center = targets.length ? Math.round(targets.reduce((a, b) => a + b, 0) / targets.length) : 60;
  let from = Math.max(full.from, center - 10);
  let to = Math.min(full.to, center + 14);
  while (from > full.from && !isWhiteKey(from)) from -= 1;
  while (to < full.to && !isWhiteKey(to)) to += 1;
  return { from, to };
}

export function PianoKeyboard({
  keyCount = 88,
  targets = [],
  hitMidi = null,
  missMidi = null,
  fingerings = {},
  shape = {},
  showFingering = true,
  memoryLevel = 0,
  onPlay,
  compact = false,
}: Props) {
  const { from, to } = useMemo(() => windowAround(targets, keyCount), [targets, keyCount]);
  const whites: number[] = [];
  for (let midi = from; midi <= to; midi += 1) {
    if (isWhiteKey(midi)) whites.push(midi);
  }
  const whiteW = compact ? 28 : 46;
  const width = whites.length * whiteW;

  useEffect(() => {
    document.querySelector(".white-key.target, .black-key.target")?.scrollIntoView({
      inline: "center",
      block: "nearest",
    });
  }, [targets]);

  const classFor = (midi: number, kind: "white-key" | "black-key") =>
    [
      kind,
      midi === 60 && kind === "white-key" ? "middle-c" : "",
      targets.includes(midi) ? "target" : "",
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
    blackNodes.push({ midi, left: whiteIndex * whiteW - whiteW * 0.36 });
  }

  const hideNames = memoryLevel >= 2;
  const hidePlay = memoryLevel >= 1;

  const fingerOn = (midi: number) => fingerings[midi] ?? shape[midi];

  return (
    <div className={`keyboard-wrap ${compact ? "compact" : ""} memory-${memoryLevel}`}>
      <div className="keyboard" style={{ width, ["--white-w" as string]: `${whiteW}px` }}>
        {whites.map((midi) => (
          <button
            type="button"
            key={midi}
            className={classFor(midi, "white-key")}
            title={midiToPitch(midi)}
            onClick={() => onPlay?.(midi)}
          >
            {!hideNames && <span className="key-name">{midiToPitch(midi)}</span>}
            {showFingering && fingerOn(midi) ? (
              <span className={`fingering ${fingerings[midi] ? "now" : "home"}`}>{fingerOn(midi)}</span>
            ) : null}
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
            onClick={() => onPlay?.(midi)}
          >
            {!hideNames && <span className="key-name">{midiToPitch(midi)}</span>}
            {showFingering && fingerOn(midi) ? (
              <span className={`fingering ${fingerings[midi] ? "now" : "home"}`}>{fingerOn(midi)}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
