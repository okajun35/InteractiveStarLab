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
  Aql: ["Aquila"], And: ["Andromeda"], Scl: ["Sculptor"], Ara: ["Ara"], Lib: ["Libra"],
  Cet: ["Cetus"], Ari: ["Aries"], Sct: ["Scutum"], Pyx: ["Pyxis"], Boo: ["Boötes"],
  Cae: ["Caelum"], Cha: ["Chamaeleon"], Cnc: ["Cancer"], Cap: ["Capricornus"], Car: ["Carina"],
  Cas: ["Cassiopeia"], Cen: ["Centaurus"], Cep: ["Cepheus"], Com: ["Coma Berenices"], Cvn: ["Canes Venatici"],
  Aur: ["Auriga"], Col: ["Columba"], Cir: ["Circinus"], Crt: ["Crater"], CrA: ["Corona Australis"],
  CrB: ["Corona Borealis"], Crv: ["Corvus"], Cru: ["Crux"], Cyg: ["Cygnus"], Del: ["Delphinus"],
  Dor: ["Dorado"], Dra: ["Draco"], Nor: ["Norma"], Eri: ["Eridanus"], Sge: ["Sagitta"], For: ["Fornax"],
  Gem: ["Gemini"], Cam: ["Camelopardalis"], CMa: ["Canis Major"], UMa: ["Ursa Major"], Gru: ["Grus"],
  Her: ["Hercules"], Hor: ["Horologium"], Hya: ["Hydra"], Hyi: ["Hydrus"], Ind: ["Indus"], Lac: ["Lacerta"],
  Mon: ["Monoceros"], Lep: ["Lepus"], Leo: ["Leo"], Lup: ["Lupus"], Lyn: ["Lynx"], Lyr: ["Lyra"],
  Ant: ["Antlia"], Mic: ["Microscopium"], Mus: ["Musca"], Oct: ["Octans"], Aps: ["Apus"], Oph: ["Ophiuchus"],
  Ori: ["Orion"], Pav: ["Pavo"], Peg: ["Pegasus"], Pic: ["Pictor"], Per: ["Perseus"], Equ: ["Equuleus"],
  CMi: ["Canis Minor"], LMi: ["Leo Minor"], Vul: ["Vulpecula"], UMi: ["Ursa Minor"], Phe: ["Phoenix"],
  Psc: ["Pisces"], PsA: ["Piscis Austrinus"], Vol: ["Volans"], Pup: ["Puppis"], Ret: ["Reticulum"],
  Sgr: ["Sagittarius"], Sco: ["Scorpius"], Ser: ["Serpens"], Sex: ["Sextans"], Men: ["Mensa"], Tau: ["Taurus"],
  Tel: ["Telescopium"], Tuc: ["Tucana"], Tri: ["Triangulum"], Tra: ["Triangulum Australe"], Aqr: ["Aquarius"],
  Vir: ["Virgo"], Vel: ["Vela"],
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
const hipToConstellation = new Map();
for (const { code, hips } of constellationsSource) {
  for (const hip of hips) {
    if (!hipRows.has(hip)) throw new Error(`Missing Hipparcos row for HIP ${hip}`);
    hipToConstellation.set(hip, code);
  }
}

const currentById = new Map(
  currentStars.map((star) => [
    star.id,
    Object.fromEntries(Object.entries(star).filter(([key]) => !key.endsWith("Ja"))),
  ]),
);
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
    description: `${constellationMeta[code][0]} is one of the 88 modern constellations.`,
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
