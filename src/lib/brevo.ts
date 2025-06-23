import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com', // Servidor SMTP do Brevo
  port: 587,                   // Porta configurada
  auth: {
    user: '8bce81001@smtp-brevo.com', // Usuário fornecido
    pass: '9Py1swHURIW4CgxB'          // Senha fornecida
  }
});

export async function sendPasswordResetEmail(email: string, resetLink: string, name = 'Usuário') {
  try {
    const info = await transporter.sendMail({
      from: '"RecebimentoSmart" <no-reply@recebimentosmart.com.br>', // "From" precisa ser verificado no Brevo
      to: email, // Destinatário
      subject: 'Recuperação de Senha - RecebimentoSmart', // Assunto
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Recuperação de Senha</h2>
          <p>Olá ${name},</p>
          <p>Clique no botão abaixo para redefinir sua senha:</p>
          <a href="${resetLink}" style="background-color: #4f46e5; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Redefinir Senha</a>
          <p>Este link expira em 24 horas.</p>
        </div>
      `
    });
    console.log(`Email enviado para ${email}:`, info.messageId);
  } catch (err) {
    console.error('Erro ao enviar email:', err);
    throw err;
  }
}