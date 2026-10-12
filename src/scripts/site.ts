import { bindAdminRouter } from "./admin-router";
import "./admin-nav";
import { bindCodeBlocks } from "./code-blocks";
import { bindPlaylistPlayers } from "./playlist-players";
import { bindMusicPlayers } from "./music-players";
import { bindAudioPlayers } from "./audio-players";
import { api, bindValidation, notice } from "./api";
const backToTop = document.querySelector<HTMLButtonElement>("[data-back-to-top]");
if (backToTop) {
  const updateBackToTop = () => { backToTop.hidden = window.scrollY < 500; };
  window.addEventListener("scroll", updateBackToTop, { passive: true });
  window.addEventListener("pageshow", updateBackToTop);
  updateBackToTop();
  backToTop.addEventListener("click", () => {
    document.querySelector<HTMLAnchorElement>(".site-header .brand")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" });
  });
}
const themeToggle = document.querySelector<HTMLButtonElement>("[data-theme-toggle]");
function updateThemeLabel() {
  themeToggle?.setAttribute("aria-label", document.documentElement.dataset.theme === "dark"
    ? "切换到日间模式" : "切换到夜间模式");
}
updateThemeLabel();
themeToggle?.addEventListener("click", () => {
  const theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  updateThemeLabel();
  try {
    localStorage.setItem("shuxin-theme", theme);
  } catch {
    // The theme still applies when browser storage is unavailable.
  }
});
const headerSearch = document.querySelector<HTMLFormElement>("[data-header-search]");
const searchToggle = headerSearch?.querySelector<HTMLButtonElement>("[data-search-toggle]");
const searchInput = headerSearch?.querySelector<HTMLInputElement>("[data-search-input]");
if (headerSearch && searchToggle && searchInput) {
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const brand = headerSearch.closest(".site-header")?.querySelector<HTMLElement>(".brand");
  function openSearch() {
    headerSearch!.classList.add("is-open");
    if (brand) brand.inert = true;
    searchToggle!.setAttribute("aria-expanded", "true");
    searchToggle!.setAttribute("aria-label", "搜索动态");
    if (reducedMotion.matches) revealSearch();
  }
  function revealSearch() {
    if (!headerSearch!.classList.contains("is-open")) return;
    headerSearch!.classList.add("is-ready");
    searchInput!.disabled = false;
    searchInput!.focus({ preventScroll: true });
  }
  function closeSearch(returnFocus = false) {
    headerSearch!.classList.remove("is-open", "is-ready");
    if (brand) brand.inert = false;
    searchInput!.disabled = true;
    searchToggle!.setAttribute("aria-expanded", "false");
    searchToggle!.setAttribute("aria-label", "展开搜索");
    if (returnFocus) searchToggle!.focus({ preventScroll: true });
  }
  headerSearch.addEventListener("transitionend", event => {
    if (event.target === headerSearch && event.propertyName === "width") revealSearch();
  });
  searchToggle.addEventListener("click", () => {
    if (!headerSearch.classList.contains("is-open")) {
      openSearch();
      return;
    }
    if (!headerSearch.classList.contains("is-ready")) return;
    if (searchInput.value.trim()) headerSearch.requestSubmit();
    else searchInput.focus({ preventScroll: true });
  });
  headerSearch.addEventListener("submit", event => {
    searchInput.value = searchInput.value.trim();
    if (!searchInput.value) {
      event.preventDefault();
      if (!headerSearch.classList.contains("is-open")) openSearch();
      else searchInput.focus({ preventScroll: true });
    }
  });
  headerSearch.addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); closeSearch(true); }
  });
  document.addEventListener("pointerdown", event => {
    if (event.target instanceof Node && !headerSearch.contains(event.target)) closeSearch();
  });
  headerSearch.addEventListener("focusout", () => {
    queueMicrotask(() => {
      if (!headerSearch.contains(document.activeElement)) closeSearch();
    });
  });
  reducedMotion.addEventListener("change", () => {
    if (reducedMotion.matches && headerSearch.classList.contains("is-open")) revealSearch();
  });
}
function bindTimeline(root: ParentNode) {
  bindCodeBlocks(root);
  bindPlaylistPlayers(root);
  bindAudioPlayers(root);
  bindMusicPlayers(root);
  root
    .querySelectorAll<HTMLVideoElement>(".live-photo video")
    .forEach((video) => {
      const showError = () => {
        const error =
          video.parentElement?.querySelector<HTMLElement>(".live-error");
        if (error) error.hidden = false;
      };
      video.addEventListener("error", showError);
      video.querySelector("source")?.addEventListener("error", showError);
    });
  root.querySelectorAll<HTMLButtonElement>("[data-expand]").forEach((button) =>
    button.addEventListener("click", () => {
      const el = document.getElementById(button.dataset.expand!);
      const expanded = button.getAttribute("aria-expanded") === "true";
      el?.classList.toggle("collapsed", expanded);
      button.setAttribute("aria-expanded", String(!expanded));
      button.textContent = expanded ? "展开全文" : "收起全文";
    }),
  );
  root.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((button) => {
    let resetTimer: ReturnType<typeof setTimeout> | undefined;
    let copying = false;
    button.addEventListener("click", async () => {
      if (copying) return;
      copying = true;
      const el =
        button.parentElement?.querySelector<HTMLElement>(".global-status") ??
        null;
      try {
        await navigator.clipboard.writeText(
          new URL(button.dataset.copy!, location.origin).href,
        );
        notice(el, "");
        clearTimeout(resetTimer);
        button.textContent = "已复制";
        resetTimer = setTimeout(() => { button.textContent = "复制链接"; }, 2000);
      } catch {
        clearTimeout(resetTimer);
        button.textContent = "复制链接";
        notice(el, "复制失败，请复制地址栏中的链接", true);
      } finally {
        copying = false;
      }
    });
  });
  root.querySelectorAll<HTMLAnchorElement>("[data-lightbox]").forEach((link) =>
    link.addEventListener("click", (event) => {
      event.preventDefault();
      imageLinks = Array.from(
        link
          .closest(".gallery")!
          .querySelectorAll<HTMLAnchorElement>("[data-lightbox]"),
      );
      imageIndex = imageLinks.indexOf(link);
      showImage();
      lightbox.showModal();
    }),
  );
}
const lightbox = document.querySelector<HTMLDialogElement>("#lightbox")!;
let imageLinks: HTMLAnchorElement[] = [];
let imageIndex = 0;
function showImage() {
  const link = imageLinks[imageIndex];
  const image = lightbox.querySelector("img")!;
  image.src = link.href;
  image.alt = link.dataset.caption || "";
  lightbox.querySelector(".lightbox-caption")!.textContent =
    link.dataset.caption || "";
  lightbox.querySelector<HTMLButtonElement>("[data-image-prev]")!.disabled =
    imageIndex === 0;
  lightbox.querySelector<HTMLButtonElement>("[data-image-next]")!.disabled =
    imageIndex === imageLinks.length - 1;
}
lightbox
  .querySelector("[data-image-close]")
  ?.addEventListener("click", () => lightbox.close());
