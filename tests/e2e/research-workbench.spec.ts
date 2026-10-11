import { test, expect } from "@playwright/test";
import { login, resetFixtures } from "./helpers";

test.beforeEach(async ({ request }) => { await resetFixtures(request); });

test("trusted research workbench covers subscriptions, evidence, collections, timeline, sharing, and corrections", async ({ page, browser }) => {
  await login(page);

  await page.goto("/research");
  await page.getByLabel("专题名称").fill("E2E 可信研究");
  await page.getByLabel("研究目标或说明").fill("核对重要变化与冲突证据");
  await page.getByRole("button", { name: "新建专题" }).click();
  await expect(page.getByRole("heading", { name: "E2E 可信研究" })).toBeVisible();
  const collectionPanel = page.locator(".collection-panel");
  await collectionPanel.getByRole("button", { name: "编辑专题" }).click();
  await collectionPanel.getByLabel("专题名称").fill("E2E 可信研究（已编辑）");
  const saved = page.waitForResponse((response) => response.url().includes("/api/research/collections/") && response.request().method() === "PATCH");
  await collectionPanel.getByRole("button", { name: "保存", exact: true }).click();
  expect((await saved).ok()).toBeTruthy();
  await expect(page.getByRole("heading", { name: "E2E 可信研究（已编辑）" })).toBeVisible();
  const collectionData = await (await page.request.get("/api/research/collections")).json() as { collections: { id: string; title: string }[] };
  expect(collectionData.collections[0].title).toBe("E2E 可信研究（已编辑）");
  const collectionId = collectionData.collections[0].id;

  await page.goto("/entities/e2e-entity-a");
  await page.getByRole("button", { name: "关注实体" }).click();
  await expect(page.getByText("已关注，将在工作台汇总相关变化")).toBeVisible();
  await page.getByRole("button", { name: "加入研究专题" }).click();
  await page.getByPlaceholder("添加个人笔记（可选）").fill("实体笔记");
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await expect(page.getByText("已加入研究专题")).toBeVisible();

  await page.goto("/events/e2e-event-ai");
  await expect(page.getByRole("heading", { name: "证据对照" })).toBeVisible();
  await expect(page.getByText("E2E supporting evidence")).toBeVisible();
  await expect(page.getByText("E2E conflicting evidence")).toBeVisible();
  await page.getByRole("button", { name: "加入研究专题" }).click();
  await page.getByPlaceholder("添加个人笔记（可选）").fill("事件判断");
  await page.getByRole("button", { name: "添加", exact: true }).click();
  await expect(page.getByText("已加入研究专题")).toBeVisible();

  await page.goto("/research/timeline?entityId=e2e-entity-a&days=30");
  await expect(page.getByRole("heading", { name: "E2E Company的重要变化" })).toBeVisible();
  await expect(page.getByText("E2E 版本发布")).toBeVisible();

  await page.goto("/research");
  const shareResponse = page.waitForResponse((response) => response.url().includes("/api/research/collections/") && response.url().endsWith("/share") && response.request().method() === "POST");
  await page.getByRole("button", { name: "创建只读分享" }).click();
  const shareData = await (await shareResponse).json() as { id: string; url: string };
  await expect(page.getByText(/已创建版本 1/)).toBeVisible();

  const publicContext = await browser.newContext();
  const publicPage = await publicContext.newPage();
  await publicPage.goto(shareData.url);
  await expect(publicPage.getByRole("heading", { name: "E2E 可信研究（已编辑）" })).toBeVisible();
  await expect(publicPage.getByText("实体笔记")).toBeVisible();

  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await login(other, "e2e-b@example.com");
  expect((await other.request.patch(`/api/research/collections/${collectionId}`, { data: { title: "越权修改" } })).status()).toBe(404);
  expect((await other.request.post(`/api/research/collections/${collectionId}/items`, { data: { targetType: "ENTITY", targetId: "e2e-entity-a" } })).status()).toBe(404);
  expect((await other.request.delete(`/api/research/shares/${shareData.id}`)).status()).toBe(404);
  await otherContext.close();

  await page.request.post("/api/feed/e2e-feed-ai/feedback", { data: { helpful: true } });
  await page.request.post("/api/feed/e2e-feed-ai/feedback", { data: { report: "来源与结论不一致" } });
  const adminContext = await browser.newContext();
  const admin = await adminContext.newPage();
  await login(admin, "e2e-admin@example.com");
  await admin.goto("/admin/reviews#corrections");
  await expect(admin.getByText("来源与结论不一致")).toBeVisible();
  await admin.getByPlaceholder("说明已修订内容，或说明不采纳的依据").fill("已补充冲突来源并修订结论");
  await admin.getByRole("button", { name: "标记已修订" }).click();
  await admin.waitForURL(/admin\/reviews/);
  await adminContext.close();

  await page.goto("/research");
  await expect(page.getByText("纠错反馈已有处理结果")).toBeVisible();
  await expect(page.getByText("已补充冲突来源并修订结论")).toBeVisible();

  await page.request.delete(`/api/research/shares/${shareData.id}`);
  await publicPage.reload();
  await expect(publicPage.getByText("404")).toBeVisible();
  await publicContext.close();
});

test("collection create and edit persist when RSC refresh requests are unavailable", async ({ page }) => {
  await login(page);
  await page.goto("/research");
  await page.route((url) => url.searchParams.has("_rsc"), (route) => route.abort());
  await page.getByLabel("专题名称").fill("E2E 刷新故障专题");
  await page.getByRole("button", { name: "新建专题" }).click();
  const panel = page.locator(".collection-panel");
  await expect(panel.getByRole("heading", { name: "E2E 刷新故障专题", exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "编辑专题" }).click();
  await panel.getByLabel("专题名称").fill("E2E 刷新故障专题已保存");
  await panel.getByLabel("研究说明").fill("重新加载也应保留");
  await panel.getByRole("button", { name: "保存", exact: true }).click();
  await expect(panel.getByRole("heading", { name: "E2E 刷新故障专题已保存", exact: true })).toBeVisible();
  await page.reload();
  await panel.getByRole("button", { name: "编辑专题" }).click();
  await expect(panel.getByLabel("专题名称")).toHaveValue("E2E 刷新故障专题已保存");
  await expect(panel.getByLabel("研究说明")).toHaveValue("重新加载也应保留");
  const data = await (await page.request.get("/api/research/collections")).json();
  expect(data.collections).toHaveLength(1);
  expect(data.collections[0].title).toBe("E2E 刷新故障专题已保存");
});
