ALTER TABLE public.imported_emails DROP CONSTRAINT imported_emails_classification_check;
ALTER TABLE public.imported_emails ADD CONSTRAINT imported_emails_classification_check CHECK (classification = ANY (ARRAY['order','needs_review','not_order','status_update']));
ALTER TABLE public.imported_emails DROP CONSTRAINT imported_emails_processing_status_check;
ALTER TABLE public.imported_emails ADD CONSTRAINT imported_emails_processing_status_check CHECK (processing_status = ANY (ARRAY['pending','imported','duplicate','needs_review','skipped','ignored','failed','status_update']));