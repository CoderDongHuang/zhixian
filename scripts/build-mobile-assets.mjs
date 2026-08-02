import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const output = "mobile-app/assets";
await mkdir(output, { recursive: true });
const icon = sharp("public/icon-512.png");
await icon.clone().resize(1024, 1024, { kernel: "lanczos3" }).png().toFile(`${output}/icon.png`);
await icon.clone().resize(720, 720).extend({ top: 152, bottom: 152, left: 152, right: 152, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(`${output}/adaptive-icon.png`);

const mark = await icon.clone().resize(512, 512).flatten({ background: "white" }).greyscale().raw().toBuffer({ resolveWithObject: true });
const notification = Buffer.alloc(mark.info.width * mark.info.height * 4);
for (let source = 0, target = 0; source < mark.data.length; source++, target += 4) { notification[target] = 255; notification[target + 1] = 255; notification[target + 2] = 255; notification[target + 3] = Math.max(0, 255 - mark.data[source]); }
await sharp(notification, { raw: { width: mark.info.width, height: mark.info.height, channels: 4 } }).trim({ threshold: 8 }).resize(192, 192, { fit: "contain" }).extend({ top: 32, bottom: 32, left: 32, right: 32, background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(`${output}/notification-icon.png`);

const logo = await sharp("public/brand-logo.png").resize({ width: 760, withoutEnlargement: true }).png().toBuffer();
await sharp({ create: { width: 1200, height: 2400, channels: 4, background: "#f7f8fa" } }).composite([{ input: logo, gravity: "center" }]).png().toFile(`${output}/splash.png`);
const featureIcon = await icon.clone().resize(320, 320).png().toBuffer();
const featureLogo = await sharp("public/brand-logo.png").resize({ width: 560, withoutEnlargement: true }).png().toBuffer();
await sharp({ create: { width: 1024, height: 500, channels: 4, background: "#f7f8fa" } }).composite([{ input: featureIcon, left: 72, top: 90 }, { input: featureLogo, left: 410, top: 165 }]).png().toFile(`${output}/store-feature.png`);
console.log(`Mobile assets generated in ${output}/`);
