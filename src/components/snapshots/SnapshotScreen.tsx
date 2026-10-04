import { useEffect, useState } from "react";
import { useSnapshots } from "../../state/snapshots";
import { useLocale, intlLocale } from "../../i18n";

function SnapshotThumbnail({ snapshotId }: { snapshotId: string }) {
  const { getSnapshot } = useSnapshots();
  const { t } = useLocale();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    void getSnapshot(snapshotId).then((record) => {
      if (cancelled || record === null) return;
      objectUrl = URL.createObjectURL(record.blob);
      setUrl(objectUrl);
    }).catch(() => {
      if (!cancelled) setUrl(null);
    });
    return () => {
      cancelled = true;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [getSnapshot, snapshotId]);

  return url === null
    ? <div className="snapshot-thumbnail placeholder">{t("snap.loading")}</div>
    : <img className="snapshot-thumbnail" src={url} alt={t("snap.alt")} />;
}

export function SnapshotScreen() {
  const { snapshots, selectedSnapshotId, downloadSnapshot, removeSnapshot, isCloudSnapshot } = useSnapshots();
  const { t, locale } = useLocale();
  const [error, setError] = useState<string | null>(null);

  const remove = (snapshotId: string) => {
    setError(null);
    void removeSnapshot(snapshotId).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : t("snap.deleteFailed"));
    });
  };

  return (
    <main className="snapshot-screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">{t("snap.eyebrow")}</p>
          <h2>{t("snap.title")}</h2>
          <p className="screen-lead">{t("snap.lead")}</p>
        </div>
        <span className="status-badge">{t("snap.count", { count: snapshots.length })}</span>
      </div>
      {snapshots.length === 0 ? (
        <section className="empty-state">
          <h3>{t("snap.empty")}</h3>
          <p>{t("snap.emptyHint")}</p>
        </section>
      ) : (
        <div className="snapshot-grid">
          {snapshots.map((snapshot) => (
            <article className={snapshot.snapshotId === selectedSnapshotId ? "snapshot-card selected" : "snapshot-card"} key={snapshot.snapshotId}>
              <SnapshotThumbnail snapshotId={snapshot.snapshotId} />
              <div className="snapshot-card-topline">
                <strong>{snapshot.site.name}</strong>
                <time dateTime={snapshot.createdAt}>{new Date(snapshot.createdAt).toLocaleString(intlLocale(locale))}</time>
              </div>
              <p>{snapshot.fileName}</p>
              {snapshot.missionId && <p className="snapshot-mission-id">{t("snap.mission", { id: snapshot.missionId })}</p>}
              <dl className="snapshot-meta">
                <div><dt>{t("snap.dateTime")}</dt><dd>{new Date(snapshot.dateTime).toLocaleString(intlLocale(locale))}</dd></div>
                <div><dt>{t("snap.direction")}</dt><dd>{snapshot.view.azimuth.toFixed(0)}° / Alt {snapshot.view.altitude.toFixed(0)}°</dd></div>
                <div><dt>{t("snap.fieldOfView")}</dt><dd>{snapshot.view.fieldOfView.toFixed(0)}°</dd></div>
                <div><dt>{t("snap.image")}</dt><dd>{snapshot.width} × {snapshot.height}</dd></div>
              </dl>
              <div className="btn-row">
                <button type="button" onClick={() => void downloadSnapshot(snapshot.snapshotId)}>{t("snap.download")}</button>
                {!isCloudSnapshot(snapshot.snapshotId) && <button type="button" onClick={() => remove(snapshot.snapshotId)}>{t("snap.delete")}</button>}
              </div>
              {isCloudSnapshot(snapshot.snapshotId) && <span className="snapshot-cloud-badge">{t("snap.cloudBadge")}</span>}
            </article>
          ))}
        </div>
      )}
      {error && <p className="cloud-error" role="alert">{error}</p>}
    </main>
  );
}
