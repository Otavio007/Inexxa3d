import React from "react";
import { ScrollView, Text, View } from "react-native";
import { router } from "expo-router";
import * as api from "../../src/api";
import {
  archived,
  displayDate,
  money,
  received,
  sortOrders,
  stages,
  todaySP,
} from "../../src/domain";
import { useResource } from "../../src/useResource";
import {
  Badge,
  Button,
  Card,
  Empty,
  Grid,
  Heading,
  Loading,
  Notice,
  Txt,
  colors,
  styles,
} from "../../src/ui";
export default function Dashboard() {
  const { data, loading, error, reload } = useResource(api.orders);
  const active = (data ?? []).filter((o) => !archived(o));
  const valid = (data ?? []).filter((o) => !o.canceled_at);
  const overdue = active.filter(
    (o) => o.due_date && o.due_date < todaySP() && o.stage !== "delivered",
  );
  const stats = [
    ["Encomendas ativas", String(active.length), "Peças e ideias em movimento"],
    [
      "A receber",
      money(valid.reduce((s, o) => s + o.total_cents - received(o), 0)),
      "Saldo das encomendas não canceladas",
    ],
    [
      "Prontas para entrega",
      String(active.filter((o) => o.stage === "ready").length),
      "Produção concluída, próximo passo: entregar",
    ],
    [
      "Lucro estimado",
      money(
        valid.reduce(
          (s, o) =>
            s +
            o.total_cents -
            o.items.reduce((c, i) => c + i.quantity * i.cost_cents, 0),
          0,
        ),
      ),
      "Todos os pedidos não cancelados, após descontos",
    ],
  ];
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Heading
        title="Seu ateliê em movimento"
        subtitle="Um olhar para o que importa hoje na INNEXA 3D."
        action={
          <Button
            label="Ver encomendas"
            icon="arrow-forward"
            onPress={() => router.push("/orders")}
          />
        }
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
        <>
          <Grid min={230}>
            {stats.map(([label, value, hint]) => (
              <Card key={label}>
                <Txt muted small>
                  {label}
                </Txt>
                <Text
                  style={{
                    color: colors.ink,
                    fontSize: 32,
                    fontWeight: "800",
                    letterSpacing: -1,
                  }}
                >
                  {value}
                </Text>
                <Txt small>{hint}</Txt>
              </Card>
            ))}
          </Grid>
          {overdue.length > 0 && (
            <Notice
              error
              message={`${overdue.length} encomenda(s) com prazo vencido. Confira a fila para organizar as próximas entregas.`}
            />
          )}
          <Heading
            title="Próximas na fila"
            subtitle="Urgências e entregas próximas aparecem primeiro."
          />
          {active.length === 0 ? (
            <Empty
              title="Espaço para novas ideias"
              subtitle="Cadastre produtos e crie encomendas para acompanhar o seu negócio."
              action={
                <Button
                  label="Ver produtos"
                  onPress={() => router.push("/products")}
                />
              }
            />
          ) : (
            sortOrders(active)
              .slice(0, 6)
              .map((o) => (
                <Card key={o.id}>
                  <View
                    style={[styles.row, { justifyContent: "space-between" }]}
                  >
                    <View style={{ gap: 7 }}>
                      <Txt bold>
                        #{o.number} · {o.customer_name}
                      </Txt>
                      <Txt small>
                        {o.items.reduce((s, i) => s + i.quantity, 0)} peça(s) ·{" "}
                        {displayDate(o.due_date)}
                      </Txt>
                    </View>
                    <View style={styles.row}>
                      {o.urgent && <Badge label="Urgente" tone="red" />}
                      <Badge label={stages[o.stage]} />
                      <Txt bold>{money(o.total_cents)}</Txt>
                    </View>
                  </View>
                </Card>
              ))
          )}
        </>
      )}
    </ScrollView>
  );
}
