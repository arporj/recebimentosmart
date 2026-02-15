import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

function createEmailHtml(feedback, messages, user) {
  const primaryColor = '#20B2AA';
  const backgroundColor = '#f4f4f4';
  const containerColor = '#ffffff';
  const textColor = '#333333';

  const messagesHtml = messages.map(msg => {
    const isSystem = !msg.sender_id;
    const senderName = isSystem ? 'Sistema' : (msg.sender_id === user.id ? user.user_metadata?.name || user.email : 'Suporte/Admin');
    const bg = isSystem ? '#e0e0e0' : (msg.sender_id === user.id ? '#f0f9ff' : '#fff0f0');
    const border = isSystem ? '#ccc' : (msg.sender_id === user.id ? '#bae6fd' : '#fecaca');

    return `
      <div style="background-color: ${bg}; border: 1px solid ${border}; padding: 10px; margin-bottom: 10px; border-radius: 5px;">
        <p style="margin: 0 0 5px 0; font-weight: bold; font-size: 12px; color: #555;">
          ${senderName} - ${new Date(msg.created_at).toLocaleString('pt-BR')}
        </p>
        <p style="margin: 0; white-space: pre-wrap;">${msg.message}</p>
      </div>
    `;
  }).join('');

  return `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body { margin: 0; padding: 0; background-color: ${backgroundColor}; font-family: Arial, sans-serif; }
        .container { max-width: 600px; margin: 20px auto; background-color: ${containerColor}; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
        .header { background-color: ${primaryColor}; color: white; padding: 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 20px; }
        .content { padding: 20px; color: ${textColor}; }
        .info { background: #f9f9f9; padding: 10px; border-radius: 4px; margin-bottom: 20px; font-size: 14px; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #777777; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Nova Interação no Feedback</h1>
        </div>
        <div class="content">
          <div class="info">
            <p><strong>Usuário:</strong> ${user.user_metadata?.name || 'N/A'} (${user.email})</p>
            <p><strong>Tipo:</strong> ${feedback.type}</p>
            <p><strong>Assunto:</strong> ${feedback.subject}</p>
            <p><strong>ID:</strong> ${feedback.id}</p>
          </div>
          
          <h3>Histórico da Conversa</h3>
          ${messagesHtml}
        </div>
        <div class="footer">
          <p>Recebimento $mart &copy; ${new Date().getFullYear()}</p>
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
    if (!BREVO_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Chaves de API não configuradas.');
    }

    const { feedback_id } = await req.json();

    if (!feedback_id) {
      throw new Error('feedback_id é obrigatório.');
    }

    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Buscar detalhes do feedback e usuário
    const { data: feedback, error: feedbackError } = await supabaseAdmin
      .from('feedbacks')
      .select('*')
      .eq('id', feedback_id)
      .single();

    if (feedbackError) throw feedbackError;

    // 2. Buscar dados do usuário (Auth)
    const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(feedback.user_id);
    if (userError) throw userError;

    // 3. Buscar mensagens
    const { data: messages, error: messagesError } = await supabaseAdmin
      .from('feedback_messages')
      .select('*')
      .eq('feedback_id', feedback_id)
      .order('created_at', { ascending: false }); // Newest first

    if (messagesError) throw messagesError;

    // 4. Montar e enviar e-mail
    const emailSubject = `[${feedback.type}] ${feedback.subject}`;
    const emailHtml = createEmailHtml(feedback, messages, user);

    const emailPayload = {
      sender: {
        name: 'Sistema Recebimento $mart',
        email: 'no-reply@recebimentosmart.com.br'
      },
      to: [
        {
          email: 'contato@recebimentosmart.com.br',
          name: 'Suporte Recebimento $mart'
        }
      ],
      replyTo: {
        email: user.email,
        name: user.user_metadata?.name || user.email
      },
      subject: emailSubject,
      htmlContent: emailHtml
    };

    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify(emailPayload)
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(`Brevo Error: ${JSON.stringify(err)}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    });

  } catch (err) {
    console.error('Erro:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});