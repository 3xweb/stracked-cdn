import { record } from "@rrweb/record";
import { Encoder } from "msgpackr/pack";

const encoder = new Encoder();

type Response = {
  token: string;
  tests: {
    entryUrl: string;
    variants: string[];
  }[];
};

(async function () {
  function getQueryParam(param: string) {
    return new URL(import.meta.url).searchParams.get(param) || "";
  }

  const strackedId = getQueryParam("stracked");

  if (!strackedId) {
    console.error("UUID is not provided");
    return;
  }

  const apiUrl = process.env.CHECK_AB_TESTS_AND_TRACKING_URL!; // Endpoint da API para verificar o UUID

  async function checkForABTests(apiUrl: string, strackedId: string) {
    try {
      const response = await fetch(`${apiUrl}?id=${strackedId}`);
      if (!response.ok) {
        throw new Error("Network response was not ok");
      }
      const data = await response.json() as Response;

      console.log(data);
      return data ? data : null;
    } catch (error) {
      console.error("Error checking for AB tests:", error);
      return null;
    }
  }

  function runABTests(tests: Response["tests"]) {
    const currentUrl = new URL(window.location.href); // Usar URL para facilitar a manipulação de parâmetros
    const searchParams = currentUrl.search; // Obter os parâmetros da URL atual

    tests.forEach((test) => {
      if (currentUrl.href.startsWith(test.entryUrl)) { // Usar startsWith para maior flexibilidade
        const randomIndex = Math.floor(Math.random() * test.variants.length);
        let targetUrl = new URL(test.variants[randomIndex]); // Criar URL para manipular
        targetUrl.search = searchParams; // Atribuir os parâmetros da URL atual à URL de destino
        
        window.location.href = targetUrl.href; // Redirecionar para a URL de destino com parâmetros
      }
    });
  }

  function getXPath(element: HTMLElement): string {
    let selector = "";
    let foundRoot;
    let currentElement = element;

    do {
      const tagName = currentElement.tagName.toLowerCase();
      const parentElement = currentElement.parentElement;

      if (!parentElement) {
        selector = `/${tagName}${selector}`;
        break;
      }

      if (parentElement.childElementCount > 1) {
        const parentsChildren = [...parentElement!.children];

        let tag: Element[] = [];
        parentsChildren.forEach(child => {
          if (child.tagName.toLowerCase() === tagName) tag.push(child)
        })

        if (tag.length === 1) {
          selector = `/${tagName}${selector}`;
        } else {
          const position = tag.indexOf(currentElement) + 1;
          selector = `/${tagName}[${position}]${selector}`;
        }
      } else {
        selector = `/${tagName}${selector}`;
      }

      currentElement = parentElement;
      foundRoot = parentElement.tagName.toLowerCase() === "html";
      if (foundRoot) selector = `/html${selector}`;
    } while (foundRoot === false);

    return selector;
  }

  const cache = new Map();

  function getCachedXPath(element: HTMLElement): string {
    if (cache.has(element)) {
      return cache.get(element);
    }
    const xpath = getXPath(element);
    cache.set(element, xpath);

    return xpath;
  }

  const response = await checkForABTests(apiUrl, strackedId);

  if (response) {
    runABTests(response.tests ?? []);

    const queryParams = new URLSearchParams(window.location.search)

    const params = new URLSearchParams();
    params.append("token", response.token);
    params.append("path", window.location.pathname + window.location.search);
    if (document.referrer) params.append("referrer", document.referrer);

    if (queryParams.get("utm_source")) params.append("utm_source", queryParams.get("utm_source")!);
    if (queryParams.get("utm_medium")) params.append("utm_medium", queryParams.get("utm_medium")!);
    if (queryParams.get("utm_campaign")) params.append("utm_campaign", queryParams.get("utm_campaign")!);
    if (queryParams.get("utm_term")) params.append("utm_term", queryParams.get("utm_term")!);
    if (queryParams.get("utm_content")) params.append("utm_content", queryParams.get("utm_content")!);

    const websocket = new WebSocket(process.env.TRACKING_URL! + "?" + params.toString());

    websocket.onopen = () => {
      record({
        emit(event) {
          websocket.send(encoder.encode({ type: "rrweb", data: event }));
        },
      }); // Iniciar a gravação de eventos para reprodução da sessão

      const clickEvents = [
        "click",
        "dblclick",
        "mousedown",
        "mouseup",
        "touchstart",
        "touchend",
      ];

      clickEvents.forEach((eventName) => {
        let isAnimating = false;

        document.addEventListener(eventName, (e) => {
          if (!isAnimating) {
            isAnimating = true;

            requestAnimationFrame(() => {
              const target = e.target as HTMLElement;
              const xpath = getCachedXPath(target);

              const { x, y } = e as MouseEvent;

              const { top, left, width, height } = target.getBoundingClientRect();
              const relativeX = x - left;
              const relativeY = y - top;

              const relativeXPercentage = Math.round((relativeX / width) * 100);
              const relativeYPercentage = Math.round((relativeY / height) * 100);

              websocket.send(
                encoder.encode({
                  type: "event",
                  data: {
                    type: eventName,
                    data: { xpath, relativeXPercentage, relativeYPercentage },
                  }
                })
              );

              isAnimating = false;
            });
          }
        });
      }); // Iniciar a gravação de eventos para gerear heatmaps
    };

    function debounce(func: Function, delay: number) {
      let timeoutId: NodeJS.Timeout;
    
      return function (this: any, ...args: any[]) {
        clearTimeout(timeoutId);

        timeoutId = setTimeout(() => {
          func.apply(this, args);
        }, delay);
      };
    };

    const moveEvents = [
      "mousemove",
      "mouseover",
      "mouseout",
      "scroll",
      "wheel",
      "touchmove",
    ];

    moveEvents.forEach((eventName) => {
      document.addEventListener(eventName, debounce((e: Event) => {
        const target = e.target as HTMLElement;
        const xpath = getCachedXPath(target);

        const { x, y } = e as MouseEvent;

        const { top, left, width, height } = target.getBoundingClientRect();
        const relativeX = x - left;
        const relativeY = y - top;

        const relativeXPercentage = Math.round((relativeX / width) * 100);
        const relativeYPercentage = Math.round((relativeY / height) * 100);

        websocket.send(
          encoder.encode({
            type: "event",
            data: {
              type: eventName,
              data: { xpath, relativeXPercentage, relativeYPercentage },
            }
          })
        );
      }, 200));
    }); // Iniciar a gravação de eventos para gerear heatmaps

    document.addEventListener("submit", (e) => {
      const target = e.target as HTMLFormElement;
      const xpath = getCachedXPath(target);

      const formData = new FormData(target);
      const data: { [key: string]: FormDataEntryValue } = {};

      for (const [key, value] of formData.entries()) {
        data[key as string] = value;
      }

      websocket.send(
        encoder.encode({
          type: "event",
          data: {
            type: "submit",
            data: { xpath, formData: data },
          }
        })
      );
    }); // Iniciar a gravação de eventos para gerear heatmaps

    window.addEventListener("beforeunload", () => {
      websocket.close();
    });
  }
})();
