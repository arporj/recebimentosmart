// API para obter detalhes de pagamento (mensalidade e créditos)
// Arquivo: pages/api/payment/details.js

import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Método não permitido' });
  }

  const supabase = createServerSupabaseClient({ req, res });

  try {
    // Obter sessão do usuário
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session?.user) {
      return res.status(401).json({ success: false, message: 'Não autorizado' });
    }

    const userId = session.user.id;

    // Definir mensalidade base
    const baseFee = 35.00;

    // Chamar a função SQL para calcular os créditos
    const { data: totalCredits, error: creditsError } = await supabase
      .rpc('calculate_referral_credits', { p_user_id: userId });

    if (creditsError) {
      console.error('Erro ao calcular créditos:', creditsError);
      // Não falhar a requisição, apenas retornar crédito zero em caso de erro
      return res.status(200).json({
        success: true,
        baseFee: baseFee,
        totalCredits: 0,
        amountToPay: baseFee
      });
    }

    const credits = totalCredits || 0;
    const amountToPay = Math.max(0, baseFee - credits); // Garante que não seja negativo
    const amountToReceive = Math.max(0, credits - baseFee); // Crédito excedente

    return res.status(200).json({
      success: true,
      baseFee: baseFee,
      totalCredits: credits,
      amountToPay: amountToPay,
      amountToReceive: amountToReceive
    });

  } catch (error) {
    console.error('Erro ao obter detalhes de pagamento:', error);
    return res.status(500).json({
      success: false,
      message: 'Falha ao obter detalhes de pagamento',
      error: error.message
    });
  }
}

