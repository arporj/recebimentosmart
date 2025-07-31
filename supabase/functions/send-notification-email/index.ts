import { serve } from 'https://deno.land/std@0.208.0/http/server.ts';

const BREVO_API_KEY = Deno.env.get('BREVO_API_KEY');
const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (!BREVO_API_KEY) {
    return new Response(JSON.stringify({ error: 'BREVO_API_KEY não configurada.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { subject, htmlContent, recipientEmail } = await req.json();

    if (!subject || !htmlContent || !recipientEmail) {
      return new Response(JSON.stringify({ error: 'Parâmetros subject, htmlContent e recipientEmail são obrigatórios.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const emailPayload = {
      sender: { name: 'Recebimento $mart - Notificação', email: 'no-reply@recebimentosmart.com.br' },
      to: [{ email: recipientEmail }],
      subject: subject,
      htmlContent: htmlContent,
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
      const errorBody = await brevoResponse.json();
      console.error('Erro ao enviar e-mail via Brevo:', errorBody);
      throw new Error(`Falha ao enviar e-mail via Brevo: ${JSON.stringify(errorBody)}`);
    }

    return new Response(JSON.stringify({ success: true, message: 'E-mail de notificação enviado com sucesso.' }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Erro na função send-notification-email:', error);
    return new Response(JSON.stringify({ error: error.message || 'Erro interno do servidor.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
