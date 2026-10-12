import { test, expect } from "@playwright/test";
import { resetFixtures, login } from "./helpers";

test("shared navigation and narrow-screen workspace remain usable", async ({ page, request }) => {
  await resetFixtures(request);
  await login(page);
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/research", "/learning", "/trends", "/onboarding"]) {
      await page.goto(path);
      await expect(page.locator("main h1").first()).toBeVisible();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
      expect(overflow, `${path} overflows at ${width}px`).toBeFalsy();
    }
    await page.getByText("更多", { exact: false }).first().click();
    await expect(page.getByRole("navigation", { name: "更多功能" })).toBeVisible();
    await page.getByRole("navigation", { name: "更多功能" }).getByRole("link", { name: "收藏", exact: true }).click();
    await expect(page).toHaveURL(/\/saved$/);
    await expect(page.getByRole("navigation", { name: "更多功能" })).toBeHidden();
  }
});
