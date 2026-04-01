"use client";

type Props = {
  step: 1 | 2;
  disabled?: boolean;
  onToggle: () => void;
  className?: string;
};

export default function StepNavButton({ step, disabled = false, onToggle, className = "" }: Props) {
  return (
    <button
      type="button"
      className={`h-9 w-9 rounded-full border text-sm flex items-center justify-center hover:bg-gray-50 disabled:opacity-40 ${className}`}
      onClick={onToggle}
      disabled={disabled}
      aria-label={step === 1 ? "Go to Staffing" : "Go to Basic Data"}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
        {step === 1 ? (
          <path
            d="M9 6l6 6-6 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M15 6l-6 6 6 6"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
    </button>
  );
}

