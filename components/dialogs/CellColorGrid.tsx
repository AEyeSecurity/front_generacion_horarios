"use client";

import { CELL_COLOR_OPTIONS_NO_RED as COLOR_OPTIONS } from "@/lib/cell-colors";

type CellColorGridProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  label: string;
  noColorLabel: string;
  selectColorLabel: string;
};

const optionClassName =
  "flex h-9 w-9 items-center justify-center justify-self-center rounded-full border text-sm text-gray-500 transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2";

export default function CellColorGrid({
  value,
  onChange,
  label,
  noColorLabel,
  selectColorLabel,
}: CellColorGridProps) {
  return (
    <fieldset className="min-w-0">
      <legend className="sr-only">{label}</legend>
      <div className="mx-auto grid w-full max-w-sm grid-cols-5 items-center gap-x-2 gap-y-3">
        <div aria-hidden="true" className="col-span-3 pr-2 text-right text-sm">
          {label}
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          className={`${optionClassName} bg-white ${
            value === null ? "border-black ring-2 ring-black" : "border-gray-300"
          }`}
          aria-label={noColorLabel}
          aria-pressed={value === null}
          title={noColorLabel}
        >
          /
        </button>
        {COLOR_OPTIONS.map((hex) => (
          <button
            key={hex}
            type="button"
            onClick={() => onChange(hex)}
            className={`${optionClassName} ${
              value === hex ? "border-black ring-2 ring-black" : "border-gray-300"
            }`}
            style={{ backgroundColor: hex }}
            aria-label={`${selectColorLabel}: ${hex}`}
            aria-pressed={value === hex}
            title={`${selectColorLabel}: ${hex}`}
          />
        ))}
      </div>
    </fieldset>
  );
}
