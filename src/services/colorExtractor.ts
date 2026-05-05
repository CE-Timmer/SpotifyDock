export interface CoverGradientColors {
  primary: string;
  secondary: string;
}

const FALLBACK_COLORS: CoverGradientColors = {
  primary: "88,110,148",
  secondary: "76,124,108"
};

export async function extractAlbumColors(imageUrl?: string): Promise<CoverGradientColors> {
  if (!imageUrl) return FALLBACK_COLORS;

  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image-load-failed"));
    });
    img.src = imageUrl;
    await loaded;

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return FALLBACK_COLORS;

    const sampleW = 28;
    const sampleH = 28;
    canvas.width = sampleW;
    canvas.height = sampleH;
    ctx.drawImage(img, 0, 0, sampleW, sampleH);
    const data = ctx.getImageData(0, 0, sampleW, sampleH).data;

    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    let count = 0;

    let hiR = 0;
    let hiG = 0;
    let hiB = 0;
    let hiCount = 0;

    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3];
      if (a < 24) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;

      sumR += r;
      sumG += g;
      sumB += b;
      count += 1;

      if (luma >= 92) {
        hiR += r;
        hiG += g;
        hiB += b;
        hiCount += 1;
      }
    }

    if (count === 0) return FALLBACK_COLORS;

    const avgR = Math.round(sumR / count);
    const avgG = Math.round(sumG / count);
    const avgB = Math.round(sumB / count);

    const brightR = Math.round((hiCount ? hiR / hiCount : avgR) * 0.92 + 16);
    const brightG = Math.round((hiCount ? hiG / hiCount : avgG) * 0.92 + 16);
    const brightB = Math.round((hiCount ? hiB / hiCount : avgB) * 0.92 + 16);

    return {
      primary: `${clamp(brightR)},${clamp(brightG)},${clamp(brightB)}`,
      secondary: `${clamp(Math.round(avgR * 0.74))},${clamp(Math.round(avgG * 0.74))},${clamp(Math.round(avgB * 0.74))}`
    };
  } catch {
    return FALLBACK_COLORS;
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(255, value));
}
