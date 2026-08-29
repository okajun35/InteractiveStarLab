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
          <section className="workflow-card workflow-empty-card" aria-label="観測ガイドなし">
            <span className="en">Observation guide</span>
            <h1>観測ガイドがありません</h1>
            <p>先にMissionを作成してから観測ガイドを準備してください。</p>
            <button type="button" className="primary" onClick={onOpenObserve}>観測画面へ戻る</button>
          </section>
        </div>
      </main>
    );
  }

  const printGuide = () => window.print();
  const generatePdf = async () => {
    try {
      const result = await onGeneratePdf();
      setPdfStatus(result ? `保存しました: ${result.fileName}` : "PDFを生成できませんでした");
    } catch {
      setPdfStatus("PDFを生成できませんでした");
    }
  };
  return (
    <main className="guide-page">
      <div className="guide-actions screen-only">
        <button type="button" className="primary" onClick={() => void generatePdf()}>PDFを直接保存</button>
        <button type="button" className="primary" onClick={printGuide}>印刷 / PDF保存</button>
        <button type="button" onClick={onOpenObserve}>観測画面へ戻る</button>
        <span>「PDFを直接保存」は印刷ダイアログを使わずに保存します。</span>
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
            <h2 id="guide-snapshot-title">Mission日時の星空</h2>
          </div>
          <MissionSkySnapshot snapshot={guide.skySnapshot} />
        </section>
        <GuideTargetTable targets={guide.targets} />
        <GuideNotes />
      </article>
    </main>
  );
}
