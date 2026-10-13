/** Sentence-aware splitting for Groq Orpheus (200-character maximum per call). */
export function chunkSpeech(text: string, maxChars = 180): string[] {
  if (!Number.isInteger(maxChars) || maxChars < 10 || maxChars > 200) {
    throw new RangeError("maxChars must be an integer between 10 and 200");
  }
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [clean];
  const chunks: string[] = [];
  let current = "";
  const flush = () => {
    if (current) chunks.push(current);
    current = "";
  };
  const append = (piece: string) => {
    if (!piece) return;
    if (piece.length > maxChars) {
      throw new RangeError("Word longer than maximum TTS chunk length");
    }
    const combined = current ? `${current} ${piece}` : piece;
    if (combined.length > maxChars) flush();
    current = current ? `${current} ${piece}` : piece;
  };
  for (const sentence of sentences) {
    const piece = sentence.trim();
    if (piece.length <= maxChars) {
      append(piece);
    } else {
      flush();
      for (const word of piece.split(/\s+/)) append(word);
      flush();
    }
  }
  flush();
  return chunks;
}
