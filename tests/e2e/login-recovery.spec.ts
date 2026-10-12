import { test, expect } from "@playwright/test";

for (const stage of ["request", "verify"] as const) {
  for (const failure of ["network", "non-json"] as const) {
    test(`login recovers from ${stage} ${failure} failure`, async ({ page }) => {
      await page.goto("/login");
      await page.getByLabel("邮箱", { exact: true }).fill("e2e-a@example.com");
      if (stage === "verify") {
        await page.route("**/api/auth/request-code", route => route.fulfill({ json: { ok: true } }));
        await page.getByRole("button", { name: "获取验证码", exact: true }).click();
        await page.getByLabel("邮箱验证码", { exact: true }).fill("123456");
      }
      const endpoint = `**/api/auth/${stage}-code`;
      await page.route(endpoint, route => failure === "network" ? route.abort() : route.fulfill({ status: 502, contentType: "text/html", body: "Upstream unavailable" }));
      const submit = page.locator('form button[type="submit"], form button:not([type])');
      await submit.click();
      await expect(page.getByRole("status")).toContainText("请检查网络后重试");
      await expect(submit).toBeEnabled();
      // Retry the same operation after recovery without reloading the page.
      await page.unroute(endpoint);
      await page.route(endpoint, route => route.fulfill({ status: 429, json: { error: "请稍后重试" } }));
      await submit.click();
      await expect(page.getByRole("status")).toHaveText("请稍后重试");
      await expect(submit).toBeEnabled();
      if (stage === "verify") {
        await page.getByRole("button", { name: "重新获取验证码" }).click();
        await expect(page.getByLabel("邮箱", { exact: true })).toBeEnabled();
        await expect(page.getByRole("button", { name: "获取验证码", exact: true })).toBeVisible();
      }
    });
  }
}
