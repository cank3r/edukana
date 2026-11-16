import sharp from "sharp";

// Exact raster derivative of the official artwork; no external image or redesign.
await sharp("public/logos/edukana_horizontal_sin_firma.svg")
  .resize({ width: 624 }).flatten({ background: "#FFFFFF" }).png()
  .toFile("public/logos/edukana_email.png");
console.log("Official email logo rendered at 4x display size.");
