import sharp from "sharp";

// The header and all browser/install icons share this outlined, font-independent mark.
for (const [name, size] of [["icon-512.png", 512], ["icon-192.png", 192], ["apple-touch-icon.png", 180], ["favicon.png", 64]]) {
  await sharp("public/brand-mark.svg").resize(size, size).png().toFile(`public/${name}`);
}
console.log("Browser brand icons generated from public/brand-mark.svg");
