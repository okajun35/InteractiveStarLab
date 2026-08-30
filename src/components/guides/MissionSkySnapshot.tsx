import { GUIDE_HORIZON_RADIUS, guideStarRadius } from "../../guides/skyProjection";
import type { MissionSkySnapshotModel } from "../../guides/types";
import { GUIDE_REFERENCE_LABEL_MAX_MAGNITUDE } from "../../guides/missionSkySnapshot";

export function MissionSkySnapshot({ snapshot }: { snapshot: MissionSkySnapshotModel }) {
  return (
    <figure className="guide-sky-figure">
      <svg
        className="guide-sky-map"
        viewBox={`0 0 ${snapshot.width} ${snapshot.height}`}
        role="img"
        aria-label="All-sky chart for the Mission date and time"
      >
        <rect x="0" y="0" width={snapshot.width} height={snapshot.height} className="guide-sky-background" />
        <circle cx="500" cy="500" r={GUIDE_HORIZON_RADIUS} className="guide-sky-horizon" />
        <circle cx="500" cy="500" r="5" className="guide-sky-zenith-dot" />
        <text x="500" y="38" textAnchor="middle" className="guide-sky-compass">N</text>
        <text x="38" y="508" textAnchor="middle" className="guide-sky-compass">E</text>
        <text x="500" y="974" textAnchor="middle" className="guide-sky-compass">S</text>
        <text x="962" y="508" textAnchor="middle" className="guide-sky-compass">W</text>
        <text x="500" y="520" textAnchor="middle" className="guide-sky-zenith-label">Zenith</text>
        <text x="500" y="966" textAnchor="middle" className="guide-sky-horizon-label">Horizon</text>

        <g className="guide-sky-constellation-lines" aria-hidden="true">
          {snapshot.constellationLines.map((line, index) => (
            <line key={`${line.constellationId}-${index}`} x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} />
          ))}
        </g>

        <g className="guide-sky-reference-stars">
          {snapshot.referenceStars.map((star) => (
            <g key={star.starId}>
              <circle cx={star.x} cy={star.y} r={guideStarRadius(star.magnitude)} />
              {star.magnitude <= GUIDE_REFERENCE_LABEL_MAX_MAGNITUDE && (
                <text x={star.x} y={star.y - guideStarRadius(star.magnitude) - 8} textAnchor="middle">
                  {star.name}
                </text>
              )}
            </g>
          ))}
        </g>

        <g className="guide-sky-target-stars">
          {snapshot.targetStars.map((star) => {
            const radius = Math.max(guideStarRadius(star.magnitude) + 8, 14);
            return (
              <g key={star.starId}>
                <circle cx={star.x} cy={star.y} r={radius} className="guide-sky-target-ring-outer" />
                <circle cx={star.x} cy={star.y} r={radius - 5} className="guide-sky-target-ring-inner" />
                <circle cx={star.x} cy={star.y} r={guideStarRadius(star.magnitude) + 1} className="guide-sky-target-dot" />
                <text x={star.x} y={star.y + 5} textAnchor="middle" className="guide-sky-target-index">
                  {star.targetIndex}
                </text>
                <text x={star.x} y={star.y - radius - 8} textAnchor="middle" className="guide-sky-target-label">
                  {star.name}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <figcaption>Hold the chart overhead and place the direction you face at the bottom.</figcaption>
    </figure>
  );
}
