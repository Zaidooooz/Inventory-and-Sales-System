-- ============================================================
-- Migration 003
--   * Two shops with fully separate data (+ admin-only combined stock view)
--   * Customer credit (pay later) and supplier credit / advances (ledgers)
--   * Sales returns
--   * Repair / maintenance jobs
--   * Cash flow (money in / money out)
--   * New payment methods: Altaf's Bank, Kafeel Bank, Credit (pay later)
--
-- Run ONCE in Supabase: SQL Editor > New query > paste > Run.
-- Run it when the shop is closed: for a few minutes (until the new website
-- version is deployed) selling will not work.
-- ============================================================

-- ------------------------------------------------------------
-- 1. SHOPS
-- ------------------------------------------------------------
create table if not exists shops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from shops) then
    insert into shops (name, created_at)
    values ('Shop 1', now()), ('Shop 2', now() + interval '1 second');
  end if;
end $$;

-- A user with shop_id = NULL and role = 'admin' can see BOTH shops (the owner).
-- Everyone else only sees the shop they are assigned to.
alter table profiles add column if not exists shop_id uuid references shops(id) on delete set null;

alter table products        add column if not exists shop_id uuid references shops(id);
alter table suppliers       add column if not exists shop_id uuid references shops(id);
alter table purchase_orders add column if not exists shop_id uuid references shops(id);
alter table sales           add column if not exists shop_id uuid references shops(id);

-- Everything that exists today becomes part of Shop 1.
update products        set shop_id = (select id from shops order by created_at limit 1) where shop_id is null;
update suppliers       set shop_id = (select id from shops order by created_at limit 1) where shop_id is null;
update purchase_orders set shop_id = (select id from shops order by created_at limit 1) where shop_id is null;
update sales           set shop_id = (select id from shops order by created_at limit 1) where shop_id is null;

-- Existing approved non-admin staff go to Shop 1 so nobody gets locked out.
update profiles
set shop_id = (select id from shops order by created_at limit 1)
where shop_id is null and role in ('cashier', 'inventory_manager');

alter table products        alter column shop_id set not null;
alter table suppliers       alter column shop_id set not null;
alter table purchase_orders alter column shop_id set not null;
alter table sales           alter column shop_id set not null;

create index if not exists products_shop_idx        on products (shop_id);
create index if not exists suppliers_shop_idx       on suppliers (shop_id);
create index if not exists purchase_orders_shop_idx on purchase_orders (shop_id);
create index if not exists sales_shop_created_idx   on sales (shop_id, created_at desc);

-- SKU only has to be unique inside one shop
alter table products drop constraint if exists products_sku_key;
create unique index if not exists products_shop_sku_idx on products (shop_id, sku) where sku is not null;

-- ------------------------------------------------------------
-- 2. NEW PAYMENT METHODS
--    NOTE: 'credit' already means CREDIT CARD in this system, so the new
--    pay-later method is stored as 'on_credit'.
-- ------------------------------------------------------------
alter table sales drop constraint if exists sales_payment_method_check;
alter table sales add constraint sales_payment_method_check
  check (payment_method in
    ('cash','debit','credit','bank','altaf_bank','kafeel_bank','tabby','tamara','on_credit'));

-- ------------------------------------------------------------
-- 3. CUSTOMERS + CUSTOMER LEDGER
-- ------------------------------------------------------------
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id),
  name text not null,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists customers_shop_idx on customers (shop_id);

alter table sales add column if not exists customer_id uuid references customers(id);

-- amount > 0  : the customer owes us more
-- amount < 0  : the customer paid us / we reduced what they owe
create table if not exists customer_ledger (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id),
  customer_id uuid not null references customers(id) on delete restrict,
  amount numeric(12,2) not null,
  kind text not null check (kind in ('credit_sale','repair_credit','payment','return_adjust','opening')),
  method text,
  ref_id uuid,
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists customer_ledger_customer_idx on customer_ledger (customer_id, created_at);
create index if not exists customer_ledger_shop_idx on customer_ledger (shop_id);

