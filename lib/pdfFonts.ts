import { Font } from "@react-pdf/renderer";

// react-pdf's built-in Helvetica only covers Western Latin — names like
// "Borevković" or "Kamiński" lost their accented letters in the PDF. Geist
// (the app's own typeface, shipped in /public/fonts) covers Latin Extended.
export const PDF_FONT = "Geist";

let registeredBase: string | null = null;

// `base` is where the .ttf files are served from — "/fonts" in the browser;
// a filesystem path when rendering from Node (tests).
export function registerPdfFonts(base = "/fonts") {
  if (registeredBase === base) return;
  registeredBase = base;
  Font.register({
    family: PDF_FONT,
    fonts: [
      { src: `${base}/Geist-Regular.ttf` },
      { src: `${base}/Geist-Bold.ttf`, fontWeight: 700 },
    ],
  });
  // Never split a word (a player's name, a URL) with a hyphen.
  Font.registerHyphenationCallback((word) => [word]);
}
