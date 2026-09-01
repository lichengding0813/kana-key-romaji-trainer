import { strFromU8, unzipSync } from "fflate";
import type { GrammarPoint, Lesson, Vocab } from "./lessons";

export type ImportedBank = {
  lessons: Lesson[];
  vocabularyCount: number;
  grammarCount: number;
};

type SheetTable = {
  name: string;
  rows: string[][];
};

const VOCABULARY_HEADERS = ["课次", "中文释义", "日语写法", "平假名", "罗马音"];
const GRAMMAR_HEADERS = ["课次", "语法标题", "句型/结构", "辨析说明"];

function parseXml(source: string, errorMessage: string) {
  const xml = new DOMParser().parseFromString(source, "application/xml");
  if (xml.getElementsByTagName("parsererror").length) throw new Error(errorMessage);
  return xml;
}

function nodesByLocalName(parent: Document | Element, name: string) {
  return Array.from(parent.getElementsByTagNameNS("*", name));
}

function headerKey(value: string) {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/[\s\u3000]/g, "")
    .replace(/[（）]/g, (mark) => (mark === "（" ? "(" : ")"));
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

function findHeaderRow(rows: string[][], expected: string[]) {
  return rows.slice(0, 20).findIndex((values) => {
    const headers = values.map(headerKey);
    return expected.every((label) => headers.includes(label));
  });
}

function parseCsv(source: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell.length === 0) {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  if (rows[0]?.[0]) rows[0][0] = rows[0][0].replace(/^\uFEFF/, "");
  return rows;
}

function columnIndex(reference: string) {
  const letters = reference.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? "A";
  return [...letters].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function normalizeZipPath(target: string) {
  const parts = (target.startsWith("/") ? target.slice(1) : target.startsWith("xl/") ? target : `xl/${target}`).split("/");
  const normalized: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") normalized.pop();
    else normalized.push(part);
  }
  return normalized.join("/");
}

function worksheetRows(xml: Document, sharedStrings: string[]) {
  return nodesByLocalName(xml, "row").map((rowNode) => {
    const values: string[] = [];
    for (const cell of nodesByLocalName(rowNode, "c")) {
      const index = columnIndex(cell.getAttribute("r") ?? "A1");
      const type = cell.getAttribute("t") ?? "";
      let value = "";
      if (type === "inlineStr") {
        value = nodesByLocalName(cell, "t").map((node) => node.textContent ?? "").join("");
      } else {
        const raw = nodesByLocalName(cell, "v")[0]?.textContent ?? "";
        value = type === "s" ? sharedStrings[Number(raw)] ?? "" : type === "b" ? (raw === "1" ? "TRUE" : "FALSE") : raw;
      }
      values[index] = value;
    }
    return Array.from({ length: values.length }, (_, index) => values[index] ?? "");
  });
}

async function parseXlsx(file: File): Promise<SheetTable[]> {
  let archive: ReturnType<typeof unzipSync>;
  try {
    archive = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error(`${file.name} 无法读取。请确认它是未加密的 XLSX 文件。`);
  }

  const workbookFile = archive["xl/workbook.xml"];
  const relationshipFile = archive["xl/_rels/workbook.xml.rels"];
  if (!workbookFile || !relationshipFile) throw new Error(`${file.name} 不是可识别的 XLSX 文件。`);

  const workbookXml = parseXml(strFromU8(workbookFile), `${file.name} 的工作表信息无法解析。`);
  const relationshipXml = parseXml(strFromU8(relationshipFile), `${file.name} 的工作表关系无法解析。`);
  const relationships = new Map(
    nodesByLocalName(relationshipXml, "Relationship").map((node) => [node.getAttribute("Id") ?? "", node.getAttribute("Target") ?? ""]),
  );

  const sharedStringsFile = archive["xl/sharedStrings.xml"];
  const sharedStrings = sharedStringsFile
    ? nodesByLocalName(parseXml(strFromU8(sharedStringsFile), `${file.name} 的文字内容无法解析。`), "si").map((node) =>
        nodesByLocalName(node, "t").map((textNode) => textNode.textContent ?? "").join(""),
      )
    : [];

  const tables: SheetTable[] = [];
  for (const sheet of nodesByLocalName(workbookXml, "sheet")) {
    const relationshipId = sheet.getAttribute("r:id") ?? sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? "";
    const target = relationships.get(relationshipId);
    if (!target) continue;
    const worksheetFile = archive[normalizeZipPath(target)];
    if (!worksheetFile) continue;
    const worksheetXml = parseXml(strFromU8(worksheetFile), `${file.name} 中的工作表无法解析。`);
    tables.push({ name: sheet.getAttribute("name") ?? "工作表", rows: worksheetRows(worksheetXml, sharedStrings) });
  }
  return tables;
}

