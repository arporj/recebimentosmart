import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

// Configuração do cliente Supabase Admin
const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { record: newSubscription } = await req.json();

    if (!newSubscription || !newSubscription.user_id) {
      return new Response(JSON.stringify({ error: 'Payload inválido: user_id ausente.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Verificar se é a primeira assinatura do usuário
    const { count, error: countError } = await supabaseAdmin
      .from('subscriptions')
      .select('id', { count: 'exact' })
      .eq('user_id', newSubscription.user_id);

    if (countError) throw countError;

    // Se count for 1, significa que esta é a primeira assinatura (a que acabou de ser inserida)
    if (count === 1) {
      // 2. Buscar informações do perfil do usuário
      const { data: profileData, error: profileError } = await supabaseAdmin
        .from('profiles')
        .select('name, email')
        .eq('id', newSubscription.user_id)
        .single();

      if (profileError) throw profileError;

      const userName = profileData?.name || 'Usuário Desconhecido';
      const userEmail = profileData?.email || 'E-mail não informado';

      // 3. Enviar e-mail de notificação
      const subject = `Nova Assinatura: ${userName}`;
      const htmlContent = `
        <p>O usuário <b>${userName}</b> realizou o seu primeiro pagamento e iniciou uma assinatura no Recebimento $mart!</p>
        <ul>
          <li><b>Usuário ID:</b> ${newSubscription.user_id}</li>
          <li><b>E-mail:</b> ${userEmail}</li>
          <li><b>Plano:</b> ${newSubscription.plan_id || 'N/A'}</li>
          <li><b>Status:</b> ${newSubscription.status}</li>
          <li><b>Data de Início:</b> ${new Date(newSubscription.start_date).toLocaleString('pt-BR')}</li>
        </ul>
        <p>Atenciosamente,<br>Equipe Recebimento $mart</p>
      `;

      // Chamar a Edge Function genérica para enviar o e-mail
      const { error: invokeError } = await supabaseAdmin.functions.invoke('send-notification-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          htmlContent,
          recipientEmail: 'financeiro@recebimentosmart.com.br',
        }),
      });

      if (invokeError) throw invokeError;

      console.log(`Notificação de primeira assinatura enviada para o usuário: ${userName}.`);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Erro na função handle-first-payment:', error);
    return new Response(JSON.stringify({ error: error.message || 'Erro interno do servidor.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});