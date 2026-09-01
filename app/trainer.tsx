"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { parseImportedSpreadsheets } from "./spreadsheet-import";
import { kanaEntries } from "./kana";
import type { KanaEntry, KanaGroup } from "./kana";
import { lessons as builtInLessons } from "./lessons";
import type { Lesson, Vocab } from "./lessons";

type Result = "correct" | "incorrect" | null;
type OpenPanel = "import" | "history" | null;
type MainTab = "kana" | "vocab" | "grammar";
type KanaScript = "hiragana" | "katakana" | "mixed";
type KanaQuestionType = "input" | "choice";

type HistoryRecord = {
  id: string;
  timestamp: string;
  category?: "vocab" | "kana";
  lessonId?: number;
  lessonTitle: string;
  word: string;
  meaning: string;
  answer: string;
  correct: boolean;
};

const IMPORTED_LESSONS_KEY = "kana-key-imported-lessons-v1";
const HISTORY_KEY = "kana-key-history-v1";
const HISTORY_LIMIT = 500;

function strip(value: string) {
  return value.trim().toLowerCase().replace(/[\s・·]/g, "").replace(/－/g, "-");
}

function toHiragana(value: string) {
  return value
    .normalize("NFKC")
    .replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/[\s・·]/g, "");
}

function toKatakana(value: string) {
  return value.replace(/[ぁ-ゖ]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60));
}

function isAnswerCorrect(input: string, word: Vocab) {
  const plain = strip(input);
  const alternativeAnswers = [word.roma, ...(word.alts ?? [])].filter(Boolean).map(strip);
  if (alternativeAnswers.includes(plain)) return true;
  if (input.trim().replace(/[\s・·]/g, "") === word.jp) return true;
  return toHiragana(input) === toHiragana(word.kana);
}

