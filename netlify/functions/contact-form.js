
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { name, email, message, type, subject } = JSON.parse(event.body);

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.RECIPIENT_EMAIL;

    // A URL da sua Edge Function (substitua pelo seu URL real do Supabase)
    const edgeFunctionUrl = `https://kwdweztilsoxxcgudtsz.supabase.co/functions/v1/send_feedback_email`;

    const recipientEmail = process.env.RECIPIENT_EMAIL;

    const emailSubject = `[${type}] ${subject} - De: ${name} (${email})`;
    const emailHtml = `
      <p><strong>Tipo:</strong> ${type}</p>
      <p><strong>Assunto:</strong> ${subject}</p>
      <p><strong>Nome:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Mensagem:</strong></p>
      <p>${message}</p>
    `;

    // Dados a serem enviados para a Edge Function
    const payload = {
      to_email: recipientEmail,
      email_subject: emailSubject,
      email_html: emailHtml,
    };

    // Chamada HTTP POST para a Edge Function
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceRoleKey}`,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Erro ao chamar Edge Function:', result);
      throw new Error(result.error || 'Erro desconhecido ao chamar Edge Function');
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Feedback enviado com sucesso!', success: true }),
    };
  } catch (error) {
    console.error('Erro ao enviar feedback:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Erro ao enviar feedback. Tente novamente mais tarde.' }),
    };
  }
};
