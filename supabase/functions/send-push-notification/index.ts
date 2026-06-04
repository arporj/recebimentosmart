import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'npm:web-push';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY');
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY');
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:contato@recebimentosmart.com.br';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

serve(async (req) => {
  // Trata requisição preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      throw new Error('Chaves VAPID nao configuradas nas variaveis de ambiente.');
    }
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Chaves do Supabase nao configuradas nas variaveis de ambiente.');
    }

    const { user_id, title, body, data } = await req.json();

    if (!user_id || !title || !body) {
      throw new Error('user_id, title e body sao obrigatorios.');
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Buscar as subscricoes ativas do usuario na tabela user_push_subscriptions
    const { data: subscriptions, error: subError } = await supabaseAdmin
      .from('user_push_subscriptions')
      .select('*')
      .eq('user_id', user_id);

    if (subError) throw subError;

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'Nenhuma subscricao ativa para este usuario.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      });
    }

    // Configurar chaves VAPID no web-push
    webpush.setVapidDetails(
      VAPID_SUBJECT,
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY
    );

    const payload = JSON.stringify({
      notification: {
        title,
        body,
        data: data || {}
      }
    });

    const sendPromises = subscriptions.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      try {
        await webpush.sendNotification(pushSubscription, payload);
        return { id: sub.id, success: true };
      } catch (err) {
        console.error(`Erro ao enviar notificacao para subscricao ${sub.id}:`, err);
        // Se retornar 410 (Gone) ou 404 (Not Found), a subscricao expirou ou e invalida e deve ser removida
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`Removendo subscricao invalida/expirada: ${sub.id}`);
          await supabaseAdmin
            .from('user_push_subscriptions')
            .delete()
            .eq('id', sub.id);
        }
        return { id: sub.id, success: false, error: err.message };
      }
    });

    const results = await Promise.all(sendPromises);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (err) {
    console.error('Erro na funcao send-push-notification:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
