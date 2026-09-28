// Accent/case-insensitive comparison key, so "joao" finds "João".
export function normalize(text: string) {
  return text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function capitalize(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
