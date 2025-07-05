// server/routes/auth.js
const express = require('express');
const router = express.Router();
const { supabase } = require('../../src/lib/supabase'); // Ajuste o caminho conforme necessário
const nodemailer = require('nodemailer');
const { passwordResetService } = require('../lib/passwordResetService'); // Ajuste o caminho conforme necessário

router.post('/request-password-reset', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ message: 'Email is required' });
  }

  try {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, name')
      .eq('email', email)
      .single();

    if (userError || !user) {
      console.error('Error finding user or user not found:', userError);
      return res.status(200).json({ message: 'If a user with that email exists, a password reset email has been sent.' });
    }

    const token = await passwordResetService.createResetToken(user.id);
    const resetLink = `${process.env.VITE_APP_URL}/reset-password?token=${token}`;
    
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });

    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_FROM_EMAIL}>`,
      to: email,
      subject: 'Recuperação de Senha - RecebimentoSmart',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Recuperação de Senha</h2>
          <p>Olá ${user.name || 'Usuário'},</p>
          <p>Clique no botão abaixo para redefinir sua senha:</p>
          <a href="${resetLink}" style="background-color: #4f46e5; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 4px;">Redefinir Senha</a>
          <p>Este link expira em 24 horas.</p>
        </div>
      `,
    });

    return res.status(200).json({ message: 'Password reset email sent successfully.' });
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
});

module.exports = router;
