import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import * as api from "../../src/api";
import { Settings } from "../../src/domain";
import { pickFile } from "../../src/files";
import {
  readWorkbook,
  ImportRow,
  rowIssues,
  rowToProduct,
  WorkbookPreview,
} from "../../src/importWorkbook";
import { check, errorText, supabase } from "../../src/supabase";
import { useResource } from "../../src/useResource";
import {
  Badge,
  Button,
  Card,
  Dialog,
  Field,
  Grid,
  Heading,
  Notice,
  NumberField,
  Toggle,
  Txt,
  styles,
} from "../../src/ui";
export default function ImportScreen() {
  const { data: existing, reload } = useResource(api.products);
  const [preview, setPreview] = useState<WorkbookPreview | null>(null);
  const [importConfig, setImportConfig] = useState(true);
  const [batchId, setBatchId] = useState(api.uuid());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const existingNames = (existing ?? []).map((p) => p.name);
  const valid =
    preview?.rows.filter(
      (r) =>
        r.selected && rowIssues(r, preview.rows, existingNames).length === 0,
    ) ?? [];
  const pending =
    preview?.rows.filter(
      (r) => rowIssues(r, preview.rows, existingNames).length > 0,
    ) ?? [];
  async function choose() {
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const f = await pickFile("*/*");
      if (!f) return;
      if (!f.name.toLowerCase().endsWith(".xlsx"))
        throw new Error("Selecione um arquivo .xlsx.");
      setPreview(readWorkbook(f.bytes, api.uuid));
      setBatchId(api.uuid());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function row(id: string, patch: Partial<ImportRow>) {
    setPreview(
      (p) =>
        p && {
          ...p,
          rows: p.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
        },
    );
  }
  function config(key: keyof Settings, value: number) {
    setPreview((p) => p && { ...p, settings: { ...p.settings, [key]: value } });
  }
  async function commit() {
    if (!preview || !valid.length) return;
    setBusy(true);
    setError("");
    try {
      const n = check(
        await supabase.rpc("import_products", {
          p_id: batchId,
          p_products: valid.map(rowToProduct),
          p_settings: importConfig ? preview.settings : null,
        }),
      );
      setConfirm(false);
      setSuccess(
        `${n} produto(s) importado(s), sem publicação no catálogo. Confira os tamanhos, adicione fotos e publique quando estiver pronto.`,
      );
      const importedIds = new Set(valid.map((row) => row.id));
      const remaining = preview.rows.filter((row) => !importedIds.has(row.id));
      setPreview(remaining.length ? { ...preview, rows: remaining } : null);
      setBatchId(api.uuid());
      setImportConfig(false);
      await reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.page}
      >
        <Heading
          title="Sua planilha, um novo começo"
          subtitle="Importe os produtos e revise os detalhes antes de confirmar."
          action={
            <Button
              label="Escolher planilha .xlsx"
              icon="cloud-upload-outline"
              loading={busy}
              onPress={() => void choose()}
            />
          }
        />
        <Notice message="A importação usa as abas Produtos e Configuracoes. Preços antigos e fórmulas de venda serão ignorados; o sistema calculará novas sugestões. Vendas, estoque e metas não serão importados." />
        {!!error && <Notice error message={error} />}
        {!!success && <Notice message={success} />}
        {preview && (
          <>
            <Card>
              <View style={styles.row}>
                <Badge label={`${preview.rows.length} registros encontrados`} />
                <Badge
                  label={`${valid.length} selecionados e válidos`}
                  tone="green"
                />
                <Badge
                  label={`${pending.length} precisam de revisão`}
                  tone="amber"
                />
              </View>
              <Toggle
                label="Importar também as configurações de custo"
                value={importConfig}
                onChange={setImportConfig}
              />
              {importConfig && (
                <>
                  <Notice message="As configurações importadas também atualizarão custos e preços automáticos dos produtos já cadastrados." />
                  <Grid>
                    {(
                      [
                        ["pla_kg_cents", "PLA por kg (R$)"],
                        ["energy_hour_cents", "Energia por hora (R$)"],
                        ["box_cents", "Caixa (R$)"],
                        ["label_cents", "Etiqueta (R$)"],
                        ["bag_cents", "Saquinho (R$)"],
                        ["wear_cents", "Desgaste (R$)"],
                        ["markup_percent", "Acréscimo (%)"],
                      ] as const
                    ).map(([key, label]) => (
                      <NumberField
                        key={key}
                        label={label}
                        cents={key !== "markup_percent"}
                        value={preview.settings[key]}
                        onChange={(v) => config(key, v)}
                      />
                    ))}
                  </Grid>
                  {preview.settingsWarnings.map((w) => (
                    <Notice key={w} error message={w} />
                  ))}
                </>
              )}
              <Toggle
                label="Mostrar apenas registros com pendências"
                value={onlyPending}
                onChange={setOnlyPending}
              />
              <Txt small>
                Tempos: 8,39 significa 8 horas e 39 minutos. Um tempo vazio
                precisa ser informado; use 0 se a peça não tiver tempo de
                impressão.
              </Txt>
            </Card>
            {(onlyPending ? pending : preview.rows).map((r) => {
              const issues = rowIssues(r, preview.rows, existingNames);
              return (
                <Card key={r.id}>
                  <View
                    style={[styles.row, { justifyContent: "space-between" }]}
                  >
                    <Txt bold>Linha {r.sourceRow}</Txt>
                    <Badge
                      label={issues.length ? "Revisar" : "Pronto para importar"}
                      tone={issues.length ? "amber" : "green"}
                    />
                  </View>
                  <Toggle
                    label="Selecionar registro"
                    value={r.selected}
                    onChange={(selected) => row(r.id, { selected })}
                  />
                  <Field
                    label="Nome"
                    value={r.name}
                    onChangeText={(name) => row(r.id, { name })}
                  />
                  <Grid>
                    <Field
                      label="PLA (gramas)"
                      keyboardType="decimal-pad"
                      value={r.grams}
                      onChangeText={(grams) => row(r.id, { grams })}
                    />
                    <Field
                      label="Tempo (horas,minutos)"
                      keyboardType="decimal-pad"
                      value={r.time}
                      onChangeText={(time) => row(r.id, { time })}
                    />
                    <Field
                      label="Custos extras (R$)"
                      keyboardType="decimal-pad"
                      value={r.extras}
                      onChangeText={(extras) => row(r.id, { extras })}
                    />
                  </Grid>
                  {issues.map((issue) => (
                    <Txt key={issue} small>
                      {issue}
                    </Txt>
                  ))}
                  {(issues.some((i) => i.includes("duplicidade")) ||
                    r.allowDuplicate) && (
                    <Toggle
                      label="Importar este registro mesmo com nome repetido"
                      value={r.allowDuplicate}
                      onChange={(allowDuplicate) =>
                        row(r.id, { allowDuplicate })
                      }
                    />
                  )}
                </Card>
              );
            })}
            <Button
              label={`Importar ${valid.length} produto(s) válido(s)`}
              disabled={!valid.length || busy || !existing}
              onPress={() => setConfirm(true)}
            />
          </>
        )}
      </ScrollView>
      <Dialog
        visible={confirm}
        title="Confirmar importação"
        onClose={() => setConfirm(false)}
      >
        <Txt>
          Serão criados {valid.length} produtos. Os registros com pendências
          serão ignorados. Nenhum produto será publicado automaticamente.
        </Txt>
        {importConfig && (
          <Txt>
            As configurações de custo serão substituídas e os preços automáticos
            existentes serão atualizados.
          </Txt>
        )}
        {!!error && <Notice error message={error} />}
        <Button
          label="Confirmar importação"
          loading={busy}
          onPress={() => void commit()}
        />
      </Dialog>
    </>
  );
}