lightbox.querySelector("[data-image-prev]")?.addEventListener("click", () => {
  if (imageIndex > 0) {
    imageIndex--;
    showImage();
  }
});
lightbox.querySelector("[data-image-next]")?.addEventListener("click", () => {
  if (imageIndex < imageLinks.length - 1) {
    imageIndex++;
    showImage();
  }
});
lightbox.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" && imageIndex > 0) {
    imageIndex--;
    showImage();
  }
  if (event.key === "ArrowRight" && imageIndex < imageLinks.length - 1) {
    imageIndex++;
    showImage();
  }
});
lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) {
    const r = lightbox.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      lightbox.close();
  }
});
bindTimeline(document);
function bindMore(link: HTMLAnchorElement) {
  link.addEventListener("click", async (event) => {
    event.preventDefault();
    if (link.dataset.loading) return;
    link.dataset.loading = "true";
    link.textContent = "加载中…";
    const status = document.querySelector<HTMLElement>(".load-status");
    try {
      const response = await fetch(link.href, {
        headers: { "X-Requested-With": "shuxin" },
      });
      if (!response.ok) throw new Error("加载失败");
      const parsed = new DOMParser().parseFromString(
        await response.text(),
        "text/html",
      );
      const timeline = document.querySelector("#timeline")!;
      parsed.querySelectorAll("#timeline > .entry").forEach((entry) => {
        if (document.getElementById(entry.id)) return;
        const node = document.importNode(entry, true);
        timeline.append(node);
        bindTimeline(node);
      });
      const next = parsed.querySelector<HTMLAnchorElement>("[data-load-more]");
      if (next) {
        link.href = next.href;
        link.textContent = "加载更多";
      } else {
        link.parentElement?.remove();
        notice(status, "已经读完了。");
      }
    } catch {
      link.textContent = "重新加载";
      notice(status, "加载失败，请重试。", true);
    } finally {
      delete link.dataset.loading;
    }
  });
}
document
  .querySelectorAll<HTMLAnchorElement>("[data-load-more]")
  .forEach(bindMore);
