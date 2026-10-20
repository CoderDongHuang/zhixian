import { test, expect, type Page } from "@playwright/test";
import { detectPlatform } from "../../app/install/platforms";

async function ready(page: Page, path = "/install") {
  await page.goto(path);
  // The detected device confirms hydration and effect registration have finished.
  if (path === "/install") await expect(page.locator(".install-device-tag")).toBeVisible();
  else await page.getByRole("button", { name: "刷新网页缓存", exact: true }).focus();
}

async function installPrompt(page: Page, outcome: "accepted" | "dismissed" | "error", installedFirst = false) {
  await page.evaluate(({ outcome, installedFirst }) => {
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt: async () => {
        document.documentElement.dataset.promptCalls = String(Number(document.documentElement.dataset.promptCalls || 0) + 1);
        if (outcome === "error") throw new Error("Test browser declined prompt");
        if (installedFirst) window.dispatchEvent(new Event("appinstalled"));
      },
      userChoice: Promise.resolve({ outcome: outcome === "error" ? "dismissed" : outcome }),
    });
    window.dispatchEvent(event);
  }, { outcome, installedFirst });
}

for (const width of [360, 390, 640, 768, 860, 1440]) {
  test(`public installation guides and navigation fit ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await ready(page);
    const nav = page.getByRole("navigation", { name: "主导航", exact: true });
    await expect(nav.getByRole("link", { name: "安装知线", exact: true })).toHaveAttribute("aria-current", "page");
    expect(await nav.locator(":scope > a, :scope > details > summary").allTextContents()).toEqual(["发现⌄", "趋势", "研究⌄", "学习", "阅读⌄", "设置⌄", "安装知线"]);
    await expect(page.locator(".install-platform-card")).toHaveCount(5);
    await expect(page.locator('a[href$=".apk"], a[href$=".exe"], a[href="#"]')).toHaveCount(0);
    for (const group of ["发现", "研究", "阅读", "设置"]) {
      const summary = nav.locator("summary").filter({ hasText: new RegExp(`^${group}`) });
      await summary.click();
      const bounds = await summary.locator("..").locator(".site-dropdown").boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await page.keyboard.press("Escape");
      await expect(summary).toBeFocused();
    }
    for (const [name, guide] of [["Windows", "Microsoft Edge"], ["macOS", "Sonoma 14"], ["Linux", "Chromium"], ["Android", "Android 版"], ["iPhone / iPad", "Safari"]]) {
      const button = page.getByRole("button", { name: `查看${name}安装方法`, exact: true });
      await button.click();
      await expect(button).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("heading", { name: `${name} 安装指南`, exact: true })).toBeFocused();
      await expect(page.locator(".install-browser-label")).toContainText(guide);
      await expect(page.locator(".install-steps li")).toHaveCount(3);
    }
    await page.getByLabel("切换设备", { exact: true }).selectOption("windows");
    await expect(page.getByRole("heading", { name: "Windows 安装指南", exact: true })).toBeVisible();
    await page.locator(".install-faq summary").filter({ hasText: "安装后如何更新和清理缓存？" }).click();
    await expect(page.locator(".install-faq").getByRole("link", { name: "应用设置", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
    if (width === 390 || width === 1440) {
      await page.evaluate(() => scrollTo(0, 0));
      await page.screenshot({ path: testInfo.outputPath(`install-${width}.png`), fullPage: true });
    }
    await nav.locator("summary").filter({ hasText: /^设置/ }).click();
    await nav.getByRole("link", { name: "应用设置", exact: true }).click();
    await expect(page.getByRole("heading", { name: "应用设置", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
  });
}

for (const outcome of ["accepted", "dismissed", "error"] as const) {
  test(`browser prompt is user initiated and single use: ${outcome}`, async ({ page }) => {
    await ready(page);
    await installPrompt(page, outcome);
    const recommendation = page.getByRole("complementary", { name: "当前设备推荐" });
    const install = recommendation.getByRole("button", { name: "安装网页版", exact: true });
    await expect(install).toBeVisible();
    expect(await page.locator("html").getAttribute("data-prompt-calls")).toBeNull();
    // Looking at a different device must not install on the current one.
    await page.getByLabel("切换设备", { exact: true }).selectOption("ios");
    await expect(page.locator(".install-guide").getByRole("button", { name: "安装网页版", exact: true })).toHaveCount(0);
    await install.click();
    await expect(page.locator("html")).toHaveAttribute("data-prompt-calls", "1");
    const message = outcome === "accepted" ? "已提交安装请求" : outcome === "dismissed" ? "已取消安装" : "未能打开安装窗口";
    await expect(page.locator(".install-status")).toContainText(message);
    await expect(recommendation.getByRole("button", { name: "安装网页版", exact: true })).toHaveCount(0);
    await expect(recommendation).not.toContainText("正在使用网页版应用");
    await recommendation.getByRole("button", { name: "查看安装方法" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-prompt-calls", "1");
    await installPrompt(page, "accepted");
    await expect(install).toBeVisible();
    await install.click();
    await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
    await expect(recommendation).toContainText("正在使用网页版应用");
    await expect(page.locator(".install-status")).toContainText("知线已安装");
  });
}

test("installation completion wins over delayed acceptance and prompt survives navigation", async ({ page }) => {
  await ready(page);
  await installPrompt(page, "accepted", true);
  await page.getByRole("navigation", { name: "主导航", exact: true }).locator("summary").filter({ hasText: /^设置/ }).click();
  await page.locator(".primary-nav").getByRole("link", { name: "应用设置", exact: true }).click();
  await page.locator(".app-settings-links").getByRole("link", { name: "安装知线" }).click();
  const recommendation = page.getByRole("complementary", { name: "当前设备推荐" });
  await recommendation.getByRole("button", { name: "安装网页版", exact: true }).click();
  await expect(page.locator(".install-status")).toContainText("知线已安装");
  await expect(page.locator(".install-status")).not.toContainText("已提交安装请求");
});

test("standalone window offers continued use without an install button", async ({ page }) => {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window);
    window.matchMedia = query => {
      const media = original(query);
      if (query === "(display-mode: standalone)") Object.defineProperty(media, "matches", { value: true });
      return media;
    };
  });
  await ready(page);
  const recommendation = page.getByRole("complementary", { name: "当前设备推荐" });
  await expect(recommendation).toContainText("正在使用网页版应用");
  await expect(recommendation.getByRole("link", { name: "继续使用知线" })).toBeVisible();
  await expect(recommendation.getByRole("button")).toHaveCount(0);
});

test("iPad desktop user agent and embedded browser use the Safari guide", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperties(navigator, {
      userAgent: { value: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 MicroMessenger/8" },
      platform: { value: "MacIntel" }, maxTouchPoints: { value: 5 },
    });
  });
  await ready(page);
  await expect(page.getByRole("heading", { name: "iPhone / iPad 安装指南", exact: true })).toBeVisible();
  await expect(page.getByRole("note")).toContainText("内置浏览器");
  await installPrompt(page, "accepted");
  await expect(page.getByRole("button", { name: "安装网页版", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "查看安装方法" }).click();
  expect(await page.locator("html").getAttribute("data-prompt-calls")).toBeNull();
});

test("unknown devices can select a platform manually", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperties(navigator, {
    userAgent: { value: "Unknown browser" }, platform: { value: "" }, maxTouchPoints: { value: 0 },
  }));
  await page.goto("/install");
  await expect(page.getByRole("heading", { name: "你的设备，你的知线" })).toBeVisible();
  await page.getByRole("button", { name: "查看安装方法" }).click();
  await expect(page.getByRole("heading", { name: "选择设备，开始安装" })).toBeFocused();
  await page.getByLabel("切换设备", { exact: true }).selectOption("linux");
  await expect(page.getByRole("heading", { name: "Linux 安装指南" })).toBeVisible();
});

test("platform detection distinguishes Android, iPad, desktops and unknown devices", () => {
  for (const [userAgent, platform, maxTouchPoints, expected] of [
    ["Windows NT 10.0", "Win32", 0, "windows"],
    ["Macintosh; Intel Mac OS X", "MacIntel", 0, "macos"],
    ["X11; Linux x86_64", "Linux x86_64", 0, "linux"],
    ["Linux; Android 15", "Linux armv8l", 5, "android"],
    ["iPhone OS 18", "iPhone", 5, "ios"],
    ["Macintosh; Intel Mac OS X", "MacIntel", 5, "ios"],
    ["X11; CrOS x86_64", "Linux x86_64", 0, null],
    ["Unknown", "", 0, null],
  ] as const) expect(detectPlatform({ userAgent, platform, maxTouchPoints })).toBe(expected);
});

test("cache refresh does nothing offline and retries after an error", async ({ page }) => {
  await ready(page, "/settings");
  await page.evaluate(() => Object.defineProperty(navigator, "onLine", { configurable: true, value: false }));
  const button = page.getByRole("button", { name: "刷新网页缓存", exact: true });
  await button.click();
  await expect(page.getByRole("status")).toContainText("请联网后");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { value: true });
    Object.defineProperty(window, "caches", { value: { keys: async () => { throw new Error("Cache unavailable"); } } });
  });
  await button.click();
  await expect(page.getByRole("status")).toContainText("缓存刷新失败");
  await expect(button).toBeEnabled();
});

test("cache refresh clears only Zhixian resources and reloads", async ({ page }) => {
  await ready(page, "/settings");
  await page.evaluate(() => {
    const record = (action: string) => sessionStorage.setItem("cache-actions", `${sessionStorage.getItem("cache-actions") || ""}${action},`);
    Object.defineProperty(window, "caches", { value: {
      keys: async () => ["zhixian-old", "unrelated-cache"],
      delete: async (key: string) => { record(key); return true; },
    } });
    Object.defineProperty(navigator.serviceWorker, "getRegistrations", { value: async () => [
      { active: { scriptURL: new URL("/sw.js", location.origin).href }, unregister: async () => { record("zhixian-worker"); return true; } },
      { active: { scriptURL: new URL("/other-sw.js", location.origin).href }, unregister: async () => { record("unrelated-worker"); return true; } },
    ] });
    sessionStorage.setItem("preserved-preference", "keep");
  });
  await Promise.all([page.waitForEvent("load"), page.getByRole("button", { name: "刷新网页缓存", exact: true }).click()]);
  expect(await page.evaluate(() => sessionStorage.getItem("cache-actions"))).toBe("zhixian-old,zhixian-worker,");
  expect(await page.evaluate(() => sessionStorage.getItem("preserved-preference"))).toBe("keep");
});
