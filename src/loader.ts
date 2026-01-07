import { Encoder } from "msgpackr/pack";
import type { Response } from "./types";
import { getQueryParamFromScript } from "./utils";
import { runABTests } from "./ab";
import { initTracking } from "./tracking";

const encoder = new Encoder();

(async function () {
  const strackedId = getQueryParamFromScript("stracked");

  if (!strackedId) {
    console.error("[Stracked] UUID is not provided (?stracked=...)");
    return;
  }

  // ⚠️ IMPORTANTÍSSIMO:
  // Esse script roda no browser. Então "process.env.X" precisa ser substituído no build (esbuild define).
  const apiUrl = process.env.CHECK_AB_TESTS_AND_TRACKING_URL as unknown as string;
  const trackingUrl = process.env.TRACKING_URL as unknown as string;

  if (!apiUrl || !trackingUrl) {
    console.error("[Stracked] Missing CHECK_AB_TESTS_AND_TRACKING_URL or TRACKING_URL (build define).");
    return;
  }

  async function checkForABTests(apiUrl_: string, strackedId_: string) {
    try {
      const response = await fetch(`${apiUrl_}?id=${encodeURIComponent(strackedId_)}`, {
        credentials: "include",
      });

      if (!response.ok) throw new Error("Network response was not ok");

      const data = (await response.json()) as Response;
      return data || null;
    } catch (error) {
      console.error("[Stracked] Error checking for AB tests:", error);
      return null;
    }
  }

  const response = await checkForABTests(apiUrl, strackedId);

  if (!response) return;

  // A/B: mantém o seu comportamento (pode mudar a cada load)
  runABTests(response.tests ?? []);

  // Monta params do WS
  const queryParams = new URLSearchParams(window.location.search);
  const params = new URLSearchParams();

  params.append("token", response.token);
  params.append("path", window.location.pathname + window.location.search);
  if (document.referrer) params.append("referrer", document.referrer);

  const utms = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
  utms.forEach((k) => {
    const v = queryParams.get(k);
    if (v) params.append(k, v);
  });

  const websocket = new WebSocket(`${trackingUrl}?${params.toString()}`);

  websocket.onopen = () => {
    initTracking(websocket, encoder);
  };

  websocket.onerror = () => {
    // não faz spam no console
  };
})();
