const { supabase } = require('./supabase');
const crypto = require('crypto');

const passwordResetService = {
  async createResetToken(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas de validade

    const { error } = await supabase
      .from('password_reset_tokens')
      .insert({
        user_id: userId,
        token: token,
        expires_at: expiresAt.toISOString(),
      });

    if (error) {
      console.error('Error creating password reset token:', error);
      throw new Error('Could not create password reset token.');
    }

    return token;
  },

  async validateResetToken(token) {
    const { data, error } = await supabase
      .from('password_reset_tokens')
      .select('user_id, expires_at')
      .eq('token', token)
      .single();

    if (error || !data) {
      return null; // Token não encontrado
    }

    if (new Date(data.expires_at) < new Date()) {
      return null; // Token expirado
    }

    return data.user_id;
  },

  async deleteResetToken(token) {
    await supabase
      .from('password_reset_tokens')
      .delete()
      .eq('token', token);
  },
};

module.exports = { passwordResetService };
