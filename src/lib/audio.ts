/** MP3 path mirror Flutter `devSentenceAsset`. */
export function sentenceAudioSrc(id: string): string | null {
  const raw = id.trim();
  const rules: Array<{ re: RegExp; folder: string }> = [
    { re: /^dev-(\d{1,2})$/, folder: "dev" },
    { re: /^work-(\d{1,2})$/, folder: "work" },
    { re: /^conv-(\d{1,2})$/, folder: "conv" },
    { re: /^vocab-(\d{1,3})$/, folder: "vocab" },
  ];

  for (const { re, folder } of rules) {
    const match = re.exec(raw);
    if (!match) continue;
    const n = Number.parseInt(match[1], 10);
    if (!Number.isFinite(n) || n < 1) return null;
    const width = raw.startsWith("vocab-") ? 3 : 2;
    return `/audio/${folder}/${String(n).padStart(width, "0")}.mp3`;
  }
  return null;
}
