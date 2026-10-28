import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";
import { Product, Settings, defaultSettings } from "./domain";

export type ImportRow = {
  sourceRow: number;
  id: string;
  variantId: string;
  name: string;
  grams: string;
  time: string;
  extras: string;
  selected: boolean;
  allowDuplicate: boolean;
};
export type WorkbookPreview = {
  rows: ImportRow[];
  settings: Settings;
  settingsWarnings: string[];
};
const array = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
function text(node: unknown): string {
  if (node === undefined || node === null) return "";
  if (typeof node !== "object") return String(node);
  const n = node as Record<string, unknown>;
  return n.t !== undefined
    ? text(n.t)
    : n.r !== undefined
      ? array(n.r).map(text).join("")
      : n["#text"] !== undefined
        ? text(n["#text"])
        : "";
}
const normalized = (s: string) =>
  s.normalize("NFC").trim().toLocaleLowerCase("pt-BR");
export function importMinutes(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value.trim().replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  const hours = Math.floor(n);
  const minutes = Math.round((n - hours) * 100);
  if (minutes > 59 || Math.abs(n * 100 - Math.round(n * 100)) > 1e-6)
    return null;
  return hours * 60 + minutes;
}
export function rowIssues(
  row: ImportRow,
  rows: ImportRow[],
  existing: string[] = [],
): string[] {
  const issues: string[] = [];
  const number = (s: string) => Number(s.replace(",", "."));
  if (!row.name.trim()) issues.push("Nome obrigatório");
  if (
    !row.grams.trim() ||
    !Number.isFinite(number(row.grams)) ||
    number(row.grams) < 0
  )
    issues.push("Gramas inválidas");
  if (importMinutes(row.time) === null)
    issues.push("Revise o tempo: use horas,minutos (minutos de 00 a 59)");
  if (!Number.isFinite(number(row.extras)) || number(row.extras) < 0)
    issues.push("Custos extras inválidos");
  if (
    !row.allowDuplicate &&
    row.name.trim() &&
    (rows.some(
      (r) => r.id !== row.id && normalized(r.name) === normalized(row.name),
    ) ||
      existing.some((n) => normalized(n) === normalized(row.name)))
  )
    issues.push(
      "Possível duplicidade: renomeie ou autorize a importação deste registro",
    );
  return issues;
}
export function rowToProduct(row: ImportRow): Product {
  const minutes = importMinutes(row.time);
  if (minutes === null) throw new Error("Tempo inválido.");
  return {
    id: row.id,
    name: row.name.trim(),
    description: "",
    category_id: null,
    published: false,
    photos: [],
    files: [],
    variants: [
      {
        id: row.variantId,
        size: "Padrão",
        grams: Number(row.grams.replace(",", ".")),
        minutes,
        extras_cents: Math.round(Number(row.extras.replace(",", ".")) * 100),
        cost_cents: 0,
        price_cents: 0,
        automatic: true,
      },
    ],
  };
}
export function readWorkbook(
  buffer: ArrayBuffer,
  uuid: () => string,
): WorkbookPreview {
  if (buffer.byteLength > 20 * 1024 * 1024)
    throw new Error("A planilha deve ter até 20 MB.");
  let size = 0;
  const zip = unzipSync(new Uint8Array(buffer), {
    filter: (file) => {
      size += file.originalSize;
      if (size > 80 * 1024 * 1024)
        throw new Error("Planilha descompactada excede 80 MB.");
      return file.name.endsWith(".xml") || file.name.endsWith(".rels");
    },
  });
  const parser = new XMLParser({
    ignoreAttributes: false,
    parseTagValue: false,
    trimValues: false,
  });
  function xml(path: string): any {
    const bytes = zip[path];
    if (!bytes) return {};
    const source = strFromU8(bytes);
    if (/<!DOCTYPE/i.test(source))
      throw new Error("Formato XML não permitido.");
    return parser.parse(source);
  }
  const shared = array<any>(xml("xl/sharedStrings.xml").sst?.si).map(text);
  const sheets = array<any>(xml("xl/workbook.xml").workbook?.sheets?.sheet);
  const relationships = array<any>(
    xml("xl/_rels/workbook.xml.rels").Relationships?.Relationship,
  );
  function sheet(name: string): Record<string, string>[] {
    const s = sheets.find(
      (s) => normalized(String(s["@_name"])) === normalized(name),
    );
    if (!s) throw new Error(`Aba ${name} não encontrada.`);
    const rel = relationships.find((r) => r["@_Id"] === s["@_r:id"]);
    if (!rel) throw new Error("Referência de aba inválida.");
    const target: string = rel["@_Target"];
    const path = target.startsWith("/")
      ? target.slice(1)
      : `xl/${target.replace(/^\.\//, "")}`;
    return array<any>(xml(path).worksheet?.sheetData?.row).map((r) => {
      const cells: Record<string, string> = { __row: String(r["@_r"]) };
      for (const c of array<any>(r.c)) {
        const col = String(c["@_r"]).replace(/\d/g, "");
        cells[col] =
          c["@_t"] === "s"
            ? (shared[Number(c.v)] ?? "")
            : c["@_t"] === "inlineStr"
              ? text(c.is)
              : text(c.v);
      }
      return cells;
    });
  }
  const products = sheet("Produtos");
  const config = sheet("Configuracoes");
  const rows = products
    .filter(
      (r) => Number(r.__row) > 1 && [r.A, r.B, r.C, r.D].some((v) => v?.trim()),
    )
    .map((r) => ({
      sourceRow: Number(r.__row),
      id: uuid(),
      variantId: uuid(),
      name: r.A ?? "",
      grams: r.B ?? "",
      time: r.C ? String(Number(r.C)) : "",
      extras: r.D || "0",
      selected: true,
      allowDuplicate: false,
    }));
  const value = (row: number, fallback: number) => {
    const raw = config.find((r) => Number(r.__row) === row)?.B;
    return raw?.trim() ? Number(raw) : fallback;
  };
  const settings: Settings = {
    pla_kg_cents: Math.round(value(2, 120) * 100),
    box_cents: Math.round(value(3, 0) * 100),
    label_cents: Math.round(value(4, 0) * 100),
    bag_cents: Math.round(value(5, 0.18) * 100),
    energy_hour_cents: Math.round(value(6, 0) * 100),
    wear_cents: Math.round(value(7, 1.5) * 100),
    markup_percent: value(9, 100),
  };
  const settingsWarnings: string[] = [];
  for (const key of Object.keys(defaultSettings) as (keyof Settings)[]) {
    const n = settings[key];
    if (
      typeof n !== "number" ||
      !Number.isFinite(n) ||
      n < 0 ||
      (key === "markup_percent" && n > 10000)
    ) {
      settingsWarnings.push(
        `Configuração ${key} inválida: usado o valor padrão.`,
      );
      (settings as any)[key] = defaultSettings[key];
    }
  }
  return { rows, settings, settingsWarnings };
}
