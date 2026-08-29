#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "data-source");
const dataDir = path.join(root, "src", "data");

const constellationSource = path.join(
  sourceDir,
  "stellarium-western-constellationship.v0.15.0.txt",
);
const starNamesSource = path.join(
  sourceDir,
  "stellarium-western-star-names.v0.15.0.txt",
);
const hipSource = path.join(sourceDir, "hipparcos-line-stars.v0.15.0.tsv");

const constellationMeta = {
  Aql: ["Aquila", "わし座"],
  And: ["Andromeda", "アンドロメダ座"],
  Scl: ["Sculptor", "ちょうこくしつ座"],
  Ara: ["Ara", "さいだん座"],
  Lib: ["Libra", "てんびん座"],
  Cet: ["Cetus", "くじら座"],
  Ari: ["Aries", "おひつじ座"],
  Sct: ["Scutum", "たて座"],
  Pyx: ["Pyxis", "らしんばん座"],
  Boo: ["Boötes", "うしかい座"],
  Cae: ["Caelum", "ちょうこくぐ座"],
  Cha: ["Chamaeleon", "カメレオン座"],
  Cnc: ["Cancer", "かに座"],
  Cap: ["Capricornus", "やぎ座"],
  Car: ["Carina", "りゅうこつ座"],
  Cas: ["Cassiopeia", "カシオペヤ座"],
  Cen: ["Centaurus", "ケンタウルス座"],
  Cep: ["Cepheus", "ケフェウス座"],
  Com: ["Coma Berenices", "かみのけ座"],
  Cvn: ["Canes Venatici", "りょうけん座"],
  Aur: ["Auriga", "ぎょしゃ座"],
  Col: ["Columba", "はと座"],
  Cir: ["Circinus", "コンパス座"],
  Crt: ["Crater", "コップ座"],
  CrA: ["Corona Australis", "みなみのかんむり座"],
  CrB: ["Corona Borealis", "かんむり座"],
  Crv: ["Corvus", "からす座"],
  Cru: ["Crux", "みなみじゅうじ座"],
  Cyg: ["Cygnus", "はくちょう座"],
  Del: ["Delphinus", "いるか座"],
  Dor: ["Dorado", "かじき座"],
  Dra: ["Draco", "りゅう座"],
  Nor: ["Norma", "じょうぎ座"],
  Eri: ["Eridanus", "エリダヌス座"],
  Sge: ["Sagitta", "や座"],
  For: ["Fornax", "ろ座"],
  Gem: ["Gemini", "ふたご座"],
  Cam: ["Camelopardalis", "きりん座"],
  CMa: ["Canis Major", "おおいぬ座"],
  UMa: ["Ursa Major", "おおぐま座"],
  Gru: ["Grus", "つる座"],
  Her: ["Hercules", "ヘルクレス座"],
  Hor: ["Horologium", "とけい座"],
  Hya: ["Hydra", "うみへび座"],
  Hyi: ["Hydrus", "みずへび座"],
  Ind: ["Indus", "インディアン座"],
  Lac: ["Lacerta", "とかげ座"],
  Mon: ["Monoceros", "いっかくじゅう座"],
  Lep: ["Lepus", "うさぎ座"],
  Leo: ["Leo", "しし座"],
  Lup: ["Lupus", "おおかみ座"],
  Lyn: ["Lynx", "やまねこ座"],
  Lyr: ["Lyra", "こと座"],
  Ant: ["Antlia", "ポンプ座"],
  Mic: ["Microscopium", "けんびきょう座"],
  Mus: ["Musca", "はえ座"],
  Oct: ["Octans", "はちぶんぎ座"],
  Aps: ["Apus", "ふうちょう座"],
  Oph: ["Ophiuchus", "へびつかい座"],
  Ori: ["Orion", "オリオン座"],
  Pav: ["Pavo", "くじゃく座"],
  Peg: ["Pegasus", "ペガスス座"],
  Pic: ["Pictor", "がか座"],
  Per: ["Perseus", "ペルセウス座"],
  Equ: ["Equuleus", "こうま座"],
  CMi: ["Canis Minor", "こいぬ座"],
  LMi: ["Leo Minor", "こじし座"],
  Vul: ["Vulpecula", "こぎつね座"],
  UMi: ["Ursa Minor", "こぐま座"],
  Phe: ["Phoenix", "ほうおう座"],
  Psc: ["Pisces", "うお座"],
  PsA: ["Piscis Austrinus", "みなみのうお座"],
  Vol: ["Volans", "とびうお座"],
  Pup: ["Puppis", "とも座"],
  Ret: ["Reticulum", "レチクル座"],
  Sgr: ["Sagittarius", "いて座"],
  Sco: ["Scorpius", "さそり座"],
  Ser: ["Serpens", "へび座"],
  Sex: ["Sextans", "ろくぶんぎ座"],
  Men: ["Mensa", "テーブルさん座"],
  Tau: ["Taurus", "おうし座"],
  Tel: ["Telescopium", "ぼうえんきょう座"],
  Tuc: ["Tucana", "きょしちょう座"],
  Tri: ["Triangulum", "さんかく座"],
  Tra: ["Triangulum Australe", "みなみのさんかく座"],
  Aqr: ["Aquarius", "みずがめ座"],
  Vir: ["Virgo", "おとめ座"],
  Vel: ["Vela", "ほ座"],
};

