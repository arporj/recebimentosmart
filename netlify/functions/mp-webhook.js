const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// Configuração do Supabase e Mercado Pago (usando variáveis de ambiente do Netlify)
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mercadoPagoAccessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
const mercadoPagoBaseUrl = process.env.MERCADO_PAGO_BASE_URL || 'https://api.mercadopago.com';

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

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: 'Método não permitido',
    };
  }

  try {
    const { topic, id } = JSON.parse(event.body); // topic: 'payment', id: payment_id

    if (topic === 'payment') {
      // 1. Buscar detalhes do pagamento no Mercado Pago
      const response = await axios.get(
        `${mercadoPagoBaseUrl}/v1/payments/${id}`,
        {
          headers: {
            Authorization: `Bearer ${mercadoPagoAccessToken}`,
          },
        }
      );

      const payment = response.data;

      // 2. Verificar se o pagamento foi aprovado
      if (payment.status === 'approved') {
        const externalReference = payment.external_reference;

        // 3. Encontrar a transação associada no nosso banco de dados
        const { data: transaction, error: transactionError } = await supabaseAdmin
          .from('payment_transactions')
          .select('*')
          .eq('reference_id', externalReference)
          .single();

        if (transactionError) {
          console.error('Erro ao buscar transação associada:', transactionError);
          return {
            statusCode: 500,
            body: JSON.stringify({ message: 'Erro interno do servidor' }),
          };
        }

        if (transaction) {
          // 4. Atualizar o status da transação para COMPLETED
          const { error: updateError } = await supabaseAdmin
            .from('payment_transactions')
            .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
            .eq('id', transaction.id);

          if (updateError) {
            console.error('Erro ao atualizar status da transação:', updateError);
            return {
              statusCode: 500,
              body: JSON.stringify({ message: 'Erro interno do servidor' }),
            };
          }

          // 5. Inserir/Atualizar registro na tabela 'subscriptions'
          // Assumindo que 'subscriptions' tem user_id, start_date, end_date, status, plan_id
          // E que 'start_date' pode ser a data do pagamento
          const { error: subscriptionError } = await supabaseAdmin
            .from('subscriptions')
            .insert({
              user_id: transaction.user_id,
              start_date: new Date().toISOString(), // Data do pagamento
              end_date: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString(), // 1 mês de validade
              status: 'active',
              plan_id: 'monthly_plan', // Assumindo um plano padrão
              // Nota: 'amount' e 'payment_id' não estão no schema atual de 'subscriptions'
              // Se forem necessários, uma migração de DB será preciso.
            });

          if (subscriptionError) {
            console.error('Erro ao criar/atualizar assinatura:', subscriptionError);
            return {
              statusCode: 500,
              body: JSON.stringify({ message: 'Erro interno do servidor' }),
            };
          }

          console.log(`Pagamento ${payment.id} aprovado e assinatura criada/atualizada para o usuário ${transaction.user_id}.`);
        }
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ message: 'OK' }),
    };
  } catch (error) {
    console.error('Erro no webhook do Mercado Pago:', error.response?.data || error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: 'Erro interno do servidor' }),
    };
  }
};
