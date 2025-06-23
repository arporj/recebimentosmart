// API para envio de e-mail de feedback
// Arquivo: /api/send-feedback.js

import nodemailer from 'nodemailer';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const { to, subject, body, from, name } = req.body;

  if (!to || !subject || !body) {
    return res.status(400).json({ error: 'Dados incompletos' });
  }

  try {
    // Configurar o transporte de e-mail
    // Nota: Em produção, use variáveis de ambiente para credenciais
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT,
      secure: process.env.EMAIL_SECURE === 'true',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD,
      },
    });

    // Enviar o e-mail
    await transporter.sendMail({
      from: `"${name}" <${process.env.EMAIL_FROM}>`,
      to,
      subject,
      text: body,
      replyTo: from,
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Erro ao enviar e-mail:', error);
    return res.status(500).json({ error: 'Falha ao enviar e-mail' });
  }
}
