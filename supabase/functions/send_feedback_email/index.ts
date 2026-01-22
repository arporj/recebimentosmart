import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://recebimentosmart.com.br',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
function createEmailHtml(name, from, type, subject, comment) {
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
        .content { padding: 30px; color: ${textColor}; }
        .content h2 { color: ${primaryColor}; font-size: 20px; }
        .content p { line-height: 1.6; }
        .info-box { background-color: #f9f9f9; border-left: 4px solid ${primaryColor}; padding: 15px; margin: 20px 0; }
        .info-box p { margin: 5px 0; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #777777; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Novo Feedback Recebido</h1>
        </div>
        <div class="content">
          <h2>Detalhes do Feedback</h2>
          <div class="info-box">
            <p><strong>De:</strong> ${name} (${from})</p>
            <p><strong>Tipo:</strong> ${type}</p>
            <p><strong>Assunto:</strong> ${subject}</p>
          </div>
          <h2>Comentário</h2>
          <p>${comment.replace(/\n/g, '<br>')}</p>
        </div>
        <div class="footer">
          <p>Enviado através do formulário de feedback do Recebimento $mart</p>
        </div>
      </div>
    </body>
    </html>
  `;
}
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    if (!BREVO_API_KEY) {
      throw new Error('A chave da API da Brevo (BREVO_API_KEY) não foi encontrada.');
    }
    const { from, name, type, subject, comment } = await req.json();
    const emailPayload = {
      sender: {
        name: 'Sistema Recebimento $mart',
        email: 'contato@recebimentosmart.com.br'
      },
      to: [
        {
          email: 'contato@recebimentosmart.com.br',
          name: 'Sistema Recebimento $mart'
        }
      ],
      replyTo: {
        email: from,
        name: name
      },
      subject: `[${type}]: ${subject}`,
      htmlContent: createEmailHtml(name, from, type, subject, comment)
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
      const errorBody = await response.json();
      throw new Error(`Falha ao enviar e-mail via Brevo: ${errorBody.message || response.statusText}`);
    }
    const data = await response.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    console.error('Erro na execução da função:', err);
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