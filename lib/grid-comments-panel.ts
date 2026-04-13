export const GRID_COMMENTS_PANEL_TOGGLE_EVENT = "grid-comments-panel-toggle";

type GridCommentsPanelToggleDetail = {
  gridId: string;
};

export function emitGridCommentsPanelToggle(gridId: number | string) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<GridCommentsPanelToggleDetail>(GRID_COMMENTS_PANEL_TOGGLE_EVENT, {
      detail: { gridId: String(gridId) },
    }),
  );
}
