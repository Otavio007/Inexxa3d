import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { defaultSettings } from "../src/domain";
test(
  "PostgreSQL: transações, preços, snapshots, pagamentos, idempotência e isolamento público",
  { timeout: 120000 },
  async () => {
    const db = new PGlite();
    try {
      await db.exec(
        `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text); alter table storage.objects enable row level security; grant usage on schema storage to anon,authenticated; grant select,insert,update,delete on storage.objects to anon,authenticated;`,
      );
      const sql = await readFile(
        new URL(
          "../supabase/migrations/202610240001_initial.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await db.exec(
        sql.replace("create extension if not exists pgcrypto;", ""),
      );
      await db.exec(await readFile(new URL("../supabase/migrations/202610270001_delete_product.sql", import.meta.url), "utf8"));
      const settingsMigration = await readFile(new URL("../supabase/migrations/202610270002_safe_settings_update.sql", import.meta.url), "utf8");
      assert.match(settingsMigration, /set cost_cents=variant_cost\(grams,minutes,extras_cents\) where id is not null;/);
      await db.exec(settingsMigration);
      await db.exec(await readFile(new URL("../supabase/migrations/202610270003_multiple_categories.sql", import.meta.url), "utf8"));
      const admin = randomUUID(),
        stranger = randomUUID();
      await db.query("insert into auth.users(id) values($1),($2)", [
        admin,
        stranger,
      ]);
      await db.query("insert into public.app_admins(user_id) values($1)", [
        admin,
      ]);
      await db.exec(
        `set role authenticated; select set_config('request.jwt.claim.sub','${admin}',false);`,
      );
      const pid = randomUUID(),
        vid = randomUUID(),
        manualId = randomUUID();
      const p = {
        id: pid,
        name: "Vaso",
        description: "Teste",
        published: true,
        category_id: null,
        variants: [
          {
            id: vid,
            size: "10 cm",
            grams: 100,
            minutes: 60,
            extras_cents: 0,
            price_cents: 0,
            automatic: true,
          },
          {
            id: manualId,
            size: "20 cm",
            grams: 200,
            minutes: 120,
            extras_cents: 0,
            price_cents: 9990,
            automatic: false,
          },
        ],
      };
      await db.query("select save_product($1::jsonb)", [JSON.stringify(p)]);
      const categoryA = randomUUID(), categoryB = randomUUID();
      await db.query("insert into categories(id,name) values($1,'Decoração'),($2,'Presentes')", [categoryA, categoryB]);
      const categorized = { ...p, category_ids: [categoryA, categoryB] };
      await db.query("select save_product($1::jsonb)", [JSON.stringify(categorized)]);
      assert.equal((await db.query<{categories: unknown[]}>("select categories from catalog where id=$1", [pid])).rows[0]!.categories.length, 2);
      await assert.rejects(db.query("select save_product($1::jsonb)", [JSON.stringify({ ...categorized, category_ids: [randomUUID()] })]));
      assert.equal((await db.query<{category_ids: string[]}>("select category_ids from products where id=$1", [pid])).rows[0]!.category_ids.length, 2);
      let variants = (
        await db.query<{ id: string; cost_cents: number; price_cents: number }>(
          "select id,cost_cents,price_cents from product_variants order by grams",
        )
      ).rows;
      assert.equal(variants[0]!.cost_cents, 1368);
      assert.equal(variants[0]!.price_cents, 2790);
      const oid = randomUUID();
      const order = {
        id: oid,
        customer_name: "Cliente",
        phone: "19995203113",
        urgent: true,
        due_date: "2026-10-26",
        discount_kind: "percent",
        discount_value: 10,
        items: [
          { variant_id: vid, quantity: 2, price_cents: 2790, notes: "Azul" },
        ],
      };
      await db.query("select create_order($1::jsonb)", [JSON.stringify(order)]);
      await db.query("select create_order($1::jsonb)", [JSON.stringify(order)]);
      assert.equal(
        (
          await db.query<{ count: number }>(
            "select count(*)::integer as count from orders",
          )
        ).rows[0]!.count,
        1,
      );
      assert.equal(
        (
          await db.query<{ total_cents: number }>(
            "select total_cents from orders",
          )
        ).rows[0]!.total_cents,
        5022,
      );
      await db.query("select save_settings($1::jsonb)", [
        JSON.stringify({ ...defaultSettings, pla_kg_cents: 24000 }),
      ]);
      variants = (
        await db.query<{ id: string; cost_cents: number; price_cents: number }>(
          "select id,cost_cents,price_cents from product_variants order by grams",
        )
      ).rows;
      assert.equal(variants[0]!.price_cents, 5190);
      assert.equal(variants[1]!.price_cents, 9990);
      const snapshot = (
        await db.query<{ cost_cents: number; price_cents: number }>(
          "select cost_cents,price_cents from order_items",
        )
      ).rows[0]!;
      assert.equal(snapshot.cost_cents, 1368);
      assert.equal(snapshot.price_cents, 2790);
      const payid = randomUUID();
      await db.query("select record_payment($1,$2,1000,current_date,$3)", [
        oid,
        payid,
        "Sinal",
      ]);
      await db.query("select record_payment($1,$2,1000,current_date,$3)", [
        oid,
        payid,
        "Sinal",
      ]);
      assert.equal(
        (
          await db.query<{ count: number }>(
            "select count(*)::integer as count from payments",
          )
        ).rows[0]!.count,
        1,
      );
      await assert.rejects(
        db.query("select record_payment($1,$2,5000,current_date,$3)", [
          oid,
          randomUUID(),
          "Saldo excessivo",
        ]),
      );
      const bad = {
        ...order,
        id: randomUUID(),
        items: [{ ...order.items[0], quantity: 0 }],
      };
      await assert.rejects(
        db.query("select create_order($1::jsonb)", [JSON.stringify(bad)]),
      );
      assert.equal(
        (
          await db.query<{ count: number }>(
            "select count(*)::integer as count from orders",
          )
        ).rows[0]!.count,
        1,
      );
      await db.query("select order_action($1,$2,$3)", [
        oid,
        "stage",
        "delivered",
      ]);
      await db.query("select record_payment($1,$2,4022,current_date,$3)", [
        oid,
        randomUUID(),
        "Saldo",
      ]);
      await db.query("select order_action($1,$2,null)", [oid, "reopen"]);
      assert.equal(
        (await db.query<{ stage: string }>("select stage from orders")).rows[0]!
          .stage,
        "todo",
      );
      await db.query("select order_action($1,$2,null)", [oid, "cancel"]);
      await assert.rejects(
        db.query("select record_payment($1,$2,1,current_date,$3)", [
          oid,
          randomUUID(),
          "Teste",
        ]),
      );
      await assert.rejects(
        db.exec("update product_variants set price_cents=1"),
      ); // Even admins must use RPCs.
      const batchId = randomUUID();
      const imported = { ...p, id: randomUUID(), name: 'Produto importado', variants: [{ ...p.variants[0], id: randomUUID() }] };
      await db.query('select import_products($1,$2::jsonb,null)', [batchId, JSON.stringify([imported])]);
      await db.query('select import_products($1,$2::jsonb,null)', [batchId, JSON.stringify([imported])]);
      assert.equal((await db.query<{ count: number }>('select count(*)::integer count from import_batches')).rows[0]!.count, 1);
      assert.equal((await db.query<{ published: boolean }>('select published from products where id=$1', [imported.id])).rows[0]!.published, false);
      const rollbackId = randomUUID();
      const validImport = { ...imported, id: rollbackId, variants: [{ ...p.variants[0], id: randomUUID() }] };
      const invalidImport = { ...imported, id: randomUUID(), name: '', variants: [{ ...p.variants[0], id: randomUUID() }] };
      await assert.rejects(db.query('select import_products($1,$2::jsonb,$3::jsonb)', [randomUUID(), JSON.stringify([validImport, invalidImport]), JSON.stringify(defaultSettings)]));
      assert.equal((await db.query('select id from products where id=$1', [rollbackId])).rows.length, 0);
      assert.equal((await db.query<{ pla_kg_cents: number }>('select pla_kg_cents from settings')).rows[0]!.pla_kg_cents, 24000);
      await db.exec(
        `reset role; insert into storage.objects(bucket_id,name) values('print-files','${pid}/teste.stl'); set role anon;`,
      );
      const publicRows = (
        await db.query<Record<string, unknown>>("select * from catalog")
      ).rows;
      assert.equal(publicRows.length, 1);
      assert.equal(
        "cost_cents" in
          (publicRows[0]!.variants as Record<string, unknown>[])[0]!,
        false,
      );
      await assert.rejects(db.exec("select * from orders"));
      await assert.rejects(db.exec("select * from product_variants"));
      await assert.rejects(db.exec("select * from product_files"));
      await assert.rejects(
        db.query("select save_product($1::jsonb)", [JSON.stringify(p)]),
      );
      assert.equal(
        (await db.query("select * from storage.objects")).rows.length,
        0,
      );
      await db.exec(
        `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${stranger}',false);`,
      );
      assert.equal((await db.query("select * from orders")).rows.length, 0);
      await assert.rejects(
        db.query("select save_settings($1::jsonb)", [
          JSON.stringify(defaultSettings),
        ]),
      );
      await assert.rejects(db.query("select delete_product($1)", [pid]));
      await db.exec(`select set_config('request.jwt.claim.sub','${admin}',false);`);
      const oldItems = (await db.query("select * from order_items order by id")).rows;
      await db.query("select delete_product($1)", [pid]);
      await db.query("select delete_product($1)", [pid]); // Safe to retry.
      assert.deepEqual((await db.query("select * from order_items order by id")).rows, oldItems);
      assert.equal((await db.query("select id from product_variants where product_id=$1 and active", [pid])).rows.length, 0);
      await db.exec("reset role; set role anon;");
      assert.equal((await db.query("select * from catalog")).rows.length, 0);
      await assert.rejects(db.query("select delete_product($1)", [pid]));
    } finally {
      await db.close();
    }
  },
);
