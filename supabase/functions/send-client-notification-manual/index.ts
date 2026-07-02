import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY') as string;
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') as string;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function buildEmailHtml(clientName: string, transactions: any[], userName: string): string {
  const total = transactions.reduce((sum: number, t: any) => sum + Number(t.amount), 0);
  const today = new Date();
  const todayStr = today.toLocaleDateString('pt-BR');

  const rows = transactions.map((t: any) => `
    <tr>
      <td style="padding: 10px 16px; border-bottom: 1px solid #f1f5f9; font-size: 14px; color: #334155;">
        ${t.description || 'Sem descrição'}
      </td>
      <td style="padding: 10px 16px; border-bottom: 1px solid #f1f5f9; font-size: 14px; color: #334155; text-align: center;">
        ${formatDate(t.date)}
      </td>
      <td style="padding: 10px 16px; border-bottom: 1px solid #f1f5f9; font-size: 14px; font-weight: 700; color: #0f172a; text-align: right;">
        ${formatCurrency(Number(t.amount))}
      </td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Lembrete de Cobrança</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 40px auto; background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #0f766e 0%, #0d9488 100%); padding: 32px 40px;">
      <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">
        💰 Lembrete de Cobrança
      </h1>
      <p style="margin: 8px 0 0; color: #ccfbf1; font-size: 14px;">
        Enviado por ${userName} • ${todayStr}
      </p>
    </div>

    <!-- Body -->
    <div style="padding: 32px 40px;">
      <p style="margin: 0 0 8px; font-size: 15px; color: #475569;">Olá, <strong style="color: #0f172a;">${clientName}</strong>!</p>
      <p style="margin: 0 0 28px; font-size: 14px; color: #64748b; line-height: 1.6;">
        Segue abaixo o resumo dos lançamentos pendentes vinculados à sua conta.
      </p>

      <!-- Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead>
          <tr style="background: #f8fafc;">
            <th style="padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 2px solid #e2e8f0;">
              Descrição
            </th>
            <th style="padding: 12px 16px; text-align: center; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 2px solid #e2e8f0;">
              Vencimento
            </th>
            <th style="padding: 12px 16px; text-align: right; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 2px solid #e2e8f0;">
              Valor
            </th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>

      <!-- Total -->
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 28px;">
        <span style="font-size: 14px; font-weight: 700; color: #166534;">Total pendente</span>
        <span style="font-size: 22px; font-weight: 900; color: #15803d;">${formatCurrency(total)}</span>
      </div>

      <p style="font-size: 13px; color: #94a3b8; margin: 0;">
        Em caso de dúvidas, entre em contato diretamente com <strong style="color: #475569;">${userName}</strong>.
      </p>
    </div>

    <!-- Footer -->
    <div style="background: #f8fafc; padding: 20px 40px; border-top: 1px solid #e2e8f0;">
      <p style="margin: 0; font-size: 12px; color: #94a3b8; text-align: center;">
        Este e-mail foi gerado automaticamente pelo <strong>Recebimento $mart</strong>.<br/>
        <a href="https://recebimentosmart.com.br" style="color: #0d9488; text-decoration: none;">recebimentosmart.com.br</a>
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (!BREVO_API_KEY) throw new Error('BREVO_API_KEY não configurada');
    if (!SUPABASE_URL) throw new Error('SUPABASE_URL não configurada');
    if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada');

    const body = await req.json();
    const clientId = body.clientId || body.client_id;
    const userId = body.userId || body.user_id;
    const targetEmail = body.targetEmail || body.target_email;
    const isTest = Boolean(body.isTest || body.is_test);

    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'userId é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Buscar perfil do usuário remetente
    const { data: profile } = await supabase
      .from('profiles')
      .select('name, email')
      .eq('id', userId)
      .single();

    const userName = profile?.name || 'Recebimento Smart';

    let client: { name: string; email: string; phone?: string | null } | null = null;
    let transactions: any[] = [];

    if (clientId) {
      // 2a. Buscar dados do cliente específico
      const { data: fetchedClient } = await supabase
        .from('clients')
        .select('name, email, phone')
        .eq('id', clientId)
        .eq('user_id', userId)
        .single();

      if (fetchedClient) {
        client = fetchedClient;
      }
    }

    // Se não tiver clientId informado ou se não encontrou o cliente específico e não é teste
    if (!client && !isTest && clientId) {
      return new Response(
        JSON.stringify({ error: 'Cliente não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (client && !client.email && !targetEmail && !isTest) {
      return new Response(
        JSON.stringify({ error: 'Cliente não tem e-mail cadastrado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Buscar lançamentos pendentes do cliente ou do primeiro cliente do usuário
    if (client && clientId) {
      const { data: txData } = await supabase
        .from('financial_transactions')
        .select('id, description, amount, date, status')
        .eq('user_id', userId)
        .eq('client_id', clientId)
        .eq('status', 'pending')
        .eq('type', 'income')
        .eq('is_template', false)
        .neq('status', 'cancelled')
        .order('date', { ascending: true });

      if (txData) transactions = txData;
    } else if (isTest) {
      // Se estiver em modo de teste e não tiver clientId especificado, buscar o primeiro cliente com pendências
      const { data: firstClientWithTx } = await supabase
        .from('financial_transactions')
        .select('client_id, clients!inner(name, email)')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .eq('type', 'income')
        .eq('is_template', false)
        .neq('status', 'cancelled')
        .not('client_id', 'is', null)
        .limit(1);

      if (firstClientWithTx && firstClientWithTx.length > 0) {
        const foundClientId = firstClientWithTx[0].client_id;
        const fetchedClient = (firstClientWithTx[0] as any).clients;
        if (fetchedClient) client = fetchedClient;
        const { data: txData } = await supabase
          .from('financial_transactions')
          .select('id, description, amount, date, status')
          .eq('user_id', userId)
          .eq('client_id', foundClientId)
          .eq('status', 'pending')
          .eq('type', 'income')
          .eq('is_template', false)
          .neq('status', 'cancelled')
          .order('date', { ascending: true });
        if (txData) transactions = txData;
      }
    }

    // Fallback para Modo de Teste / Simulação: se não houver lançamentos ou cliente para o teste
    if (isTest && (!client || transactions.length === 0)) {
      if (!client) {
        client = {
          name: 'Cliente de Demonstração (Simulação)',
          email: targetEmail || profile?.email || 'teste@recebimentosmart.com.br'
        };
      }
      const todayStr = new Date().toISOString().split('T')[0];
      transactions = [
        {
          id: 'mock-1',
          description: 'Prestação de Serviços - Simulação de Teste',
          amount: 150.00,
          date: todayStr,
          status: 'pending'
        },
        {
          id: 'mock-2',
          description: 'Mensalidade de Consultoria (Exemplo)',
          amount: 250.00,
          date: todayStr,
          status: 'pending'
        }
      ];
    }

    if (!transactions || transactions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'Nenhum lançamento pendente para este cliente.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Destinatário final
    const recipientEmail = targetEmail || client?.email;
    const recipientName = client?.name || 'Cliente';

    if (!recipientEmail) {
      return new Response(
        JSON.stringify({ error: 'Nenhum e-mail de destino foi definido para o envio.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Montar e enviar e-mail
    const htmlContent = buildEmailHtml(recipientName, transactions, userName);

    const emailPayload = {
      sender: { name: 'Recebimento $mart', email: 'no-reply@recebimentosmart.com.br' },
      to: [{ email: recipientEmail, name: recipientName }],
      subject: `💰 Lembrete: ${transactions.length} lançamento${transactions.length > 1 ? 's' : ''} pendente${transactions.length > 1 ? 's' : ''} para você`,
      htmlContent,
    };

    const brevoResponse = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });

    if (!brevoResponse.ok) {
      const err = await brevoResponse.json();
      throw new Error(`Falha Brevo: ${err.message || brevoResponse.statusText}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        sentTo: recipientEmail,
        message: `E-mail enviado para ${recipientEmail}`,
        transactionsCount: transactions.length,
        isTest,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Erro em send-client-notification-manual:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Erro interno' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
