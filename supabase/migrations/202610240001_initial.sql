-- All business mutations run as transactions through the RPCs below.
create extension if not exists pgcrypto;
create table public.app_admins (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.app_admins enable row level security;
create function public.is_admin() returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from app_admins where user_id = auth.uid()) $$;

create table public.settings (
  id integer primary key default 1 check(id=1),
  pla_kg_cents integer not null default 12000 check(pla_kg_cents >= 0),
  energy_hour_cents integer not null default 0 check(energy_hour_cents >= 0),
  box_cents integer not null default 0 check(box_cents >= 0),
  label_cents integer not null default 0 check(label_cents >= 0),
  bag_cents integer not null default 18 check(bag_cents >= 0),
  wear_cents integer not null default 150 check(wear_cents >= 0),
  markup_percent numeric(8,2) not null default 100 check(markup_percent between 0 and 10000)
);
insert into public.settings(id) values(1);
create table public.categories (id uuid primary key default gen_random_uuid(), name text not null unique check(length(trim(name)) between 1 and 100));
create table public.products (
  id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 200),
  description text not null default '', category_id uuid references public.categories(id), published boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.product_variants (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
  size text not null check(length(trim(size)) between 1 and 200), grams numeric(12,3) not null check(grams>=0),
  minutes integer not null check(minutes>=0), extras_cents integer not null default 0 check(extras_cents>=0),
  cost_cents integer not null default 0 check(cost_cents>=0), price_cents integer not null default 0 check(price_cents>=0),
  automatic boolean not null default true, active boolean not null default true
);
create index product_variants_product on public.product_variants(product_id);
create table public.product_photos (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
  path text not null unique, position integer not null default 0 check(position>=0)
);
create table public.product_files (
  id uuid primary key default gen_random_uuid(), product_id uuid not null references public.products(id) on delete cascade,
  path text not null unique, name text not null
);
create table public.orders (
  id uuid primary key, number bigint generated always as identity unique,
  customer_name text not null check(length(trim(customer_name)) between 1 and 200),
  phone text not null check(length(regexp_replace(phone,'\D','','g')) between 10 and 13),
  urgent boolean not null default false, due_date date,
  stage text not null default 'todo' check(stage in ('todo','printing','ready','delivered')),
  discount_kind text not null check(discount_kind in ('amount','percent')),
  discount_value numeric(12,2) not null check(discount_value>=0), total_cents integer not null check(total_cents>=0),
  canceled_at timestamptz, created_at timestamptz not null default now()
);
create index orders_created on public.orders(created_at);
create table public.order_items (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references public.orders(id),
  variant_id uuid not null references public.product_variants(id), product_name text not null, size text not null,
  quantity integer not null check(quantity between 1 and 100000),
  price_cents integer not null check(price_cents>=0), cost_cents integer not null check(cost_cents>=0), notes text not null default ''
);
create index order_items_order on public.order_items(order_id);
create table public.payments (
  id uuid primary key, order_id uuid not null references public.orders(id), amount_cents integer not null check(amount_cents>0),
  paid_on date not null, notes text not null default '', created_at timestamptz not null default now()
);
create index payments_order on public.payments(order_id);
create table public.import_batches (id uuid primary key, created_at timestamptz not null default now(), product_count integer not null);

-- Explicit projection: costs, grams, times and private file paths are never exposed.
create view public.catalog with (security_barrier = true) as
select p.id,p.name,p.description,p.category_id,c.name as category_name,
  coalesce((select jsonb_agg(jsonb_build_object('path',ph.path,'position',ph.position) order by ph.position,ph.id) from public.product_photos ph where ph.product_id=p.id),'[]'::jsonb) as photos,
  (select jsonb_agg(jsonb_build_object('id',v.id,'size',v.size,'price_cents',v.price_cents) order by v.price_cents,v.id) from public.product_variants v where v.product_id=p.id and v.active) as variants
