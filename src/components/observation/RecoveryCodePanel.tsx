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
          <h2 id="recovery-code-title">Store your Recovery Code</h2>
        </div>
      </div>
      <p>Use this code to restore the Mission on another device. It will not be shown again after this panel is closed.</p>
      <div className="recovery-code-value" aria-label="Mission Recovery Code">
        <code>{recoveryCode}</code>
        <button type="button" onClick={() => void copyCode()}>Copy</button>
      </div>
      {copyState === "copied" && <p className="recovery-code-status" role="status">Recovery Code copied.</p>}
      {copyState === "failed" && <p className="cloud-error" role="alert">Could not copy the code. Save it manually in a secure place.</p>}
      <p className="workflow-note">Anyone with this code can view and update the Mission. Share it carefully.</p>
      <button type="button" className="recovery-code-dismiss" onClick={clearRecoveryCode}>Acknowledge and close</button>
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
      setError("This Recovery Code is invalid or unavailable.");
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
          <h2 id="restore-mission-title">Restore Mission with a Recovery Code</h2>
        </div>
      </div>
      <p>Enter a Recovery Code issued on another device to add that Mission to your history.</p>
      <div className="recovery-restore-form">
        <label htmlFor="mission-recovery-code">Recovery Code</label>
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
            {restoring ? "Restoring…" : "Restore Mission"}
          </button>
        </div>
      </div>
      {error && <p className="cloud-error" role="alert">{error}</p>}
    </section>
  );
}

function recoveryErrorMessage(error: unknown): string {
  if (error instanceof CloudApplicationError) {
    if (error.code === "RESTORE_CODE_INVALID") return "This Recovery Code is invalid or unavailable.";
    if (error.code === "CLOUD_NOT_CONFIGURED") return "Mission restoration is unavailable because cloud storage is not configured.";
  }
  return "Could not restore the Mission. Please try again later.";
}
