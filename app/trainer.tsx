"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { lessons } from "./lessons";
import type { Vocab } from "./lessons";

type Result = "correct" | "incorrect" | null;

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
  const romanAnswers = [word.roma, ...(word.alts ?? [])].map(strip);
  if (romanAnswers.includes(plain)) return true;
  if (input.trim().replace(/[\s・·]/g, "") === word.jp) return true;
  return toHiragana(input) === toHiragana(word.kana);
}

function toKatakana(value: string) {
  return value.replace(/[ぁ-ゖ]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60));
}

const romanTokens = /(?:kya|kyu|kyo|sha|shu|sho|cha|chu|cho|nya|nyu|nyo|hya|hyu|hyo|mya|myu|myo|rya|ryu|ryo|gya|gyu|gyo|ja|ju|jo|bya|byu|byo|pya|pyu|pyo|shi|chi|tsu|dhi|thi|fa|fi|fe|fo|[bcdfghjklmnpqrstvwxyz]?[aeiou]|n'|nn|n|-)/g;

function splitRomaji(value: string) {
  return value.match(romanTokens) ?? [value];
}

function inputTip(word: Vocab) {
  if (word.roma.includes("-")) return "半角减号 - 会输入片假名长音符「ー」。";
  if (/([bcdfghjklmpqrstvwxyz])\1/.test(word.roma)) return "重复下一个辅音，会输入小「っ／ッ」。";
  if (/(k|s|t|n|h|m|r|g|j|b|p)y[auo]/.test(word.roma) || /(sh|ch)[auo]/.test(word.roma)) return "辅音与 y 组合，可以输入小「ゃ／ゅ／ょ」。";
  if (word.roma.includes("n")) return "n 后接多数辅音时会自动确定为「ん」；句尾可再按一次 n。";
  return "按显示顺序输入罗马字，系统日语输入法会自动组合假名。";
}

export default function Trainer() {
  const [lessonIndex, setLessonIndex] = useState(0);
  const [wordIndex, setWordIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<Result>(null);
  const [attempts, setAttempts] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [streak, setStreak] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const lesson = lessons[lessonIndex];
  const word = lesson.words[wordIndex];
  const progress = ((wordIndex + 1) / lesson.words.length) * 100;
  const tokens = useMemo(() => splitRomaji(word.roma), [word.roma]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [lessonIndex, wordIndex]);

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
  }

  function nextWord() {
    setWordIndex((value) => (value + 1) % lesson.words.length);
    setAnswer("");
    setResult(null);
  }

  function changeLesson(value: number) {
    setLessonIndex(value);
    setWordIndex(0);
    setAnswer("");
    setResult(null);
  }

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
        <div className="session-stats" aria-label="本轮成绩" aria-live="polite">
          <span><b>{streak}</b><small>连续正确</small></span>
          <span><b>{attempts ? `${Math.round((correct / attempts) * 100)}%` : "—"}</b><small>正确率</small></span>
        </div>
      </header>

      <section className="lesson-bar" aria-label="课程选择">
        <div>
          <p>初级上册 · 第 1–8 课</p>
          <h1>第 {String(lesson.id).padStart(2, "0")} 课 · {lesson.title}</h1>
        </div>
        <label className="lesson-picker">
          <span>选择课次</span>
          <select value={lessonIndex} onChange={(event) => changeLesson(Number(event.target.value))}>
            {lessons.map((item, index) => (
              <option key={item.id} value={index}>第 {String(item.id).padStart(2, "0")} 课</option>
            ))}
          </select>
        </label>
      </section>

      <section className="practice-wrap" id="practice">
        <div className="question-meta">
          <span>词汇 {wordIndex + 1} / {lesson.words.length}</span>
          <span>平假名、片假名、罗马音均可</span>
        </div>
        <div className="progress-track" role="progressbar" aria-label="本课进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}>
          <span style={{ width: `${progress}%` }} />
        </div>

        <article className={`practice-card ${result ? `answered ${result}` : ""}`}>
          <p className="eyebrow">请写出对应的日语</p>
          <h2>{word.zh}</h2>
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
                placeholder="在这里输入答案"
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
              <strong>提交后显示答案解析</strong>
              <p>会展示汉字、假名、罗马音和推荐按键拆解。</p>
            </div>
          </section>
        ) : (
          <section className="analysis-panel" aria-label="答案解析">
            <div className="answer-heading">
              <div>
                <span>正确答案</span>
                <strong>{word.jp}</strong>
              </div>
              <em>{result === "correct" ? "正解" : "复习"}</em>
            </div>
            <dl className="reading-grid">
              <div><dt>平假名</dt><dd>{word.kana}</dd></div>
              <div><dt>片假名</dt><dd>{toKatakana(word.kana)}</dd></div>
              <div><dt>罗马音</dt><dd>{word.roma}</dd></div>
            </dl>
            <div className="key-breakdown">
              <span>推荐按键</span>
              <div aria-label={word.roma}>
                {tokens.map((token, index) => <code key={`${token}-${index}`}>{token}</code>)}
              </div>
              <p>{inputTip(word)}</p>
            </div>
          </section>
        )}

        <footer className="source-note">
          当前收录《新标准日本语》初级上册第 1–8 课代表词汇，按课次练习，不是教材完整词表。
        </footer>
      </section>
    </main>
  );
}
