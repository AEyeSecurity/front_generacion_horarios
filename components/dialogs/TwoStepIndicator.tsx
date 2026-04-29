"use client";

type Props = {
  step: 1 | 2;
  canGoStep2?: boolean;
  onStepChange: (step: 1 | 2) => void;
  className?: string;
};

const stepCircleBase =
  "w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-semibold transition-colors";

export default function TwoStepIndicator({ step, canGoStep2 = true, onStepChange, className = "" }: Props) {
  return (
    <div className={`flex items-center justify-center gap-2 select-none ${className}`}>
      <button
        type="button"
        onClick={() => onStepChange(1)}
        className={`${stepCircleBase} ${
          step === 1
            ? "bg-black text-white border-black shadow-[0_0_0_3px_rgba(0,0,0,0.18)]"
            : "bg-black text-white border-black"
        }`}
        aria-label="Go to step 1"
      >
        1
      </button>

      <div className={`h-0.5 w-12 ${step === 2 ? "bg-black" : "bg-gray-300"}`} />

      <button
        type="button"
        onClick={() => onStepChange(2)}
        disabled={!canGoStep2}
        className={`${stepCircleBase} ${
          step === 2
            ? "bg-black text-white border-black shadow-[0_0_0_3px_rgba(0,0,0,0.18)]"
            : "bg-white text-gray-500 border-gray-300"
        } disabled:opacity-40`}
        aria-label="Go to step 2"
      >
        2
      </button>
    </div>
  );
}
