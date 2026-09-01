import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Japanese trainer without decorative subtitles", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /かなキー｜五十音、单词与语法训练/);
  assert.match(html, /五十音训练/);
  assert.match(html, /单词记忆/);
  assert.match(html, /语法辨析/);
  assert.match(html, /提交后显示答案与解析/);
  assert.doesNotMatch(html, /日语输入与词汇练习|基础假名|输入练习|句型与例句/);
});

test("ships spreadsheet import and the expanded kana practice modes", async () => {
  const [trainer, kana, spreadsheetImport] = await Promise.all([
    readFile(new URL("../app/trainer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/kana.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/spreadsheet-import.ts", import.meta.url), "utf8"),
  ]);

  assert.match(trainer, /输入罗马音/);
  assert.match(trainer, /选择罗马音/);
  assert.match(trainer, /随机：开/);
  assert.match(trainer, /normalizedKana === kana\.hiragana/);
  assert.match(trainer, /multiple accept="\.xlsx,\.csv/);
  assert.match(kana, /"清音" \| "浊音" \| "半浊音" \| "拗音"/);
  assert.match(kana, /hiragana: "ぎゃ"/);
  assert.match(kana, /hiragana: "ぴょ"/);
  assert.match(spreadsheetImport, /parseImportedSpreadsheets/);

  await Promise.all([
    access(new URL("../public/kana-key-import-template.xlsx", import.meta.url)),
    access(new URL("../public/kana-key-vocabulary-template.csv", import.meta.url)),
    access(new URL("../public/kana-key-grammar-template.csv", import.meta.url)),
  ]);
  await assert.rejects(access(new URL("../public/kana-key-import-template.docx", import.meta.url)));
});
