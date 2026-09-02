import type { HeardNote } from "@piano-helper/shared";

export type MidiHandle = {
  stop: () => void;
  inputs: { id: string; name: string }[];
};

export async function startMidi(
  preferredId: string | null,
  onNote: (note: HeardNote) => void,
  onChange: (name: string | null, inputs: { id: string; name: string }[]) => void,
): Promise<MidiHandle> {
  if (!navigator.requestMIDIAccess) {
    onChange(null, []);
    return { stop() {}, inputs: [] };
  }
  const access = await navigator.requestMIDIAccess();
  const inputs = [...access.inputs.values()].map((i) => ({ id: i.id, name: i.name ?? i.id }));
  const chosen =
    [...access.inputs.values()].find((i) => i.id === preferredId) ?? [...access.inputs.values()][0];
  const handlers: Array<[MIDIInput, (e: MIDIMessageEvent) => void]> = [];

  const listen = (input: MIDIInput) => {
    const handler = (e: MIDIMessageEvent) => {
      const data = e.data;
      if (!data || data.length < 2) return;
      const status = data[0] & 0xf0;
      const note = data[1];
      const vel = data[2] ?? 0;
      if (status === 0x90 && vel > 0) {
        onNote({ midi: note, centsError: 0, rms: vel / 127, source: "midi", t: performance.now() });
      }
    };
    input.addEventListener("midimessage", handler);
    handlers.push([input, handler]);
  };

  if (chosen) listen(chosen);
  onChange(chosen?.name ?? null, inputs);

  const onState = () => {
    const list = [...access.inputs.values()].map((i) => ({ id: i.id, name: i.name ?? i.id }));
    const still = chosen && access.inputs.get(chosen.id);
    onChange(still ? chosen.name ?? chosen.id : null, list);
  };
  access.addEventListener("statechange", onState);

  return {
    inputs,
    stop() {
      access.removeEventListener("statechange", onState);
      for (const [input, handler] of handlers) input.removeEventListener("midimessage", handler);
    },
  };
}
