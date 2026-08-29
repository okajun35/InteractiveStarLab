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
    ? <div className="snapshot-thumbnail placeholder">画像を読み込み中…</div>
    : <img className="snapshot-thumbnail" src={url} alt="保存した星空" />;
}

export function SnapshotScreen() {
  const { snapshots, selectedSnapshotId, downloadSnapshot, removeSnapshot, isCloudSnapshot } = useSnapshots();
  const [error, setError] = useState<string | null>(null);

  const remove = (snapshotId: string) => {
    setError(null);
    void removeSnapshot(snapshotId).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "Snapshotを削除できませんでした。");
    });
  };

  return (
    <main className="snapshot-screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">SKY SNAPSHOTS</p>
          <h2>保存した星空</h2>
          <p className="screen-lead">撮影時点の星空画像と、観測条件のメタデータを確認できます。</p>
        </div>
        <span className="status-badge">{snapshots.length}件</span>
      </div>
      {snapshots.length === 0 ? (
        <section className="empty-state">
          <h3>まだSnapshotがありません</h3>
          <p>Sky画面の「Snapshot」ボタン、またはMCPのcapture_sky_snapshotを使って保存してください。</p>
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
                <div><dt>観測日時</dt><dd>{new Date(snapshot.dateTime).toLocaleString()}</dd></div>
                <div><dt>方向</dt><dd>{snapshot.view.azimuth.toFixed(0)}° / 高度 {snapshot.view.altitude.toFixed(0)}°</dd></div>
                <div><dt>視野角</dt><dd>{snapshot.view.fieldOfView.toFixed(0)}°</dd></div>
                <div><dt>画像</dt><dd>{snapshot.width} × {snapshot.height}</dd></div>
              </dl>
              <div className="btn-row">
                <button type="button" onClick={() => void downloadSnapshot(snapshot.snapshotId)}>再ダウンロード</button>
                {!isCloudSnapshot(snapshot.snapshotId) && <button type="button" onClick={() => remove(snapshot.snapshotId)}>削除</button>}
              </div>
              {isCloudSnapshot(snapshot.snapshotId) && <span className="snapshot-cloud-badge">Cloud保存・不変</span>}
            </article>
          ))}
        </div>
      )}
      {error && <p className="cloud-error" role="alert">{error}</p>}
    </main>
  );
}
