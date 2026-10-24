// Advisory only: homonyms remain separate participants and may be saved.
export async function confirmDuplicateParticipant(
  grid: number, name: string, surname: string,
  excludeId: string | number | undefined, locale: string,
): Promise<boolean> {
  const query = new URLSearchParams({ grid: String(grid), name, surname });
  if (excludeId != null) query.set("exclude_id", String(excludeId));
  const res = await fetch(`/api/participants/duplicate-check/?${query}`, { cache: "no-store" });
  const spanish = locale.startsWith("es");
  if (!res.ok) throw new Error(spanish
    ? "No se pudieron comprobar los nombres duplicados. Intentá nuevamente."
    : "Could not check duplicate names. Please try again.");
  const result = await res.json();
  if (!result.duplicate) return true;
  return window.confirm(spanish
    ? "Ya existe un participante con el mismo nombre y apellido en esta grilla. Podés guardar otro participante con un ID distinto. ¿Querés continuar?"
    : "A participant with the same first and last name already exists in this grid. You can save another participant with a distinct ID. Continue?");
}
