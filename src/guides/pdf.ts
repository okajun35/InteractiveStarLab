import type { ObservationGuideModel, GuideMapStar } from "./types";
import { formatGuideDate, formatGuideTimeRange } from "./time";

export interface GuidePdfArtifact {
  blob: Blob;
  fileName: string;
}

export const GUIDE_PDF_MAP = {
  x: 147.64,
  y: 375,
  size: 300,
} as const;

const MAP_X = GUIDE_PDF_MAP.x;
const MAP_Y = GUIDE_PDF_MAP.y;
const MAP_SIZE = GUIDE_PDF_MAP.size;

function asciiText(value: string, fallback = ""): string {
  const normalized = value.trim();
  if (!normalized) return fallback;
  return normalized.replace(/[^\x20-\x7e]/g, "?");
}

function pdfString(value: string): string {
  return `(${asciiText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")})`;
}

function text(content: string[], x: number, y: number, value: string, size = 9, bold = false): void {
  content.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${x.toFixed(2)} ${y.toFixed(2)} Td ${pdfString(value)} Tj ET`);
}

function line(content: string[], x1: number, y1: number, x2: number, y2: number, width = 0.6): void {
  content.push(`${width.toFixed(2)} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
}

function rect(content: string[], x: number, y: number, width: number, height: number, fill = false, stroke = true): void {
  content.push(`${x.toFixed(2)} ${y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re ${fill ? "f" : stroke ? "S" : "n"}`);
}

function circle(content: string[], cx: number, cy: number, radius: number, fill = false, width = 0.8): void {
  const k = 0.5522848 * radius;
  content.push(`${width.toFixed(2)} w ${cx + radius} ${cy} m ${cx + radius} ${cy + k} ${cx + k} ${cy + radius} ${cx} ${cy + radius} c ${cx - k} ${cy + radius} ${cx - radius} ${cy + k} ${cx - radius} ${cy} c ${cx - radius} ${cy - k} ${cx - k} ${cy - radius} ${cx} ${cy - radius} c ${cx + k} ${cy - radius} ${cx + radius} ${cy - k} ${cx + radius} ${cy} c ${fill ? "f" : "S"}`);
}

function mapPoint(x: number, y: number): { x: number; y: number } {
  return { x: MAP_X + (x / 1000) * MAP_SIZE, y: MAP_Y + MAP_SIZE - (y / 1000) * MAP_SIZE };
}

function mapStar(content: string[], star: GuideMapStar, target: boolean): void {
  const point = mapPoint(star.x, star.y);
  const radius = Math.max(1.5, Math.min(5, 4.5 - star.magnitude));
  if (target) {
    circle(content, point.x, point.y, Math.max(7, radius + 5), false, 2.2);
    circle(content, point.x, point.y, Math.max(3.5, radius + 1), false, 0.9);
    circle(content, point.x, point.y, radius, true, 0.5);
    text(content, point.x - 2.2, point.y - 2.8, String(star.targetIndex ?? ""), 7, true);
    text(content, Math.max(MAP_X + 2, point.x - 20), Math.min(MAP_Y + MAP_SIZE - 4, point.y + 15), star.name, 7, true);
  } else {
    circle(content, point.x, point.y, radius, true, 0.5);
    if (star.magnitude <= 1.5) {
      text(content, Math.max(MAP_X + 2, point.x - 14), Math.min(MAP_Y + MAP_SIZE - 3, point.y + 11), star.name, 6, false);
    }
  }
}

