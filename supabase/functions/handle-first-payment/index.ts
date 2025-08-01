import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: 'Secrets do Supabase não configuradas.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const payload = await req.json();
    const newPayment = payload.record; // Dados do novo pagamento

    if (!newPayment || !newPayment.client_id || !newPayment.amount) {
      return new Response(JSON.stringify({ error: 'Payload inválido.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Verificar se é o primeiro pagamento do cliente
    const { count, error: countError } = await supabaseAdmin
      .from('payments')
      .select('id', { count: 'exact' })
      .eq('client_id', newPayment.client_id);

    if (countError) throw countError;

    // Se count for 1, significa que este é o primeiro pagamento (o que acabou de ser inserido)
    if (count === 1) {
      // 2. Buscar informações do cliente
      const { data: clientData, error: clientError } = await supabaseAdmin
        .from('clients')
        .select('name, phone')
        .eq('id', newPayment.client_id)
        .single();

      if (clientError) throw clientError;

      const clientName = clientData?.name || 'Cliente Desconhecido';
      const clientPhone = clientData?.phone || 'N/A';

      // 3. Enviar e-mail de notificação
      const subject = `Primeiro Pagamento Recebido: ${clientName}`;
      const htmlContent = `
        <p>O cliente <b>${clientName}</b> realizou o primeiro pagamento no Recebimento $mart!</p>
        <ul>
          <li><b>Valor:</b> R$ ${newPayment.amount.toFixed(2).replace('.', ',')}</li>
          <li><b>Data do Pagamento:</b> ${new Date(newPayment.payment_date).toLocaleString('pt-BR')}</li>
          <li><b>Cliente ID:</b> ${newPayment.client_id}</li>
          <li><b>Telefone do Cliente:</b> ${clientPhone}</li>
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

      console.log(`Notificação de primeiro pagamento enviada para ${clientName}.`);
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