from public.products p left join public.categories c on c.id=p.category_id
where p.published and exists(select 1 from public.product_variants v where v.product_id=p.id and v.active);
grant select on public.catalog to anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['settings','categories','products','product_variants','product_photos','product_files','orders','order_items','payments','import_batches'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy admin_read on public.%I for select to authenticated using (public.is_admin())',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
end $$;
-- Only assets and categories permit direct writes. Business rows must use RPCs.
do $$ declare t text; begin
  foreach t in array array['categories','product_photos','product_files'] loop
    execute format('create policy admin_write on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',t);
    execute format('grant insert,update,delete on public.%I to authenticated',t);
  end loop;
end $$;
revoke all on public.app_admins from anon, authenticated;

create function public.variant_cost(p_grams numeric,p_minutes integer,p_extras integer) returns integer
language sql stable security definer set search_path=public as $$
 select round((p_grams/1000)*pla_kg_cents+(p_minutes::numeric/60)*energy_hour_cents+box_cents+label_cents+bag_cents+wear_cents+p_extras)::integer from settings where id=1
$$;
create function public.suggested_price(p_cost integer) returns integer
language sql stable security definer set search_path=public as $$
 select greatest(90,ceil((p_cost*(1+markup_percent/100)-90)/100)*100+90)::integer from settings where id=1
$$;

create function public.save_product(p_product jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare pid uuid; v jsonb; vid uuid; c integer;
begin
 if not is_admin() then raise exception 'Acesso restrito'; end if;
 -- Serialize product edits with settings changes so committed costs use one configuration.
 perform 1 from settings where id=1 for update;
 pid := (p_product->>'id')::uuid;
 if jsonb_typeof(p_product->'variants') is distinct from 'array' or jsonb_array_length(p_product->'variants')<1 then raise exception 'Adicione ao menos um tamanho'; end if;
 if (select count(*) from jsonb_array_elements(p_product->'variants')) <> (select count(distinct x->>'id') from jsonb_array_elements(p_product->'variants') x) then raise exception 'Tamanhos duplicados'; end if;
 insert into products(id,name,description,category_id,published) values(pid,trim(p_product->>'name'),coalesce(p_product->>'description',''),nullif(p_product->>'category_id','')::uuid,coalesce((p_product->>'published')::boolean,false))
 on conflict(id) do update set name=excluded.name,description=excluded.description,category_id=excluded.category_id,published=excluded.published;
 update product_variants set active=false where product_id=pid;
 for v in select * from jsonb_array_elements(p_product->'variants') loop
   vid := (v->>'id')::uuid;
   if exists(select 1 from product_variants where id=vid and product_id<>pid) then raise exception 'Tamanho pertence a outro produto'; end if;
   c := variant_cost((v->>'grams')::numeric,(v->>'minutes')::integer,(v->>'extras_cents')::integer);
   insert into product_variants(id,product_id,size,grams,minutes,extras_cents,cost_cents,price_cents,automatic,active)
   values(vid,pid,trim(v->>'size'),(v->>'grams')::numeric,(v->>'minutes')::integer,(v->>'extras_cents')::integer,c,
    case when (v->>'automatic')::boolean then suggested_price(c) else (v->>'price_cents')::integer end,(v->>'automatic')::boolean,true)
   on conflict(id) do update set size=excluded.size,grams=excluded.grams,minutes=excluded.minutes,extras_cents=excluded.extras_cents,cost_cents=excluded.cost_cents,price_cents=excluded.price_cents,automatic=excluded.automatic,active=true;
 end loop;
 return pid;
end $$;

create function public.save_settings(p_settings jsonb) returns void
language plpgsql security definer set search_path=public as $$
begin
 if not is_admin() then raise exception 'Acesso restrito'; end if;
 update settings set pla_kg_cents=(p_settings->>'pla_kg_cents')::integer,energy_hour_cents=(p_settings->>'energy_hour_cents')::integer,
 box_cents=(p_settings->>'box_cents')::integer,label_cents=(p_settings->>'label_cents')::integer,bag_cents=(p_settings->>'bag_cents')::integer,
 wear_cents=(p_settings->>'wear_cents')::integer,markup_percent=(p_settings->>'markup_percent')::numeric where id=1;
 update product_variants set cost_cents=variant_cost(grams,minutes,extras_cents) where id is not null;
 update product_variants set price_cents=suggested_price(cost_cents) where automatic;
end $$;

create function public.create_order(p_order jsonb) returns uuid
language plpgsql security definer set search_path=public as $$
declare oid uuid; item jsonb; v record; qty integer; price integer; subtotal bigint:=0; disc numeric; total bigint;
begin
 if not is_admin() then raise exception 'Acesso restrito'; end if;
 perform 1 from settings where id=1 for share;
 oid := (p_order->>'id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(oid::text,0));
 if exists(select 1 from orders where id=oid) then return oid; end if;
 if jsonb_typeof(p_order->'items') is distinct from 'array' or jsonb_array_length(p_order->'items')<1 then raise exception 'Adicione produtos'; end if;
 disc := (p_order->>'discount_value')::numeric;
 if disc<0 or disc is null then raise exception 'Desconto inválido'; end if;
 -- The order row and snapshots become visible together at commit.
 insert into orders(id,customer_name,phone,urgent,due_date,discount_kind,discount_value,total_cents)
 values(oid,trim(p_order->>'customer_name'),p_order->>'phone',coalesce((p_order->>'urgent')::boolean,false),nullif(p_order->>'due_date','')::date,p_order->>'discount_kind',disc,0);
 for item in select * from jsonb_array_elements(p_order->'items') loop
   select pv.*,p.name into v from product_variants pv join products p on p.id=pv.product_id where pv.id=(item->>'variant_id')::uuid and pv.active for share of pv,p;
   if not found then raise exception 'Um tamanho foi removido. Atualize os produtos'; end if;
   qty := (item->>'quantity')::integer; price := (item->>'price_cents')::integer;
   insert into order_items(order_id,variant_id,product_name,size,quantity,price_cents,cost_cents,notes)
   values(oid,v.id,v.name,v.size,qty,price,v.cost_cents,coalesce(item->>'notes',''));
   subtotal := subtotal+qty::bigint*price;
 end loop;
 if p_order->>'discount_kind'='percent' then
   if disc>100 then raise exception 'Desconto maior que 100%%'; end if;
   total := subtotal-round(subtotal*disc/100);
 elsif p_order->>'discount_kind'='amount' then
   if disc<>trunc(disc) then raise exception 'Desconto deve estar em centavos'; end if;
   total := subtotal-disc;
 else raise exception 'Tipo de desconto inválido'; end if;
 if total<0 then raise exception 'Desconto maior que o total'; end if;
 update orders set total_cents=total where id=oid;
 return oid;
end $$;

create function public.record_payment(p_order_id uuid,p_id uuid,p_amount integer,p_date date,p_notes text) returns uuid
language plpgsql security definer set search_path=public as $$
declare o orders; paid bigint;
begin
 if not is_admin() then raise exception 'Acesso restrito'; end if;
 select * into o from orders where id=p_order_id for update;
 if not found then raise exception 'Encomenda não encontrada'; end if;
 if exists(select 1 from payments where id=p_id and order_id=p_order_id and amount_cents=p_amount and paid_on=p_date and notes=coalesce(p_notes,'')) then return p_id; end if;
 if exists(select 1 from payments where id=p_id) then raise exception 'Identificador de pagamento já utilizado'; end if;
 if o.canceled_at is not null then raise exception 'Encomenda cancelada'; end if;
 select coalesce(sum(amount_cents),0) into paid from payments where order_id=p_order_id;
 if p_amount is null or p_amount<=0 or p_amount+paid>o.total_cents then raise exception 'Pagamento deve ser positivo e não ultrapassar o saldo'; end if;
 if p_date is null or p_date>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'Data de pagamento inválida'; end if;
 insert into payments(id,order_id,amount_cents,paid_on,notes) values(p_id,p_order_id,p_amount,p_date,coalesce(p_notes,''));
 return p_id;
end $$;

create function public.order_action(p_id uuid,p_action text,p_stage text default null) returns void
language plpgsql security definer set search_path=public as $$
declare o orders;
begin
 if not is_admin() then raise exception 'Acesso restrito'; end if;
 select * into o from orders where id=p_id for update;
 if not found then raise exception 'Encomenda não encontrada'; end if;
 if p_action='cancel' then update orders set canceled_at=coalesce(canceled_at,now()) where id=p_id;
 elsif p_action='reopen' then update orders set canceled_at=null,stage='todo' where id=p_id;
 elsif p_action='stage' then
   if o.canceled_at is not null then raise exception 'Reabra a encomenda primeiro'; end if;
   if p_stage is null or p_stage not in ('todo','printing','ready','delivered') then raise exception 'Etapa inválida'; end if;
   update orders set stage=p_stage where id=p_id;
 else raise exception 'Ação inválida'; end if;
end $$;

create function public.import_products(p_id uuid,p_products jsonb,p_settings jsonb default null) returns integer
language plpgsql security definer set search_path=public as $$
declare p jsonb; n integer;
begin
 if not is_admin() then raise exception 'Acesso restrito'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select product_count into n from import_batches where id=p_id;
 if found then return n; end if;
 if jsonb_typeof(p_products) is distinct from 'array' or jsonb_array_length(p_products)<1 then raise exception 'Selecione produtos válidos'; end if;
 if p_settings is not null then perform save_settings(p_settings); end if;
 n:=0;
 for p in select * from jsonb_array_elements(p_products) loop
   perform save_product(p || '{"published":false}'::jsonb); n:=n+1;
 end loop;
 insert into import_batches(id,product_count) values(p_id,n);
 return n;
end $$;

-- Revoke default PUBLIC function execution, then expose only guarded entry points.
revoke all on function public.is_admin(), public.variant_cost(numeric,integer,integer), public.suggested_price(integer), public.save_product(jsonb), public.save_settings(jsonb), public.create_order(jsonb), public.record_payment(uuid,uuid,integer,date,text), public.order_action(uuid,text,text), public.import_products(uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.save_product(jsonb), public.save_settings(jsonb), public.create_order(jsonb), public.record_payment(uuid,uuid,integer,date,text), public.order_action(uuid,text,text), public.import_products(uuid,jsonb,jsonb) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('product-images','product-images',true,10485760,array['image/jpeg','image/png','image/webp']),
 ('print-files','print-files',false,104857600,array['application/octet-stream'])
on conflict(id) do nothing;
create policy admin_storage on storage.objects for all to authenticated
 using (bucket_id in ('product-images','print-files') and public.is_admin())
 with check (bucket_id in ('product-images','print-files') and public.is_admin());

notify pgrst, 'reload schema';
