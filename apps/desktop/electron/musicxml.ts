import { type Lesson, type LessonEvent, type LessonMeasure } from "@piano-helper/shared";

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? m[1] : null;
}

function attrs(openTag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Za-z_:][\w:.-]*)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(openTag))) out[m[1]] = m[2];
  return out;
}

function splitMeasures(xml: string): string[] {
  const parts: string[] = [];
  const re = /<measure\b([^>]*)>([\s\S]*?)<\/measure>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) parts.push(m[0]);
  return parts;
}

function notePitch(noteXml: string): string | null {
  if (/<rest\b/.test(noteXml)) return null;
  const step = tag(noteXml, "step");
  const octave = tag(noteXml, "octave");
  if (!step || !octave) return null;
  const alter = Number(tag(noteXml, "alter") ?? 0);
  const acc = alter === 1 ? "#" : alter === -1 ? "b" : "";
  return `${step}${acc}${octave}`;
}

export function parseMusicXml(xml: string, titleHint = "Imported MusicXML"): Lesson {
  const workTitle = tag(xml, "work-title") ?? tag(xml, "movement-title") ?? titleHint;
  const rawMeasures = splitMeasures(xml);
  const measures: LessonMeasure[] = [];
  let tempo = 90;
  let beats = 4;
  let beatType = 4;

  rawMeasures.forEach((block, i) => {
    const open = block.match(/<measure\b([^>]*)>/)?.[1] ?? "";
    const number = Number(attrs(open).number ?? i + 1);
    const beatsTag = tag(block, "beats");
    const beatTypeTag = tag(block, "beat-type");
    if (beatsTag) beats = Number(beatsTag);
    if (beatTypeTag) beatType = Number(beatTypeTag);
    const tempoAttr = block.match(/<sound[^>]*tempo="([\d.]+)"/);
    if (tempoAttr) tempo = Number(tempoAttr[1]);

    const events: LessonEvent[] = [];
    let beat = 1;
    const divisions = Number(tag(block, "divisions") ?? 1);
    const quarterBeats = beatType === 8 ? 0.5 : beatType === 2 ? 2 : 1;
    const noteRe = /<note\b[\s\S]*?<\/note>/g;
    let nm: RegExpExecArray | null;
    while ((nm = noteRe.exec(block))) {
      const note = nm[0];
      const durationDiv = Number(tag(note, "duration") ?? divisions);
      const durationBeats = (durationDiv / divisions) * quarterBeats;
      const staff = Number(tag(note, "staff") ?? 1);
      const pitch = notePitch(note);
      if (pitch) {
        if (/<chord\b/.test(note) && events.length > 0) {
          const last = events[events.length - 1];
          if (last.pitches.length < 3) last.pitches.push(pitch);
        } else {
          events.push({
            beat,
            durationBeats: Math.max(0.25, durationBeats),
            pitches: [pitch],
            hand: staff === 2 ? "lh" : "rh",
          });
          beat += durationBeats;
        }
      } else {
        beat += durationBeats;
      }
    }
    measures.push({
      n: number,
      events: events.length
        ? events
        : [{ beat: 1, durationBeats: beats, pitches: ["C4"], hand: "rh", uncertain: true }],
    });
  });

  const slug = workTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "musicxml";
  return {
    id: `xml-${slug}`,
    title: workTitle,
    source: "musicxml",
    timeSignature: { num: beats, den: beatType },
    tempoBpm: tempo,
    keySignature: "C",
    difficulty: 2,
    measures: measures.length
      ? measures
      : [{ n: 1, events: [{ beat: 1, durationBeats: 1, pitches: ["C4"], hand: "rh", uncertain: true }] }],
  };
}
