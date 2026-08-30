import { useEffect, useState } from "react";
import { useSnapshots } from "../../state/snapshots";

function SnapshotThumbnail({ snapshotId }: { snapshotId: string }) {
  const { getSnapshot } = useSnapshots();
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
    ? <div className="snapshot-thumbnail placeholder">Loading image…</div>
    : <img className="snapshot-thumbnail" src={url} alt="Saved sky snapshot" />;
}

export function SnapshotScreen() {
  const { snapshots, selectedSnapshotId, downloadSnapshot, removeSnapshot, isCloudSnapshot } = useSnapshots();
  const [error, setError] = useState<string | null>(null);

  const remove = (snapshotId: string) => {
    setError(null);
    void removeSnapshot(snapshotId).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Could not delete the Snapshot.");
    });
  };

  return (
    <main className="snapshot-screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">SKY SNAPSHOTS</p>
          <h2>Saved sky snapshots</h2>
          <p className="screen-lead">Review sky images and observation metadata captured at that time.</p>
        </div>
        <span className="status-badge">{snapshots.length} snapshots</span>
      </div>
      {snapshots.length === 0 ? (
        <section className="empty-state">
          <h3>No Snapshots yet</h3>
          <p>Use the Snapshot button on Sky or the MCP tool <code>capture_sky_snapshot</code> to save one.</p>
        </section>
      ) : (
        <div className="snapshot-grid">
          {snapshots.map((snapshot) => (
            <article className={snapshot.snapshotId === selectedSnapshotId ? "snapshot-card selected" : "snapshot-card"} key={snapshot.snapshotId}>
              <SnapshotThumbnail snapshotId={snapshot.snapshotId} />
              <div className="snapshot-card-topline">
                <strong>{snapshot.site.name}</strong>
                <time dateTime={snapshot.createdAt}>{new Date(snapshot.createdAt).toLocaleString()}</time>
              </div>
              <p>{snapshot.fileName}</p>
              {snapshot.missionId && <p className="snapshot-mission-id">Mission: {snapshot.missionId}</p>}
              <dl className="snapshot-meta">
                <div><dt>Date and time</dt><dd>{new Date(snapshot.dateTime).toLocaleString()}</dd></div>
                <div><dt>Direction</dt><dd>{snapshot.view.azimuth.toFixed(0)}° / Alt {snapshot.view.altitude.toFixed(0)}°</dd></div>
                <div><dt>Field of view</dt><dd>{snapshot.view.fieldOfView.toFixed(0)}°</dd></div>
                <div><dt>Image</dt><dd>{snapshot.width} × {snapshot.height}</dd></div>
              </dl>
              <div className="btn-row">
                <button type="button" onClick={() => void downloadSnapshot(snapshot.snapshotId)}>Download again</button>
                {!isCloudSnapshot(snapshot.snapshotId) && <button type="button" onClick={() => remove(snapshot.snapshotId)}>Delete</button>}
              </div>
              {isCloudSnapshot(snapshot.snapshotId) && <span className="snapshot-cloud-badge">Cloud saved · immutable</span>}
            </article>
          ))}
        </div>
      )}
      {error && <p className="cloud-error" role="alert">{error}</p>}
    </main>
  );
}
