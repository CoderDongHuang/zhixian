import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
try {
  const result = await prisma.$queryRawUnsafe("select current_database() as database, current_user as user");
  console.log(result);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
