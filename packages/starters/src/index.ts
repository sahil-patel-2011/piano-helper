import type { Lesson } from "@piano-helper/shared";
import fiveFinger from "./lessons/five-finger.json";
import twinkle from "./lessons/twinkle.json";
import ode from "./lessons/ode-to-joy.json";
import minuet from "./lessons/minuet.json";
import scaleC from "./lessons/scale-c.json";
import scaleG from "./lessons/scale-g.json";
import scaleF from "./lessons/scale-f.json";
import hymn from "./lessons/hymn.json";

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
