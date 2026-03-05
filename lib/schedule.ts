export function formatMinutes(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatSlotRange(dayStartMin: number, slotMin: number, startSlot: number, endSlot: number) {
  return `${formatMinutes(dayStartMin + startSlot * slotMin)} - ${formatMinutes(dayStartMin + endSlot * slotMin)}`;
}
