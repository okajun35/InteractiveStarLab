import type { ObservationStatus } from "../../types/observation";
import { useLocale, type MessageKey } from "../../i18n";

interface ObservationStatusInputProps {
  starId: string;
  status: ObservationStatus | undefined;
  onChange: (status: ObservationStatus) => void;
}

const OPTIONS: Array<{ status: ObservationStatus; labelKey: MessageKey }> = [
  { status: "visible", labelKey: "status.visible" },
  { status: "not_visible", labelKey: "status.notVisible" },
  { status: "unsure", labelKey: "status.unsure" },
];

export function ObservationStatusInput({
  starId,
  status,
  onChange,
}: ObservationStatusInputProps) {
  const { t } = useLocale();
  return (
    <div className="observation-status" role="group" aria-label={t("status.resultAria", { name: starId })}>
      {OPTIONS.map((option) => (
        <button
          key={option.status}
          type="button"
          className={status === option.status ? "status-btn active" : "status-btn"}
          aria-pressed={status === option.status}
          onClick={() => onChange(option.status)}
        >
          {t(option.labelKey)}
        </button>
      ))}
    </div>
  );
}
