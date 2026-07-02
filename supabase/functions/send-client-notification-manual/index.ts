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
        Em caso de dúvidas, entre em contato diretamente com quem enviou este lembrete.
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

    const { clientId, userId } = await req.json();
    if (!clientId || !userId) {
      return new Response(
        JSON.stringify({ error: 'clientId e userId são obrigatórios' }),
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

    // 2. Buscar dados do cliente
    const { data: client, error: clientError } = await supabase
      .from('clients')
      .select('name, email, phone')
      .eq('id', clientId)
      .eq('user_id', userId)
      .single();

    if (clientError || !client) {
      return new Response(
        JSON.stringify({ error: 'Cliente não encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!client.email) {
      return new Response(
        JSON.stringify({ error: 'Cliente não tem e-mail cadastrado' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Buscar lançamentos pendentes do cliente
    const today = new Date().toISOString().split('T')[0];
    const { data: transactions, error: txError } = await supabase
      .from('financial_transactions')
      .select('id, description, amount, date, status')
      .eq('user_id', userId)
      .eq('client_id', clientId)
      .eq('status', 'pending')
      .eq('type', 'income')
      .eq('is_template', false)
      .neq('status', 'cancelled')
      .order('date', { ascending: true });

    if (txError) throw txError;

    if (!transactions || transactions.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'Nenhum lançamento pendente para este cliente.' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 4. Montar e enviar e-mail
    const htmlContent = buildEmailHtml(client.name, transactions, userName);

    const emailPayload = {
      sender: { name: 'Recebimento $mart', email: 'no-reply@recebimentosmart.com.br' },
      to: [{ email: client.email, name: client.name }],
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
        message: `E-mail enviado para ${client.email}`,
        transactionsCount: transactions.length,
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
