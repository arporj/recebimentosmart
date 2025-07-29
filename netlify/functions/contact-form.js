
const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { name, email, message, type, subject } = JSON.parse(event.body);

    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

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

    // Chamada para uma função Supabase (Edge Function ou Database Function) para enviar o e-mail
    const { data, error } = await supabase.rpc('send_feedback_email', {
      to_email: recipientEmail,
      email_subject: emailSubject,
      email_html: emailHtml,
    });

    if (error) {
      console.error('Erro ao chamar função Supabase para enviar e-mail:', error);
      throw new Error(error.message);
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
