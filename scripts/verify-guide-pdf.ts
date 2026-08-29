import { createObservationMission } from "../src/observation/mission";
import { buildObservationGuideModel, createGuideDescriptor } from "../src/guides/model";
import { buildObservationGuidePdf, guidePdfFileName } from "../src/guides/pdf";

let failures = 0;
function check(name: string, condition: boolean, detail = ""): void {
  console.log(`${condition ? "PASS" : "FAIL"}  ${name}${detail ? ` (${detail})` : ""}`);
  if (!condition) failures += 1;
}
const mission = createObservationMission({
  site: { id: "home", name: "Home", latitude: 35.68, longitude: 139.76 },
  dateTime: "2026-08-29T11:00:00.000Z", maxMagnitude: 2,
  targets: [
    { starId: "vega", predictedVisible: true, predictedAltitude: 62, predictedAzimuth: 285, predictedMagnitude: 0.03 },
    { starId: "altair", predictedVisible: true, predictedAltitude: 48, predictedAzimuth: 160, predictedMagnitude: 0.77 },
    { starId: "deneb", predictedVisible: true, predictedAltitude: 41, predictedAzimuth: 320, predictedMagnitude: 1.25 },
  ],
}, { id: () => "mission-pdf-1", now: new Date("2026-08-29T11:01:00.000Z") });
const descriptor = createGuideDescriptor({ mission, timeZone: "Asia/Tokyo", now: new Date("2026-08-29T11:02:00.000Z") });
const guide = buildObservationGuideModel(mission, descriptor);
const pdf = buildObservationGuidePdf(guide);
const source = new TextDecoder().decode(pdf);
check("PDF has a valid header", source.startsWith("%PDF-1.4"));
check("PDF has one page", source.includes("/Count 1") && source.includes("/Type /Page"));
check("PDF includes mission snapshot vector content", source.includes("MISSION SKY SNAPSHOT") && source.includes("/MediaBox [0 0 595.28 841.89]"));
check("PDF includes all target names and checklist labels", source.includes("Vega") && source.includes("Altair") && source.includes("Deneb") && source.includes("Not Visible") && source.includes("Unsure"));
check("PDF has a stable file name", guidePdfFileName(guide) === "observation-guide-20260829.pdf");
check("PDF is non-empty", pdf.length > 3_000, `${pdf.length} bytes`);
if (failures > 0) process.exit(1);
