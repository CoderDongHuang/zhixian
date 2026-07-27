import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const tree = {
  "AI 行业": ["基础模型", "AI 应用", "开源项目", "AI 芯片与基础设施", "多模态", "机器人", "AI 安全", "AI 教育与生产力"],
};
for (const [rootName, children] of Object.entries(tree)) {
  const root = await prisma.industryNode.upsert({ where: { slug: rootName.toLowerCase().replace(/\s+/g, "-") }, update: {}, create: { name: rootName, slug: rootName.toLowerCase().replace(/\s+/g, "-") } });
  for (const [index, name] of children.entries()) await prisma.industryNode.upsert({ where: { slug: name.toLowerCase().replace(/\s+/g, "-") }, update: { parentId: root.id, sortOrder: index }, create: { name, slug: name.toLowerCase().replace(/\s+/g, "-"), parentId: root.id, sortOrder: index } });
}
console.log("Industry tree seeded"); await prisma.$disconnect();
