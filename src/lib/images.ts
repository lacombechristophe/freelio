import sharp from "sharp"

/**
 * Optimizes an image for the web (logo or receipt).
 * Resizes to max 800px width and converts to WebP.
 */
export async function optimizeImage(buffer: Buffer) {
  return await sharp(buffer)
    .resize(800, null, { withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer()
}

/**
 * Specifically for logos: makes them square or preserved aspect ratio,
 * removes background if possible (basic alpha treatment).
 */
export async function optimizeLogo(buffer: Buffer) {
  return await sharp(buffer)
    .resize(400, 400, { fit: "inside" })
    .webp({ quality: 90 })
    .toBuffer()
}
