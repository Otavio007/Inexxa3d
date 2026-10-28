alter table public.order_items add column if not exists produced_quantity integer not null default 0;
update public.order_items set produced_quantity=quantity where completed and produced_quantity=0;
alter table public.order_items add constraint produced_quantity_range check(produced_quantity between 0 and quantity);

create or replace function public.sync_item_production() returns trigger
language plpgsql set search_path=public as $$
begin
 if TG_OP='UPDATE' and new.quantity<>old.quantity then
   new.produced_quantity:=least(old.produced_quantity,new.quantity);
 end if;
 new.completed:=(new.produced_quantity=new.quantity);
 return new;
end $$;
create trigger sync_item_production before insert or update on public.order_items
for each row execute function public.sync_item_production();

create or replace function public.sync_order_progress() returns trigger
language plpgsql security definer set search_path=public as $$
declare oid uuid; total bigint; done bigint;
begin
 if TG_OP='DELETE' then oid:=old.order_id; else oid:=new.order_id; end if;
 select coalesce(sum(quantity),0),coalesce(sum(produced_quantity),0) into total,done from order_items where order_id=oid;
 update orders set stage=case when total>0 and done=total then 'ready'
   when done>0 or stage='ready' then 'printing' else stage end
 where id=oid and canceled_at is null and stage<>'delivered';
 return null;
end $$;
create trigger sync_order_progress after insert or update or delete on public.order_items
for each row execute function public.sync_order_progress();

create or replace function public.set_item_produced(p_item_id uuid,p_quantity integer) returns void
language plpgsql security definer set search_path=public as $$
declare o orders;
begin
 if not is_admin() then raise exception 'Acesso restrito'; end if;
 select ord.* into o from orders ord join order_items i on i.order_id=ord.id where i.id=p_item_id for update of ord;
 if not found then raise exception 'Item não encontrado'; end if;
 if o.canceled_at is not null then raise exception 'Reabra a encomenda antes de alterar os itens'; end if;
 if p_quantity is null or p_quantity<0 or p_quantity>(select quantity from order_items where id=p_item_id) then raise exception 'Quantidade produzida fora do limite do item'; end if;
 update order_items set produced_quantity=p_quantity where id=p_item_id;
end $$;
create or replace function public.set_item_completed(p_item_id uuid,p_completed boolean) returns void
language plpgsql security definer set search_path=public as $$
begin
 if p_completed is null then raise exception 'Informe se o item foi feito'; end if;
 perform set_item_produced(p_item_id,case when p_completed then (select quantity from order_items where id=p_item_id) else 0 end);
end $$;
revoke all on function public.sync_item_production(),public.sync_order_progress(),public.set_item_produced(uuid,integer),public.set_item_completed(uuid,boolean) from public,anon,authenticated;
grant execute on function public.set_item_produced(uuid,integer),public.set_item_completed(uuid,boolean) to authenticated;
notify pgrst, 'reload schema';

create or replace function public.edit_order(p_order jsonb) returns void
language plpgsql security definer set search_path=public as $$
declare oid uuid; o orders; item jsonb; iid uuid; v record; subtotal bigint:=0; total bigint; disc numeric; paid bigint; kept uuid[]:='{}';
begin
 if not is_admin() then raise exception 'Acesso restrito'; end if;
 perform 1 from settings where id=1 for share;
 oid:=(p_order->>'id')::uuid;
 select * into o from orders where id=oid for update;
 if not found then raise exception 'Encomenda não encontrada'; end if;
 if o.canceled_at is not null then raise exception 'Reabra a encomenda antes de editar'; end if;
 if jsonb_typeof(p_order->'items') is distinct from 'array' or jsonb_array_length(p_order->'items')<1 then raise exception 'Adicione produtos'; end if;
 for item in select * from jsonb_array_elements(p_order->'items') loop
   iid:=nullif(item->>'id','')::uuid;
   if iid is not null then
     if iid=any(kept) then raise exception 'Item duplicado'; end if;
     update order_items set quantity=(item->>'quantity')::integer,price_cents=(item->>'price_cents')::integer,notes=coalesce(item->>'notes','')
       where id=iid and order_id=oid and variant_id=(item->>'variant_id')::uuid;
     if not found then raise exception 'Item não pertence à encomenda'; end if;
   else
     select pv.*,p.name into v from product_variants pv join products p on p.id=pv.product_id
       where pv.id=(item->>'variant_id')::uuid and pv.active for share of pv,p;
     if not found then raise exception 'Produto indisponível. Atualize a lista'; end if;
     insert into order_items(order_id,variant_id,product_name,size,quantity,price_cents,cost_cents,notes)
       values(oid,v.id,v.name,v.size,(item->>'quantity')::integer,(item->>'price_cents')::integer,v.cost_cents,coalesce(item->>'notes','')) returning id into iid;
   end if;
   kept:=array_append(kept,iid);
 end loop;
 delete from order_items where order_id=oid and not(id=any(kept));
 select sum(quantity::bigint*price_cents) into subtotal from order_items where order_id=oid;
 disc:=(p_order->>'discount_value')::numeric;
 if disc is null or disc<0 then raise exception 'Desconto inválido'; end if;
 if p_order->>'discount_kind'='percent' then
   if disc>100 then raise exception 'Desconto maior que 100%%'; end if;
   total:=subtotal-round(subtotal*disc/100);
 elsif p_order->>'discount_kind'='amount' then
   if disc<>trunc(disc) then raise exception 'Desconto deve estar em centavos'; end if;
   total:=subtotal-disc;
 else raise exception 'Tipo de desconto inválido'; end if;
 select coalesce(sum(amount_cents),0) into paid from payments where order_id=oid;
 if total<0 or total<paid then raise exception 'O total não pode ser menor que o valor já recebido'; end if;
 update orders set customer_name=trim(p_order->>'customer_name'),phone=p_order->>'phone',urgent=(p_order->>'urgent')::boolean,
   due_date=nullif(p_order->>'due_date','')::date,discount_kind=p_order->>'discount_kind',discount_value=disc,total_cents=total where id=oid;
end $$;
revoke all on function public.edit_order(jsonb) from public,anon,authenticated;
grant execute on function public.edit_order(jsonb) to authenticated;
notify pgrst, 'reload schema';
