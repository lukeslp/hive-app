/**
 * File Purpose: Give the Android Back button and gesture something to do.
 * Primary Components: registerBackHandler, handleBack, useBackHandler.
 * I/O: Open layers register a close function; handleBack runs the topmost
 *   one and reports whether anything closed.
 *
 * The Capacitor shell only goes "back" through WebView history, and this app
 * has none, so Back did nothing at all: it closed no dialog and never left
 * the app. main.tsx now sends Back here first and minimizes the app when
 * nothing is open.
 *
 * Order, highest first: the first-run tour and the question prompt (they
 * cover the whole screen), then any open dialog, then the toolbar and the
 * tile detail panel.
 */

import { useEffect, useRef } from "react";

export const BACK_PRIORITY = {
  tour: 40,
  prompt: 30,
  /** Dialogs are found in the document, not registered. */
  dialog: 20,
  toolbar: 10,
  panel: 5,
} as const;

type BackHandler = () => boolean;

interface Registration {
  priority: number;
  order: number;
  handler: BackHandler;
}

let nextOrder = 0;
const registrations = new Set<Registration>();

/**
 * Register a close function for a layer that is open now. The function
 * returns true when it closed something. Call the returned function when the
 * layer closes.
 */
export function registerBackHandler(
  priority: number,
  handler: BackHandler
): () => void {
  const registration = { priority, order: nextOrder++, handler };
  registrations.add(registration);
  return () => {
    registrations.delete(registration);
  };
}

function closeTopDialog(doc: Document): boolean {
  const open = doc.querySelectorAll<HTMLElement>(
    '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]'
  );
  const top = open[open.length - 1];
  if (!top) return false;
  // The dialogs close on Escape. Not bubbling keeps the same key press from
  // also reaching the toolbar's own Escape listener on window.
  top.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: false,
      cancelable: true,
    })
  );
  return true;
}

/** Close the topmost open layer. Returns false when nothing was open. */
export function handleBack(doc: Document = document): boolean {
  const ordered = Array.from(registrations).sort(
    (a, b) => b.priority - a.priority || b.order - a.order
  );
  for (const registration of ordered) {
    if (registration.priority <= BACK_PRIORITY.dialog) break;
    if (registration.handler()) return true;
  }
  if (closeTopDialog(doc)) return true;
  for (const registration of ordered) {
    if (registration.priority > BACK_PRIORITY.dialog) continue;
    if (registration.handler()) return true;
  }
  return false;
}

/**
 * Register `handler` while `active` is true. The latest handler is always
 * the one called, so callers can pass an inline function.
 */
export function useBackHandler(
  active: boolean,
  priority: number,
  handler: BackHandler
): void {
  const latest = useRef(handler);
  latest.current = handler;
  useEffect(() => {
    if (!active) return;
    return registerBackHandler(priority, () => latest.current());
  }, [active, priority]);
}
