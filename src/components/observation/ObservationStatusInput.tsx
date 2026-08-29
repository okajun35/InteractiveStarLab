import type { ObservationStatus } from "../../types/observation";

interface ObservationStatusInputProps {
  starId: string;
  status: ObservationStatus | undefined;
  onChange: (status: ObservationStatus) => void;
}

const OPTIONS: Array<{ status: ObservationStatus; en: string; ja: string }> = [
  { status: "visible", en: "Visible", ja: "見えた" },
  { status: "not_visible", en: "Not Visible", ja: "見えなかった" },
  { status: "unsure", en: "Unsure", ja: "わからない" },
];

export function ObservationStatusInput({
  starId,
  status,
  onChange,
}: ObservationStatusInputProps) {
  return (
    <div className="observation-status" role="group" aria-label={`${starId}の観測結果`}>
      {OPTIONS.map((option) => (
        <button
          key={option.status}
          type="button"
          className={status === option.status ? "status-btn active" : "status-btn"}
          aria-pressed={status === option.status}
          onClick={() => onChange(option.status)}
        >
          <span className="en">{option.en}</span>
          {option.ja}
        </button>
      ))}
    </div>
  );
}
