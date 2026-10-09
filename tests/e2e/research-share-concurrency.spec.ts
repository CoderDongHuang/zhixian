import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { login, resetFixtures } from "./helpers";

test("concurrent HTTP shares allocate unique versions and remain frozen", async ({ page, request }) => {
  await resetFixtures(request);
  await login(page);
  const { collection } = await (await page.request.post("/api/research/collections", { data: { title: "Concurrent shares" } })).json();
  const db = new PrismaClient();
  try {
    const responses = await Promise.all(Array.from({ length: 8 }, () => page.request.post(`/api/research/collections/${collection.id}/share`)));
    for (const response of responses) expect(response.status()).toBe(201);
    const values = await Promise.all(responses.map((r) => r.json()));
    expect(values.map((v) => v.version).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    await db.researchCollection.update({ where: { id: collection.id }, data: { title: "Edited title" } });
    await page.goto(values[0].url);
    await expect(page.getByRole("heading", { name: "Concurrent shares", exact: true })).toBeVisible();
    await expect(page.getByText(`只读版本 ${values[0].version}`, { exact: true })).toBeVisible();
  } finally { await db.researchCollection.delete({ where: { id: collection.id } }); await db.$disconnect(); }
});
