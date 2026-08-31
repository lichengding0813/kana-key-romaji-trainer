import { strFromU8, unzipSync } from "fflate";
import type { GrammarPoint, Lesson, Vocab } from "./lessons";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

export type ImportedBank = {
  lessons: Lesson[];
  vocabularyCount: number;
  grammarCount: number;
};

function cellText(cell: Element) {
  const paragraphs = Array.from(cell.getElementsByTagNameNS(WORD_NS, "p"));
  return paragraphs
    .map((paragraph) =>
      Array.from(paragraph.getElementsByTagNameNS(WORD_NS, "t"))
        .map((node) => node.textContent ?? "")
        .join(""),
    )
    .filter(Boolean)
    .join("\n")
    .trim();
}

function tableRows(table: Element) {
  return Array.from(table.getElementsByTagNameNS(WORD_NS, "tr")).map((row) =>
    Array.from(row.getElementsByTagNameNS(WORD_NS, "tc")).map(cellText),
  );
}

function headerKey(value: string) {
  return value.replace(/[\s\u3000]/g, "").replace(/[（）]/g, (mark) => (mark === "（" ? "(" : ")"));
}

function rowObject(headers: string[], values: string[]) {
  return Object.fromEntries(headers.map((header, index) => [headerKey(header), values[index]?.trim() ?? ""]));
}

function lessonNumber(value: string) {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : null;
}

function splitAlternatives(value: string) {
  return value
    .split(/[|｜]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function parseImportedDocx(file: File): Promise<ImportedBank> {
  if (!file.name.toLowerCase().endsWith(".docx")) {
    throw new Error("请选择 .docx 格式的 Word 文件。");
  }

  let documentXml = "";
  try {
    const archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const documentFile = archive["word/document.xml"];
    if (!documentFile) throw new Error("missing document.xml");
    documentXml = strFromU8(documentFile);
  } catch {
    throw new Error("无法读取这个文件。请确认它是未加密的 DOCX 文件。");
  }

  const xml = new DOMParser().parseFromString(documentXml, "application/xml");
  if (xml.getElementsByTagName("parsererror").length) {
    throw new Error("Word 文件内容无法解析，请重新保存后再试。");
  }

  const tables = Array.from(xml.getElementsByTagNameNS(WORD_NS, "tbl")).map(tableRows);
  const vocabularyTable = tables.find((rows) => {
    const headers = (rows[0] ?? []).map(headerKey);
    return ["课次", "中文释义", "日语写法", "平假名", "罗马音"].every((label) => headers.includes(label));
  });
  const grammarTable = tables.find((rows) => {
    const headers = (rows[0] ?? []).map(headerKey);
    return ["课次", "语法标题", "句型/结构", "辨析说明"].every((label) => headers.includes(label));
  });

  if (!vocabularyTable) {
    throw new Error("没有找到词汇表。请使用网站提供的导入模板，并保留表头文字不变。");
  }

  const lessonMap = new Map<number, Lesson>();
  const vocabHeaders = vocabularyTable[0];
  for (const values of vocabularyTable.slice(1)) {
    const row = rowObject(vocabHeaders, values);
    const id = lessonNumber(row["课次"]);
    if (id === null) continue;

    const jp = row["日语写法"];
    const kana = row["平假名"];
    const zh = row["中文释义"];
    if (!jp || !kana || !zh) continue;

    const lesson = lessonMap.get(id) ?? {
      id,
      title: row["课名"] || `第 ${id} 课自定义词库`,
      words: [],
      grammar: [],
      source: "imported" as const,
    };
    const word: Vocab = {
      jp,
      kana,
      roma: row["罗马音"],
      zh,
      alts: splitAlternatives(row["其他答案"]),
      exampleJa: row["例句(日语)"],
      exampleZh: row["例句(中文)"],
    };
    lesson.words.push(word);
    lessonMap.set(id, lesson);
  }

  if (!lessonMap.size) {
    throw new Error("词汇表里没有可导入的内容。请至少填写课次、中文释义、日语写法和平假名。");
  }

  if (grammarTable) {
    const grammarHeaders = grammarTable[0];
    for (const values of grammarTable.slice(1)) {
      const row = rowObject(grammarHeaders, values);
      const id = lessonNumber(row["课次"]);
      const lesson = id === null ? undefined : lessonMap.get(id);
      if (!lesson) continue;
      const point: GrammarPoint = {
        title: row["语法标题"],
        pattern: row["句型/结构"],
        explanation: row["辨析说明"],
        exampleJa: row["例句(日语)"],
        exampleZh: row["例句(中文)"],
      };
      if (point.title || point.pattern || point.explanation) lesson.grammar?.push(point);
    }
  }

  const importedLessons = Array.from(lessonMap.values()).sort((a, b) => a.id - b.id);
  return {
    lessons: importedLessons,
    vocabularyCount: importedLessons.reduce((sum, lesson) => sum + lesson.words.length, 0),
    grammarCount: importedLessons.reduce((sum, lesson) => sum + (lesson.grammar?.length ?? 0), 0),
  };
}
