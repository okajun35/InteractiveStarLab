import { useState } from "react";
import type { ObservationMission } from "../../types/observation";
import { CloudApplicationError } from "../../cloud/errors";
import { normalizeRecoveryCode } from "../../cloud/recoveryCode";
import { useLocale } from "../../i18n";

interface RecoveryCodePanelProps {
  recoveryCode: string;
  clearRecoveryCode: () => void;
}

export function RecoveryCodePanel({ recoveryCode, clearRecoveryCode }: RecoveryCodePanelProps) {
  const { t } = useLocale();
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
          <span className="en">{t("recovery.kicker")}</span>
          <h2 id="recovery-code-title">{t("recovery.title")}</h2>
        </div>
      </div>
      <p>{t("recovery.body")}</p>
      <div className="recovery-code-value" aria-label={t("recovery.codeAria")}>
        <code>{recoveryCode}</code>
        <button type="button" onClick={() => void copyCode()}>{t("recovery.copy")}</button>
      </div>
      {copyState === "copied" && <p className="recovery-code-status" role="status">{t("recovery.copied")}</p>}
      {copyState === "failed" && <p className="cloud-error" role="alert">{t("recovery.copyFailed")}</p>}
      <p className="workflow-note">{t("recovery.shareNote")}</p>
      <button type="button" className="recovery-code-dismiss" onClick={clearRecoveryCode}>{t("recovery.dismiss")}</button>
    </section>
  );
}

interface RecoveryMissionFormProps {
  restoreMission: (recoveryCode: string) => Promise<ObservationMission>;
  onRestored: (mission: ObservationMission) => void;
}

export function RecoveryMissionForm({ restoreMission, onRestored }: RecoveryMissionFormProps) {
  const { t } = useLocale();
  const [recoveryCodeInput, setRecoveryCodeInput] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    if (normalizeRecoveryCode(recoveryCodeInput) === null) {
      setError(t("recovery.invalid"));
      return;
    }
    setRestoring(true);
    setError(null);
    void restoreMission(recoveryCodeInput).then((mission) => {
      setRecoveryCodeInput("");
      onRestored(mission);
    }).catch((restoreError: unknown) => {
      setError(recoveryErrorMessage(restoreError, t));
    }).finally(() => setRestoring(false));
  };

  return (
    <section className="workflow-card recovery-restore-card" aria-labelledby="restore-mission-title">
      <div className="workflow-card-heading">
        <div>
          <span className="en">{t("recovery.restoreKicker")}</span>
          <h2 id="restore-mission-title">{t("recovery.restoreTitle")}</h2>
        </div>
      </div>
      <p>{t("recovery.restoreBody")}</p>
      <div className="recovery-restore-form">
        <label htmlFor="mission-recovery-code">{t("recovery.codeLabel")}</label>
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
            {restoring ? t("recovery.restoring") : t("recovery.restore")}
          </button>
        </div>
      </div>
      {error && <p className="cloud-error" role="alert">{error}</p>}
    </section>
  );
}

function recoveryErrorMessage(error: unknown, t: ReturnType<typeof useLocale>["t"]): string {
  if (error instanceof CloudApplicationError) {
    if (error.code === "RESTORE_CODE_INVALID") return t("recovery.invalid");
    if (error.code === "CLOUD_NOT_CONFIGURED") return t("recovery.cloudMissing");
  }
  return t("recovery.failed");
}