-- ------------------------------------------------------------
-- 4. SUPPLIER LEDGER (credit we owe + advances we paid)
-- ------------------------------------------------------------
-- amount > 0 : we owe the supplier more (stock received, opening balance)
-- amount < 0 : we paid the supplier (payment or advance)
-- Net balance > 0  = "you owe them" (supplier credit)
-- Net balance < 0  = "they hold your advance"
create table if not exists supplier_ledger (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id),
  supplier_id uuid not null references suppliers(id) on delete restrict,
  amount numeric(12,2) not null,
  kind text not null check (kind in ('purchase','payment','advance','opening')),
  method text,
  ref_id uuid,
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists supplier_ledger_supplier_idx on supplier_ledger (supplier_id, created_at);
create index if not exists supplier_ledger_shop_idx on supplier_ledger (shop_id);

-- ------------------------------------------------------------
-- 5. CASH FLOW
-- ------------------------------------------------------------
create table if not exists cash_entries (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id),
  direction text not null check (direction in ('in','out')),
  amount numeric(12,2) not null check (amount > 0),
  method text not null default 'cash'
    check (method in ('cash','debit','credit','bank','altaf_bank','kafeel_bank','tabby','tamara')),
  category text,
  note text,
  source text not null default 'manual'
    check (source in ('manual','sale','return','customer_payment','supplier_payment','repair')),
  ref_id uuid,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists cash_entries_shop_created_idx on cash_entries (shop_id, created_at desc);

-- ------------------------------------------------------------
-- 6. SALES RETURNS
-- ------------------------------------------------------------
create table if not exists sale_returns (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id),
  sale_id uuid not null references sales(id),
  total_refund numeric(12,2) not null default 0,
  refund_method text not null
    check (refund_method in ('cash','debit','credit','bank','altaf_bank','kafeel_bank','tabby','tamara','credit_adjust')),
  note text,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists sale_returns_shop_idx on sale_returns (shop_id, created_at desc);

create table if not exists sale_return_items (
  id uuid primary key default gen_random_uuid(),
  return_id uuid not null references sale_returns(id) on delete cascade,
  sale_item_id uuid not null references sale_items(id),
  product_id uuid not null references products(id),
  quantity int not null check (quantity > 0),
  unit_price numeric(12,2) not null,
  restock boolean not null default true
);
create index if not exists sale_return_items_sale_item_idx on sale_return_items (sale_item_id);

-- ------------------------------------------------------------
-- 7. REPAIR / MAINTENANCE JOBS
-- ------------------------------------------------------------
create table if not exists repair_jobs (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id),
  ticket_no text not null
    default ('REP-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(random()::text), 1, 4))),
  customer_id uuid references customers(id),
  customer_name text,
  customer_phone text,
  device text not null,
  issue text,
  status text not null default 'received'
    check (status in ('received','diagnosing','waiting_parts','in_progress','ready','delivered','cancelled')),
  labor_charge numeric(12,2) not null default 0 check (labor_charge >= 0),
  parts_total numeric(12,2) not null default 0,
  is_paid boolean not null default false,
  payment_method text,
  paid_at timestamptz,
  notes text,
  created_by uuid references profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  delivered_at timestamptz
);
create unique index if not exists repair_jobs_shop_ticket_idx on repair_jobs (shop_id, ticket_no);
create index if not exists repair_jobs_shop_status_idx on repair_jobs (shop_id, status);

create table if not exists repair_parts (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references repair_jobs(id) on delete cascade,
  product_id uuid not null references products(id),
  quantity int not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0)
);

-- Money-related columns on a repair job can only be changed by the app's
-- payment / parts actions, never by editing the row directly.
create or replace function guard_repair_job() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();

  if new.status = 'delivered' and old.status <> 'delivered' then
    new.delivered_at := now();
  end if;

  if coalesce(current_setting('app.rpc', true), '') <> '1' then
    if new.is_paid is distinct from old.is_paid
       or new.parts_total is distinct from old.parts_total
       or new.payment_method is distinct from old.payment_method
       or new.paid_at is distinct from old.paid_at
       or new.shop_id is distinct from old.shop_id
       or new.ticket_no is distinct from old.ticket_no then
      raise exception 'Payment and parts can only be changed through the payment / parts buttons';
    end if;
    if old.is_paid and new.labor_charge is distinct from old.labor_charge then
      raise exception 'This job is already paid, so the labor charge is locked';
    end if;
  end if;

  -- Cancelling a job puts any parts it used back into stock.
  if new.status = 'cancelled' and old.status <> 'cancelled' then
    if old.is_paid then
      raise exception 'A paid job cannot be cancelled';
    end if;
    update products p
    set quantity = p.quantity + rp.quantity, updated_at = now()
    from repair_parts rp
    where rp.job_id = old.id and p.id = rp.product_id;
    delete from repair_parts where job_id = old.id;
    new.parts_total := 0;
  end if;

  return new;