const romanTokens = /(?:kya|kyu|kyo|sha|shu|sho|cha|chu|cho|nya|nyu|nyo|hya|hyu|hyo|mya|myu|myo|rya|ryu|ryo|gya|gyu|gyo|ja|ju|jo|bya|byu|byo|pya|pyu|pyo|shi|chi|tsu|dhi|thi|fa|fi|fe|fo|[bcdfghjklmnpqrstvwxyz]?[aeiou]|n'|nn|n|-)/g;

function splitRomaji(value: string) {
  if (!value) return [];
  return value.match(romanTokens) ?? [value];
}

function inputTip(word: Vocab) {
  if (!word.roma) return "这条词汇未填写罗马音，可用日语写法、平假名或片假名作答。";
  if (word.roma.includes("-")) return "半角减号 - 会输入片假名长音符「ー」。";
  if (/([bcdfghjklmpqrstvwxyz])\1/.test(word.roma)) return "重复下一个辅音，会输入小「っ／ッ」。";
  if (/(k|s|t|n|h|m|r|g|j|b|p)y[auo]/.test(word.roma) || /(sh|ch)[auo]/.test(word.roma)) return "辅音与 y 组合，可以输入小「ゃ／ゅ／ょ」。";
  if (word.roma.includes("n")) return "n 后接多数辅音时会自动确定为「ん」；句尾可再按一次 n。";
  return "按显示顺序输入罗马字，系统日语输入法会自动组合假名。";
}

function lessonKey(lesson: Lesson) {
  return `${lesson.source ?? "builtin"}-${lesson.id}`;
}

function readStoredArray<T>(key: string): T[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function createHistoryId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function currentTimestamp() {
  return new Date().toISOString();
}

function kanaScriptLabel(script: KanaScript) {
  if (script === "hiragana") return "平假名";
  if (script === "katakana") return "片假名";
  return "平假名与片假名混合";
}

function acceptedKanaRomaji(kana: KanaEntry) {
  return [kana.romaji, ...(kana.alternatives ?? [])];
}

function shuffled<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function kanaChoices(target: KanaEntry, pool: KanaEntry[]) {
  const distractors = shuffled(Array.from(new Set(pool.map((item) => item.romaji).filter((romaji) => romaji !== target.romaji)))).slice(0, 3);
  return shuffled([target.romaji, ...distractors]);
}

function mergeImportedLessons(current: Lesson[], incoming: Lesson[]) {
  const merged = new Map(current.map((lesson) => [lesson.id, lesson]));
  for (const lesson of incoming) {
    const existing = merged.get(lesson.id) ?? builtInLessons.find((item) => item.id === lesson.id);
    const words = lesson.words.length ? lesson.words : existing?.words ?? [];
    if (!words.length) {
      throw new Error(`第 ${lesson.id} 课只有语法，没有对应词汇。请同时导入该课词汇表。`);
    }
    merged.set(lesson.id, {
      id: lesson.id,
      title: lesson.title || existing?.title || `第 ${lesson.id} 课自定义题库`,
      words,
      grammar: lesson.grammar?.length ? lesson.grammar : existing?.grammar ?? [],
      source: "imported",
    });
  }
  return Array.from(merged.values()).sort((a, b) => a.id - b.id);
}

export default function Trainer() {
  const [activeTab, setActiveTab] = useState<MainTab>("vocab");
  const [importedLessons, setImportedLessons] = useState<Lesson[]>([]);
  const [selectedLesson, setSelectedLesson] = useState("builtin-1");
  const [wordIndex, setWordIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [kanaGroups, setKanaGroups] = useState<KanaGroup[]>(["清音", "浊音", "半浊音", "拗音"]);
  const [kanaQuestionType, setKanaQuestionType] = useState<KanaQuestionType>("input");
  const [kanaShuffle, setKanaShuffle] = useState(false);
  const [kanaSequence, setKanaSequence] = useState<KanaEntry[]>(kanaEntries);
  const [kanaIndex, setKanaIndex] = useState(0);
  const [kanaScript, setKanaScript] = useState<KanaScript>("hiragana");
  const [kanaAnswer, setKanaAnswer] = useState("");
  const [selectedKanaChoice, setSelectedKanaChoice] = useState("");
  const [kanaChoiceOptions, setKanaChoiceOptions] = useState(["a", "i", "u", "e"]);
  const [kanaResult, setKanaResult] = useState<Result>(null);
  const [attempts, setAttempts] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const kanaInputRef = useRef<HTMLInputElement>(null);

  const allLessons = useMemo(
    () => [...builtInLessons.map((lesson) => ({ ...lesson, source: "builtin" as const })), ...importedLessons],
    [importedLessons],
  );
  const lesson = allLessons.find((item) => lessonKey(item) === selectedLesson) ?? allLessons[0];
  const word = lesson.words[wordIndex] ?? lesson.words[0];
  const progress = ((wordIndex + 1) / lesson.words.length) * 100;
  const tokens = useMemo(() => splitRomaji(word.roma), [word.roma]);
  const kana = kanaSequence[kanaIndex] ?? kanaSequence[0] ?? kanaEntries[0];
  const kanaTargetScript = kanaScript === "mixed" ? (kanaIndex % 2 === 0 ? "hiragana" : "katakana") : kanaScript;
  const kanaPrompt = kanaTargetScript === "hiragana" ? kana.hiragana : toKatakana(kana.hiragana);
  const kanaRomajiAnswers = acceptedKanaRomaji(kana);
  const kanaProgress = ((kanaIndex + 1) / kanaSequence.length) * 100;

  useEffect(() => {
    const hydrationTask = window.setTimeout(() => {
      const storedLessons = readStoredArray<Lesson>(IMPORTED_LESSONS_KEY).filter(
        (storedLesson) => storedLesson?.source === "imported" && Array.isArray(storedLesson.words) && storedLesson.words.length,
      );
      setImportedLessons(storedLessons);
      setHistory(readStoredArray<HistoryRecord>(HISTORY_KEY));
    }, 0);
    return () => window.clearTimeout(hydrationTask);
  }, []);

  useEffect(() => {
    if (activeTab === "vocab") inputRef.current?.focus();
    if (activeTab === "kana" && kanaQuestionType === "input") kanaInputRef.current?.focus();
  }, [activeTab, selectedLesson, wordIndex, kanaIndex, kanaScript, kanaQuestionType]);

  useEffect(() => {
    if (!openPanel) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenPanel(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [openPanel]);

  function saveHistory(entry: HistoryRecord) {
    setHistory((current) => {
      const next = [entry, ...current].slice(0, HISTORY_LIMIT);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }

  function recordOutcome(ok: boolean) {
    setAttempts((value) => value + 1);
    if (ok) {
      setCorrect((value) => value + 1);
      setStreak((value) => value + 1);
    } else {
      setStreak(0);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (result) {
      nextWord();
      return;
    }
    if (!answer.trim()) {
      inputRef.current?.focus();
      return;
    }
    const ok = isAnswerCorrect(answer, word);
    setResult(ok ? "correct" : "incorrect");
    recordOutcome(ok);
    saveHistory({
      id: createHistoryId(),
      timestamp: currentTimestamp(),
      category: "vocab",
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      word: word.jp,
      meaning: word.zh,
      answer: answer.trim(),
      correct: ok,
    });
  }

  function gradeKana(value: string) {
    const normalized = strip(value.normalize("NFKC"));
    const normalizedKana = toHiragana(value);
    const ok = kanaRomajiAnswers.includes(normalized) || normalizedKana === kana.hiragana;
    setKanaAnswer(value);
    setKanaResult(ok ? "correct" : "incorrect");
    recordOutcome(ok);
    saveHistory({
      id: createHistoryId(),
      timestamp: currentTimestamp(),
      category: "kana",
      lessonTitle: `五十音 · ${kanaScriptLabel(kanaScript)}`,
      word: kana.romaji,
      meaning: kanaPrompt,
      answer: value.trim(),
      correct: ok,
    });
  }

  function submitKana(event: FormEvent) {
    event.preventDefault();
    if (kanaResult) {
      nextKana();
      return;
    }
    if (!kanaAnswer.trim()) {
      kanaInputRef.current?.focus();
      return;
    }
    gradeKana(kanaAnswer);
  }

  function chooseKana(value: string) {
    if (kanaResult) return;
    setSelectedKanaChoice(value);
    gradeKana(value);
  }

  function nextWord() {
    setWordIndex((value) => (value + 1) % lesson.words.length);
    setAnswer("");
    setResult(null);
  }

  function nextKana() {
    let nextSequence = kanaSequence;
    let nextIndex = kanaIndex + 1;
    if (nextIndex >= kanaSequence.length) {
      nextIndex = 0;
      if (kanaShuffle) {
        nextSequence = shuffled(kanaSequence);
        setKanaSequence(nextSequence);
      }
    }
    setKanaIndex(nextIndex);
    setKanaChoiceOptions(kanaChoices(nextSequence[nextIndex], nextSequence));
    setKanaAnswer("");
    setSelectedKanaChoice("");
    setKanaResult(null);
  }

  function changeLesson(value: string) {
    setSelectedLesson(value);
    setWordIndex(0);
    setAnswer("");
    setResult(null);
  }

  function resetKanaRun(options?: { groups?: KanaGroup[]; shuffled?: boolean; questionType?: KanaQuestionType }) {
    const groups = options?.groups ?? kanaGroups;
    const shouldShuffle = options?.shuffled ?? kanaShuffle;
    const pool = kanaEntries.filter((entry) => groups.includes(entry.group));
    const sequence = shouldShuffle ? shuffled(pool) : pool;
    setKanaSequence(sequence);
    setKanaIndex(0);
    setKanaChoiceOptions(kanaChoices(sequence[0], sequence));
    setKanaAnswer("");
    setSelectedKanaChoice("");
    setKanaResult(null);
    if (options?.questionType) setKanaQuestionType(options.questionType);
  }

  function changeKanaScript(value: KanaScript) {
    setKanaScript(value);
    resetKanaRun();
  }

  function toggleKanaGroup(group: KanaGroup) {
    const selected = kanaGroups.includes(group);
    if (selected && kanaGroups.length === 1) return;
    const nextGroups = selected ? kanaGroups.filter((item) => item !== group) : [...kanaGroups, group];
    setKanaGroups(nextGroups);
    resetKanaRun({ groups: nextGroups });
  }

  function changeKanaQuestionType(value: KanaQuestionType) {
    resetKanaRun({ questionType: value });
  }

  function toggleKanaShuffle() {
    const next = !kanaShuffle;
    setKanaShuffle(next);
    resetKanaRun({ shuffled: next });
  }

  async function importSpreadsheets(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setIsImporting(true);
    setImportMessage("");
    setImportError("");
    try {
      const bank = await parseImportedSpreadsheets(files);
      const next = mergeImportedLessons(importedLessons, bank.lessons);
      setImportedLessons(next);
      localStorage.setItem(IMPORTED_LESSONS_KEY, JSON.stringify(next));
      const firstImported = next.find((item) => item.id === bank.lessons[0].id) ?? next[0];
      setSelectedLesson(lessonKey(firstImported));
      setActiveTab(bank.vocabularyCount ? "vocab" : "grammar");
      setWordIndex(0);
      setAnswer("");
      setResult(null);
      setImportMessage(`已导入 ${bank.lessons.length} 课、${bank.vocabularyCount} 个词汇、${bank.grammarCount} 条语法。支持继续导入同课次的另一张表。`);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "导入失败，请检查文件格式。");
    } finally {
      setIsImporting(false);
      event.target.value = "";
    }
  }

  const historyCorrect = history.filter((item) => item.correct).length;

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#practice" aria-label="かなキー首页">
          <span className="brand-mark" aria-hidden="true">あ</span>
          <span>
            <strong>かなキー</strong>
          </span>
        </a>
        <div className="top-actions">
          <button className="quiet-button" type="button" onClick={() => setOpenPanel("import")}>导入题库</button>
          <button className="quiet-button" type="button" onClick={() => setOpenPanel("history")}>答题记录</button>
          <div className="session-stats" aria-label="本轮成绩" aria-live="polite">
            <span><b>{streak}</b><small>连续正确</small></span>
            <span><b>{attempts ? `${Math.round((correct / attempts) * 100)}%` : "—"}</b><small>正确率</small></span>
          </div>
        </div>
      </header>

      <div className="primary-tabs" role="tablist" aria-label="训练模式">
        <button type="button" role="tab" aria-selected={activeTab === "kana"} aria-controls="kana-panel" onClick={() => setActiveTab("kana")}>
          <span>五十音训练</span>
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "vocab"} aria-controls="vocab-panel" onClick={() => setActiveTab("vocab")}>
          <span>单词记忆</span>
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "grammar"} aria-controls="grammar-panel" onClick={() => setActiveTab("grammar")}>
          <span>语法辨析</span>
        </button>
      </div>

      <section className="lesson-bar" aria-label={activeTab === "kana" ? "假名类型选择" : "课程选择"}>
        {activeTab === "kana" ? (
          <div>
            <h1>五十音 · {kanaScriptLabel(kanaScript)}</h1>
          </div>
        ) : (
          <div>
            <h1>第 {String(lesson.id).padStart(2, "0")} 课 · {lesson.title}</h1>
          </div>
        )}

        {activeTab === "kana" ? (
          <div className="segmented-control" aria-label="选择假名类型">
            {(["hiragana", "katakana", "mixed"] as const).map((script) => (
              <button key={script} type="button" aria-pressed={kanaScript === script} onClick={() => changeKanaScript(script)}>
                {script === "hiragana" ? "平假名" : script === "katakana" ? "片假名" : "混合"}
              </button>
            ))}
          </div>
        ) : (
          <label className="lesson-picker">
            <span>选择课次</span>
            <select value={lessonKey(lesson)} onChange={(event) => changeLesson(event.target.value)}>
              <optgroup label="内置题库">
                {allLessons.filter((item) => item.source !== "imported").map((item) => (
                  <option key={lessonKey(item)} value={lessonKey(item)}>第 {String(item.id).padStart(2, "0")} 课</option>
                ))}
              </optgroup>
              {importedLessons.length > 0 && (
                <optgroup label="我的导入">
                  {importedLessons.map((item) => (
                    <option key={lessonKey(item)} value={lessonKey(item)}>第 {String(item.id).padStart(2, "0")} 课 · {item.title}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
        )}
      </section>

      {activeTab === "kana" && (
        <section className="practice-wrap" id="kana-panel" role="tabpanel">
          <div className="kana-toolbar" aria-label="五十音训练设置">
            <div className="kana-control-group">
              <span>题型</span>
              <div className="compact-toggle">
                <button type="button" aria-pressed={kanaQuestionType === "input"} onClick={() => changeKanaQuestionType("input")}>输入罗马音</button>
                <button type="button" aria-pressed={kanaQuestionType === "choice"} onClick={() => changeKanaQuestionType("choice")}>选择罗马音</button>
              </div>
            </div>
            <div className="kana-control-group kana-group-filter">
              <span>音类</span>
              <div>
                {(["清音", "浊音", "半浊音", "拗音"] as KanaGroup[]).map((group) => (
                  <button key={group} type="button" aria-pressed={kanaGroups.includes(group)} onClick={() => toggleKanaGroup(group)}>{group}</button>
                ))}
              </div>
            </div>
            <button className="shuffle-toggle" type="button" aria-pressed={kanaShuffle} onClick={toggleKanaShuffle}>
              <span aria-hidden="true">↝</span>{kanaShuffle ? "随机：开" : "随机：关"}
            </button>
          </div>
          <div className="question-meta">
            <span>假名 {kanaIndex + 1} / {kanaSequence.length} · {kana.group} · {kana.row}</span>
            <span>{kanaQuestionType === "input" ? "输入罗马音、平假名或片假名" : "选择与假名对应的罗马音"}</span>
          </div>
          <div className="progress-track" role="progressbar" aria-label="五十音进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(kanaProgress)}>
            <span style={{ width: `${kanaProgress}%` }} />
          </div>

          <div className="practice-grid kana-practice-grid">
            <article className={`practice-card ${kanaResult ? `answered ${kanaResult}` : ""}`}>
              <div className="question-copy">
                <p className="eyebrow">{kanaQuestionType === "input" ? "输入对应的罗马音或假名" : "选择正确的罗马音"}</p>
                <h2 className="kana-prompt" lang="ja">{kanaPrompt}</h2>
              </div>
              {kanaQuestionType === "input" ? (
                <form className="answer-form" onSubmit={submitKana}>
                  <label htmlFor="kana-answer">答案</label>
                  <div className="answer-row">
                    <input
                      ref={kanaInputRef}
                      id="kana-answer"
                      value={kanaAnswer}
                      onChange={(event) => !kanaResult && setKanaAnswer(event.target.value)}
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      aria-describedby={kanaResult ? "kana-answer-status" : undefined}
                    />
                    <button type="submit">{kanaResult ? "下一题" : "确认"}</button>
                  </div>
                </form>
              ) : (
                <div className="kana-choice-wrap">
                  <div className="kana-choice-grid" role="group" aria-label="罗马音选项">
                    {kanaChoiceOptions.map((option) => {
                      const state = kanaResult ? (option === kana.romaji ? "correct" : option === selectedKanaChoice ? "incorrect" : "") : "";
                      return <button key={option} className={state} type="button" aria-pressed={selectedKanaChoice === option} disabled={Boolean(kanaResult)} onClick={() => chooseKana(option)}>{option}</button>;
                    })}
                  </div>
                  {kanaResult && <button className="choice-next" type="button" onClick={nextKana}>下一题</button>}
                </div>
              )}
              {kanaResult && (
                <p className={`answer-status ${kanaResult}`} id="kana-answer-status" role="status">
                  {kanaResult === "correct" ? "回答正确" : `你的答案：${kanaAnswer}`}
                </p>
              )}
            </article>

            {!kanaResult ? (
              <section className="analysis-locked" aria-label="五十音答案尚未显示">
                <span aria-hidden="true">あ</span>
                <div><strong>作答后显示答案</strong></div>
              </section>
            ) : (
              <section className="analysis-panel kana-answer-panel" aria-label="五十音答案">
                <div className="answer-heading kana-answer-heading">
                  <div><span>正确答案</span><strong>{kana.romaji}</strong></div>
                  <em className={kanaResult}>{kanaResult === "correct" ? "正解" : "复习"}</em>
                </div>
                <dl className="kana-reading-grid">
                  <div><dt>平假名</dt><dd lang="ja">{kana.hiragana}</dd></div>
                  <div><dt>片假名</dt><dd lang="ja">{toKatakana(kana.hiragana)}</dd></div>
                  <div><dt>罗马音按键</dt><dd>{kana.romaji}</dd></div>
                </dl>
                <div className="kana-coach">
                  <span>可接受答案</span>
                  <p><code>{kana.romaji}</code>{kanaRomajiAnswers.length > 1 ? `、${kanaRomajiAnswers.slice(1).join("、")}` : ""}、{kana.hiragana}、{toKatakana(kana.hiragana)}</p>
                </div>
              </section>
            )}
          </div>
        </section>
      )}

      {activeTab === "vocab" && (
        <section className="practice-wrap" id="vocab-panel" role="tabpanel">
          <div className="question-meta">
            <span>词汇 {wordIndex + 1} / {lesson.words.length}</span>
            <span>平假名、片假名、罗马音或日语写法均可</span>
          </div>
          <div className="progress-track" role="progressbar" aria-label="本课进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
            <span style={{ width: `${progress}%` }} />
          </div>

          <div className="practice-grid">
            <article className={`practice-card ${result ? `answered ${result}` : ""}`}>
              <div className="question-copy">
                <p className="eyebrow">请写出对应的日语</p>
                <h2>{word.zh}</h2>
              </div>
              <form className="answer-form" onSubmit={submit}>
                <label htmlFor="answer">你的答案</label>
                <div className="answer-row">
                  <input
                    ref={inputRef}
                    id="answer"
                    value={answer}
                    onChange={(event) => !result && setAnswer(event.target.value)}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    aria-describedby={result ? "answer-status" : undefined}
                  />
                  <button type="submit">{result ? "下一题" : "确认"}</button>
                </div>
              </form>
              {result && (
                <p className={`answer-status ${result}`} id="answer-status" role="status">
                  {result === "correct" ? "回答正确" : `你的答案：${answer}`}
                </p>
              )}
            </article>

            {!result ? (
              <section className="analysis-locked" aria-label="答案解析尚未显示">
                <span aria-hidden="true">解</span>
                <div><strong>提交后显示答案与解析</strong></div>
              </section>
            ) : (
              <section className="analysis-panel" aria-label="答案解析">
                <div className="answer-heading">
                  <div><span>正确答案</span><strong>{word.jp}</strong></div>
                  <em className={result}>{result === "correct" ? "正解" : "复习"}</em>
                </div>
                <dl className="reading-grid">
                  <div><dt>平假名</dt><dd>{word.kana}</dd></div>
                  <div><dt>片假名</dt><dd>{toKatakana(word.kana)}</dd></div>
                  <div><dt>罗马音</dt><dd>{word.roma || "未填写"}</dd></div>
                </dl>
                <div className="analysis-details">
                  <div className="key-breakdown">
                    <span>推荐按键</span>
                    {tokens.length > 0 && <div aria-label={word.roma}>{tokens.map((token, index) => <code key={`${token}-${index}`}>{token}</code>)}</div>}
                    <p>{inputTip(word)}</p>
                  </div>
                  {(word.exampleJa || word.exampleZh) && (
                    <div className="example-block">
                      <span>例句</span>
                      {word.exampleJa && <p lang="ja">{word.exampleJa}</p>}
                      {word.exampleZh && <small>{word.exampleZh}</small>}
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
          <footer className="source-note">导入题库和答题记录仅保存在当前浏览器。</footer>
        </section>
      )}

      {activeTab === "grammar" && (
        <section className="grammar-page" id="grammar-panel" role="tabpanel">
          <header className="grammar-page-header">
            <div><span>本课语法</span><strong>{lesson.grammar?.length ?? 0}</strong><small>条辨析</small></div>
          </header>
          {lesson.grammar?.length ? (
            <div className="grammar-study-grid">
              {lesson.grammar.map((point, index) => (
                <article key={`${point.title}-${index}`}>
                  <div className="grammar-number">{String(index + 1).padStart(2, "0")}</div>
                  <div className="grammar-copy">
                    <span>{point.title || "语法辨析"}</span>
                    <h2 lang="ja">{point.pattern}</h2>
                    {point.explanation && <p>{point.explanation}</p>}
                    {(point.exampleJa || point.exampleZh) && (
                      <div className="grammar-example">
                        <small>例句</small>
                        {point.exampleJa && <strong lang="ja">{point.exampleJa}</strong>}
                        {point.exampleZh && <em>{point.exampleZh}</em>}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="grammar-empty">
              <span aria-hidden="true">文</span>
              <h2>本课还没有语法辨析</h2>
              <p>可在表格模板的“语法辨析”工作表中填写后导入。</p>
              <button type="button" onClick={() => setOpenPanel("import")}>导入含语法的题库</button>
            </div>
          )}
        </section>
      )}

      {openPanel === "import" && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
            <button className="modal-close" type="button" aria-label="关闭" onClick={() => setOpenPanel(null)}>×</button>
            <h2 id="import-title">导入我的题库</h2>
            <p className="modal-copy">XLSX 可同时填写词汇和语法；CSV 可一次选择多个文件。同课次内容会自动合并。</p>
            <div className="template-links">
              <a className="template-link" href="/kana-key-import-template.xlsx" download>下载 XLSX 模板</a>
              <a className="template-link secondary" href="/kana-key-vocabulary-template.csv" download>词汇 CSV</a>
              <a className="template-link secondary" href="/kana-key-grammar-template.csv" download>语法 CSV</a>
            </div>
            <label className={`upload-zone ${isImporting ? "busy" : ""}`}>
              <input type="file" multiple accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={importSpreadsheets} disabled={isImporting} />
              <strong>{isImporting ? "正在读取…" : "选择 XLSX 或 CSV"}</strong>
              <span>文件在浏览器中解析，不会上传到服务器</span>
            </label>
            {importMessage && <p className="modal-message success" role="status">{importMessage}</p>}
            {importError && <p className="modal-message error" role="alert">{importError}</p>}
          </section>
        </div>
      )}

      {openPanel === "history" && (
        <div className="modal-backdrop">
          <section className="modal history-modal" role="dialog" aria-modal="true" aria-labelledby="history-title">
            <button className="modal-close" type="button" aria-label="关闭" onClick={() => setOpenPanel(null)}>×</button>
            <h2 id="history-title">答题记录</h2>
            <div className="history-summary">
              <span><b>{history.length}</b> 次作答</span>
              <span><b>{history.length ? Math.round((historyCorrect / history.length) * 100) : 0}%</b> 正确率</span>
            </div>
            {history.length ? (
              <div className="history-list">
                {history.map((item) => (
                  <article key={item.id}>
                    <span className={`history-result ${item.correct ? "correct" : "incorrect"}`}>{item.correct ? "正确" : "错误"}</span>
                    <div>
                      <strong>{item.meaning} <i>→</i> <span lang="ja">{item.word}</span></strong>
                      <p>作答：{item.answer} · {item.category === "kana" ? item.lessonTitle : `第 ${item.lessonId} 课`}</p>
                    </div>
                    <time dateTime={item.timestamp}>{new Date(item.timestamp).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</time>
                  </article>
                ))}
              </div>
            ) : (
              <p className="history-empty">还没有记录。完成一道题后，这里会自动保存作答结果。</p>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
