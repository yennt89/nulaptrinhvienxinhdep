import type { ConvCardBack, DevCardBack, PhraseContent } from "./types";

function looksEnglish(s: string): boolean {
  const letters = (s.match(/[A-Za-z]/g) ?? []).length;
  const viet = (
    s.match(
      /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/gi,
    ) ?? []
  ).length;
  return letters >= 2 && letters > viet;
}

function firstMatch(text: string, re: RegExp): string | null {
  const m = re.exec(text);
  return m?.[1]?.trim() ?? null;
}

function guessVietnameseLine(body: string): string | null {
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    if (
      t.startsWith("Phần:") ||
      t.startsWith("Mẫu:") ||
      t.startsWith("Ví dụ:") ||
      t.startsWith("Nghĩa:")
    ) {
      continue;
    }
    if (!looksEnglish(t) && t.length >= 2) return t;
  }
  return null;
}

function firstEnglishLine(body: string): string {
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (looksEnglish(t) && t.length >= 2) return t;
  }
  return body.trim();
}

/** Parse body module (phrase/vocab) — mirror Flutter phrase_parser. */
export function parsePhraseContent({
  title,
  body,
  preview,
}: {
  title: string;
  body: string;
  preview?: string;
}): PhraseContent {
  const meaning =
    firstMatch(body, /Nghĩa:\s*(.+)/m) ??
    guessVietnameseLine(body) ??
    (preview?.trim() ? preview.trim() : "");

  const examples = [...body.matchAll(/Ví dụ:\s*(.+)/gm)]
    .map((m) => m[1].trim())
    .filter((e) => e && looksEnglish(e));

  return {
    english: title.trim() || firstEnglishLine(body),
    meaning: meaning.replace(/\s+/g, " ").trim(),
    examples,
  };
}

/** Mặt sau thẻ 60 câu lập trình viên. */
export function parseDevCardBack(body: string): DevCardBack | null {
  let ipa: string | undefined;
  let note: string | undefined;

  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("Nhóm:") || line.startsWith("Câu:")) continue;
    const text = line.startsWith("Phiên âm:")
      ? line.slice("Phiên âm:".length).trim()
      : line;
    if (ipa == null && text.startsWith("/")) {
      ipa = text;
      continue;
    }
    if (ipa != null && note == null && text) {
      note = text;
      break;
    }
  }

  if (!ipa && !note) return null;
  return { ipa: ipa ?? "", note: note ?? "" };
}

/** Mặt sau hội thoại. */
export function parseConvCardBack(body: string): ConvCardBack | null {
  const lines = body
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const after = (prefix: string): string => {
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].startsWith(prefix) || i + 1 >= lines.length) continue;
      const next = lines[i + 1];
      if (
        next.startsWith("Q:") ||
        next.startsWith("A:") ||
        next.startsWith("Chủ đề:")
      ) {
        return "";
      }
      return next;
    }
    return "";
  };

  let answer = "";
  for (const line of lines) {
    if (line.startsWith("A:")) {
      answer = line.slice(2).trim();
      break;
    }
  }

  const back: ConvCardBack = {
    questionMeaning: after("Q:"),
    answer,
    answerMeaning: after("A:"),
  };

  if (!back.questionMeaning && !back.answer && !back.answerMeaning) return null;
  return back;
}
