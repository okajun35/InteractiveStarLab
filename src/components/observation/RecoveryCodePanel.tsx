import { useState } from "react";
import type { ObservationMission } from "../../types/observation";
import { CloudApplicationError } from "../../cloud/errors";
import { normalizeRecoveryCode } from "../../cloud/recoveryCode";

interface RecoveryCodePanelProps {
  recoveryCode: string;
  clearRecoveryCode: () => void;
}

export function RecoveryCodePanel({ recoveryCode, clearRecoveryCode }: RecoveryCodePanelProps) {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const copyCode = async () => {
    try {
      if (!navigator.clipboard) throw new Error("Clipboard API is unavailable");
      await navigator.clipboard.writeText(recoveryCode);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <section className="recovery-code-panel" aria-labelledby="recovery-code-title">
      <div className="workflow-card-heading">
        <div>
          <span className="en">Mission recovery code</span>
          <h2 id="recovery-code-title">復元コードを保管してください</h2>
        </div>
      </div>
      <p>別の端末でこのMissionを復元するためのコードです。画面を閉じると再表示できません。</p>
      <div className="recovery-code-value" aria-label="Mission復元コード">
        <code>{recoveryCode}</code>
        <button type="button" onClick={() => void copyCode()}>コピー</button>
      </div>
      {copyState === "copied" && <p className="recovery-code-status" role="status">復元コードをコピーしました。</p>}
      {copyState === "failed" && <p className="cloud-error" role="alert">コピーできませんでした。コードを安全な場所へ手動で保存してください。</p>}
      <p className="workflow-note">このコードを知っている人はMissionを閲覧・更新できます。共有には注意してください。</p>
      <button type="button" className="recovery-code-dismiss" onClick={clearRecoveryCode}>確認して閉じる</button>
    </section>
  );
}

interface RecoveryMissionFormProps {
  restoreMission: (recoveryCode: string) => Promise<ObservationMission>;
  onRestored: (mission: ObservationMission) => void;
}

export function RecoveryMissionForm({ restoreMission, onRestored }: RecoveryMissionFormProps) {
  const [recoveryCodeInput, setRecoveryCodeInput] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (normalizeRecoveryCode(recoveryCodeInput) === null) {
      setError("復元コードが正しくないか、利用できません。");
      return;
    }
    setRestoring(true);
    setError(null);
    void restoreMission(recoveryCodeInput).then((mission) => {
      setRecoveryCodeInput("");
      onRestored(mission);
    }).catch((restoreError: unknown) => {
      setError(recoveryErrorMessage(restoreError));
    }).finally(() => setRestoring(false));
  };

  return (
    <section className="workflow-card recovery-restore-card" aria-labelledby="restore-mission-title">
      <div className="workflow-card-heading">
        <div>
          <span className="en">Restore a Mission</span>
          <h2 id="restore-mission-title">復元コードからMissionを復元</h2>
        </div>
      </div>
      <p>別端末で発行した復元コードを入力すると、そのMissionだけを履歴へ追加できます。</p>
      <div className="recovery-restore-form">
        <label htmlFor="mission-recovery-code">復元コード</label>
        <div className="recovery-restore-input-row">
          <input
            id="mission-recovery-code"
            type="text"
            value={recoveryCodeInput}
            onChange={(event) => {
              setRecoveryCodeInput(event.target.value);
              setError(null);
            }}
            placeholder="ISL-1234-ABCD-…"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="primary" disabled={restoring || recoveryCodeInput.trim() === ""} onClick={submit}>
            {restoring ? "復元中…" : "Missionを復元"}
          </button>
        </div>
      </div>
      {error && <p className="cloud-error" role="alert">{error}</p>}
    </section>
  );
}

function recoveryErrorMessage(error: unknown): string {
  if (error instanceof CloudApplicationError) {
    if (error.code === "RESTORE_CODE_INVALID") return "復元コードが正しくないか、利用できません。";
    if (error.code === "CLOUD_NOT_CONFIGURED") return "Cloud保存が設定されていないため復元できません。";
  }
  return "Missionを復元できませんでした。時間をおいて再試行してください。";
}
