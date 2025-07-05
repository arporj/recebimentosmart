import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: import.meta.env.VITE_SMTP_HOST,
  port: Number(import.meta.env.VITE_SMTP_PORT),
  secure: import.meta.env.VITE_SMTP_SECURE === 'true',
  auth: {
    user: import.meta.env.VITE_SMTP_USER,
    pass: import.meta.env.VITE_SMTP_PASSWORD
  }
});

export async function sendPasswordResetEmail(email: string, resetLink: string, name = 'Usuário') {
  try {
    const info = await transporter.sendMail({
      from: `"${import.meta.env.VITE_SMTP_FROM_NAME}" <${import.meta.env.VITE_SMTP_FROM_EMAIL}>`,
      to: email,
      subject: 'Recuperação de Senha - RecebimentoSmart',
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