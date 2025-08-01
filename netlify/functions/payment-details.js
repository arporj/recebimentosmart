const { createClient } = require('@supabase/supabase-js');

// Configuração do Supabase (usando variáveis de ambiente do Netlify)
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

exports.handler = async (event, context) => {
  // Permite requisições OPTIONS para CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      },
      body: 'OK',
    };
  }

  // Extrai o userId da URL
  const userId = event.path.split('/').pop();

  if (!userId) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, message: 'ID do usuário ausente.' }),
    };
  }

  const baseFee = 35.00; // Valor base da mensalidade

  try {
    // Buscar o total de créditos do usuário
    const { data: credits, error: creditsError } = await supabaseAdmin
      .from('referrals')
      .select('credits_earned')
      .eq('user_id', userId)
      .single();

    if (creditsError && creditsError.code !== 'PGRST116') { // Ignora erro se não encontrar registro
      console.error(`Erro ao buscar créditos: ${creditsError.message}`);
      throw new Error(`Erro ao buscar créditos: ${creditsError.message}`);
    }

    const totalCredits = credits?.credits_earned || 0;
    const creditsUsed = Math.min(baseFee, totalCredits);
    const amountToPay = Math.max(0, baseFee - creditsUsed);

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        success: true,
        baseFee,
        totalCredits,
        creditsUsed,
        amountToPay,
      }),
    };

  } catch (error) {
    console.error('Erro na Netlify Function payment-details:', error.message);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: false, message: 'Falha ao buscar detalhes de pagamento.' }),
    };
  }
};
