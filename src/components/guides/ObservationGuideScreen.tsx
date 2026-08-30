import { useEffect, useState } from "react";
import { formatGuideDate, formatGuideTimeRange } from "../../guides/time";
import type { ObservationGuideModel } from "../../guides/types";
import { MissionSkySnapshot } from "./MissionSkySnapshot";
import { GuideNotes } from "./GuideNotes";
import { GuideTargetTable } from "./GuideTargetTable";

interface ObservationGuideScreenProps {
  guide: ObservationGuideModel | null;
  onOpenObserve: () => void;
  onGeneratePdf: () => Promise<{ fileName: string } | null>;
}

export function ObservationGuideScreen({ guide, onOpenObserve, onGeneratePdf }: ObservationGuideScreenProps) {
  const [pdfStatus, setPdfStatus] = useState<string | null>(null);
  useEffect(() => {
    if (!guide) return;
    const previousTitle = document.title;
    document.title = guide.descriptor.title;
    return () => { document.title = previousTitle; };
  }, [guide]);

  if (guide === null) {
    return (
      <main className="workflow-page">
        <div className="workflow-container workflow-empty-page">
          <section className="workflow-card workflow-empty-card" aria-label="No observation guide">
            <span className="en">Observation guide</span>
            <h1>No observation guide</h1>
            <p>Create a Mission first, then prepare an observation guide.</p>
            <button type="button" className="primary" onClick={onOpenObserve}>Back to Observe</button>
          </section>
        </div>
      </main>
    );
  }

  const printGuide = () => window.print();
  const generatePdf = async () => {
    try {
      const result = await onGeneratePdf();
      setPdfStatus(result ? `Saved: ${result.fileName}` : "Could not generate the PDF");
    } catch {
      setPdfStatus("Could not generate the PDF");
    }
  };
  return (
    <main className="guide-page">
      <div className="guide-actions screen-only">
        <button type="button" className="primary" onClick={() => void generatePdf()}>Save PDF directly</button>
        <button type="button" className="primary" onClick={printGuide}>Print / save PDF</button>
        <button type="button" onClick={onOpenObserve}>Back to Observe</button>
        <span>Direct PDF saving does not open the print dialog.</span>
        {pdfStatus && <span role="status">{pdfStatus}</span>}
      </div>
      <article className="observation-guide" aria-label="Observation Guide">
        <header className="guide-header">
          <p className="guide-kicker">STAR OBSERVATION GUIDE</p>
          <h1>{guide.descriptor.title}</h1>
          <div className="guide-meta-grid">
            <div><span>Date</span><strong>{formatGuideDate(guide.dateTime, guide.descriptor.timeZone)}</strong></div>
            <div><span>Time</span><strong>{formatGuideTimeRange(guide.dateTime, guide.descriptor.durationMinutes, guide.descriptor.timeZone)}</strong></div>
            <div><span>Time zone</span><strong>{guide.timeZoneLabel}</strong></div>
            <div><span>Location</span><strong>{guide.locationText}</strong></div>
            <div><span>Direction</span><strong>{guide.primaryDirection}</strong></div>
          </div>
        </header>
        <section className="guide-snapshot-section" aria-labelledby="guide-snapshot-title">
          <div className="guide-section-heading">
            <span className="en">Mission sky snapshot</span>
            <h2 id="guide-snapshot-title">Mission sky at the observation time</h2>
          </div>
          <MissionSkySnapshot snapshot={guide.skySnapshot} />
        </section>
        <GuideTargetTable targets={guide.targets} />
        <GuideNotes />
      </article>
    </main>
  );
}
