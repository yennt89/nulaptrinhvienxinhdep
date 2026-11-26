import type { ModuleItem, VocabCard, WorkplaceCard } from "./types";
import {
  parseConvCardBack,
  parseDevCardBack,
  parsePhraseContent,
} from "./parse";

export type StudyFace = {
  title: string;
  lines: string[];
};

export type ResolvedCard = {
  id: string;
  front: StudyFace;
  back: StudyFace;
  hint: string;
  audioId: string;
};

export function chunkItems<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export function padRangeLabel(start: number, end: number, width = 3): string {
  return `${String(start).padStart(width, "0")}–${String(end).padStart(width, "0")}`;
}

export function resolveCard(
  item: ModuleItem,
  workplace?: WorkplaceCard,
  vocab?: VocabCard,
): ResolvedCard {
  const content = parsePhraseContent({ title: item.title, body: item.body });
  const frontTitle =
    workplace?.pattern?.trim() ||
    vocab?.word?.trim() ||
    content.english ||
    item.title;

  if (vocab) {
    return {
      id: item.id,
      audioId: item.id,
      front: { title: frontTitle, lines: [] },
      hint: vocab.ipa || vocab.meaning || "Không có gợi ý",
      back: {
        title: vocab.ipa || vocab.meaning,
        lines: [
          vocab.meaning && vocab.ipa ? vocab.meaning : "",
          ...vocab.examples.flatMap((ex) =>
            [ex.en, ex.vi ? `→ ${ex.vi}` : ""].filter(Boolean),
          ),
        ].filter(Boolean),
      },
    };
  }

  if (workplace) {
    return {
      id: item.id,
      audioId: item.id,
      front: { title: frontTitle, lines: [] },
      hint: workplace.meaning || "Không có gợi ý",
      back: {
        title: workplace.meaning || "(Chưa có nghĩa)",
        lines: workplace.examples,
      },
    };
  }

  if (item.id.startsWith("dev-")) {
    const back = parseDevCardBack(item.body);
    return {
      id: item.id,
      audioId: item.id,
      front: { title: frontTitle, lines: [] },
      hint: back?.ipa || back?.note || "Không có gợi ý",
      back: {
        title: back?.ipa || "(Chưa có phiên âm)",
        lines: back?.note ? [back.note] : [],
      },
    };
  }

  if (item.id.startsWith("conv-")) {
    const back = parseConvCardBack(item.body);
    return {
      id: item.id,
      audioId: item.id,
      front: { title: frontTitle, lines: [] },
      hint: back?.questionMeaning || "Không có gợi ý",
      back: {
        title: back?.questionMeaning || content.meaning || "(Chưa có nghĩa)",
        lines: [back?.answer, back?.answerMeaning].filter(Boolean) as string[],
      },
    };
  }

  return {
    id: item.id,
    audioId: item.id,
    front: { title: frontTitle, lines: [] },
    hint: content.meaning || content.examples[0] || "Không có gợi ý",
    back: {
      title: content.meaning || "(Chưa có nghĩa)",
      lines: content.examples.slice(0, 3),
    },
  };
}

export function shuffleIds(ids: string[]): string[] {
  const next = [...ids];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}
