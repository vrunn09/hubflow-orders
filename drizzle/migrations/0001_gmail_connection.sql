CREATE TABLE public.connected_email_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL UNIQUE REFERENCES public.restaurants(id) ON DELETE CASCADE,
  connected_by uuid NOT NULL,
  provider text NOT NULL DEFAULT 'gmail',
  email_address text,
  connection_key_ciphertext text NOT NULL,
  connection_status text NOT NULL DEFAULT 'connected' CHECK (connection_status IN ('connected','reconnect_required','error')),
  source_id uuid REFERENCES public.order_sources(id) ON DELETE SET NULL,
  last_checked_at timestamptz,
  emails_processed integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.connected_email_accounts TO service_role;
ALTER TABLE public.connected_email_accounts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.imported_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  gmail_message_id text NOT NULL,
  thread_id text,
  sender text,
  sender_domain text,
  subject text,
  received_at timestamptz,
  platform text NOT NULL DEFAULT 'UNKNOWN',
  classification text NOT NULL DEFAULT 'not_order' CHECK (classification IN ('order','needs_review','not_order')),
  confidence numeric NOT NULL DEFAULT 0,
  processing_status text NOT NULL DEFAULT 'pending' CHECK (processing_status IN ('pending','imported','duplicate','needs_review','skipped','ignored','failed')),
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  snippet text,
  processed_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, gmail_message_id)
);
CREATE INDEX imported_emails_rest_idx ON public.imported_emails (restaurant_id, created_at DESC);
GRANT SELECT ON public.imported_emails TO authenticated;
GRANT ALL ON public.imported_emails TO service_role;
ALTER TABLE public.imported_emails ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mgr read imported emails" ON public.imported_emails FOR SELECT TO authenticated
  USING (public.has_any_role(restaurant_id, ARRAY['owner','manager']::public.app_role[]));

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS source_platform text;