function makeContent(model: ObservationGuideModel): string {
  const content: string[] = ["q", "1 1 1 rg", "0 0 595.28 841.89 re f", "0 0 0 RG", "0 0 0 rg"];
  text(content, 36, 808, "STAR OBSERVATION GUIDE", 9, true);
  text(content, 36, 785, model.descriptor.title, 19, true);
  text(content, 36, 765, `Date: ${formatGuideDate(model.dateTime, model.descriptor.timeZone)}   Time: ${formatGuideTimeRange(model.dateTime, model.descriptor.durationMinutes, model.descriptor.timeZone)}`, 8);
  text(content, 36, 751, `Time zone: ${model.descriptor.timeZone}`, 8);
  text(content, 36, 737, `Location: ${model.site.name} (${model.site.latitude.toFixed(2)}, ${model.site.longitude.toFixed(2)})`, 8);
  text(content, 36, 723, `Direction: ${model.primaryDirection}   Duration: ${model.descriptor.durationMinutes} minutes`, 8);
  line(content, 36, 711, 559, 711, 1.2);

  text(content, 36, 692, "MISSION SKY SNAPSHOT", 9, true);
  circle(content, MAP_X + MAP_SIZE / 2, MAP_Y + MAP_SIZE / 2, MAP_SIZE * 0.44, false, 1.4);
  text(content, MAP_X + MAP_SIZE / 2 - 3, MAP_Y + MAP_SIZE - 8, "N", 10, true);
  text(content, MAP_X - 3, MAP_Y + MAP_SIZE / 2 - 3, "E", 10, true);
  text(content, MAP_X + MAP_SIZE / 2 - 3, MAP_Y - 16, "S", 10, true);
  text(content, MAP_X + MAP_SIZE - 3, MAP_Y + MAP_SIZE / 2 - 3, "W", 10, true);
  text(content, MAP_X + MAP_SIZE / 2 - 13, MAP_Y + MAP_SIZE / 2 - 4, "Zenith", 7);
  text(content, MAP_X + MAP_SIZE / 2 - 17, MAP_Y + 3, "Horizon", 7);
  for (const item of model.skySnapshot.constellationLines) {
    const start = mapPoint(item.x1, item.y1);
    const end = mapPoint(item.x2, item.y2);
    content.push("0.35 0.35 0.35 RG");
    line(content, start.x, start.y, end.x, end.y, 0.35);
    content.push("0 0 0 RG");
  }
  for (const star of model.skySnapshot.referenceStars) mapStar(content, star, false);
  for (const star of model.skySnapshot.targetStars) mapStar(content, star, true);
  text(content, 36, 342, "Hold the chart overhead and place the direction you face at the bottom.", 7);
  line(content, 36, 330, 559, 330, 0.8);
  text(content, 36, 313, "OBSERVATION TARGETS", 9, true);

  let rowY = 292;
  for (const target of model.targets) {
    text(content, 36, rowY, `${target.index}. ${target.name}`, 9, true);
    text(content, 190, rowY, `Mag ${target.magnitude.toFixed(2)}   Alt ${Math.round(target.altitude)} deg   ${target.direction}   ${target.difficulty}`, 7);
    let checkX = 36;
    const options = ["Visible", "Not Visible", "Unsure"];
    for (const option of options) {
      rect(content, checkX, rowY - 16, 9, 9, false, true);
      text(content, checkX + 13, rowY - 14, option, 7);
      checkX += option === "Not Visible" ? 105 : 78;
    }
    line(content, 36, rowY - 24, 559, rowY - 24, 0.35);
    rowY -= 42;
  }
  text(content, 36, 72, "NOTES", 9, true);
  text(content, 36, 54, "Weather:", 8);
  line(content, 90, 52, 559, 52, 0.6);
  text(content, 36, 34, "What did you notice?", 8);
  line(content, 140, 32, 559, 32, 0.6);
  line(content, 36, 15, 559, 15, 0.6);
  content.push("Q");
  return content.join("\n") + "\n";
}

function pdfDocument(content: string): Uint8Array {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];
  let output = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(output.length);
    output += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = output.length;
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new TextEncoder().encode(output);
}

export function guidePdfFileName(model: ObservationGuideModel): string {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: model.descriptor.timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(model.dateTime));
  const parts = Object.fromEntries(date.map((part) => [part.type, part.value]));
  const dateKey = parts.year && parts.month && parts.day ? `${parts.year}${parts.month}${parts.day}` : "unknown";
  return `observation-guide-${dateKey}.pdf`;
}

export function buildObservationGuidePdf(model: ObservationGuideModel): Uint8Array {
  return pdfDocument(makeContent(model));
}

export function createObservationGuidePdfArtifact(model: ObservationGuideModel): GuidePdfArtifact {
  return {
    blob: new Blob([buildObservationGuidePdf(model)], { type: "application/pdf" }),
    fileName: guidePdfFileName(model),
  };
}

export function startGuidePdfDownload(artifact: GuidePdfArtifact): string {
  if (typeof window === "undefined" || typeof URL === "undefined" || typeof document === "undefined") {
    throw new Error("PDF download is only available in a browser");
  }
  const url = URL.createObjectURL(artifact.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = artifact.fileName;
  anchor.rel = "noopener";
  anchor.click();
  return url;
}
