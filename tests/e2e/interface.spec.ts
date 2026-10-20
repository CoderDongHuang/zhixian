import { test, expect } from "@playwright/test";
import { resetFixtures, login } from "./helpers";

test("shared navigation and narrow-screen workspace remain usable", async ({ page, request }) => {
  await resetFixtures(request);
  await login(page);
  for (const width of [360, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/research", "/learning", "/trends", "/onboarding", "/account", "/install", "/settings"]) {
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow, `${path} overflows at ${width}px`).toBeFalsy();
    }
    const navigation = page.getByRole("navigation", { name: "主导航", exact: true });
    for (const [group, links] of [
      ["发现", ["发现首页", "行业简报", "搜索"]],
      ["研究", ["研究工作台", "实体档案", "关系浏览"]],
      ["阅读", ["收藏", "阅读历史", "关键词提醒"]],
      ["设置", ["阅读偏好", "应用设置", "隐私政策"]],
    ] as const) {
      const summary = navigation.locator("summary").filter({ hasText: new RegExp(`^${group}`) });
      await summary.click();
      await expect(page.locator(".site-header details[open]")).toHaveCount(1);
      for (const label of links) await expect(navigation.getByRole("link", { name: label, exact: true })).toBeVisible();
      const menuBounds = await summary.locator("..").locator(".site-dropdown").boundingBox();
      expect(menuBounds).not.toBeNull();
      expect(menuBounds!.x).toBeGreaterThanOrEqual(0);
      expect(menuBounds!.x + menuBounds!.width).toBeLessThanOrEqual(width);
    }
    await page.keyboard.press("Escape");
    await expect(page.locator(".site-header details[open]")).toHaveCount(0);
    await navigation.locator("summary").filter({ hasText: /^阅读/ }).click();
    await navigation.getByRole("link", { name: "收藏", exact: true }).click();
    await expect(page).toHaveURL(/\/saved$/);
    await expect(page.locator(".site-header details[open]")).toHaveCount(0);
    await page.getByLabel("用户菜单", { exact: true }).click();
    await expect(page.locator(".account-dropdown")).toContainText("e2e-a@example.com");
    await expect(page.locator(".account-dropdown").getByRole("button", { name: "退出登录", exact: true })).toBeVisible();
    await page.locator(".account-dropdown").getByRole("link", { name: "个人中心" }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { name: "个人中心", exact: true })).toBeVisible();
    await page.getByLabel("用户菜单", { exact: true }).click();
    await page.locator(".account-profile").click({ position: { x: 8, y: 24 } });
    await expect(page.locator(".site-header details[open]")).toHaveCount(0);
  }
  await page.getByLabel("用户菜单", { exact: true }).click();
  await page.locator(".account-dropdown").getByRole("button", { name: "退出登录", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByLabel("用户菜单", { exact: true }).click();
  await expect(page.locator(".account-dropdown").getByRole("link", { name: "登录 / 注册" })).toBeVisible();
  await page.locator(".account-dropdown").getByRole("link", { name: "个人中心" }).click();
  await expect(page).toHaveURL(/\/login\?next=\/account$/);
});
