import type { Lesson } from "@piano-helper/shared";
import fiveFinger from "./lessons/five-finger.json" with { type: "json" };
import twinkle from "./lessons/twinkle.json" with { type: "json" };
import ode from "./lessons/ode-to-joy.json" with { type: "json" };
import minuet from "./lessons/minuet.json" with { type: "json" };
import scaleC from "./lessons/scale-c.json" with { type: "json" };
import scaleG from "./lessons/scale-g.json" with { type: "json" };
import scaleF from "./lessons/scale-f.json" with { type: "json" };
import hymn from "./lessons/hymn.json" with { type: "json" };

export const STARTERS: Lesson[] = [
  fiveFinger,
  twinkle,
  ode,
  minuet,
  scaleC,
  scaleG,
  scaleF,
  hymn,
] as Lesson[];

export function getStarter(id: string): Lesson | undefined {
  return STARTERS.find((l) => l.id === id);
}
