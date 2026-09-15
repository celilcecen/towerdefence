interface ElementOptions {
  readonly className?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string>>;
}

/**
 * The only way UI code creates elements. Text always goes through
 * textContent; HTML string sinks are banned by lint, so user-visible strings
 * can never be interpreted as markup.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  children: readonly (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (options.className) element.className = options.className;
  if (options.text !== undefined) element.textContent = options.text;
  for (const [name, value] of Object.entries(options.attrs ?? {}))
    element.setAttribute(name, value);
  element.append(...children);
  return element;
}

export function requireElement<T extends Element>(
  root: ParentNode,
  selector: string,
  type: abstract new () => T,
): T {
  const element = root.querySelector(selector);
  if (!(element instanceof type)) throw new Error(`Required element "${selector}" is missing.`);
  return element;
}

/** Writes only when the value changed, so per-frame UI updates cost almost nothing. */
export function setText(element: Element, text: string): void {
  if (element.textContent !== text) element.textContent = text;
}

export function setFlag(element: Element, attribute: string, on: boolean): void {
  if (element.hasAttribute(attribute) !== on) element.toggleAttribute(attribute, on);
}

export function setAttr(element: Element, attribute: string, value: string): void {
  if (element.getAttribute(attribute) !== value) element.setAttribute(attribute, value);
}
