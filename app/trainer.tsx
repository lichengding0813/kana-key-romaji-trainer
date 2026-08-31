"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { parseImportedDocx } from "./docx-import";
import { lessons as builtInLessons } from "./lessons";
import type { Lesson, Vocab } from "./lessons";

type Result = "correct" | "incorrect" | null;
type OpenPanel = "import" | "history" | null;

type HistoryRecord = {
  id: string;
  timestamp: string;
  lessonId: number;
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

function isAnswerCorrect(input: string, word: Vocab) {
  const plain = strip(input);
  const alternativeAnswers = [word.roma, ...(word.alts ?? [])].filter(Boolean).map(strip);
  if (alternativeAnswers.includes(plain)) return true;
  if (input.trim().replace(/[\s・·]/g, "") === word.jp) return true;
  return toHiragana(input) === toHiragana(word.kana);
}

function toKatakana(value: string) {
  return value.replace(/[ぁ-ゖ]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60));
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

export default function Trainer() {
  const [importedLessons, setImportedLessons] = useState<Lesson[]>([]);
  const [selectedLesson, setSelectedLesson] = useState("builtin-1");
  const [wordIndex, setWordIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [attempts, setAttempts] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [openPanel, setOpenPanel] = useState<OpenPanel>(null);
  const [importMessage, setImportMessage] = useState("");
  const [importError, setImportError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const allLessons = useMemo(
    () => [...builtInLessons.map((lesson) => ({ ...lesson, source: "builtin" as const })), ...importedLessons],
    [importedLessons],
  );
  const lesson = allLessons.find((item) => lessonKey(item) === selectedLesson) ?? allLessons[0];
  const word = lesson.words[wordIndex] ?? lesson.words[0];
  const progress = ((wordIndex + 1) / lesson.words.length) * 100;
  const tokens = useMemo(() => splitRomaji(word.roma), [word.roma]);

  useEffect(() => {
    const hydrationTask = window.setTimeout(() => {
      const storedLessons = readStoredArray<Lesson>(IMPORTED_LESSONS_KEY).filter(
        (lesson) => lesson?.source === "imported" && Array.isArray(lesson.words) && lesson.words.length,
      );
      setImportedLessons(storedLessons);
      setHistory(readStoredArray<HistoryRecord>(HISTORY_KEY));
    }, 0);
    return () => window.clearTimeout(hydrationTask);
  }, []);

  useEffect(() => {
    inputRef.current?.focus();
  }, [selectedLesson, wordIndex]);

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
    setAttempts((value) => value + 1);
    if (ok) {
      setCorrect((value) => value + 1);
      setStreak((value) => value + 1);
    } else {
      setStreak(0);
    }
    saveHistory({
      id: createHistoryId(),
      timestamp: currentTimestamp(),
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      word: word.jp,
      meaning: word.zh,
      answer: answer.trim(),
      correct: ok,
    });
  }

  function nextWord() {
    setWordIndex((value) => (value + 1) % lesson.words.length);
    setAnswer("");
    setResult(null);
  }

  function changeLesson(value: string) {
    setSelectedLesson(value);
    setWordIndex(0);
    setAnswer("");
    setResult(null);
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
            <small>新标日词汇输入练习</small>
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

      <section className="lesson-bar" aria-label="课程选择">
        <div>
          <p>{lesson.source === "imported" ? "本机导入题库" : "初级上册 · 第 1–8 课"}</p>
          <h1>第 {String(lesson.id).padStart(2, "0")} 课 · {lesson.title}</h1>
        </div>
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
      </section>

      <section className="practice-wrap" id="practice">
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
              <div>
                <strong>提交后显示答案与解析</strong>
                <p>作答前不会显示假名、罗马音、例句或语法提示。</p>
              </div>
            </section>
          ) : (
            <section className="analysis-panel" aria-label="答案解析">
              <div className="answer-heading">
                <div>
                  <span>正确答案</span>
                  <strong>{word.jp}</strong>
                </div>
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
                  {tokens.length > 0 && (
                    <div aria-label={word.roma}>
                      {tokens.map((token, index) => <code key={`${token}-${index}`}>{token}</code>)}
                    </div>
                  )}
                  <p>{inputTip(word)}</p>
                </div>

                {(word.exampleJa || word.exampleZh) && (
                  <div className="example-block">
                    <span>例句</span>
                    {word.exampleJa && <p lang="ja">{word.exampleJa}</p>}
                    {word.exampleZh && <small>{word.exampleZh}</small>}
                  </div>
                )}

                <div className="grammar-block">
                  <span>本课语法辨析</span>
                  {lesson.grammar?.length ? (
                    <div className="grammar-list">
                      {lesson.grammar.map((point, index) => (
                        <article key={`${point.title}-${index}`}>
                          <div><b>{point.title || "语法"}</b><code>{point.pattern}</code></div>
                          {point.explanation && <p>{point.explanation}</p>}
                          {(point.exampleJa || point.exampleZh) && <small>{point.exampleJa}{point.exampleJa && point.exampleZh ? " · " : ""}{point.exampleZh}</small>}
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-copy">本课题库暂未填写语法辨析。</p>
                  )}
                </div>
              </div>
            </section>
          )}
        </div>

        <footer className="source-note">
          内置题库收录第 1–8 课代表词汇；导入的题库和答题记录仅保存在当前浏览器。
        </footer>
      </section>

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
                      <p>作答：{item.answer} · 第 {item.lessonId} 课</p>
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
