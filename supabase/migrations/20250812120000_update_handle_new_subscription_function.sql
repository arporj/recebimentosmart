CREATE OR REPLACE FUNCTION public.handle_new_subscription()
 RETURNS TRIGGER
 LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM net.http_post(
    url:='https://kwdweztilsoxxcgudtsz.supabase.co/functions/v1/handle-first-payment',
    body:=jsonb_build_object('record', NEW),
    headers:=jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3ZHdlenRpbHNveHhjZ3VkdHN6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDEzMjY3NywiZXhwIjoyMDU5NzA4Njc3fQ.1iKIZqSUyo5VCqFvdJl-ZLdCsXZVmmwnKKA-9zHpGrA'
    )
  );
  RETURN NEW;
END;
$function$;