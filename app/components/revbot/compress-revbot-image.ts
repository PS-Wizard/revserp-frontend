import type { AITurnImage } from "~/lib/api.types"

const MAX_LONG_SIDE = 2048
const JPEG_QUALITY = 0.8

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("Failed to decode image"))
    }
    image.src = url
  })
}

async function sourceToBitmap(
  file: File
): Promise<ImageBitmap | HTMLImageElement> {
  try {
    return await createImageBitmap(file)
  } catch {
    return loadImage(file)
  }
}

function blobToRawBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== "string") {
        reject(new Error("Failed to read image"))
        return
      }
      const comma = result.indexOf(",")
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = () =>
      reject(reader.error ?? new Error("Failed to read image"))
    reader.readAsDataURL(blob)
  })
}

function closeBitmap(source: ImageBitmap | HTMLImageElement) {
  if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) {
    source.close()
  }
}

/** Resize to max 2048px long side and encode as JPEG 0.8. Returns null on failure. */
export async function compressRevbotImage(
  file: File
): Promise<AITurnImage | null> {
  try {
    const source = await sourceToBitmap(file)
    const width = source.width
    const height = source.height
    if (!width || !height) {
      closeBitmap(source)
      return null
    }

    const longSide = Math.max(width, height)
    const scale = longSide > MAX_LONG_SIDE ? MAX_LONG_SIDE / longSide : 1
    const targetWidth = Math.max(1, Math.round(width * scale))
    const targetHeight = Math.max(1, Math.round(height * scale))

    const canvas = document.createElement("canvas")
    canvas.width = targetWidth
    canvas.height = targetHeight
    const context = canvas.getContext("2d")
    if (!context) {
      closeBitmap(source)
      return null
    }
    context.drawImage(source, 0, 0, targetWidth, targetHeight)
    closeBitmap(source)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    })
    if (!blob) return null

    const data = await blobToRawBase64(blob)
    if (!data) return null
    return { media_type: "image/jpeg", data }
  } catch {
    return null
  }
}
