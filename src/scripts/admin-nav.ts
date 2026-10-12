const nav = document.querySelector<HTMLElement>(".admin-tabs");
const liquid = nav?.querySelector<HTMLElement>(".admin-tab-liquid");
if (nav && liquid) {
  const menu = nav, surface = liquid;
  const active = () => menu.querySelector<HTMLElement>('[aria-current="page"]');
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  let frame = 0;
  let destination: HTMLElement | null = null;
  function ease(t: number) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    let low = 0, high = 1;
    for (let i = 0; i < 12; i++) {
      const u = (low + high) / 2;
      const x = 3 * (1 - u) ** 2 * u * .2 + 3 * (1 - u) * u ** 2 * .22 + u ** 3;
      if (x < t) low = u; else high = u;
    }
    const u = (low + high) / 2;
    return 3 * (1 - u) ** 2 * u * .9 + 3 * (1 - u) * u ** 2 + u ** 3;
  }
  function move(target: HTMLElement | null, instant = false) {
    if (!target || (target === destination && !instant)) return;
    destination = target;
    cancelAnimationFrame(frame);
    const menuBox = menu.getBoundingClientRect(), box = target.getBoundingClientRect();
    const left = box.left - menuBox.left + menu.scrollLeft, right = left + box.width;
    const oldLeft = parseFloat(surface.style.left), oldWidth = parseFloat(surface.style.width);
    if (instant || reduced.matches || !Number.isFinite(oldLeft)) {
      surface.style.left = `${left}px`; surface.style.width = `${box.width}px`; return;
    }
    const oldRight = oldLeft + oldWidth, forward = left > oldLeft;
    const leadStart = forward ? oldRight : oldLeft, leadEnd = forward ? right : left;
    const trailStart = forward ? oldLeft : oldRight, trailEnd = forward ? left : right;
    const started = performance.now();
    function tick(now: number) {
      const elapsed = now - started;
      const lead = leadStart + (leadEnd - leadStart) * ease(Math.min(1, elapsed / 430));
      const trail = trailStart + (trailEnd - trailStart) * ease(Math.min(1, Math.max(0, elapsed - 100) / 430));
      surface.style.left = `${Math.min(lead, trail)}px`;
      surface.style.width = `${Math.max(2, Math.abs(lead - trail))}px`;
      if (elapsed < 530) frame = requestAnimationFrame(tick);
      else { surface.style.left = `${left}px`; surface.style.width = `${box.width}px`; }
    }
    frame = requestAnimationFrame(tick);
  }
  const current = active();
  if (current) menu.scrollLeft = Math.max(0, current.offsetLeft - menu.offsetLeft - (menu.clientWidth - current.clientWidth) / 2);
  move(current, true);
  menu.classList.add("is-animated");
  menu.querySelectorAll<HTMLAnchorElement>(".admin-tab").forEach(link => {
    link.addEventListener("pointerenter", event => { if (event.pointerType === "mouse") move(link); });
    link.addEventListener("focus", () => move(link));
    link.addEventListener("pointerdown", () => move(link));
  });
  document.addEventListener("shuxin:route-change", event => {
    const path = (event as CustomEvent<{ path: string }>).detail.path.replace(/\/$/, "");
    const selected = path === "/admin/new" || path.startsWith("/admin/edit/") ? "/admin" : path;
    menu.querySelectorAll<HTMLAnchorElement>(".admin-tab").forEach(link => {
      const on = link.getAttribute("href") === selected;
      link.classList.toggle("active", on);
      if (on) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
    });
    move(active());
  });
  menu.addEventListener("pointerleave", event => { if (event.pointerType === "mouse") move(active()); });
  menu.addEventListener("focusout", () => queueMicrotask(() => { if (!menu.contains(document.activeElement)) move(active()); }));

  let width = menu.clientWidth;
  new ResizeObserver(() => {
    if (menu.clientWidth !== width) { width = menu.clientWidth; move(active(), true); }
  }).observe(menu);
  reduced.addEventListener("change", () => move(active(), true));
}
