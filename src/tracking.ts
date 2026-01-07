import { record } from "@rrweb/record";
import type { Encoder } from "msgpackr/pack";
import { createBufferedSender } from "./ws";
import { debounce, getClientXY, isHTMLElement, clampPercent } from "./utils";
import { getCachedXPath } from "./xpath";
import type { eventWithTime } from "@rrweb/types";

function buildRelativePosition(target: HTMLElement, x: number, y: number) {
  const rect = target.getBoundingClientRect();
  const { width, height, left, top } = rect;
  if (width <= 0 || height <= 0) return null;

  const relX = x - left;
  const relY = y - top;

  const px = clampPercent(Math.round((relX / width) * 100));
  const py = clampPercent(Math.round((relY / height) * 100));

  if (px === null || py === null) return null;
  return { relativeXPercentage: px, relativeYPercentage: py };
}

export function initTracking(websocket: WebSocket, encoder: Encoder) {
  const sender = createBufferedSender(websocket, encoder, {
    flushIntervalMs: 50,
    maxQueue: 3000,
  });

  // ✅ rrweb (replay) — com máscara de inputs para reduzir risco de PII
  record({
    emit: (event: eventWithTime) => {
      sender.send({ type: "rrweb", data: event });
    },

    // Segurança (e geralmente suficiente pra replay sem vazar dados)
    maskAllInputs: true,

    // Dica operacional:
    // se quiser bloquear elementos inteiros no replay, você pode usar CSS class no site:
    // blockClass: "stracked-block",
    // maskTextClass: "stracked-mask",
  } as Parameters<typeof record>[0]);

  // ✅ cliques (mantém click/dblclick)
  (["click", "dblclick"] as const).forEach((eventName) => {
    document.addEventListener(
      eventName,
      (e) => {
        try {
          if (!isHTMLElement(e.target)) return;

          const xy = getClientXY(e);
          if (!xy) return;

          const pos = buildRelativePosition(e.target, xy.x, xy.y);
          if (!pos) return;

          sender.send({
            type: "event",
            data: {
              type: eventName,
              data: {
                xpath: getCachedXPath(e.target),
                ...pos,
              },
            },
          });
        } catch {
          // nunca derrubar o site por tracking
        }
      },
      { passive: true }
    );
  });

  // ✅ pointerdown/up (substitui mousedown/mouseup + touchstart/touchend com consistência)
  (["pointerdown", "pointerup"] as const).forEach((eventName) => {
    document.addEventListener(
      eventName,
      (e) => {
        try {
          if (!isHTMLElement(e.target)) return;

          const xy = getClientXY(e);
          if (!xy) return;

          const pos = buildRelativePosition(e.target, xy.x, xy.y);
          if (!pos) return;

          sender.send({
            type: "event",
            data: {
              type: eventName,
              data: {
                xpath: getCachedXPath(e.target),
                ...pos,
              },
            },
          });
        } catch {}
      },
      { passive: true }
    );
  });

  // ✅ movimento (um só: pointermove) com debounce
  document.addEventListener(
    "pointermove",
    debounce((e: PointerEvent) => {
      try {
        if (!isHTMLElement(e.target)) return;

        const xy = getClientXY(e);
        if (!xy) return;

        const pos = buildRelativePosition(e.target, xy.x, xy.y);
        if (!pos) return;

        sender.send({
          type: "event",
          data: {
            type: "pointermove",
            data: {
              xpath: getCachedXPath(e.target),
              ...pos,
            },
          },
        });
      } catch {}
    }, 100),
    { passive: true }
  );

  // ✅ scroll (payload útil e barato)
  window.addEventListener(
    "scroll",
    debounce(() => {
      try {
        const doc = document.documentElement;
        sender.send({
          type: "event",
          data: {
            type: "scroll",
            data: {
              scrollX: window.scrollX,
              scrollY: window.scrollY,
              viewportW: window.innerWidth,
              viewportH: window.innerHeight,
              docW: doc.scrollWidth,
              docH: doc.scrollHeight,
            },
          },
        });
      } catch {}
    }, 150),
    { passive: true }
  );

  // ✅ submit (sanitizado: NÃO envia valores)
  document.addEventListener(
    "submit",
    (e) => {
      try {
        const t = e.target;
        if (!(t instanceof HTMLFormElement)) return;

        const xpath = getCachedXPath(t);

        const formData = new FormData(t);
        const fields: Array<{
          name: string;
          hasValue: boolean;
          length?: number;
        }> = [];

        for (const [key, value] of formData.entries()) {
          if (typeof value === "string") {
            fields.push({
              name: key,
              hasValue: value.length > 0,
              length: value.length || undefined,
            });
          } else {
            // arquivo: não envia conteúdo
            fields.push({
              name: key,
              hasValue: true,
            });
          }
        }

        sender.send({
          type: "event",
          data: {
            type: "submit",
            data: { xpath, fields },
          },
        });
      } catch {}
    },
    { passive: true }
  );

  // ✅ fechamento mais confiável que beforeunload (inclui mobile)
  const close = () => {
    try {
      sender.flush();
    } catch {}
    try {
      websocket.close();
    } catch {}
  };

  window.addEventListener("pagehide", close);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") close();
  });
}
