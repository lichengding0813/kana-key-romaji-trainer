"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { parseImportedDocx } from "./docx-import";
import { kanaEntries } from "./kana";
import { lessons as builtInLessons } from "./lessons";
import type { Lesson, Vocab } from "./lessons";

type Result = "correct" | "incorrect" | null;
type OpenPanel = "import" | "history" | null;
type MainTab = "kana" | "vocab" | "grammar";
type KanaScript = "hiragana" | "katakana" | "mixed";

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

function acceptedKanaRomaji(romaji: string) {
  const alternatives: Record<string, string[]> = {
    shi: ["si"],
    chi: ["ti"],
    tsu: ["tu"],
    fu: ["hu"],
    wo: ["o"],
    n: ["nn", "n'"],
  };
  return [romaji, ...(alternatives[romaji] ?? [])];
}

export default function Trainer() {
  const [activeTab, setActiveTab] = useState<MainTab>("vocab");
  const [importedLessons, setImportedLessons] = useState<Lesson[]>([]);
  const [selectedLesson, setSelectedLesson] = useState("builtin-1");
  const [wordIndex, setWordIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [kanaIndex, setKanaIndex] = useState(0);
  const [kanaScript, setKanaScript] = useState<KanaScript>("hiragana");
  const [kanaAnswer, setKanaAnswer] = useState("");
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
  const kana = kanaEntries[kanaIndex];
  const kanaTargetScript = kanaScript === "mixed" ? (kanaIndex % 2 === 0 ? "hiragana" : "katakana") : kanaScript;
  const kanaPrompt = kanaTargetScript === "hiragana" ? kana.hiragana : toKatakana(kana.hiragana);
  const kanaRomajiAnswers = acceptedKanaRomaji(kana.romaji);
  const kanaProgress = ((kanaIndex + 1) / kanaEntries.length) * 100;

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
    if (activeTab === "kana") kanaInputRef.current?.focus();
  }, [activeTab, selectedLesson, wordIndex, kanaIndex, kanaScript]);

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
    const normalized = strip(kanaAnswer.normalize("NFKC"));
    const ok = kanaRomajiAnswers.includes(normalized);
    setKanaResult(ok ? "correct" : "incorrect");
    recordOutcome(ok);
    saveHistory({
      id: createHistoryId(),
      timestamp: currentTimestamp(),
      category: "kana",
      lessonTitle: `五十音 · ${kanaScriptLabel(kanaScript)}`,
      word: kana.romaji,
      meaning: kanaPrompt,
      answer: kanaAnswer.trim(),
      correct: ok,
    });
  }

  function nextWord() {
    setWordIndex((value) => (value + 1) % lesson.words.length);
    setAnswer("");
    setResult(null);
  }

  function nextKana() {
    setKanaIndex((value) => (value + 1) % kanaEntries.length);
    setKanaAnswer("");
    setKanaResult(null);
  }

  function changeLesson(value: string) {
    setSelectedLesson(value);
    setWordIndex(0);
    setAnswer("");
    setResult(null);
  }

  function changeKanaScript(value: KanaScript) {
    setKanaScript(value);
    setKanaIndex(0);
    setKanaAnswer("");
    setKanaResult(null);
  }

  async function importDocx(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setIsImporting(true);
    setImportMessage("");
    setImportError("");
    try {
      const bank = await parseImportedDocx(file);
      setImportedLessons((current) => {
        const lessonIds = new Set(bank.lessons.map((item) => item.id));
        const next = [...current.filter((item) => !lessonIds.has(item.id)), ...bank.lessons].sort((a, b) => a.id - b.id);
        localStorage.setItem(IMPORTED_LESSONS_KEY, JSON.stringify(next));
        return next;
      });
      setSelectedLesson(lessonKey(bank.lessons[0]));
      setActiveTab("vocab");
      setWordIndex(0);
      setAnswer("");
      setResult(null);
      setImportMessage(`已导入 ${bank.lessons.length} 课、${bank.vocabularyCount} 个词汇、${bank.grammarCount} 条语法。`);
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
            <small>日语输入与词汇练习</small>
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
          <span>五十音训练</span><small>基础假名</small>
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "vocab"} aria-controls="vocab-panel" onClick={() => setActiveTab("vocab")}>
          <span>单词记忆</span><small>输入练习</small>
        </button>
        <button type="button" role="tab" aria-selected={activeTab === "grammar"} aria-controls="grammar-panel" onClick={() => setActiveTab("grammar")}>
          <span>语法辨析</span><small>句型与例句</small>
        </button>
      </div>

      <section className="lesson-bar" aria-label={activeTab === "kana" ? "假名类型选择" : "课程选择"}>
        {activeTab === "kana" ? (
          <div>
            <p>基础 46 音 · 罗马音键盘</p>
            <h1>五十音 · {kanaScriptLabel(kanaScript)}</h1>
          </div>
        ) : (
          <div>
            <p>{lesson.source === "imported" ? "本机导入题库" : "初级上册 · 第 1–8 课"}</p>
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
          <div className="question-meta">
            <span>假名 {kanaIndex + 1} / {kanaEntries.length} · {kana.row}</span>
            <span>辨认屏幕上的假名，用英文字母输入罗马音</span>
          </div>
          <div className="progress-track" role="progressbar" aria-label="五十音进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(kanaProgress)}>
            <span style={{ width: `${kanaProgress}%` }} />
          </div>

          <div className="practice-grid kana-practice-grid">
            <article className={`practice-card ${kanaResult ? `answered ${kanaResult}` : ""}`}>
              <div className="question-copy">
                <p className="eyebrow">请写出这个{kanaTargetScript === "hiragana" ? "平假名" : "片假名"}的罗马音</p>
                <h2 className="kana-prompt" lang="ja">{kanaPrompt}</h2>
                <p className="prompt-note">直接使用英文字母键盘作答</p>
              </div>
              <form className="answer-form" onSubmit={submitKana}>
                <label htmlFor="kana-answer">罗马音答案</label>
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
              {kanaResult && (
                <p className={`answer-status ${kanaResult}`} id="kana-answer-status" role="status">
                  {kanaResult === "correct" ? "回答正确" : `你的答案：${kanaAnswer}`}
                </p>
              )}
            </article>

            {!kanaResult ? (
              <section className="analysis-locked" aria-label="五十音答案尚未显示">
                <span aria-hidden="true">あ</span>
                <div><strong>作答后显示罗马音</strong><p>会同时展示标准写法和常用输入法写法。</p></div>
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
                  <span>输入提示</span>
                  <p>标准写法是 <code>{kana.romaji}</code>{kanaRomajiAnswers.length > 1 ? `；也接受 ${kanaRomajiAnswers.slice(1).join(" / ")}。` : "。"}切换“混合”可以交替辨认平假名和片假名。</p>
                </div>
              </section>
            )}
          </div>
          <footer className="source-note">五十音训练包含 46 个基础清音，平假名、片假名和混合模式共用本轮成绩。</footer>
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
                <div><strong>提交后显示答案与解析</strong><p>作答前不会显示假名、罗马音或例句。</p></div>
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
          <footer className="source-note">导入的题库和答题记录仅保存在当前浏览器；语法内容请在“语法辨析”标签页查看。</footer>
        </section>
      )}

      {activeTab === "grammar" && (
        <section className="grammar-page" id="grammar-panel" role="tabpanel">
          <header className="grammar-page-header">
            <div><span>本课语法</span><strong>{lesson.grammar?.length ?? 0}</strong><small>条辨析</small></div>
            <p>句型、用法和例句集中在这里阅读，不再重复出现在每道单词解析里。</p>
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
              <p>可在 Word 导入模板的“语法辨析表”中填写句型、说明和例句，再重新导入题库。</p>
              <button type="button" onClick={() => setOpenPanel("import")}>导入含语法的题库</button>
            </div>
          )}
        </section>
      )}

      {openPanel === "import" && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="import-title">
            <button className="modal-close" type="button" aria-label="关闭" onClick={() => setOpenPanel(null)}>×</button>
            <p className="modal-kicker">WORD · DOCX</p>
            <h2 id="import-title">导入我的题库</h2>
            <p className="modal-copy">下载模板后填写词汇表；例句和语法辨析为选填。同课次再次导入时，会替换该课之前的导入版本。</p>
            <a className="template-link" href="/kana-key-import-template.docx" download>下载 Word 导入模板</a>
            <label className={`upload-zone ${isImporting ? "busy" : ""}`}>
              <input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={importDocx} disabled={isImporting} />
              <strong>{isImporting ? "正在读取…" : "选择填写好的 DOCX"}</strong>
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
            <p className="modal-kicker">LOCAL HISTORY</p>
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
