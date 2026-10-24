const cards = [
  { x: 90, y: -140, rotate: -2, opacity: "opacity-45" },
  { x: 60, y: -95, rotate: 1, opacity: "opacity-60" },
  { x: 30, y: -50, rotate: -1, opacity: "opacity-75" },
  { x: 0, y: 0, rotate: 0, opacity: "opacity-100" },
];

export default function CellsCardSkeleton() {
  return (
    <div className="relative h-[640px] overflow-hidden" aria-hidden="true">
      <div className="absolute left-1/2 top-1/2 h-[360px] w-[520px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2">
        <div className="relative h-full w-full animate-pulse">
          {cards.map((card, index) => (
            <div
              key={index}
              className={`absolute left-1/2 top-1/2 h-[200px] w-[350px] max-w-[78vw] rounded-xl border border-slate-200 bg-slate-100 shadow-lg ${card.opacity}`}
              style={{
                transform: `translate(calc(-50% + ${card.x}px), calc(-50% + ${card.y}px)) rotate(${card.rotate}deg)`,
              }}
            >
              {index === cards.length - 1 ? (
                <div className="flex h-full flex-col gap-4 p-5">
                  <div className="flex items-start justify-between gap-8">
                    <div className="h-5 w-40 rounded bg-slate-200" />
                    <div className="h-5 w-16 rounded bg-slate-200" />
                  </div>
                  <div className="h-7 w-28 rounded-md bg-slate-200" />
                  <div className="mt-auto space-y-2">
                    <div className="h-3 w-24 rounded bg-slate-200" />
                    <div className="h-3 w-52 rounded bg-slate-200" />
                    <div className="h-3 w-40 rounded bg-slate-200" />
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
