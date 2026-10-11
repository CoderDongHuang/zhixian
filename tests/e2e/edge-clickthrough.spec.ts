import { expect, test } from "@playwright/test";
import { login, resetFixtures } from "./helpers";

test.beforeEach(async ({ request }) => { await resetFixtures(request); });

test("personal workspace works through visible page controls", async ({ page }) => {
  await login(page);

  await page.goto("/onboarding");
  await expect(page.getByText("正在读取已保存设置...")).toHaveCount(0);
  await expect(page.getByLabel("开发者")).toBeChecked();
  await expect(page.getByLabel("入门")).toBeChecked();
  await expect(page.getByLabel("AI 应用")).toBeChecked();
  await expect(page.getByLabel("提升技能")).toBeChecked();
  await expect(page.getByLabel("AI 行业")).toBeChecked();
  await page.getByLabel("Python").check();
  await page.locator('select[name="itemsPerDigest"]').selectOption("20");
  await page.getByRole("button", { name: "保存并查看信息流" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("已根据你的关注和阅读行为排序。")).toBeVisible();

  await page.locator(".topic-tabs").getByRole("link", { name: "AI 行业", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("topic")).toBe("AI 行业");
  await page.getByRole("link", { name: "E2E AI 深度分析" }).first().click();
  await expect(page.getByRole("heading", { name: "证据对照" })).toBeVisible();
  await page.getByRole("button", { name: "标记已读" }).click();
  await expect(page.getByRole("button", { name: "已读", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "收藏", exact: true }).click();
  await expect(page.getByRole("button", { name: "已收藏" })).toBeVisible();
  await page.getByRole("button", { name: "有帮助" }).click();
  await expect(page.getByText("反馈已记录")).toBeVisible();
  await page.getByRole("button", { name: "报告问题" }).click();
  await page.getByPlaceholder("请描述事实错误、翻译问题或不相关内容").fill("Edge 真实点击验收：核对纠错提交链路");
  await page.getByRole("button", { name: "提交", exact: true }).click();
  await expect(page.getByText("问题已记录")).toBeVisible();
  await page.getByRole("button", { name: "离线阅读" }).click();
  await expect(page.getByText("已加入离线阅读")).toBeVisible();
  await expect.poll(() => page.evaluate(async () => Boolean(await caches.match("/events/e2e-event-ai")))).toBe(true);

  await page.goto("/saved");
  await expect(page.getByRole("heading", { name: "我的收藏" })).toBeVisible();
  await expect(page.getByRole("link", { name: "E2E AI 深度分析" })).toBeVisible();
  await page.goto("/history");
  await expect(page.getByRole("heading", { name: "阅读历史" })).toBeVisible();
  await expect(page.getByRole("link", { name: "E2E AI 深度分析" })).toBeVisible();

  await page.goto("/search");
  await page.getByLabel("搜索词").fill("E2E Company");
  await page.getByRole("button", { name: "搜索" }).click();
  await expect(page.getByRole("link", { name: "E2E Company", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "E2E Company", exact: true }).click();
  await expect(page.getByRole("heading", { name: "E2E Company", exact: true })).toBeVisible();

  await page.goto("/keywords");
  await page.getByLabel("关键词").fill("E2E AI");
  await page.getByRole("button", { name: "添加关键词" }).click();
  await expect(page.getByText("已订阅“E2E AI”")).toBeVisible();
  await expect(page.locator(".keyword-item", { hasText: "E2E AI" })).toBeVisible();
  await page.locator(".keyword-item", { hasText: "E2E AI" }).getByRole("button", { name: "删除" }).click();
  await expect(page.locator(".keyword-item", { hasText: "E2E AI" })).toHaveCount(0);

  await page.goto("/digests");
  await page.getByRole("link", { name: "E2E 周报" }).click();
  await expect(page.getByText("导出报告")).toBeVisible();
  await page.getByLabel("模板").selectOption("learning");
  await page.getByLabel("格式").selectOption("markdown");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载" }).click();
  expect((await download).suggestedFilename()).toMatch(/\.md$/);
});

test("filters, administration, and browser push controls are clickable", async ({ page, context }) => {
  await login(page, "e2e-admin@example.com");

  await page.goto("/relations");
  await page.getByLabel("对象").selectOption("entity");
  await page.locator('select[name="relation"]').selectOption("COOPERATES_WITH");
  await page.getByRole("button", { name: "筛选" }).click();
  await expect(page.locator(".relation-list")).toContainText("COOPERATES_WITH");

  await page.goto("/trends");
  await page.getByLabel("招聘").check();
  await page.getByLabel("7 天").check();
  await page.getByRole("button", { name: "应用" }).click();
  await expect(page.getByRole("heading", { name: "E2E AI Jobs" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "E2E Model Pro" })).toHaveCount(0);

  await page.goto("/admin/entities");
  await page.getByLabel("待合并实体").selectOption("e2e-entity-b");
  await page.getByLabel("保留实体").selectOption("e2e-entity-a");
  await page.getByLabel("合并原因").fill("Edge 真实点击验收");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "合并实体" }).click();
  await expect(page.getByText("已合并到 E2E Company")).toBeVisible();

  if (process.env.E2E_BROWSER_CHANNEL === "msedge") {
    await context.grantPermissions(["notifications"], { origin: new URL(page.url()).origin });
    await page.goto("/");
    await page.getByRole("button", { name: "开启推送" }).click();
    await expect(page.getByRole("status")).toContainText(/推送已开启|推送操作超时，请重试同步|浏览器推送服务拒绝注册/, { timeout: 20_000 });
    const pushEnabled = await page.getByRole("status").getByText("推送已开启", { exact: true }).count();
    if (pushEnabled) {
      await expect(page.getByRole("button", { name: "关闭推送" })).toBeEnabled();
      await page.getByRole("button", { name: "关闭推送" }).click();
      await expect(page.getByRole("status")).toHaveText("推送已关闭");
    } else {
      const endpoint = `https://push.example.invalid/e2e-${test.info().project.name}`;
      const subscription = { endpoint, keys: { p256dh: "e2e-p256dh", auth: "e2e-auth" } };
      expect((await page.request.post("/api/push/subscribe", { data: subscription })).ok()).toBeTruthy();
      expect((await page.request.delete("/api/push/subscribe", { data: { endpoint } })).ok()).toBeTruthy();
    }
  }
});