document.querySelector<HTMLElement>("[data-logout]")?.addEventListener("click", async event => {
  event.preventDefault();
  const link = event.currentTarget as HTMLElement;
  if (link.getAttribute("aria-disabled") === "true") return;
  link.setAttribute("aria-disabled", "true");
  try {
    const data = await api("/api/auth/logout");
    location.href = data.redirect;
  } catch (error) {
    notice(document.querySelector("#admin-notice"), (error as Error).message, true);
    link.removeAttribute("aria-disabled");
  }
});
const confirmDialog =
  document.querySelector<HTMLDialogElement>("#confirm-dialog")!;
let deleteId: string | null = null;
document.addEventListener("click", event => {
  const trigger = (event.target as Element).closest<HTMLButtonElement>("button[data-delete]");
  if (!trigger || trigger.disabled) return;
  if (document.body.dataset.ownerAuthenticated !== "true") return;
  deleteId = trigger.dataset.delete!;
  notice(confirmDialog.querySelector<HTMLElement>("[data-delete-notice]"), "");
  confirmDialog.showModal();
});
confirmDialog
  .querySelector("[data-confirm-cancel]")
  ?.addEventListener("click", () => {
    deleteId = null;
    confirmDialog.close();
  });
confirmDialog
  .querySelector("[data-confirm-delete]")
  ?.addEventListener("click", async () => {
    if (!deleteId || document.body.dataset.ownerAuthenticated !== "true") return;
    const button = confirmDialog.querySelector<HTMLButtonElement>(
      "[data-confirm-delete]",
    )!;
    button.disabled = true;
    try {
      await api(`/api/posts/${deleteId}`, undefined, "DELETE");
      location.reload();
    } catch (e) {
      notice(
        confirmDialog.querySelector<HTMLElement>("[data-delete-notice]"),
        (e as Error).message,
        true,
      );
    } finally {
      button.disabled = false;
    }
  });

function bindAdminActions() {
document
  .querySelectorAll<HTMLFormElement>("[data-api-form]")
  .forEach((form) => {
    bindValidation(form);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector<HTMLButtonElement>("[type=submit]")!;
      button.disabled = true;
      const el = form.querySelector<HTMLElement>(".notice");
      const pending = form.dataset.apiForm === "/api/auth/login" ? "正在登录..."
        : form.dataset.apiForm === "/api/auth/setup" ? "正在创建账号…"
        : form.dataset.apiForm === "/api/auth/password" ? "正在修改密码…" : "正在保存…";
      notice(el, pending);
      try {
        const data = await api(
          form.dataset.apiForm!,
          Object.fromEntries(new FormData(form)),
        );
        if (data.redirect) location.href = data.redirect;
        else notice(el, data.message ?? "已保存");
      } catch (error) {
        notice(el, (error as Error).message, true);
      } finally {
        button.disabled = false;
      }
    });
  });
document.querySelectorAll<HTMLButtonElement>("[data-pin]").forEach((button) =>
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await api(`/api/posts/${button.dataset.pin}/pin`, {
        pinned: button.dataset.pinned !== "true",
      });
      location.reload();
    } catch (e) {
      notice(
        document.querySelector("#admin-notice"),
        (e as Error).message,
        true,
      );
      button.disabled = false;
    }
  }),
);

}

async function initializeAdminPage() {
  bindAdminActions();
  if (document.querySelector("#composer")) return (await import("./composer")).bindComposer();
  if (document.querySelector("#account-form")) (await import("./account")).bindAccount();
  else if (document.querySelector("#settings-form")) (await import("./settings")).bindSettings();
  else if (document.querySelector("#storage-form")) (await import("./storage")).bindStorage();
  else if (document.querySelector("#login-name-form")) (await import("./system")).bindSystem();
  else if (document.querySelector(".admin-content [data-file-library]")) {
    const { bindLibrary } = await import("./file-library");
    document.querySelectorAll<HTMLElement>(".admin-content [data-file-library]").forEach(root => bindLibrary(root));
  }
}
if (document.querySelector(".admin-shell")) {
  void bindAdminRouter(initializeAdminPage).catch(error => notice(null, (error as Error).message, true));
} else bindAdminActions();
