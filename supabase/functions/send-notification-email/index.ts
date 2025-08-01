import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Trata a requisição preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Valida a existência da chave da API
    if (!BREVO_API_KEY) {
      throw new Error('BREVO_API_KEY não foi configurada como um secret da função.');
    }

    // Extrai os dados do corpo da requisição
    const { subject, htmlContent, recipientEmail } = await req.json();

    // Valida os parâmetros recebidos
    if (!subject || !htmlContent || !recipientEmail) {
      return new Response(JSON.stringify({ error: 'Parâmetros subject, htmlContent e recipientEmail são obrigatórios.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Monta o payload para a API da Brevo
    const emailPayload = {
      sender: { name: 'Recebimento $mart - Notificação', email: 'no-reply@recebimentosmart.com.br' },
      to: [{ email: recipientEmail }],
      subject: subject,
      htmlContent: htmlContent,
    };

    // Envia o e-mail
    const brevoResponse = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });

    // Trata a resposta da API da Brevo
    if (!brevoResponse.ok) {
      const errorBody = await brevoResponse.json();
      console.error('Erro da API Brevo:', errorBody);
      throw new Error(`Falha ao enviar e-mail via Brevo: ${errorBody.message || brevoResponse.statusText}`);
    }

    const responseData = await brevoResponse.json();

    // Retorna sucesso
    return new Response(JSON.stringify({ success: true, data: responseData }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    // Captura qualquer erro que ocorrer no processo
    console.error('Erro na função send-notification-email:', error);
    return new Response(JSON.stringify({ error: error.message || 'Erro interno do servidor.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});