end $$;

drop trigger if exists repair_jobs_guard on repair_jobs;
create trigger repair_jobs_guard before update on repair_jobs
  for each row execute function guard_repair_job();

-- ------------------------------------------------------------
-- 8. HELPERS
-- ------------------------------------------------------------
-- Can the signed-in user work inside this shop?
create or replace function has_shop_access(p_shop uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and role <> 'pending'
      and (shop_id = p_shop or (role = 'admin' and shop_id is null))
  );
$$;

-- ------------------------------------------------------------
-- 9. FUNCTIONS (all money / stock changes go through these)
-- ------------------------------------------------------------

-- ---- create_sale: replaces the old version ----
drop function if exists create_sale(text, text, numeric, text, int, jsonb);

create or replace function create_sale(
  p_shop_id uuid,
  p_customer_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_discount numeric,
  p_payment_method text,
  p_installments int,
  p_items jsonb   -- [{ "product_id": "...", "quantity": 1 }, ...]
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_sale_id uuid;
  v_subtotal numeric := 0;
  v_discount numeric := coalesce(p_discount, 0);
  v_total numeric;
  v_invoice text;
  v_name text := p_customer_name;
  v_phone text := p_customer_phone;
  item jsonb;
  pr products;
  v_qty int;
begin
  if get_role() not in ('admin','cashier','inventory_manager') or not has_shop_access(p_shop_id) then
    raise exception 'Not authorized to record sales in this shop';
  end if;
  if p_payment_method not in ('cash','debit','credit','bank','altaf_bank','kafeel_bank','tabby','tamara','on_credit') then
    raise exception 'Unknown payment method';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item to the sale';
  end if;
  if v_discount < 0 then
    raise exception 'Discount cannot be negative';
  end if;

  if p_customer_id is not null then
    select name, phone into v_name, v_phone
    from customers where id = p_customer_id and shop_id = p_shop_id;
    if not found then
      raise exception 'Customer not found in this shop';
    end if;
  end if;
  if p_payment_method = 'on_credit' and p_customer_id is null then
    raise exception 'Choose or add a customer for a credit sale';
  end if;

  -- validate stock + compute subtotal using the real shop price
  for item in select * from jsonb_array_elements(p_items) loop
    v_qty := (item->>'quantity')::int;
    if v_qty is null or v_qty <= 0 then
      raise exception 'Quantity must be at least 1';
    end if;
    select * into pr from products
    where id = (item->>'product_id')::uuid and shop_id = p_shop_id and is_active
    for update;
    if not found then
      raise exception 'A selected product was not found in this shop';
    end if;
    if pr.quantity < v_qty then
      raise exception 'Not enough stock for "%" (only % left)', pr.name, pr.quantity;
    end if;
    v_subtotal := v_subtotal + v_qty * pr.sale_price;
  end loop;

  if v_discount > v_subtotal then
    raise exception 'Discount cannot be bigger than the subtotal';
  end if;
  v_total := v_subtotal - v_discount;
  v_invoice := 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(random()::text), 1, 6));

  insert into sales (shop_id, invoice_no, customer_id, customer_name, customer_phone,
                     subtotal, discount, total, payment_method, installments, created_by)
  values (p_shop_id, v_invoice, p_customer_id, v_name, v_phone,
          v_subtotal, v_discount, v_total, p_payment_method, p_installments, auth.uid())
  returning id into v_sale_id;

  for item in select * from jsonb_array_elements(p_items) loop
    v_qty := (item->>'quantity')::int;
    select * into pr from products where id = (item->>'product_id')::uuid;

    insert into sale_items (sale_id, product_id, quantity, unit_price, subtotal)
    values (v_sale_id, pr.id, v_qty, pr.sale_price, v_qty * pr.sale_price);

    update products set quantity = quantity - v_qty, updated_at = now() where id = pr.id;
  end loop;

  if p_payment_method = 'on_credit' then
    insert into customer_ledger (shop_id, customer_id, amount, kind, ref_id, note, created_by)
    values (p_shop_id, p_customer_id, v_total, 'credit_sale', v_sale_id, 'Sale ' || v_invoice, auth.uid());
  elsif v_total > 0 then
    insert into cash_entries (shop_id, direction, amount, method, category, note, source, ref_id, created_by)
    values (p_shop_id, 'in', v_total, p_payment_method, 'Sale', 'Sale ' || v_invoice, 'sale', v_sale_id, auth.uid());
  end if;

  return v_sale_id;
