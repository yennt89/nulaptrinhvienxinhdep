export type ModuleItem = {
  id: string;
  order: number;
  title: string;
  body: string;
  kind?: string;
  meta?: {
    section?: string;
    meaning?: string;
  };
};

export type ModuleSummary = {
  id: string;
  code?: string;
  title: string;
  subtitle?: string;
  icon?: string;
  items: ModuleItem[];
};

export type ModulesFile = {
  title: string;
  modules: ModuleSummary[];
};

export type WorkplaceCard = {
  id: string;
  pattern: string;
  meaning: string;
  examples: string[];
};

export type VocabExample = {
  en: string;
  vi: string;
};

export type VocabCard = {
  id: string;
  word: string;
  ipa: string;
  meaning: string;
  examples: VocabExample[];
  example?: string;
  exampleMeaning?: string;
};

export type PhraseContent = {
  english: string;
  meaning: string;
  examples: string[];
};

export type DevCardBack = {
  ipa: string;
  note: string;
};

export type ConvCardBack = {
  questionMeaning: string;
  answer: string;
  answerMeaning: string;
};
