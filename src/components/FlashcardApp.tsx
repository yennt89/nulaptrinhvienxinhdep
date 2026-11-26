"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { sentenceAudioSrc } from "../lib/audio";
import {
  chunkItems,
  padRangeLabel,
  resolveCard,
  shuffleIds,
  type ResolvedCard,
} from "../lib/study";
import type { ModulesFile, VocabCard, WorkplaceCard } from "../lib/types";

type WorkplaceMap = Record<string, WorkplaceCard>;
type VocabMap = Record<string, VocabCard>;
type StudyMode = "cards" | "learn" | "test";
type SortBucket = "learning" | "know";

const CHUNK = 10;
const STAR_KEY = "nltv-flash-stars";
const SORT_KEY = "nltv-flash-sort";

function loadJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function FlashcardApp() {
  const [data, setData] = useState<ModulesFile | null>(null);
  const [workplace, setWorkplace] = useState<WorkplaceMap>({});
  const [vocab, setVocab] = useState<VocabMap>({});
  const [error, setError] = useState<string | null>(null);

  const [moduleId, setModuleId] = useState<string | null>(null);
  const [chunkIndex, setChunkIndex] = useState(0);
  const [studyMode, setStudyMode] = useState<StudyMode>("cards");

  const [order, setOrder] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [shuffled, setShuffled] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [termFirst, setTermFirst] = useState(true);
  const [starredOnly, setStarredOnly] = useState(false);
  const [sortingOn, setSortingOn] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [roundDone, setRoundDone] = useState(false);

  const [stars, setStars] = useState<Record<string, boolean>>({});
  const [sortMap, setSortMap] = useState<Record<string, SortBucket>>({});

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setStars(loadJson(STAR_KEY, {}));
    setSortMap(loadJson(SORT_KEY, {}));
  }, []);

  useEffect(() => {
    localStorage.setItem(STAR_KEY, JSON.stringify(stars));
  }, [stars]);

  useEffect(() => {
    localStorage.setItem(SORT_KEY, JSON.stringify(sortMap));
  }, [sortMap]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [modulesRes, workRes, vocabRes] = await Promise.all([
          fetch("/data/modules.json"),
          fetch("/data/workplace_cards.json"),
          fetch("/data/vocab_cards.json"),
        ]);
        if (!modulesRes.ok || !workRes.ok || !vocabRes.ok) {
          throw new Error("Không tải được dữ liệu mock JSON");
        }
        const modulesJson = (await modulesRes.json()) as ModulesFile;
        const workList = (await workRes.json()) as WorkplaceCard[];
        const vocabList = (await vocabRes.json()) as VocabCard[];
        if (cancelled) return;
        const workMap: WorkplaceMap = {};
        for (const item of workList) workMap[item.id] = item;
        const vocabMap: VocabMap = {};
        for (const item of vocabList) vocabMap[item.id] = item;
        setData(modulesJson);
        setWorkplace(workMap);
        setVocab(vocabMap);
        setModuleId(modulesJson.modules[0]?.id ?? null);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Lỗi tải dữ liệu");
        }
      }
    })();
    return () => {
      cancelled = true;
      audioRef.current?.pause();
    };
  }, []);

  const modules = data?.modules ?? [];
  const selected =
    modules.find((m) => m.id === moduleId) ?? modules[0] ?? null;
  const allItems = selected?.items ?? [];
  const chunks = useMemo(() => chunkItems(allItems, CHUNK), [allItems]);
  const safeChunk = chunks.length
    ? Math.min(chunkIndex, chunks.length - 1)
    : 0;
  const chunkItemsList = useMemo(
    () => chunks[safeChunk] ?? [],
    [chunks, safeChunk],
  );

  const resolvedMap = useMemo(() => {
    const map: Record<string, ResolvedCard> = {};
    for (const item of chunkItemsList) {
      map[item.id] = resolveCard(item, workplace[item.id], vocab[item.id]);
    }
    return map;
  }, [chunkItemsList, workplace, vocab]);

  const baseIds = useMemo(
    () => chunkItemsList.map((i) => i.id),
    [chunkItemsList],
  );
  const deckKey = `${moduleId ?? ""}:${safeChunk}:${baseIds.join(",")}`;

  const rebuildOrder = useCallback(
    (opts?: { shuffle?: boolean; starred?: boolean }) => {
      const useShuffle = opts?.shuffle ?? shuffled;
      const useStarred = opts?.starred ?? starredOnly;
      let ids = [...baseIds];
      if (useStarred) ids = ids.filter((id) => stars[id]);
      if (useShuffle) ids = shuffleIds(ids);
      setOrder(ids);
      setIndex(0);
      setFlipped(false);
      setShowHint(false);
      setRoundDone(ids.length === 0);
    },
    [baseIds, shuffled, starredOnly, stars],
  );

  useEffect(() => {
    setShuffled(false);
    setStarredOnly(false);
    setAutoplay(false);
    setOrder([...baseIds]);
    setIndex(0);
    setFlipped(false);
    setShowHint(false);
    setRoundDone(baseIds.length === 0);
  }, [deckKey]);

  const visibleIds = order;
  const safeIndex = visibleIds.length
    ? Math.min(index, visibleIds.length - 1)
    : 0;
  const currentId = visibleIds[safeIndex];
  const card = currentId ? resolvedMap[currentId] : null;
  const starredCount = baseIds.filter((id) => stars[id]).length;

  const stopAudio = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.pause();
    a.currentTime = 0;
  }, []);

  const speak = useCallback(
    async (id: string) => {
      const src = sentenceAudioSrc(id);
      stopAudio();
      if (!src) return;
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = src;
      try {
        await audio.play();
      } catch {
        return;
      }
      await new Promise<void>((resolve) => {
        const done = () => {
          audio.removeEventListener("ended", done);
          audio.removeEventListener("error", done);
          resolve();
        };
        audio.addEventListener("ended", done);
        audio.addEventListener("error", done);
      });
    },
    [stopAudio],
  );

  const flip = useCallback(() => {
    setFlipped((v) => !v);
    setShowHint(false);
  }, []);

  const goPrev = useCallback(() => {
    if (safeIndex <= 0) return;
    stopAudio();
    setIndex(safeIndex - 1);
    setFlipped(false);
    setShowHint(false);
  }, [safeIndex, stopAudio]);

  const goNext = useCallback(() => {
    if (safeIndex >= visibleIds.length - 1) {
      setRoundDone(true);
      setAutoplay(false);
      return;
    }
    stopAudio();
    setIndex(safeIndex + 1);
    setFlipped(false);
    setShowHint(false);
  }, [safeIndex, visibleIds.length, stopAudio]);

  const toggleStar = useCallback(() => {
    if (!currentId) return;
    setStars((prev) => ({ ...prev, [currentId]: !prev[currentId] }));
  }, [currentId]);

  const markSort = useCallback(
    (bucket: SortBucket) => {
      if (!currentId) return;
      setSortMap((prev) => ({ ...prev, [currentId]: bucket }));
      goNext();
    },
    [currentId, goNext],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (studyMode !== "cards") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        flip();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key.toLowerCase() === "s") {
        e.preventDefault();
        toggleStar();
      } else if (e.key.toLowerCase() === "l") {
        e.preventDefault();
        setStarredOnly((v) => {
          const next = !v;
          rebuildOrder({ starred: next });
          return next;
        });
      } else if (e.key.toLowerCase() === "p") {
        e.preventDefault();
        setAutoplay((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [studyMode, flip, goNext, goPrev, toggleStar, rebuildOrder]);

  useEffect(() => {
    if (!autoplay || studyMode !== "cards" || !card || roundDone) return;
    let cancelled = false;
    const run = async () => {
      setFlipped(false);
      setShowHint(false);
      await speak(card.audioId);
      if (cancelled) return;
      setFlipped(true);
      await speak(card.audioId);
      if (cancelled) return;
      goNext();
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [autoplay, safeIndex, currentId, studyMode, roundDone]);

  useEffect(() => {
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  const toggleFullscreen = async () => {
    const el = stageRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  };

  if (error) {
    return <Centered>{error}</Centered>;
  }
  if (!data || !selected) {
    return <Centered>Đang tải flashcards…</Centered>;
  }

  const progressPct = visibleIds.length
    ? ((safeIndex + (roundDone ? 1 : 0)) / visibleIds.length) * 100
    : 0;

  return (
    <main
      ref={stageRef}
      className={`mx-auto flex min-h-full w-full max-w-5xl flex-1 flex-col px-4 py-5 sm:px-6 ${
        fullscreen ? "bg-[#f6f7fb] px-6 py-8" : ""
      }`}
    >
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-[var(--muted)] uppercase">
            NLTV English
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-extrabold text-[var(--ink)] sm:text-3xl">
            {selected.title}
          </h1>
        </div>
        <p className="text-sm text-[var(--muted)]">
          Space lật · ← → chuyển · S sao · P tự chạy
        </p>
      </header>

      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        {modules.map((m) => {
          const active = m.id === selected.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                stopAudio();
                setModuleId(m.id);
                setChunkIndex(0);
                setStudyMode("cards");
              }}
              className={`shrink-0 rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                active
                  ? "bg-[var(--navy)] text-white"
                  : "bg-white text-[var(--navy)] ring-1 ring-[var(--line)] hover:bg-[var(--amber-soft)]"
              }`}
            >
              {m.title}
            </button>
          );
        })}
      </div>

      {chunks.length > 1 ? (
        <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
          {chunks.map((chunk, i) => {
            const first = chunk[0]?.order ?? i * CHUNK + 1;
            const last =
              chunk[chunk.length - 1]?.order ?? i * CHUNK + chunk.length;
            const active = i === safeChunk;
            return (
              <button
                key={`chunk-${i}`}
                type="button"
                onClick={() => {
                  stopAudio();
                  setChunkIndex(i);
                  setStudyMode("cards");
                }}
                className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold tracking-wide ${
                  active
                    ? "bg-[#d9e8ff] text-[#1a4cff]"
                    : "bg-white text-[var(--muted)] ring-1 ring-[var(--line)]"
                }`}
              >
                {padRangeLabel(first, last)}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-3 gap-2 rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-[var(--line)]">
        <ModeTab
          active={studyMode === "cards"}
          onClick={() => setStudyMode("cards")}
          icon={<CardsIcon />}
          label="Thẻ ghi nhớ"
        />
        <ModeTab
          active={studyMode === "learn"}
          onClick={() => setStudyMode("learn")}
          icon={<LearnIcon />}
          label="Học"
        />
        <ModeTab
          active={studyMode === "test"}
          onClick={() => setStudyMode("test")}
          icon={<TestIcon />}
          label="Kiểm tra"
        />
      </div>

      {studyMode !== "cards" ? (
        <PlaceholderMode
          mode={studyMode}
          onBack={() => setStudyMode("cards")}
        />
      ) : roundDone ? (
        <RoundDone
          total={visibleIds.length}
          starred={starredCount}
          onRestart={() => rebuildOrder()}
          onStarred={() => {
            setStarredOnly(true);
            rebuildOrder({ starred: true });
          }}
        />
      ) : !card ? (
        <Centered>
          {starredOnly
            ? "Chưa có thẻ nào được gắn sao trong bộ này."
            : "Bộ này chưa có thẻ."}
        </Centered>
      ) : (
        <>
          <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-[#e8edf5]">
            <div
              className="h-full rounded-full bg-[#4255ff] transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <div
            className="study-card"
            role="button"
            tabIndex={0}
            onClick={flip}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                flip();
              }
            }}
            aria-label={flipped ? "Lật lại mặt trước" : "Lật thẻ"}
          >
            <CardFace
              key={`${card.id}-${flipped ? "back" : "front"}`}
              face={
                flipped
                  ? termFirst
                    ? card.back
                    : card.front
                  : termFirst
                    ? card.front
                    : card.back
              }
              hint={card.hint}
              showHint={showHint && !flipped}
              onHint={(e) => {
                e.stopPropagation();
                setShowHint((v) => !v);
              }}
              starred={Boolean(stars[card.id])}
              onStar={(e) => {
                e.stopPropagation();
                toggleStar();
              }}
              onSpeak={(e) => {
                e.stopPropagation();
                void speak(card.audioId);
              }}
              isBack={flipped}
            />
          </div>

          {sortingOn ? (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => markSort("learning")}
                className="rounded-xl bg-[#ffe8ea] px-4 py-3 text-sm font-bold text-[#c8192e]"
              >
                Đang học
              </button>
              <button
                type="button"
                onClick={() => markSort("know")}
                className="rounded-xl bg-[#e5f8ef] px-4 py-3 text-sm font-bold text-[#0b7a45]"
              >
                Đã thuộc
              </button>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-3 py-3 shadow-sm ring-1 ring-[var(--line)]">
            <button
              type="button"
              onClick={() => setSortingOn((v) => !v)}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${
                sortingOn
                  ? "bg-[#d9e8ff] text-[#1a4cff]"
                  : "bg-[#eef2ff] text-[#4255ff]"
              }`}
            >
              Sắp xếp thẻ ghi nhớ
            </button>

            <div className="flex items-center gap-2">
              <IconRound
                label="Trước"
                onClick={goPrev}
                disabled={safeIndex <= 0}
              >
                <ArrowLeftIcon />
              </IconRound>
              <span className="min-w-[4.5rem] text-center text-sm font-bold text-[var(--ink)]">
                {safeIndex + 1} / {visibleIds.length}
              </span>
              <IconRound label="Tiếp" onClick={goNext}>
                <ArrowRightIcon />
              </IconRound>
            </div>

            <div className="flex items-center gap-1.5">
              <IconRound
                label="Tự chạy"
                active={autoplay}
                onClick={() => setAutoplay((v) => !v)}
              >
                <PlayIcon />
              </IconRound>
              <IconRound
                label="Xáo trộn"
                active={shuffled}
                onClick={() => {
                  const next = !shuffled;
                  setShuffled(next);
                  rebuildOrder({ shuffle: next });
                }}
              >
                <ShuffleIcon />
              </IconRound>
              <IconRound
                label="Cài đặt"
                active={settingsOpen}
                onClick={() => setSettingsOpen((v) => !v)}
              >
                <GearIcon />
              </IconRound>
              <IconRound label="Toàn màn hình" onClick={() => void toggleFullscreen()}>
                <ExpandIcon />
              </IconRound>
            </div>
          </div>

          {settingsOpen ? (
            <div className="mt-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[var(--line)]">
              <p className="mb-3 text-sm font-bold text-[var(--ink)]">Tùy chọn</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <ToggleRow
                  label="Hiện thuật ngữ trước"
                  checked={termFirst}
                  onChange={setTermFirst}
                />
                <ToggleRow
                  label="Chỉ học thẻ đã gắn sao"
                  checked={starredOnly}
                  onChange={(v) => {
                    setStarredOnly(v);
                    rebuildOrder({ starred: v });
                  }}
                />
                <ToggleRow
                  label="Xáo trộn"
                  checked={shuffled}
                  onChange={(v) => {
                    setShuffled(v);
                    rebuildOrder({ shuffle: v });
                  }}
                />
                <button
                  type="button"
                  onClick={() => rebuildOrder()}
                  className="rounded-xl bg-[var(--navy)] px-4 py-3 text-sm font-bold text-white"
                >
                  Học lại từ đầu
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </main>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-full flex-1 items-center justify-center p-6 text-[var(--muted)]">
      {children}
    </main>
  );
}

function ModeTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition ${
        active
          ? "bg-[#e8f0ff] text-[#4255ff]"
          : "text-[var(--muted)] hover:bg-[#f4f6fb]"
      }`}
    >
      <span className={active ? "text-[#4255ff]" : "text-[var(--muted)]"}>
        {icon}
      </span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function CardFace({
  face,
  hint,
  showHint,
  onHint,
  starred,
  onStar,
  onSpeak,
  isBack = false,
}: {
  face: { title: string; lines: string[] };
  hint: string;
  showHint: boolean;
  onHint: (e: MouseEvent) => void;
  starred: boolean;
  onStar: (e: MouseEvent) => void;
  onSpeak: (e: MouseEvent) => void;
  isBack?: boolean;
}) {
  return (
    <div className={`study-card-face ${isBack ? "is-back" : ""}`}>
      <div className="flex h-full min-h-0 flex-col p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <button
            type="button"
            onClick={onHint}
            className="inline-flex items-center gap-2 rounded-full px-2 py-1 text-sm font-semibold text-[#6b7cff] hover:bg-[#eef2ff]"
          >
            <LightbulbIcon />
            <span className="hidden sm:inline">Hiển thị gợi ý</span>
          </button>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onSpeak}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-[#5c6b7a] hover:bg-[#f2f4f8]"
              aria-label="Phát âm"
            >
              <SpeakerIcon />
            </button>
            <button
              type="button"
              onClick={onStar}
              className={`inline-flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f2f4f8] ${
                starred ? "text-[#f5b400]" : "text-[#5c6b7a]"
              }`}
              aria-label="Gắn sao"
            >
              <StarIcon filled={starred} />
            </button>
          </div>
        </div>

        {showHint ? (
          <p className="mt-2 text-center text-sm font-semibold text-[#6b7cff]">
            {hint}
          </p>
        ) : null}

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto px-2 py-4">
          <p className="text-center text-3xl font-bold leading-snug text-[#0d1b2a] sm:text-4xl">
            {face.title || "(Trống)"}
          </p>
          {face.lines.map((line, i) => (
            <p
              key={`${i}-${line.slice(0, 24)}`}
              className="max-w-xl text-center text-[15px] leading-snug text-[#5c6b7a]"
            >
              {line}
            </p>
          ))}
        </div>

        <p className="text-center text-xs text-[#5c6b7a]">
          {isBack ? "Chạm để lật lại" : "Chạm để lật thẻ"}
        </p>
      </div>
    </div>
  );
}

function RoundDone({
  total,
  starred,
  onRestart,
  onStarred,
}: {
  total: number;
  starred: number;
  onRestart: () => void;
  onStarred: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-[20px] bg-white p-8 text-center shadow-sm ring-1 ring-[var(--line)]">
      <p className="font-[family-name:var(--font-display)] text-3xl font-extrabold text-[var(--ink)]">
        Hoàn thành vòng học
      </p>
      <p className="mt-2 text-[var(--muted)]">
        Bạn đã xem {total} thẻ · {starred} thẻ đang gắn sao
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={onRestart}
          className="rounded-xl bg-[var(--navy)] px-5 py-3 text-sm font-bold text-white"
        >
          Học lại
        </button>
        <button
          type="button"
          onClick={onStarred}
          disabled={starred === 0}
          className="rounded-xl bg-[#eef2ff] px-5 py-3 text-sm font-bold text-[#4255ff] disabled:opacity-40"
        >
          Chỉ học thẻ gắn sao
        </button>
      </div>
    </div>
  );
}

function PlaceholderMode({
  mode,
  onBack,
}: {
  mode: StudyMode;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-[20px] bg-white p-8 text-center shadow-sm ring-1 ring-[var(--line)]">
      <p className="text-xl font-bold text-[var(--ink)]">
        {mode === "learn" ? "Chế độ Học" : "Chế độ Kiểm tra"}
      </p>
      <p className="mt-2 max-w-md text-[var(--muted)]">
        Đang ưu tiên làm giống Quizlet Flashcards trước. Chế độ này sẽ bổ sung
        sau.
      </p>
      <button
        type="button"
        onClick={onBack}
        className="mt-5 rounded-xl bg-[#eef2ff] px-5 py-3 text-sm font-bold text-[#4255ff]"
      >
        Quay lại Thẻ ghi nhớ
      </button>
    </div>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl bg-[#f7f8fc] px-4 py-3 text-sm font-semibold text-[var(--ink)]">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 accent-[#4255ff]"
      />
    </label>
  );
}

function IconRound({
  children,
  onClick,
  label,
  active = false,
  disabled = false,
}: {
  children: ReactNode;
  onClick: () => void;
  label: string;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full transition disabled:opacity-35 ${
        active
          ? "bg-[#e8f0ff] text-[#4255ff]"
          : "text-[var(--muted)] hover:bg-[#f2f4f8]"
      }`}
    >
      {children}
    </button>
  );
}

function CardsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="4" y="5" width="12" height="14" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M10 3h8a2 2 0 012 2v12" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function LearnIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function TestIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M7 3h10v18H7z" stroke="currentColor" strokeWidth="2" />
      <path d="M10 8h4M10 12h4M10 16h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function LightbulbIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 18h6M10 21h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 3a6 6 0 00-3 11c.6.4 1 1.1 1 1.8V17h4v-1.2c0-.7.4-1.4 1-1.8A6 6 0 0012 3z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}
function SpeakerIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M3 9v6h4l5 4V5L7 9H3z" fill="currentColor" />
      <path d="M16 8.5a5 5 0 010 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8L12 16.9 6.7 19.6l1-5.8L3.5 9.7l5.9-.9L12 3.5z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.8"
      />
    </svg>
  );
}
function ArrowLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ArrowRightIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M8 5v14l11-7L8 5z" />
    </svg>
  );
}
function ShuffleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M16 3h5v5M3 7c4 0 6 3 8 5s4 5 8 5h2M21 16v5h-5M3 17c2.5 0 4-1.5 5.5-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
function ExpandIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M9 3H3v6M15 3h6v6M9 21H3v-6M21 15v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
