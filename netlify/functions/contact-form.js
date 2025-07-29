
const nodemailer = require('nodemailer');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { name, email, message } = JSON.parse(event.body);

    // Configurar o transporter do Nodemailer
    // Use suas credenciais de e-mail aqui, preferencialmente de variáveis de ambiente
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: process.env.EMAIL_SECURE === 'true', // true para 465, false para outras portas
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_TO, // O e-mail para onde as críticas/sugestões serão enviadas
      subject: `Nova Crítica/Sugestão de ${name}`,
      html: `
        <p><strong>Nome:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Mensagem:</strong></p>
        <p>${message}</p>
      `,
    };

    await transporter.sendMail(mailOptions);

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'Feedback enviado com sucesso!' }),
    };
  } catch (error) {
    console.error('Erro ao enviar feedback:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Erro ao enviar feedback. Tente novamente mais tarde.' }),
    };
  }
};
