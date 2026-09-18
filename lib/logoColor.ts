// Extracts a representative color from a club crest, client-side only —
// used to color tactical-board pins by team instead of a fixed color that
// can clash with (or just not look like) the actual club.
const DEFAULT_COLOR = "#334155"; // slate-700 fallback while loading/on failure

const colorCache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function extractDominantColor(url: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        // Quantized-color histogram, skipping transparent/near-white/
        // near-black pixels (background and outline noise, not the crest).
        const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 128) continue;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          if (max > 235 && min > 200) continue;
          if (max < 30) continue;
          const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
          const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
          bucket.count += 1;
          bucket.r += r;
          bucket.g += g;
          bucket.b += b;
          buckets.set(key, bucket);
        }

        let best: { count: number; r: number; g: number; b: number } | null = null;
        for (const bucket of buckets.values()) {
          if (!best || bucket.count > best.count) best = bucket;
        }
        resolve(
          best
            ? rgbToHex(
                Math.round(best.r / best.count),
                Math.round(best.g / best.count),
                Math.round(best.b / best.count),
              )
            : DEFAULT_COLOR,
        );
      } catch {
        resolve(DEFAULT_COLOR);
      }
    };
    img.onerror = () => resolve(DEFAULT_COLOR);
    img.src = url;
  });
}

export function getLogoColor(url: string | null | undefined): Promise<string> {
  if (!url) return Promise.resolve(DEFAULT_COLOR);
  if (colorCache.has(url)) return Promise.resolve(colorCache.get(url)!);
  const inFlight = pending.get(url);
  if (inFlight) return inFlight;
  const promise = extractDominantColor(url).then((color) => {
    colorCache.set(url, color);
    pending.delete(url);
    return color;
  });
  pending.set(url, promise);
  return promise;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h * 60, s, l };
}

const vividColorCache = new Map<string, string>();
const vividPending = new Map<string, Promise<string>>();

// Same crest sampling as extractDominantColor, but picks the most saturated
// common color instead of the most frequent one — a badge's most frequent
// pixel is often a neutral outline/background, not the "loud" brand color a
// UI accent should borrow.
function extractVividColor(url: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 24;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("no 2d context");
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        const buckets = new Map<string, { count: number; r: number; g: number; b: number }>();
        let total = 0;
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];
          if (a < 128) continue;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          if (max > 235 && min > 200) continue;
          if (max < 30) continue;
          total += 1;
          const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
          const bucket = buckets.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
          bucket.count += 1;
          bucket.r += r;
          bucket.g += g;
          bucket.b += b;
          buckets.set(key, bucket);
        }

        // Ignore buckets too small to be a real crest color (stray
        // anti-aliasing pixels), then take whichever survivor is most
        // saturated.
        const minCount = Math.max(3, total * 0.03);
        let best: { r: number; g: number; b: number; s: number } | null = null;
        for (const bucket of buckets.values()) {
          if (bucket.count < minCount) continue;
          const r = Math.round(bucket.r / bucket.count);
          const g = Math.round(bucket.g / bucket.count);
          const b = Math.round(bucket.b / bucket.count);
          const { s } = rgbToHsl(r, g, b);
          if (!best || s > best.s) best = { r, g, b, s };
        }
        resolve(best ? rgbToHex(best.r, best.g, best.b) : DEFAULT_COLOR);
      } catch {
        resolve(DEFAULT_COLOR);
      }
    };
    img.onerror = () => resolve(DEFAULT_COLOR);
    img.src = url;
  });
}

export function getVividLogoColor(url: string | null | undefined): Promise<string> {
  if (!url) return Promise.resolve(DEFAULT_COLOR);
  if (vividColorCache.has(url)) return Promise.resolve(vividColorCache.get(url)!);
  const inFlight = vividPending.get(url);
  if (inFlight) return inFlight;
  const promise = extractVividColor(url).then((color) => {
    vividColorCache.set(url, color);
    vividPending.delete(url);
    return color;
  });
  vividPending.set(url, promise);
  return promise;
}

function relativeLuminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// White text on a dark pin, dark text on a light one.
export function contrastTextColor(bgHex: string): string {
  return relativeLuminance(bgHex) > 0.45 ? "#111827" : "#ffffff";
}

function colorDistance(a: string, b: string): number {
  const ar = parseInt(a.slice(1, 3), 16);
  const ag = parseInt(a.slice(3, 5), 16);
  const ab = parseInt(a.slice(5, 7), 16);
  const br = parseInt(b.slice(1, 3), 16);
  const bg = parseInt(b.slice(3, 5), 16);
  const bb = parseInt(b.slice(5, 7), 16);
  return Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2);
}

const NEUTRAL_DARK = "#0f172a"; // slate-900 — the board's original default

// If the opponent's own crest color is too close to ours to tell the two
// sides apart on the pitch, fall back to a safe neutral dark instead.
export function resolveOpponentColor(ourColor: string, opponentColor: string): string {
  return colorDistance(ourColor, opponentColor) < 90 ? NEUTRAL_DARK : opponentColor;
}
