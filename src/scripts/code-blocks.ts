import { notice } from "./api";
export function bindCodeBlocks(root: ParentNode) {
  root.querySelectorAll<HTMLElement>(".code-block").forEach((block) => {
    if (block.dataset.bound) return;
    block.dataset.bound = "true";
    const copy = block.querySelector<HTMLButtonElement>("[data-code-copy]")!;
    copy.addEventListener("click", async () => {
      const code = Array.from(block.querySelectorAll(".code-line"))
        .map((line) => line.textContent || "")
        .join("\n");
      try {
        await navigator.clipboard.writeText(code);
        if (location.pathname.startsWith("/admin")) notice(null, "代码已复制");
        else copy.textContent = "已复制";
      } catch {
        if (location.pathname.startsWith("/admin")) notice(null, "代码复制失败", true);
        else copy.textContent = "复制失败";
      }
      setTimeout(() => {
        copy.textContent = "复制";
      }, 1800);
    });
    const wrap = block.querySelector<HTMLButtonElement>("[data-code-wrap]")!;
    wrap.addEventListener("click", () => {
      const on = block.classList.toggle("code-wrapped");
      wrap.setAttribute("aria-pressed", String(on));
    });
  });
}
