/** When a step was actually played, and where it sits in the piece (in beats). */
export type TimedHit = { t: number; beat: number };

/**
 * The player's current tempo, from the gaps between their last few notes.
 * Stops and hesitations (far slower than the music) and flams (far faster) are
 * ignored, so one pause doesn't drag the tempo down. Null until there is enough to go on.
 */
export function estimatePace(hits: TimedHit[], writtenBpm: number): number | null {
  const recent = hits.slice(-8);
  const bpms: number[] = [];
  for (let i = 1; i < recent.length; i += 1) {
    const dBeat = recent[i].beat - recent[i - 1].beat;
    const dt = recent[i].t - recent[i - 1].t;
    if (dBeat <= 0 || dt < 60) continue;
    const bpm = (60000 * dBeat) / dt;
    if (bpm < writtenBpm * 0.25 || bpm > writtenBpm * 3) continue;
    bpms.push(bpm);
  }
  if (bpms.length < 2) return null;
  const last = bpms.slice(-5).sort((a, b) => a - b);
  const mid = last[Math.floor(last.length / 2)];
  return Math.max(writtenBpm * 0.3, Math.min(writtenBpm * 2, mid));
}

/** Blend a fresh estimate into the running pace so it follows you without jumping around. */
export function smoothPace(current: number | null, fresh: number | null): number | null {
  if (fresh === null) return current;
  if (current === null) return fresh;
  return current * 0.5 + fresh * 0.5;
}
