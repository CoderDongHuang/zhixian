import sharp from "sharp";
import { mkdir } from "node:fs/promises";

await mkdir("public", { recursive: true });
await sharp("logo.png").extract({ left: 650, top: 940, width: 560, height: 245 }).png().toFile("public/brand-logo.png");
const icon = sharp("logo.png").extract({ left: 42, top: 600, width: 340, height: 340 });
await icon.clone().resize(512, 512).png().toFile("public/icon-512.png");
await icon.clone().resize(192, 192).png().toFile("public/icon-192.png");
await icon.clone().resize(180, 180).png().toFile("public/apple-touch-icon.png");
await icon.clone().resize(64, 64).png().toFile("public/favicon.png");
console.log("Brand assets generated in public/");
