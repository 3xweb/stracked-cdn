const cache = new WeakMap<HTMLElement, string>();

function buildXPath(element: HTMLElement): string {
  let selector = "";
  let current: HTMLElement | null = element;

  while (current) {
    const tag = current.tagName.toLowerCase();
    const parent = current.parentElement;

    if (!parent) {
      selector = `/${tag}${selector}`;
      break;
    }

    const siblingsSameTag = Array.from(parent.children).filter(
      (c) => c.tagName.toLowerCase() === tag
    );

    if (siblingsSameTag.length === 1) {
      selector = `/${tag}${selector}`;
    } else {
      const position = siblingsSameTag.indexOf(current) + 1;
      selector = `/${tag}[${position}]${selector}`;
    }

    current = parent as HTMLElement;

    if (current.tagName.toLowerCase() === "html") {
      selector = `/html${selector}`;
      break;
    }
  }

  return selector;
}

export function getCachedXPath(el: HTMLElement): string {
  const v = cache.get(el);
  if (v) return v;

  const xp = buildXPath(el);
  cache.set(el, xp);
  return xp;
}
