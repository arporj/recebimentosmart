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
function createResetEmailHtml(resetLink) {
  const primaryColor = '#20B2AA';
  const backgroundColor = '#f4f4f4';
  const containerColor = '#ffffff';
  const textColor = '#333333';
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
        .header h1 { margin: 0; font-size: 24px; }
        .content { padding: 30px; color: ${textColor}; text-align: center; }
        .content p { line-height: 1.6; font-size: 16px; }
        .button { display: inline-block; background-color: ${primaryColor}; color: white !important; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-size: 18px; margin-top: 20px; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #777777; }
        .footer p { margin: 5px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Redefinição de Senha</h1>
        </div>
        <div class="content">
          <p>Recebemos uma solicitação para redefinir a senha da sua conta no Recebimento $mart.</p>
          <p>Clique no botão abaixo para escolher uma nova senha:</p>
          <a href="${resetLink}" class="button" style="color: white !important;">Redefinir Senha</a>
          <p style="font-size: 14px; margin-top: 30px;">Se você não solicitou esta alteração, pode ignorar este e-mail com segurança.</p>
        </div>
        <div class="footer">
          <p>Recebimento $mart &copy; ${new Date().getFullYear()}</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
serve(async function (req) {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    if (!BREVO_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Uma ou mais secrets (BREVO, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) não foram configuradas.');
    }
    const { email, redirectTo } = await req.json();
    if (!email) {
      throw new Error('O e-mail é obrigatório.');
    }

    // 1. Gerar o link de recuperação usando a API Admin do Supabase
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: redirectTo || 'https://recebimentosmart.com.br/reset-password'
      }
    });

    if (linkError) throw linkError;

    const resetLink = linkData.properties.action_link;

    // 2. Preparar payload para o Brevo
    const emailPayload = {
      sender: {
        name: 'Recebimento $mart',
        email: 'no-reply@recebimentosmart.com.br'
      },
      to: [
        {
          email: email
        }
      ],
      subject: 'Redefina sua senha do Recebimento $mart',
      htmlContent: createResetEmailHtml(resetLink)
    };

    // 3. Enviar via Brevo API
    const brevoResponse = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify(emailPayload)
    });

    if (!brevoResponse.ok) {
      const errorBody = await brevoResponse.json();
      console.error('Erro detalhado Brevo:', JSON.stringify(errorBody));
      throw new Error(`Falha ao enviar e-mail via Brevo: ${errorBody.message || brevoResponse.statusText}`);
    }

    const data = await brevoResponse.json();

    return new Response(JSON.stringify({
      success: true,
      message: 'E-mail de recuperação enviado com sucesso!',
      data: data
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    console.error('Erro na função send-password-reset:', err);
    return new Response(JSON.stringify({
      error: err.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