function parseRa(value) {
  const [hours, minutes, seconds] = value.trim().split(/\s+/).map(Number);
  return hours + minutes / 60 + seconds / 3600;
}

function parseDec(value) {
  const sign = value.trim().startsWith("-") ? -1 : 1;
  const [degrees, minutes, seconds] = value
    .trim()
    .replace(/^[-+]/, "")
    .split(/\s+/)
    .map(Number);
  return sign * (degrees + minutes / 60 + seconds / 3600);
}

function parseConstellationSource() {
  return fs
    .readFileSync(constellationSource, "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const [code, countText, ...hipText] = line.trim().split(/\s+/);
      const count = Number(countText);
      const hips = hipText.map(Number);
      if (!constellationMeta[code] || hips.length !== count * 2) {
        throw new Error(`Invalid constellation source row: ${line}`);
      }
      return { code, hips };
    });
}

function parseStarNames() {
  const names = new Map();
  for (const line of fs.readFileSync(starNamesSource, "utf8").trim().split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\|_\("(.*)"\)\s*$/);
    if (!match) throw new Error(`Invalid star-name source row: ${line}`);
    names.set(Number(match[1]), match[2]);
  }
  return names;
}

function parseHipparcos() {
  const rows = new Map();
  for (const line of fs.readFileSync(hipSource, "utf8").trim().split(/\r?\n/)) {
    const [hipText, raText, decText, magnitudeText] = line.trim().split("\t");
    const hip = Number(hipText);
    const row = {
      ra: parseRa(raText),
      dec: parseDec(decText),
      magnitude: Number(magnitudeText),
    };
    if (!Number.isInteger(hip) || !Number.isFinite(row.ra) || !Number.isFinite(row.dec) || !Number.isFinite(row.magnitude)) {
      throw new Error(`Invalid Hipparcos source row: ${line}`);
    }
    rows.set(hip, row);
  }
  return rows;
}

const constellationsSource = parseConstellationSource();
const starNames = parseStarNames();
const hipRows = parseHipparcos();
const currentStars = JSON.parse(
  fs.readFileSync(path.join(dataDir, "stars.json"), "utf8"),
);
const currentConstellations = JSON.parse(
  fs.readFileSync(path.join(dataDir, "constellations.json"), "utf8"),
);
const descriptionsById = new Map(
  currentConstellations
    .filter((constellation) => constellation.descriptionJa)
    .map((constellation) => [constellation.id, constellation.descriptionJa]),
);

const hipToConstellation = new Map();
for (const { code, hips } of constellationsSource) {
  for (const hip of hips) {
    if (!hipRows.has(hip)) throw new Error(`Missing Hipparcos row for HIP ${hip}`);
    hipToConstellation.set(hip, code);
  }
}

const currentById = new Map(currentStars.map((star) => [star.id, { ...star }]));
const nameToCurrentId = new Map();
const sourceNameToHip = new Map(
  [...starNames].map(([hip, name]) => [name.toLowerCase(), hip]),
);
for (const star of currentById.values()) {
  const hip = sourceNameToHip.get(star.name.toLowerCase());
  if (hip !== undefined && !nameToCurrentId.has(hip)) {
    nameToCurrentId.set(hip, star.id);
  }
}

const hipToId = new Map(nameToCurrentId);
for (const hip of hipToConstellation.keys()) {
  if (!hipToId.has(hip)) hipToId.set(hip, `hip-${hip}`);
}

for (const [hip, id] of hipToId) {
  const current = currentById.get(id);
  const source = hipRows.get(hip);
  const code = hipToConstellation.get(hip);
  if (current) {
    if (code) current.constellation = constellationMeta[code][0];
    continue;
  }
  currentById.set(id, {
    id,
    name: starNames.get(hip) ?? `HIP ${hip}`,
    ra: source.ra,
    dec: source.dec,
    magnitude: source.magnitude,
    constellation: constellationMeta[code][0],
  });
}

const stars = [...currentById.values()];
const constellations = constellationsSource.map(({ code, hips }) => {
  const id = code.toUpperCase();
  return {
    id,
    name: constellationMeta[code][0],
    nameJa: constellationMeta[code][1],
    ...(descriptionsById.has(id)
      ? { descriptionJa: descriptionsById.get(id) }
      : {}),
    lines: Array.from({ length: hips.length / 2 }, (_, index) => [
      hipToId.get(hips[index * 2]),
      hipToId.get(hips[index * 2 + 1]),
    ]),
  };
});

fs.writeFileSync(
  path.join(dataDir, "stars.json"),
  `${JSON.stringify(stars, null, 2)}\n`,
);
fs.writeFileSync(
  path.join(dataDir, "constellations.json"),
  `${JSON.stringify(constellations, null, 2)}\n`,
);

console.log(
  `Imported ${constellations.length} constellations, ${constellations.reduce((sum, c) => sum + c.lines.length, 0)} lines, ${stars.length} stars (${hipToConstellation.size} unique line endpoints).`,
);
