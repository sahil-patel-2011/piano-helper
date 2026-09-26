import { isWhiteKey, keyRangeForCount, type KeyCount } from "@piano-helper/shared";

type Props = {
  keyCount: KeyCount;
  target?: number | null;
  wrong?: number | null;
  done?: number[];
};

/** The whole piano in one strip, so "lowest key" or "middle C" can be found without reading music. */
export function KeyboardMap({ keyCount, target = null, wrong = null, done = [] }: Props) {
  const { from, to } = keyRangeForCount(keyCount);
  const whites: number[] = [];
  for (let m = from; m <= to; m += 1) if (isWhiteKey(m)) whites.push(m);
  const W = 1000;
  const H = 120;
  const ww = W / whites.length;
  const xOf = (midi: number) => {
    const i = whites.filter((m) => m < midi).length;
    return isWhiteKey(midi) ? i * ww + ww / 2 : i * ww;
  };
  const fill = (midi: number, base: string) =>
    midi === target ? "var(--accent)" : midi === wrong ? "var(--miss)" : done.includes(midi) ? "var(--hit)" : base;

  return (
    <svg className="keyboard-map" viewBox={`0 -34 ${W} ${H + 34}`} role="img" aria-label="Where the key is on the piano">
      {whites.map((m, i) => (
        <rect key={m} x={i * ww} y={0} width={ww - 1} height={H} rx={2} fill={fill(m, "#efe6d4")} />
      ))}
      {Array.from({ length: to - from + 1 }, (_, k) => from + k)
        .filter((m) => !isWhiteKey(m))
        .map((m) => (
          <rect key={m} x={xOf(m) - ww * 0.32} y={0} width={ww * 0.64} height={H * 0.62} rx={1.5} fill={fill(m, "#1b1a17")} />
        ))}
      {60 >= from && 60 <= to && (
        <text x={xOf(60)} y={H - 8} textAnchor="middle" fontSize={Math.min(22, ww * 1.4)} fill="#6d6352" fontWeight={700}>
          C
        </text>
      )}
      {target !== null && (
        <g transform={`translate(${xOf(target)} 0)`}>
          <path d="M0 -4 L-11 -24 L11 -24 Z" fill="var(--accent)" />
        </g>
      )}
    </svg>
  );
}
