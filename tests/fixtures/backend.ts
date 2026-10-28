/** Local-only UI test harness. Not a Supabase replacement and never deploy this server. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
const db = new PGlite();
const admin = "00000000-0000-4000-8000-000000000001";
const uploads = new Map<string, { bytes: Buffer; mime: string }>();
const user = {
  id: admin,
  aud: "authenticated",
  role: "authenticated",
  email: "teste@innexa.example",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: new Date().toISOString(),
};
async function start() {
  await db.exec(
    `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]); create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);`,
  );
  const sql = await readFile(
    new URL(
      "../../supabase/migrations/202610240001_initial.sql",
      import.meta.url,
    ),
    "utf8",
  );
  await db.exec(sql.replace("create extension if not exists pgcrypto;", ""));
  await db.query("insert into auth.users(id) values($1)", [admin]);
  await db.query("insert into app_admins(user_id) values($1)", [admin]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    admin,
  ]);
  const categoryId = randomUUID();
  await db.query("insert into categories(id,name) values($1,$2)", [
    categoryId,
    "Decoração",
  ]);
  for (const [name, grams, minutes] of [
    ["Vaso orgânico", 125.79, 519],
    ["Organizador de mesa", 70, 150],
    ["Suporte para celular", 64.14, 120],
  ] as const) {
    await db.query("select save_product($1::jsonb)", [
      JSON.stringify({
        id: randomUUID(),
        name,
        description:
          "Uma peça pensada para transformar os pequenos detalhes do dia a dia.",
        published: true,
        category_id: categoryId,
        variants: [
          {
            id: randomUUID(),
            size: "Pequeno — 10 cm",
            grams,
            minutes,
            extras_cents: 0,
            automatic: true,
          },
          {
            id: randomUUID(),
            size: "Grande — 18 cm",
            grams: grams * 1.5,
            minutes: (minutes * 1.5) | 0,
            extras_cents: 0,
            automatic: true,
          },
        ],
      }),
    ]);
  }
  let queue = Promise.resolve();
  createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PATCH,DELETE,PUT,OPTIONS",
    );
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    queue = queue
      .then(async () => {
        const url = new URL(req.url!, "http://127.0.0.1:54329");
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk));
        const raw = Buffer.concat(chunks);
        const body =
          raw.length && String(req.headers["content-type"]).includes("json")
            ? JSON.parse(raw.toString())
            : {};
        const send = (data: unknown, status = 200) => {
          res
            .writeHead(status, { "Content-Type": "application/json" })
            .end(
              JSON.stringify(data, (key, value) =>
                ["grams", "markup_percent", "discount_value"].includes(key) &&
                typeof value === "string"
                  ? Number(value)
                  : value,
              ),
            );
        };
        try {
          if (url.pathname === "/auth/v1/token") {
            if (
              body.email !== user.email ||
              body.password !== "apenas-teste-local"
            ) {
              send(
                {
                  message: "Invalid login credentials",
                  error_description: "Invalid login credentials",
                },
                400,
              );
              return;
            }
            const token = [
              Buffer.from(
                JSON.stringify({ alg: "HS256", typ: "JWT" }),
              ).toString("base64url"),
              Buffer.from(
                JSON.stringify({
                  sub: admin,
                  exp: Math.floor(Date.now() / 1000) + 3600,
                  role: "authenticated",
                }),
              ).toString("base64url"),
              "test-only",
            ].join(".");
            send({
              access_token: token,
              refresh_token: "test-refresh",
              expires_in: 3600,
              expires_at: Math.floor(Date.now() / 1000) + 3600,
              token_type: "bearer",
              user,
            });
            return;
          }
          if (url.pathname === "/auth/v1/user") {
            send(user);
            return;
          }
          if (url.pathname.startsWith("/auth/")) {
            send({});
            return;
          }
          if (url.pathname.startsWith("/storage/v1/object/sign/")) {
            const p = url.pathname.replace("/storage/v1/object/sign/", "");
            send({ signedURL: `/object/${p}?token=test-only` });
            return;
          }
          if (url.pathname.startsWith("/storage/v1/object/")) {
            const path = decodeURIComponent(
              url.pathname
                .replace("/storage/v1/object/", "")
                .replace(/^public\//, ""),
            );
            if (req.method === "POST") {
              uploads.set(path, {
                bytes: raw,
                mime: String(req.headers["content-type"]),
              });
              send({ Key: path });
              return;
            }
            if (req.method === "DELETE") {
              for (const prefix of body.prefixes ?? [])
                uploads.delete(`${path}/${prefix}`);
              send([]);
              return;
            }
            const f = uploads.get(path);
            if (!f) {
              send({ message: "Not found" }, 404);
              return;
            }
            res.writeHead(200, { "Content-Type": f.mime }).end(f.bytes);
            return;
          }
          if (!url.pathname.startsWith("/rest/v1/")) {
            send({ message: "Not found" }, 404);
            return;
          }
          const resource = url.pathname.replace("/rest/v1/", "");
          if (resource.startsWith("rpc/")) {
            const rpc = resource.slice(4);
            const allowed: Record<string, string[]> = {
              is_admin: [],
              save_product: ["p_product"],
              save_settings: ["p_settings"],
              create_order: ["p_order"],
              record_payment: [
                "p_order_id",
                "p_id",
                "p_amount",
                "p_date",
                "p_notes",
              ],
              order_action: ["p_id", "p_action", "p_stage"],
              import_products: ["p_id", "p_products", "p_settings"],
            };
            const args = allowed[rpc];
            if (!args) throw new Error("RPC não permitida no teste");
            const values = args.map((key) =>
              typeof body[key] === "object" && body[key] !== null
                ? JSON.stringify(body[key])
                : body[key],
            );
            const result = await db.query<Record<string, unknown>>(
              `select ${rpc}(${args.map((_, i) => `$${i + 1}`).join(",")}) as value`,
              values,
            );
            send(result.rows[0]?.value ?? null);
            return;
          }
          if (
            ![
              "products",
              "orders",
              "categories",
              "settings",
              "catalog",
              "product_photos",
              "product_files",
            ].includes(resource)
          )
            throw new Error("Tabela não permitida no teste");
          if (req.method === "POST") {
            const keys = Object.keys(body);
            const allowed = ["name", "product_id", "path", "position"];
            if (
              !["categories", "product_photos", "product_files"].includes(
                resource,
              ) ||
              keys.some((k) => !allowed.includes(k))
            )
              throw new Error("Escrita não permitida");
            const result = await db.query(
              `insert into ${resource}(${keys.join(",")}) values(${keys.map((_, i) => `$${i + 1}`).join(",")}) returning *`,
              Object.values(body),
            );
            send(result.rows[0]);
            return;
          }
          if (req.method === "DELETE") {
            const id = url.searchParams.get("id")?.replace("eq.", "");
            await db.query(`delete from ${resource} where id=$1`, [id]);
            send(null);
            return;
          }
          const sql =
            resource === "products"
              ? `select p.*,coalesce((select jsonb_agg(v) from product_variants v where v.product_id=p.id),'[]') variants,coalesce((select jsonb_agg(ph) from product_photos ph where ph.product_id=p.id),'[]') photos,coalesce((select jsonb_agg(f) from product_files f where f.product_id=p.id),'[]') files from products p order by name`
              : resource === "orders"
                ? `select o.*,coalesce((select jsonb_agg(i) from order_items i where i.order_id=o.id),'[]') items,coalesce((select jsonb_agg(p) from payments p where p.order_id=o.id),'[]') payments from orders o order by created_at`
                : `select * from ${resource}`;
          const result = await db.query(sql);
          send(
            String(req.headers.accept).includes("vnd.pgrst.object")
              ? result.rows[0]
              : result.rows,
          );
        } catch (e) {
          send(
            { message: e instanceof Error ? e.message : "Falha no teste" },
            400,
          );
        }
      })
      .catch((e) => {
        console.error(e);
        if (!res.writableEnded) res.writeHead(500).end();
      });
  }).listen(54329, "127.0.0.1", () =>
    console.log(
      "Backend de teste local: http://127.0.0.1:54329 | teste@innexa.example / apenas-teste-local",
    ),
  );
}
void start();
