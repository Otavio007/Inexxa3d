import React, { useEffect, useState } from "react";
import { ScrollView } from "react-native";
import * as api from "../../src/api";
import { Settings } from "../../src/domain";
import { errorText } from "../../src/supabase";
import { useResource } from "../../src/useResource";
import {
  Button,
  Card,
  Grid,
  Heading,
  Loading,
  Notice,
  NumberField,
  Txt,
  styles,
} from "../../src/ui";
const fields = [
  ["pla_kg_cents", "PLA por kg (R$)"],
  ["energy_hour_cents", "Energia por hora (R$)"],
  ["box_cents", "Caixa por unidade (R$)"],
  ["label_cents", "Etiqueta por unidade (R$)"],
  ["bag_cents", "Saquinho por unidade (R$)"],
  ["wear_cents", "Desgaste por unidade (R$)"],
] as const;
export default function SettingsScreen() {
  const { data, loading, error, reload } = useResource(api.settings);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [success, setSuccess] = useState("");
  useEffect(() => {
    if (data) setDraft(data);
  }, [data]);
  async function save() {
    if (!draft) return;
    setBusy(true);
    setProblem("");
    setSuccess("");
    try {
      await api.saveSettings(draft);
      setSuccess(
        "Configurações salvas. Custos e preços automáticos atualizados.",
      );
      await reload();
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Heading
        title="O valor de cada detalhe"
        subtitle="Configure a base dos seus custos e mantenha os preços sob controle."
      />
      {!!error && (
        <>
          <Notice error message={error} />
          <Button label="Tentar novamente" onPress={() => void reload()} />
        </>
      )}
      {loading ? (
        <Loading />
      ) : (
        draft && (
          <>
            <Card>
              <Heading
                title="Custos de produção"
                subtitle="Os valores de embalagem e desgaste são aplicados a cada unidade produzida."
              />
              <Grid>
                {fields.map(([key, label]) => (
                  <NumberField
                    key={key}
                    label={label}
                    cents
                    value={draft[key]}
                    onChange={(v) => setDraft({ ...draft, [key]: v })}
                  />
                ))}
              </Grid>
            </Card>
            <Card>
              <Heading title="Sua regra de preço" />
              <NumberField
                label="Acréscimo sobre o custo (%)"
                value={draft.markup_percent}
                onChange={(markup_percent) =>
                  setDraft({ ...draft, markup_percent })
                }
              />
              <Txt>
                Com acréscimo de 100%, uma peça que custa R$ 10,00 tem base de
                venda de R$ 20,00. O arredondamento sugere R$ 20,90.
              </Txt>
              <Notice message="Ao salvar, todos os custos serão recalculados. Preços automáticos acompanharão os novos valores; preços manuais e encomendas existentes serão preservados." />
            </Card>
            {!!problem && <Notice error message={problem} />}
            {!!success && <Notice message={success} />}
            <Button
              label="Salvar e atualizar preços automáticos"
              icon="checkmark"
              loading={busy}
              onPress={() => void save()}
            />
          </>
        )
      )}
    </ScrollView>
  );
}