end $$;

-- ---- receive_purchase_order: now also books the amount we owe the supplier ----
create or replace function receive_purchase_order(p_po_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  po purchase_orders;
  item record;
  v_total numeric;
begin
  select * into po from purchase_orders where id = p_po_id for update;
  if not found then
    raise exception 'Purchase order not found';
  end if;
  if get_role() not in ('admin','inventory_manager') or not has_shop_access(po.shop_id) then
    raise exception 'Not authorized to receive stock';
  end if;
  if po.status <> 'pending' then
    raise exception 'This order was already %', po.status;
  end if;

  for item in select * from purchase_order_items where purchase_order_id = p_po_id loop
    update products
    set quantity = quantity + item.quantity, cost_price = item.unit_cost, updated_at = now()
    where id = item.product_id and shop_id = po.shop_id;
  end loop;

  select coalesce(sum(quantity * unit_cost), 0) into v_total
  from purchase_order_items where purchase_order_id = p_po_id;

  update purchase_orders
  set status = 'received', received_at = now(), total_cost = v_total
  where id = p_po_id;

  if po.supplier_id is not null and v_total > 0 then
    insert into supplier_ledger (shop_id, supplier_id, amount, kind, ref_id, note, created_by)
    values (po.shop_id, po.supplier_id, v_total, 'purchase', po.id, 'Stock received', auth.uid());
  end if;
end $$;

-- ---- supplier payments / advances / opening balance ----
create or replace function record_supplier_entry(
  p_shop_id uuid,
  p_supplier_id uuid,
  p_kind text,            -- 'payment' | 'advance' | 'opening'
  p_amount numeric,
  p_method text default 'cash',
  p_note text default null,
  p_record_cash boolean default true   -- false = it happened before the system started
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if get_role() not in ('admin','inventory_manager') or not has_shop_access(p_shop_id) then
    raise exception 'Not authorized';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be bigger than zero';
  end if;
  if p_kind not in ('payment','advance','opening') then
    raise exception 'Unknown entry type';
  end if;
  if not exists (select 1 from suppliers where id = p_supplier_id and shop_id = p_shop_id) then
    raise exception 'Supplier not found in this shop';
  end if;

  if p_kind = 'opening' then
    -- an amount we already owed before using the system
    insert into supplier_ledger (shop_id, supplier_id, amount, kind, note, created_by)
    values (p_shop_id, p_supplier_id, p_amount, 'opening', coalesce(p_note, 'Opening balance'), auth.uid());
  else
    insert into supplier_ledger (shop_id, supplier_id, amount, kind, method, note, created_by)
    values (p_shop_id, p_supplier_id, -p_amount, p_kind, p_method, p_note, auth.uid());

    if p_record_cash then
      insert into cash_entries (shop_id, direction, amount, method, category, note, source, created_by)
      values (p_shop_id, 'out', p_amount, p_method,
              case p_kind when 'advance' then 'Supplier advance' else 'Supplier payment' end,
              p_note, 'supplier_payment', auth.uid());
    end if;
  end if;
end $$;

-- ---- customer payments / opening balance ----
create or replace function record_customer_entry(
  p_shop_id uuid,
  p_customer_id uuid,
  p_kind text,            -- 'payment' | 'opening'
  p_amount numeric,
  p_method text default 'cash',
  p_note text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if get_role() not in ('admin','cashier','inventory_manager') or not has_shop_access(p_shop_id) then
    raise exception 'Not authorized';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be bigger than zero';
  end if;
  if p_kind not in ('payment','opening') then
    raise exception 'Unknown entry type';
  end if;
  if not exists (select 1 from customers where id = p_customer_id and shop_id = p_shop_id) then
    raise exception 'Customer not found in this shop';
  end if;

  if p_kind = 'opening' then
    -- an amount the customer already owed before using the system
    insert into customer_ledger (shop_id, customer_id, amount, kind, note, created_by)
    values (p_shop_id, p_customer_id, p_amount, 'opening', coalesce(p_note, 'Opening balance'), auth.uid());
  else
    if p_method not in ('cash','debit','credit','bank','altaf_bank','kafeel_bank','tabby','tamara') then
      raise exception 'Unknown payment method';
    end if;
    insert into customer_ledger (shop_id, customer_id, amount, kind, method, note, created_by)
    values (p_shop_id, p_customer_id, -p_amount, 'payment', p_method, p_note, auth.uid());

    insert into cash_entries (shop_id, direction, amount, method, category, note, source, created_by)
    values (p_shop_id, 'in', p_amount, p_method, 'Customer payment', p_note, 'customer_payment', auth.uid());
  end if;
end $$;

-- ---- manual cash in / out (admin only) ----
create or replace function add_cash_entry(
  p_shop_id uuid,
  p_direction text,
  p_amount numeric,
  p_method text,
  p_category text,
  p_note text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if get_role() <> 'admin' or not has_shop_access(p_shop_id) then
    raise exception 'Only an admin can add cash flow entries';
  end if;
  if p_direction not in ('in','out') then
    raise exception 'Direction must be in or out';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be bigger than zero';
  end if;
  insert into cash_entries (shop_id, direction, amount, method, category, note, source, created_by)
  values (p_shop_id, p_direction, p_amount, p_method, p_category, p_note, 'manual', auth.uid());
end $$;

-- ---- sales return ----
create or replace function create_sale_return(
  p_shop_id uuid,
  p_sale_id uuid,
  p_items jsonb,            -- [{ "sale_item_id": "...", "quantity": 1, "restock": true }, ...]
  p_refund_method text,     -- a payment method, or 'credit_adjust' = reduce the customer's balance
  p_note text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  s sales;
  item jsonb;
  si sale_items;
  v_qty int;
  v_returned int;
  v_ratio numeric;
  v_total numeric := 0;
  v_return_id uuid;
  v_restock boolean;
begin
  if get_role() not in ('admin','cashier','inventory_manager') or not has_shop_access(p_shop_id) then
    raise exception 'Not authorized';
  end if;
  select * into s from sales where id = p_sale_id and shop_id = p_shop_id;
  if not found then
    raise exception 'Sale not found in this shop';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Choose at least one item to return';
  end if;
  if p_refund_method not in ('cash','debit','credit','bank','altaf_bank','kafeel_bank','tabby','tamara','credit_adjust') then
    raise exception 'Unknown refund method';
  end if;
  if p_refund_method = 'credit_adjust' and s.customer_id is null then
    raise exception 'This sale has no customer, so it cannot be applied to a credit balance';
  end if;

  -- refund at the price actually paid (scaled down if the sale had a discount)
  v_ratio := case when s.subtotal > 0 then s.total / s.subtotal else 1 end;

  insert into sale_returns (shop_id, sale_id, total_refund, refund_method, note, created_by)
  values (p_shop_id, p_sale_id, 0, p_refund_method, p_note, auth.uid())
  returning id into v_return_id;

  for item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((item->>'quantity')::int, 0);
    if v_qty < 0 then
      raise exception 'Return quantity cannot be negative';
    end if;
    continue when v_qty = 0;

    select * into si from sale_items
    where id = (item->>'sale_item_id')::uuid and sale_id = p_sale_id for update;
    if not found then
      raise exception 'An item does not belong to this sale';
    end if;

    select coalesce(sum(quantity), 0) into v_returned from sale_return_items where sale_item_id = si.id;
    if v_qty > si.quantity - v_returned then
      raise exception 'Cannot return % of an item: only % left to return', v_qty, si.quantity - v_returned;
    end if;

    v_restock := coalesce((item->>'restock')::boolean, true);

    insert into sale_return_items (return_id, sale_item_id, product_id, quantity, unit_price, restock)
    values (v_return_id, si.id, si.product_id, v_qty, round(si.unit_price * v_ratio, 2), v_restock);

    if v_restock then
      update products set quantity = quantity + v_qty, updated_at = now() where id = si.product_id;
    end if;

    v_total := v_total + round(si.unit_price * v_qty * v_ratio, 2);
  end loop;

  if v_total <= 0 then
    raise exception 'Nothing to return';
  end if;

  update sale_returns set total_refund = v_total where id = v_return_id;

  if p_refund_method = 'credit_adjust' then
    insert into customer_ledger (shop_id, customer_id, amount, kind, ref_id, note, created_by)
    values (p_shop_id, s.customer_id, -v_total, 'return_adjust', v_return_id,
            'Return on ' || s.invoice_no, auth.uid());
  else
    insert into cash_entries (shop_id, direction, amount, method, category, note, source, ref_id, created_by)
    values (p_shop_id, 'out', v_total, p_refund_method, 'Sales return',
            'Return on ' || s.invoice_no, 'return', v_return_id, auth.uid());
  end if;

  return v_return_id;
end $$;

-- ---- repairs: parts ----
create or replace function add_repair_part(
  p_job_id uuid,
  p_product_id uuid,
  p_quantity int,
  p_unit_price numeric default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  j repair_jobs;
  pr products;
  v_price numeric;
begin
  perform set_config('app.rpc', '1', true);

  select * into j from repair_jobs where id = p_job_id for update;
  if not found then
    raise exception 'Repair job not found';
  end if;
  if get_role() not in ('admin','cashier','inventory_manager') or not has_shop_access(j.shop_id) then
    raise exception 'Not authorized';
  end if;
  if j.is_paid or j.status in ('delivered','cancelled') then
    raise exception 'This job is closed, parts can no longer be changed';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be at least 1';
  end if;

  select * into pr from products where id = p_product_id and shop_id = j.shop_id for update;
  if not found then
    raise exception 'Product not found in this shop';
  end if;
  if pr.quantity < p_quantity then
    raise exception 'Not enough stock for "%" (only % left)', pr.name, pr.quantity;
  end if;

  v_price := coalesce(p_unit_price, pr.sale_price);
  if v_price < 0 then
    raise exception 'Price cannot be negative';
  end if;

  update products set quantity = quantity - p_quantity, updated_at = now() where id = pr.id;
  insert into repair_parts (job_id, product_id, quantity, unit_price)
  values (p_job_id, pr.id, p_quantity, v_price);

  update repair_jobs
  set parts_total = (select coalesce(sum(quantity * unit_price), 0) from repair_parts where job_id = p_job_id)
  where id = p_job_id;
end $$;

create or replace function remove_repair_part(p_part_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  part repair_parts;
  j repair_jobs;
begin
  perform set_config('app.rpc', '1', true);

  select * into part from repair_parts where id = p_part_id;
  if not found then
    raise exception 'Part not found';
  end if;
  select * into j from repair_jobs where id = part.job_id for update;
  if get_role() not in ('admin','cashier','inventory_manager') or not has_shop_access(j.shop_id) then
    raise exception 'Not authorized';
  end if;
  if j.is_paid or j.status in ('delivered','cancelled') then
    raise exception 'This job is closed, parts can no longer be changed';
  end if;

  update products set quantity = quantity + part.quantity, updated_at = now() where id = part.product_id;
  delete from repair_parts where id = p_part_id;

  update repair_jobs
  set parts_total = (select coalesce(sum(quantity * unit_price), 0) from repair_parts where job_id = j.id)
  where id = j.id;
end $$;

-- ---- repairs: take payment ----
create or replace function collect_repair_payment(
  p_job_id uuid,
  p_method text,
  p_customer_id uuid default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  j repair_jobs;
  v_total numeric;
  v_customer uuid;
begin
  perform set_config('app.rpc', '1', true);

  select * into j from repair_jobs where id = p_job_id for update;
  if not found then
    raise exception 'Repair job not found';
  end if;
  if get_role() not in ('admin','cashier','inventory_manager') or not has_shop_access(j.shop_id) then
    raise exception 'Not authorized';
  end if;
  if j.is_paid then
    raise exception 'This job is already paid';
  end if;
  if j.status = 'cancelled' then
    raise exception 'This job was cancelled';
  end if;
  if p_method not in ('cash','debit','credit','bank','altaf_bank','kafeel_bank','tabby','tamara','on_credit') then
    raise exception 'Unknown payment method';
  end if;

  v_total := j.labor_charge + j.parts_total;
  if v_total <= 0 then
    raise exception 'Add a labor charge or parts before taking payment';
  end if;

  if p_method = 'on_credit' then
    v_customer := coalesce(p_customer_id, j.customer_id);
    if v_customer is null then
      raise exception 'Choose or add a customer to put this repair on credit';
    end if;
    if not exists (select 1 from customers where id = v_customer and shop_id = j.shop_id) then
      raise exception 'Customer not found in this shop';
    end if;
    insert into customer_ledger (shop_id, customer_id, amount, kind, ref_id, note, created_by)
    values (j.shop_id, v_customer, v_total, 'repair_credit', j.id, 'Repair ' || j.ticket_no, auth.uid());
    update repair_jobs set customer_id = v_customer where id = j.id;
  else
    insert into cash_entries (shop_id, direction, amount, method, category, note, source, ref_id, created_by)
    values (j.shop_id, 'in', v_total, p_method, 'Repair', 'Repair ' || j.ticket_no, 'repair', j.id, auth.uid());
  end if;

  update repair_jobs
  set is_paid = true, payment_method = p_method, paid_at = now()
  where id = j.id;
end $$;

-- Only signed-in users may call these
revoke all on function create_sale(uuid, uuid, text, text, numeric, text, int, jsonb) from public, anon;
revoke all on function receive_purchase_order(uuid) from public, anon;
revoke all on function record_supplier_entry(uuid, uuid, text, numeric, text, text, boolean) from public, anon;
revoke all on function record_customer_entry(uuid, uuid, text, numeric, text, text) from public, anon;
revoke all on function add_cash_entry(uuid, text, numeric, text, text, text) from public, anon;
revoke all on function create_sale_return(uuid, uuid, jsonb, text, text) from public, anon;
revoke all on function add_repair_part(uuid, uuid, int, numeric) from public, anon;
revoke all on function remove_repair_part(uuid) from public, anon;
revoke all on function collect_repair_payment(uuid, text, uuid) from public, anon;

grant execute on function create_sale(uuid, uuid, text, text, numeric, text, int, jsonb) to authenticated;
grant execute on function receive_purchase_order(uuid) to authenticated;
grant execute on function record_supplier_entry(uuid, uuid, text, numeric, text, text, boolean) to authenticated;
grant execute on function record_customer_entry(uuid, uuid, text, numeric, text, text) to authenticated;
grant execute on function add_cash_entry(uuid, text, numeric, text, text, text) to authenticated;
grant execute on function create_sale_return(uuid, uuid, jsonb, text, text) to authenticated;
grant execute on function add_repair_part(uuid, uuid, int, numeric) to authenticated;
grant execute on function remove_repair_part(uuid) to authenticated;
grant execute on function collect_repair_payment(uuid, text, uuid) to authenticated;

-- ------------------------------------------------------------
-- 10. ROW LEVEL SECURITY
--     Rule of thumb: you can only see / change rows of YOUR shop.
--     (An admin with no shop assigned is the owner and sees both shops.)
-- ------------------------------------------------------------
alter table shops             enable row level security;
alter table customers         enable row level security;
alter table customer_ledger   enable row level security;
alter table supplier_ledger   enable row level security;
alter table cash_entries      enable row level security;
alter table sale_returns      enable row level security;
alter table sale_return_items enable row level security;
alter table repair_jobs       enable row level security;
alter table repair_parts      enable row level security;

-- shops
drop policy if exists "shops_select" on shops;
create policy "shops_select" on shops for select using (has_shop_access(id));
drop policy if exists "shops_update" on shops;
create policy "shops_update" on shops for update
  using (get_role() = 'admin' and has_shop_access(id))
  with check (get_role() = 'admin' and has_shop_access(id));

-- suppliers (everyone in the shop can read names; stock managers edit)
drop policy if exists "suppliers_select" on suppliers;
create policy "suppliers_select" on suppliers for select using (has_shop_access(shop_id));
drop policy if exists "suppliers_write" on suppliers;
create policy "suppliers_write" on suppliers for all
  using (get_role() in ('admin','inventory_manager') and has_shop_access(shop_id))
  with check (get_role() in ('admin','inventory_manager') and has_shop_access(shop_id));

-- products
drop policy if exists "products_select" on products;
create policy "products_select" on products for select using (has_shop_access(shop_id));
drop policy if exists "products_write" on products;
create policy "products_write" on products for all
  using (get_role() in ('admin','inventory_manager') and has_shop_access(shop_id))
  with check (get_role() in ('admin','inventory_manager') and has_shop_access(shop_id));

-- purchase orders + items
drop policy if exists "po_select" on purchase_orders;
drop policy if exists "po_write" on purchase_orders;
create policy "po_select" on purchase_orders for select
  using (get_role() in ('admin','inventory_manager') and has_shop_access(shop_id));
create policy "po_write" on purchase_orders for all
  using (get_role() in ('admin','inventory_manager') and has_shop_access(shop_id))
  with check (get_role() in ('admin','inventory_manager') and has_shop_access(shop_id));

drop policy if exists "po_items_select" on purchase_order_items;
drop policy if exists "po_items_write" on purchase_order_items;
create policy "po_items_select" on purchase_order_items for select
  using (get_role() in ('admin','inventory_manager') and exists (
    select 1 from purchase_orders po where po.id = purchase_order_id and has_shop_access(po.shop_id)));
create policy "po_items_write" on purchase_order_items for all
  using (get_role() in ('admin','inventory_manager') and exists (
    select 1 from purchase_orders po where po.id = purchase_order_id and has_shop_access(po.shop_id)))
  with check (get_role() in ('admin','inventory_manager') and exists (
    select 1 from purchase_orders po where po.id = purchase_order_id and has_shop_access(po.shop_id)));

-- sales are READ-ONLY from the website: they are only created by create_sale()
-- and corrected with a sales return (no direct insert / edit / delete).
drop policy if exists "sales_select" on sales;
drop policy if exists "sales_insert" on sales;
drop policy if exists "sales_admin_write" on sales;
drop policy if exists "sales_admin_delete" on sales;
create policy "sales_select" on sales for select using (has_shop_access(shop_id));

drop policy if exists "sale_items_select" on sale_items;
drop policy if exists "sale_items_insert" on sale_items;
create policy "sale_items_select" on sale_items for select
  using (exists (select 1 from sales s where s.id = sale_id and has_shop_access(s.shop_id)));

-- customers
drop policy if exists "customers_select" on customers;
create policy "customers_select" on customers for select using (has_shop_access(shop_id));
drop policy if exists "customers_insert" on customers;
create policy "customers_insert" on customers for insert
  with check (get_role() in ('admin','cashier','inventory_manager') and has_shop_access(shop_id));
drop policy if exists "customers_update" on customers;
create policy "customers_update" on customers for update
  using (get_role() in ('admin','cashier','inventory_manager') and has_shop_access(shop_id))
  with check (get_role() in ('admin','cashier','inventory_manager') and has_shop_access(shop_id));
drop policy if exists "customers_delete" on customers;
create policy "customers_delete" on customers for delete
  using (get_role() = 'admin' and has_shop_access(shop_id));

-- ledgers (read only; written by functions)
drop policy if exists "customer_ledger_select" on customer_ledger;
create policy "customer_ledger_select" on customer_ledger for select using (has_shop_access(shop_id));

drop policy if exists "supplier_ledger_select" on supplier_ledger;
create policy "supplier_ledger_select" on supplier_ledger for select
  using (get_role() in ('admin','inventory_manager') and has_shop_access(shop_id));

-- cash flow: admin only
drop policy if exists "cash_entries_select" on cash_entries;
create policy "cash_entries_select" on cash_entries for select
  using (get_role() = 'admin' and has_shop_access(shop_id));
drop policy if exists "cash_entries_delete" on cash_entries;
create policy "cash_entries_delete" on cash_entries for delete
  using (get_role() = 'admin' and has_shop_access(shop_id) and source = 'manual');

-- returns (read only; written by function)
drop policy if exists "sale_returns_select" on sale_returns;
create policy "sale_returns_select" on sale_returns for select using (has_shop_access(shop_id));
drop policy if exists "sale_return_items_select" on sale_return_items;
create policy "sale_return_items_select" on sale_return_items for select
  using (exists (select 1 from sale_returns r where r.id = return_id and has_shop_access(r.shop_id)));

-- repair jobs
drop policy if exists "repair_jobs_select" on repair_jobs;
create policy "repair_jobs_select" on repair_jobs for select using (has_shop_access(shop_id));
drop policy if exists "repair_jobs_insert" on repair_jobs;
create policy "repair_jobs_insert" on repair_jobs for insert
  with check (get_role() in ('admin','cashier','inventory_manager') and has_shop_access(shop_id));
drop policy if exists "repair_jobs_update" on repair_jobs;
create policy "repair_jobs_update" on repair_jobs for update
  using (get_role() in ('admin','cashier','inventory_manager') and has_shop_access(shop_id))
  with check (get_role() in ('admin','cashier','inventory_manager') and has_shop_access(shop_id));
drop policy if exists "repair_jobs_delete" on repair_jobs;  -- jobs are cancelled, not deleted

drop policy if exists "repair_parts_select" on repair_parts;
create policy "repair_parts_select" on repair_parts for select
  using (exists (select 1 from repair_jobs j where j.id = job_id and has_shop_access(j.shop_id)));

-- make the new tables / functions visible to the API right away
notify pgrst, 'reload schema';
