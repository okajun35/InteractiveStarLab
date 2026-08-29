import type {
  ObservationSettings,
  SimulationSettings,
} from "../types/astronomy";
import { applyPlace, PLACE_PRESETS } from "../astronomy/directions";
import { lightPollutionLimit } from "../astronomy/magnitude";

/**
 * The four What-If experiments (spec §28). Each is a pure transformation
 * on (observation, simulation) state plus a short explanation (§29-§30).
 *
 * - A: darken the daytime sky        → daylightMode: real → removed
 * - B: switch off all city lights   → lightPollution → perfect
 * - C: 6 hours later                → datetime += 6h
 * - D: from Sydney (South)          → location → Sydney (same local time §27)
 */
export interface ExperimentDef {
  id: "daylight" | "city-lights" | "plus-six-hours" | "sydney";
  en: string;
  ja: string;
  /** Guided guess options (spec §29). */
  guessQuestionJa: string;
  guesses: string[];
  correctGuess: number;
  apply: (
    obs: ObservationSettings,
    sim: SimulationSettings,
  ) => { observation: ObservationSettings; simulation: SimulationSettings };
  explainJa: string;
}

export const EXPERIMENTS: ExperimentDef[] = [
  {
    id: "daylight",
    en: "What if the daytime sky were dark?",
    ja: "昼の空を暗くしたら？",
    guessQuestionJa: "昼の空を暗くしたらどうなると思う？",
    guesses: [
      "星がたくさん現れる",
      "何も変わらない",
      "星の位置が夜の位置に移動する",
    ],
    correctGuess: 0,
    apply: (obs, sim) => ({
      observation: obs,
      simulation: { ...sim, daylightMode: "removed" },
    }),
    explainJa: `星は昼間にも存在しています。昼間に見えにくいのは、太陽光が大気中で散乱して空が明るくなるためです。
今回、時刻はそのままです。星を夜の位置へ移動したわけではありません。`,
  },
  {
    id: "city-lights",
    en: "What if all city lights went out?",
    ja: "街の明かりが全部消えたら？",
    guessQuestionJa: "街の明かりが全部消えたらどうなると思う？",
    guesses: [
      "見える星の数が大きく増える",
      "見える星の数は変わらない",
      "星の位置が変わる",
    ],
    correctGuess: 0,
    apply: (obs, sim) => ({
      observation: obs,
      simulation: {
        ...sim,
        lightPollution: "perfect",
        limitingMagnitude: lightPollutionLimit("perfect"),
      },
    }),
    explainJa: `街の明かり（光害）は空全体を明るくして、暗い星を隠しています。
光害を消すと、同じ時刻・同じ場所でも見える星の数が大きく増えます。
星の位置は変わりません。空が暗くなるだけです。`,
  },
  {
    id: "plus-six-hours",
    en: "What will the sky look like 6 hours later?",
    ja: "6時間後の空は？",
    guessQuestionJa: "6時間後に星空はどうなると思う？",
    guesses: [
      "星がゆっくり動いている",
      "星の配置がほぼ同じである",
      "星の明るさが変わる",
    ],
    correctGuess: 0,
    apply: (obs, sim) => ({
      observation: {
        ...obs,
        datetime: new Date(obs.datetime.getTime() + 6 * 3600 * 1000),
      },
      simulation: sim,
    }),
    explainJa: `地球の自転によって、星はゆっくりと動いています。
6時間で星座がはっきりと移動していることに注目してください。
星の等級（明るさ）は変わりません。`,
  },
  {
    id: "sydney",
    en: "What if you looked from Sydney?",
    ja: "シドニーから見たら？",
    guessQuestionJa: "南半球のシドニーから見たらどうなると思う？",
    guesses: [
      "見える星座が変わる（南の空の星座が現れる）",
      "全く同じ星空に見える",
      "星が全て消える",
    ],
    correctGuess: 0,
    apply: (obs, sim) => ({
      observation: {
        ...obs,
        ...applyPlace(PLACE_PRESETS.find((p) => p.id === "sydney")!),
      },
      simulation: sim,
    }),
    explainJa: `場所が変わると、地平線の位置も変わり、見える星座が変わります。
南半球からは、アルマゾクズなどの南天の星座が見えます。
同じ時刻（現地時刻）の空でも、北半球と共通の星座だけが見えるわけではありません。`,
  },
];
