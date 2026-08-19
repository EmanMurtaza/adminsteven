"use client";

import { useEffect, type RefObject } from "react";

/**
 * Close a popover on an outside click or Escape.
 *
 * Shared by the filter dropdowns and the tag picker. Both live inside a
 * horizontally scrolling table, where a popover that stays open while you scroll
 * away from its trigger is worse than no popover at all.
 *
 * `pointerdown` rather than `click`: a click fires after mouseup, so choosing
 * something in one popover while another was open left the first one visibly
 * hanging around for the duration of the gesture.
 */
export function useDismissable(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void
) {
  useEffect(() => {
    if (!open) return;

    function onPointer(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) onDismiss();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }

    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, ref, onDismiss]);
}
