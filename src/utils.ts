export function getQueryParamFromScript(param: string) {
  try {
    return new URL(import.meta.url).searchParams.get(param) || "";
  } catch {
    return "";
  }
}

export function isHTMLElement(t: EventTarget | null): t is HTMLElement {
  return !!t && t instanceof HTMLElement;
}

export function clampPercent(n: number): number | null {
  if (!Number.isFinite(n)) return null;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

export function getClientXY(e: Event): { x: number; y: number } | null {
  // PointerEvent herda de MouseEvent na prática (clientX/clientY existem)
  const any = e as any;
  if (typeof any.clientX === "number" && typeof any.clientY === "number") {
    return { x: any.clientX, y: any.clientY };
  }
  return null;
}

export function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let t: number | undefined;
  return (...args: Parameters<T>) => {
    if (t) window.clearTimeout(t);
    t = window.setTimeout(() => fn(...args), delay);
  };
}
