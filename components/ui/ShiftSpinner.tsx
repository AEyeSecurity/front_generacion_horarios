"use client";

type ShiftSpinnerProps = {
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
};

const SIZE_CLASS: Record<NonNullable<ShiftSpinnerProps["size"]>, string> = {
  sm: "h-8 w-8",
  md: "h-12 w-12",
  lg: "h-16 w-16",
};

export default function ShiftSpinner({ size = "md", label, className = "" }: ShiftSpinnerProps) {
  const accessibleLabel = label?.trim() || "Loading";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center gap-3 text-center ${className}`}
    >
      {}
      <style>{`
        @keyframes spinFastAndPause {
          0% { transform: rotate(0deg); }
          33.33% { transform: rotate(360deg); } /* Gira en 0.25s */
          100% { transform: rotate(360deg); }    /* Se queda quieto 0.5s */
        }
        .animate-spin-custom {
          animation: spinFastAndPause 0.75s ease-in-out infinite;
        }
      `}</style>

      <img
        src="/shift_min.png"
        alt=""
        aria-hidden="true"
        className={`${SIZE_CLASS[size]} animate-spin-custom object-contain motion-reduce:animate-none`}
      />
      <span className="sr-only">{accessibleLabel}</span>
      {label ? <span className="text-sm font-medium text-gray-500">{label}</span> : null}
    </div>
  );
}