function addVocabularyRows(lessonMap: Map<number, Lesson>, rows: string[][], headerIndex: number) {
  const headers = rows[headerIndex];
  for (const values of rows.slice(headerIndex + 1)) {
    const row = rowObject(headers, values);
    const id = lessonNumber(row["课次"]);
    if (id === null) continue;
    const jp = row["日语写法"];
    const kana = row["平假名"];
    const zh = row["中文释义"];
    if (!jp || !kana || !zh) continue;

    const lesson = lessonMap.get(id) ?? {
      id,
      title: row["课名"] || `第 ${id} 课自定义题库`,
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
    if (row["课名"]) lesson.title = row["课名"];
    lessonMap.set(id, lesson);
  }
}

function addGrammarRows(lessonMap: Map<number, Lesson>, rows: string[][], headerIndex: number) {
  const headers = rows[headerIndex];
  for (const values of rows.slice(headerIndex + 1)) {
    const row = rowObject(headers, values);
    const id = lessonNumber(row["课次"]);
    if (id === null) continue;
    const point: GrammarPoint = {
      title: row["语法标题"],
      pattern: row["句型/结构"],
      explanation: row["辨析说明"],
      exampleJa: row["例句(日语)"],
      exampleZh: row["例句(中文)"],
    };
    if (!point.title && !point.pattern && !point.explanation) continue;
    const lesson = lessonMap.get(id) ?? {
      id,
      title: row["课名"] || `第 ${id} 课自定义题库`,
      words: [],
      grammar: [],
      source: "imported" as const,
    };
    lesson.grammar ??= [];
    lesson.grammar.push(point);
    if (row["课名"]) lesson.title = row["课名"];
    lessonMap.set(id, lesson);
  }
}

export async function parseImportedSpreadsheets(files: File[]): Promise<ImportedBank> {
  if (!files.length) throw new Error("请选择 XLSX 或 CSV 文件。");
  const tables: SheetTable[] = [];

  for (const file of files) {
    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith(".xlsx")) {
      tables.push(...(await parseXlsx(file)));
    } else if (lowerName.endsWith(".csv")) {
      tables.push({ name: file.name, rows: parseCsv(await file.text()) });
    } else {
      throw new Error(`${file.name} 格式不支持，请选择 .xlsx 或 .csv 文件。`);
    }
  }

  const lessonMap = new Map<number, Lesson>();
  let recognizedTables = 0;
  for (const table of tables) {
    const vocabularyHeader = findHeaderRow(table.rows, VOCABULARY_HEADERS);
    const grammarHeader = findHeaderRow(table.rows, GRAMMAR_HEADERS);
    if (vocabularyHeader >= 0) {
      addVocabularyRows(lessonMap, table.rows, vocabularyHeader);
      recognizedTables += 1;
    } else if (grammarHeader >= 0) {
      addGrammarRows(lessonMap, table.rows, grammarHeader);
      recognizedTables += 1;
    }
  }

  if (!recognizedTables) {
    throw new Error("没有找到可识别的词汇表或语法辨析表。请使用网站提供的模板，并保留表头文字不变。");
  }
  if (!lessonMap.size) {
    throw new Error("表格里没有可导入的内容。词汇至少填写课次、中文释义、日语写法和平假名；语法至少填写课次和一项语法内容。");
  }

  const lessons = Array.from(lessonMap.values()).sort((a, b) => a.id - b.id);
  return {
    lessons,
    vocabularyCount: lessons.reduce((sum, lesson) => sum + lesson.words.length, 0),
    grammarCount: lessons.reduce((sum, lesson) => sum + (lesson.grammar?.length ?? 0), 0),
  };
}
