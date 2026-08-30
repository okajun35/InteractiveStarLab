import type { ObservationStatus } from "../../types/observation";

interface ObservationStatusInputProps {
  starId: string;
  status: ObservationStatus | undefined;
  onChange: (status: ObservationStatus) => void;
}

const OPTIONS: Array<{ status: ObservationStatus; label: string }> = [
  { status: "visible", label: "Visible" },
  { status: "not_visible", label: "Not Visible" },
  { status: "unsure", label: "Unsure" },
];

export function ObservationStatusInput({
  starId,
  status,
  onChange,
}: ObservationStatusInputProps) {
  return (
    <div className="observation-status" role="group" aria-label={`${starId} observation result`}>
      {OPTIONS.map((option) => (
        <button
          key={option.status}
          type="button"
          className={status === option.status ? "status-btn active" : "status-btn"}
          aria-pressed={status === option.status}
          onClick={() => onChange(option.status)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
