import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2';
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://recebimentosmart.com.br',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
function createResetEmailHtml(resetLink) {
  const primaryColor = '#20B2AA';
  const backgroundColor = '#f4f4f4';
  const containerColor = '#ffffff';
  const textColor = '#333333';
  return `
    &lt;!DOCTYPE html&gt;
    &lt;html lang="pt-BR"&gt;
    &lt;head&gt;
      &lt;meta charset="UTF-8"&gt;
      &lt;meta name="viewport" content="width=device-width, initial-scale=1.0"&gt;
      &lt;style&gt;
        body { margin: 0; padding: 0; background-color: ${backgroundColor}; font-family: Arial, sans-serif; }
        .container { max-width: 600px; margin: 20px auto; background-color: ${containerColor}; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
        .header { background-color: ${primaryColor}; color: white; padding: 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { padding: 30px; color: ${textColor}; text-align: center; }
        .content p { line-height: 1.6; font-size: 16px; }
        .button { display: inline-block; background-color: ${primaryColor}; color: white !important; padding: 15px 25px; text-decoration: none; border-radius: 5px; font-size: 18px; margin-top: 20px; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #777777; }
        .footer p { margin: 5px 0; }
      &lt;/style&gt;
    &lt;/head&gt;
    &lt;body&gt;
      &lt;div class="container"&gt;
        &lt;div class="header"&gt;
          &lt;h1&gt;Redefinição de Senha&lt;/h1&gt;
        &lt;/div&gt;
        &lt;div class="content"&gt;
          &lt;p&gt;Recebemos uma solicitação para redefinir a senha da sua conta no Recebimento $mart.&lt;/p&gt;
          &lt;p&gt;Clique no botão abaixo para escolher uma nova senha:&lt;/p&gt;
          &lt;a href="${resetLink}" class="button" style="color: white !important;"&gt;Redefinir Senha&lt;/a&gt;
          &lt;p style="font-size: 14px; margin-top: 30px;"&gt;Se você não solicitou esta alteração, pode ignorar este e-mail com segurança.&lt;/p&gt;
        &lt;/div&gt;
        &lt;div class="footer"&gt;
          &lt;p&gt;Recebimento $mart&lt;/p&gt;
        &lt;/div&gt;
      &lt;/div&gt;
    &lt;/body&gt;
    &lt;/html&gt;
  `;
}
serve(async (req)=&gt;{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    if (!BREVO_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Uma ou mais secrets (BREVO, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) não foram configuradas.');
    }
    const { email } = await req.json();
    if (!email) {
      throw new Error('O e-mail é obrigatório.');
    }
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email
    });
    if (linkError) throw linkError;
    const resetLink = linkData.properties.action_link;
    const emailPayload = {
      sender: {
        name: 'Recebimento $mart',
        email: 'contato@recebimentosmart.com.br'
      },
      to: [
        {
          email: email
        }
      ],
      subject: 'Redefina sua senha do Recebimento $mart',
      htmlContent: createResetEmailHtml(resetLink)
    };
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
      throw new Error(`Falha ao enviar e-mail via Brevo: ${errorBody.message || brevoResponse.statusText}`);
    }
    return new Response(JSON.stringify({
      success: true,
      message: 'E-mail de recuperação enviado.'
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
