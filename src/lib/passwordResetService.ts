import { v4 as uuidv4 } from 'uuid';
import { supabase } from './supabase'; // Certifique-se que supabase está configurado
import { sendPasswordResetEmail } from './brevo'; // Importe seu serviço de e-mail

export const passwordResetService = {
  // Gerar e armazenar o token no Supabase
  async createResetToken(userId: string) {
    const token = uuidv4(); // Gerar um token único
    const expireDate = new Date(Date.now() + 1000 * 60 * 60); // Expira em 1 hora

    const { error } = await supabase
      .from('password_reset_tokens')
      .insert([{ user_id: userId, token, expire_date: expireDate }]);

    if (error) {
      console.error('Erro ao armazenar token:', error);
      throw new Error('Erro ao gerar token de redefinição');
    }

    return token;
  },

  // Validar o token no Supabase
  async validateResetToken(token: string) {
    const { data, error } = await supabase
      .from('password_reset_tokens')
      .select('user_id')
      .eq('token', token)
      .gt('expire_date', new Date())
      .single();

    if (error || !data) {
      return { valid: false, error: 'Token inválido ou expirado' };
    }

    return { valid: true, userId: data.user_id };
  }
};

// Função para enviar o e-mail de redefinição usando o Brevo
export async function sendResetEmail(userEmail: string, userId: string) {
  const token = await passwordResetService.createResetToken(userId);
  const resetLink = `${window.location.origin}/reset-password?token=${token}`;
  await sendPasswordResetEmail(userEmail, resetLink);
}