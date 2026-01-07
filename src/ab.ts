import type { Response } from "./types";

export function runABTests(tests: NonNullable<Response["tests"]>) {
  const currentUrl = new URL(window.location.href);
  const searchParams = currentUrl.search;

  tests.forEach((test) => {
    if (currentUrl.href.startsWith(test.entryUrl)) {
      const randomIndex = Math.floor(Math.random() * test.variants.length);
      const targetUrl = new URL(test.variants[randomIndex]);
      targetUrl.search = searchParams;

      window.location.href = targetUrl.href;
    }
  });
}
