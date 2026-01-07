import { Encoder } from "msgpackr/pack";

type SenderOptions = {
  flushIntervalMs?: number; // default 50
  maxQueue?: number;        // default 3000 (drop oldest)
};

export function createBufferedSender(ws: WebSocket, encoder: Encoder, opts: SenderOptions = {}) {
  const flushIntervalMs = opts.flushIntervalMs ?? 50;
  const maxQueue = opts.maxQueue ?? 3000;

  const queue: any[] = [];
  let scheduled = false;

  function flush() {
    scheduled = false;
    if (ws.readyState !== WebSocket.OPEN) return;
    if (queue.length === 0) return;

    // envia preservando o formato antigo: 1 send por mensagem
    // (mas de forma agrupada na execução)
    while (queue.length > 0) {
      const msg = queue.shift();
      try {
        ws.send(encoder.encode(msg));
      } catch {
        // se falhar no meio, devolve pro começo e para
        queue.unshift(msg);
        break;
      }
    }
  }

  function scheduleFlush() {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(flush, flushIntervalMs);
  }

  function send(msg: any) {
    // drop oldest pra não explodir memória se o ws cair
    if (queue.length >= maxQueue) queue.shift();
    queue.push(msg);

    if (ws.readyState === WebSocket.OPEN) scheduleFlush();
  }

  return { send, flush };
}
