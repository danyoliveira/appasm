// Client-only: crops an image file to a centered square and re-encodes it
// as a small JPEG, so uploaded photos (avatars, custom tactical players)
// are a predictable size/shape regardless of what the user picked.
export function cropToSquare(file: File, size = 512): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const cropSize = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("no canvas context"));
      ctx.drawImage(
        img,
        (img.width - cropSize) / 2,
        (img.height - cropSize) / 2,
        cropSize,
        cropSize,
        0,
        0,
        size,
        size,
      );
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("crop failed"))), "image/jpeg", 0.9);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
