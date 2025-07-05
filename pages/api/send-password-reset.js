import { supabase } from '../../src/lib/supabase';
import nodemailer from 'nodemailer';
import { v4 as uuidv4 } from 'uuid';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    // 1. Find the user by email to get their name for the email template.
    const { data: user, error: userError } = await supabase
      .from('usuario')
      .select('nome')
      .eq('email', email)
      .single();

    if (userError || !user) {
      // Do not reveal if the user exists or not for security reasons.
      // Silently succeed, but log the error on the server.
      console.error('Attempt to reset password for non-existent user or db error:', email, userError);
      return res.status(200).json({ message: 'If your email is in our system, you will receive a password reset link.' });
    }

    // 2. Generate a reset token and expiry date.
    const token = uuidv4();
    const expires_at = new Date(Date.now() + 1000 * 60 * 60); // 1 hour expiry

    // 3. Store the token in the existing `password_reset_tokens` table.
    const { error: tokenError } = await supabase
      .from('password_reset_tokens')
      .insert([{ email, token, expires_at }]);

    if (tokenError) {
      console.error('Error saving password reset token:', tokenError);
      return res.status(500).json({ message: 'Internal server error' });
    }

    // 4. Send the email.
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    const resetLink = `${process.env.APP_URL || 'http://localhost:5173'}/reset-password?token=${token}`;

    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME || 'RecebimentoSmart'}" <${process.env.SMTP_FROM_EMAIL}>`,
      to: email,
      subject: 'Recuperação de Senha - RecebimentoSmart',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Recuperação de Senha</h2>
          <p>Olá ${user.nome || 'Usuário'},</p>
          <p>Clique no botão abaixo para redefinir sua senha:</p>
          <a href="${resetLink}" style="background-color: #4f46e5; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Redefinir Senha</a>
          <p>Este link expira em 1 hora.</p>
        </div>
      `,
    });

    res.status(200).json({ message: 'If your email is in our system, you will receive a password reset link.' });
  } catch (error) {
    console.error('Error in send-password-reset:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}