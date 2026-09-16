import type { Strings } from "../i18n";
import { lookupText } from "./describe";
import { setAttr, setText } from "./dom";

/**
 * Fills static markup from the translation table: `data-t` sets the text,
 * `data-t-aria` the accessible label. Dynamic text is set by the UI classes.
 * Returns the keys that did not resolve, which the test suite requires to be empty.
 */
export function translateDom(root: Document, t: Strings): string[] {
  const missing: string[] = [];
  for (const element of root.querySelectorAll<HTMLElement>("[data-t]")) {
    const key = element.dataset["t"] ?? "";
    const text = lookupText(t, key);
    if (text === undefined) missing.push(key);
    else setText(element, text);
  }
  for (const element of root.querySelectorAll<HTMLElement>("[data-t-aria]")) {
    const key = element.dataset["tAria"] ?? "";
    const text = lookupText(t, key);
    if (text === undefined) missing.push(key);
    else setAttr(element, "aria-label", text);
  }
  root.documentElement.lang = t.locale;
  return missing;
}
