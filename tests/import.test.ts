import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import {
  ImportRow,
  importMinutes,
  readWorkbook,
  rowIssues,
  rowToProduct,
} from "../src/importWorkbook";
test("horas e minutos e dados inválidos da planilha", () => {
  assert.equal(importMinutes("8,39"), 519);
  assert.equal(importMinutes("1.23"), 83);
  assert.equal(importMinutes("0.36"), 36);
  assert.equal(importMinutes("2"), 120);
  assert.equal(importMinutes("1.90"), null);
  assert.equal(importMinutes(""), null);
  assert.equal(importMinutes("-1"), null);
  assert.equal(importMinutes("8.391"), null);
});
test("importação sinaliza faltas e duplicidades, sem agrupar registros", () => {
  const row: ImportRow = {
    sourceRow: 2,
    id: randomUUID(),
    variantId: randomUUID(),
    name: "Vaso",
    grams: "100",
    time: "8,39",
    extras: "1,50",
    selected: true,
    allowDuplicate: false,
  };
  assert.deepEqual(rowIssues(row, [row]), []);
  assert.ok(
    rowIssues(row, [row], ["vaso"]).some((x) => x.includes("duplicidade")),
  );
  assert.deepEqual(
    rowIssues({ ...row, allowDuplicate: true }, [row], ["vaso"]),
    [],
  );
  assert.ok(rowIssues({ ...row, name: "", time: "" }, [row]).length >= 2);
  const p = rowToProduct(row);
  assert.equal(p.published, false);
  assert.equal(p.variants[0]!.minutes, 519);
  assert.equal(p.variants[0]!.extras_cents, 150);
  assert.equal(p.variants[0]!.automatic, true);
});
test("leitura XLSX usa relação das abas e ignora fórmulas de venda", () => {
  const files = {
    "xl/workbook.xml":
      '<workbook><sheets><sheet name="Produtos" r:id="rId2"/><sheet name="Configuracoes" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels":
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
    "xl/sharedStrings.xml":
      "<sst><si><t>Produto</t></si><si><r><t>Vaso </t></r><r><t>azul</t></r></si></sst>",
    "xl/worksheets/sheet1.xml":
      '<worksheet><sheetData><row r="2"><c r="B2"><v>120</v></c></row><row r="9"><c r="B9"><v>100</v></c></row></sheetData></worksheet>',
    "xl/worksheets/sheet2.xml":
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><v>125.79</v></c><c r="C2"><v>8.39</v></c><c r="H2"><f>BAD()</f><v>-34.1</v></c></row></sheetData></worksheet>',
  };
  const zipped = zipSync(
    Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)])),
  );
  const preview = readWorkbook(zipped.buffer as ArrayBuffer, randomUUID);
  assert.equal(preview.rows[0]!.name, "Vaso azul");
  assert.equal(preview.settings.markup_percent, 100);
  assert.equal(rowToProduct(preview.rows[0]!).variants[0]!.price_cents, 0);
});
