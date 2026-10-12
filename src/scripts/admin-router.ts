import { notice } from "./api";
type Initializer = () => Promise<void | (() => void)>;
export async function bindAdminRouter(initialize: Initializer) {
  const shell = document.querySelector<HTMLElement>(".admin-shell")!;
  const content = shell.querySelector<HTMLElement>(".admin-content")!;
  let cleanup = await initialize();
  let pageReady: Promise<void> = Promise.resolve();
  let current = new URL(location.href);
  let index = 0;
  let restoring = false;
  let request: AbortController | null = null;
  let serial = 0;
  const prefetched = new Map<string, { time: number; response: Promise<Response> }>();
  history.replaceState({ ...history.state, shuxinIndex: index, scroll: scrollY }, "");
  history.scrollRestoration = "manual";
  function eligible(url: URL) {
    return url.origin === location.origin && /^\/admin(?:\/|$)/.test(url.pathname)
      && !["/admin/login", "/admin/setup"].includes(url.pathname.replace(/\/$/, ""));
  }
  function announce(path: string) {
    document.dispatchEvent(new CustomEvent("shuxin:route-change", { detail: { path } }));
  }
  function canLeave() {
    const editor = content.querySelector("#composer");
    if (editor && !editor.dispatchEvent(new Event("shuxin:before-leave", { cancelable: true }))) return false;
    if (content.querySelector('form button[type="submit"]:disabled')) {
      notice(null, "请等当前保存完成后再切换页面。", true);
      return false;
    }
    return true;
  }
  function prefetch(link: HTMLAnchorElement) {
    const url = new URL(link.href);
    if (!eligible(url) || url.href === current.href || prefetched.has(url.href)) return;
    const response = fetch(url, { credentials: "same-origin", headers: { "X-Requested-With": "shuxin-admin" } });
    response.catch(() => prefetched.delete(url.href));
    prefetched.set(url.href, { time: Date.now(), response });
  }
  async function navigate(url: URL, popState?: { shuxinIndex: number; scroll?: number }) {
    if (!canLeave()) { announce(current.pathname); return false; }
    if (url.href === current.href && !popState) { announce(current.pathname); return true; }
    const id = ++serial;
    request?.abort();
    request = new AbortController();
    const signal = request.signal;
    shell.setAttribute("aria-busy", "true");
    content.inert = true;
    announce(url.pathname);
    try {
      const cached = prefetched.get(url.href);
      const response = cached && Date.now() - cached.time < 5000
        ? await cached.response
        : await fetch(url, { credentials: "same-origin", signal, headers: { "X-Requested-With": "shuxin-admin" } });
      if (id !== serial) return false;
      const destination = new URL(response.url);
      if (!eligible(destination)) { location.assign(destination.href); return true; }
      if (!response.ok) throw new Error("页面加载失败，请重试。");
      const html = new DOMParser().parseFromString(await response.clone().text(), "text/html");
      if (id !== serial) return false;
      const incoming = html.querySelector(".admin-content");
      if (!incoming) throw new Error("页面加载失败，请刷新后重试。");
      incoming.querySelectorAll('script:not([type="application/json"])').forEach(script => script.remove());
      await pageReady;
      if (id !== serial) return false;
      if (!popState) history.replaceState({ ...history.state, scroll: scrollY }, "", current);
      cleanup?.();
      content.replaceChildren(...Array.from(incoming.childNodes, node => document.importNode(node, true)));
      document.title = html.title;
      const csrf = html.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content;
      if (csrf) document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')!.content = csrf;
      if (popState) index = popState.shuxinIndex;
      else history.pushState({ shuxinIndex: ++index, scroll: 0 }, "", destination);
      current = destination;
      prefetched.clear();
      announce(current.pathname);
      pageReady = (async () => { cleanup = await initialize(); })();
      await pageReady;
      if (id !== serial) return true;
      window.scrollTo({ top: popState?.scroll ?? 0, behavior: "instant" });
      return true;
    } catch (error) {
      if (id === serial && !signal.aborted) {
        announce(current.pathname);
        notice(null, (error as Error).message || "页面加载失败，请重试。", true);
      }
      return false;
    } finally {
      if (id === serial) {
        shell.removeAttribute("aria-busy");
        content.inert = false;
      }
    }
  }
  document.addEventListener("click", event => {
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>("a[href]") : null;
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
      || link.hasAttribute("download") || (link.target && link.target !== "_self")) return;
    const url = new URL(link.href);
    if (!eligible(url) || url.hash) return;
    event.preventDefault();
    void navigate(url);
  });
  for (const name of ["pointerover", "focusin"] as const) document.addEventListener(name, event => {
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>(".admin-tab, .post-actions a") : null;
    if (link) prefetch(link);
  });
  document.addEventListener("shuxin:navigate", event => {
    const href = (event as CustomEvent<{ href: string }>).detail.href;
    const url = new URL(href, location.origin);
    if (eligible(url)) { prefetched.clear(); void navigate(url); }
    else location.assign(url.href);
  });
  window.addEventListener("popstate", async event => {
    if (restoring) { restoring = false; return; }
    const state = event.state;
    if (!state || !Number.isInteger(state.shuxinIndex) || !eligible(new URL(location.href))) {
      location.reload(); return;
    }
    const oldIndex = index;
    if (!await navigate(new URL(location.href), state) && state.shuxinIndex !== oldIndex) {
      restoring = true;
      history.go(oldIndex - state.shuxinIndex);
    }
  });
}
