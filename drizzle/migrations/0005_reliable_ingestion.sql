ALTER TABLE public.ingestion_jobs DROP CONSTRAINT IF EXISTS ingestion_jobs_status_check;
ALTER TABLE public.ingestion_jobs ADD CONSTRAINT ingestion_jobs_status_check CHECK (status = ANY (ARRAY['pending','processing','done','failed','duplicate','needs_review','dead_letter','ignored','dismissed','superseded']));

ALTER TABLE public.ingestion_jobs
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS last_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS max_attempts integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS order_id uuid;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS group_key text,
  ADD COLUMN IF NOT EXISTS occurrences integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

UPDATE public.ingestion_jobs SET dedupe_key = 'msg:' || (payload->>'messageId')
WHERE dedupe_key IS NULL AND payload ? 'messageId';

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY restaurant_id, dedupe_key ORDER BY (status='done') DESC, created_at) rn
  FROM public.ingestion_jobs WHERE dedupe_key IS NOT NULL
)
UPDATE public.ingestion_jobs j SET status='superseded', error_code=coalesce(j.error_code,'SUPERSEDED'), updated_at=now()
FROM ranked r WHERE r.id=j.id AND r.rn > 1;

UPDATE public.ingestion_jobs SET status='ignored', error_code='STATUS_UPDATE_EMAIL',
  last_error='Delivery/cancellation update email — refers to an existing order, not a new one', updated_at=now()
WHERE status='failed' AND payload->>'subject' ~* '(delivered|delivery time passed|cancel|undeliver|refund)'
  AND payload->>'subject' !~* 'new (irctc )?order';

UPDATE public.ingestion_jobs SET status='needs_review', error_code='VALIDATION_NO_ITEMS',
  last_error='No food items could be read from this payload', updated_at=now()
WHERE status='failed' AND last_error LIKE '%"items"%';

CREATE UNIQUE INDEX IF NOT EXISTS ingestion_jobs_dedupe_uq ON public.ingestion_jobs(restaurant_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status <> 'superseded';
CREATE INDEX IF NOT EXISTS ingestion_jobs_due_idx ON public.ingestion_jobs(status, next_attempt_at);

UPDATE public.notifications SET group_key='legacy:ingest_failed', read=true, resolved_at=now()
WHERE category='integration' AND title='Order ingestion failed' AND group_key IS NULL;
CREATE INDEX IF NOT EXISTS notifications_group_idx ON public.notifications(restaurant_id, group_key) WHERE resolved_at IS NULL;

CREATE OR REPLACE FUNCTION public.create_ingested_order(_rid uuid, _source_id uuid, _source_key text, _o jsonb, _items jsonb, _raw jsonb, _actor uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE oid uuid; onum text; sub numeric; tot numeric;
BEGIN
  SELECT coalesce(sum((i->>'quantity')::int * (i->>'unit_price')::numeric),0) INTO sub FROM jsonb_array_elements(_items) i;
  tot := greatest(0, sub + coalesce((_o->>'tax')::numeric,0) + coalesce((_o->>'delivery_fee')::numeric,0) - coalesce((_o->>'discount')::numeric,0));
  INSERT INTO orders(restaurant_id, source_id, source_key, external_order_id, customer_name, customer_phone, train_number, train_name, journey_date,
    delivery_station, coach, seat, instructions, subtotal, tax, discount, delivery_fee, total, payment_method, payment_status, priority, deliver_by, raw_payload, source_platform)
  VALUES (_rid, _source_id, _source_key, _o->>'external_order_id', _o->>'customer_name', _o->>'customer_phone', _o->>'train_number', _o->>'train_name',
    nullif(_o->>'journey_date','')::date, _o->>'delivery_station', _o->>'coach', _o->>'seat', _o->>'instructions', sub,
    coalesce((_o->>'tax')::numeric,0), coalesce((_o->>'discount')::numeric,0), coalesce((_o->>'delivery_fee')::numeric,0), tot,
    coalesce(_o->>'payment_method','COD'), 'PENDING', coalesce(_o->>'priority','normal'), nullif(_o->>'deliver_by','')::timestamptz, _raw, _o->>'source_platform')
  RETURNING id, order_number INTO oid, onum;
  INSERT INTO order_items(order_id, restaurant_id, name, quantity, unit_price, notes)
    SELECT oid, _rid, i->>'name', (i->>'quantity')::int, (i->>'unit_price')::numeric, i->>'notes' FROM jsonb_array_elements(_items) i;
  INSERT INTO order_status_history(order_id, restaurant_id, to_status, actor_id, note) VALUES (oid, _rid, 'NEW', _actor, 'Received via ' || _source_key);
  INSERT INTO payments(order_id, restaurant_id, method, mode, amount, status)
    VALUES (oid, _rid, coalesce(_o->>'payment_method','COD'), CASE WHEN coalesce(_o->>'payment_method','COD')='COD' THEN 'offline' ELSE 'online' END, tot, 'PENDING');
  UPDATE order_sources SET orders_received = orders_received + 1 WHERE id = _source_id;
  INSERT INTO notifications(restaurant_id, category, title, body, link)
    VALUES (_rid, 'order', 'New order ' || onum, (_o->>'customer_name') || ' · ' || jsonb_array_length(_items) || ' item(s) · ₹' || tot, '/orders/' || oid);
  RETURN jsonb_build_object('id', oid, 'order_number', onum, 'total', tot);
END $$;
REVOKE ALL ON FUNCTION public.create_ingested_order(uuid, uuid, text, jsonb, jsonb, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_ingested_order(uuid, uuid, text, jsonb, jsonb, jsonb, uuid) TO service_role;