import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();
const code = randomBytes(6).toString("hex").toUpperCase();
await prisma.invitation.create({ data: { code, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } });
console.log(`Invitation code: ${code}`);
await prisma.$disconnect();
