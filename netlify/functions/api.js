const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

// Configuração do Supabase e Mercado Pago (usando variáveis de ambiente do Netlify)
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mercadoPagoAccessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
const mercadoPagoBaseUrl = process.env.MERCADO_PAGO_BASE_URL || 'https://api.mercadopago.com';
const webhookUrl = process.env.WEBHOOK_URL; // URL do webhook para o Mercado Pago

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

// Funções Auxiliares (copiadas do server.cjs)
function createPixPaymentPayload(amount, description, payer, externalReference) {
  return { transaction_amount: amount, description, payment_method_id: 'pix', payer, external_reference: externalReference };
}
function createCreditCardPaymentPayload(amount, description, payer, cardData, installments, externalReference) {
  return { transaction_amount: amount, description, payment_method_id: cardData.payment_method_id || 'visa', token: cardData.token, installments, payer, external_reference: externalReference };
}
function createDebitCardPaymentPayload(amount, description, payer, cardData, externalReference) {
  return { transaction_amount: amount, description, payment_method_id: cardData.payment_method_id || 'debvisa', token: cardData.token, payer, external_reference: externalReference };
}
function createTicketPaymentPayload(amount, description, payer, externalReference) {
  return { transaction_amount: amount, description, payment_method_id: 'bolbradesco', payer: { ...payer, address: { zip_code: '01310-100', street_name: 'Av Paulista', street_number: 1000, neighborhood: 'Bela Vista', city: 'São Paulo', federal_unit: 'SP' } }, external_reference: externalReference };
}
async function saveTransactionAssociation(externalReference, userId, amount, description) {
  try {
    const { error } = await supabaseAdmin.from('payment_transactions').insert({ reference_id: externalReference, user_id: userId, amount, description, status: 'PENDING', created_at: new Date().toISOString() });
    if (error) console.error('Erro ao salvar associação da transação:', error);
  } catch (error) {
    console.error('Erro ao salvar associação da transação:', error);
  }
}

exports.handler = async (event, context) => {
  console.log('Requisição recebida na Netlify Function api.js');
  console.log('event.path:', event.path);
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

  const path = event.path.replace(/^\/api\//, ''); // Remove /api/ from the start
  const segments = path.split('/').filter(Boolean);
  console.log('path (after replace): ', path);
  console.log('segments: ', segments);

  switch (segments[0]) {
    case 'payment-details':
      if (event.httpMethod === 'GET' && segments[1]) {
        const userId = segments[1];
        const baseFee = 35.00; // Valor base da mensalidade

        try {
          const { data: credits, error: creditsError } = await supabaseAdmin
            .from('referrals')
            .select('credits_earned')
            .eq('user_id', userId)
            .single();

          if (creditsError && creditsError.code !== 'PGRST116') {
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
      }
      break;

    case 'generate-payment-mp':
      if (event.httpMethod === 'POST') {
        try {
          const { 
            amount, 
            description, 
            userId, 
            paymentMethod = 'pix',
            customerData,
            cardData,
            installments = 1
          } = JSON.parse(event.body);

          if (!amount || !description || !userId) {
            return {
              statusCode: 400,
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ success: false, message: 'Dados obrigatórios: amount, description, userId' }),
            };
          }

          const externalReference = uuidv4();
          await saveTransactionAssociation(externalReference, userId, amount, description);

          const payer = {
            email: customerData?.email || 'cliente@exemplo.com',
            identification: { type: 'CPF', number: customerData?.cpf || '12345678909' },
            first_name: customerData?.firstName || 'Cliente',
            last_name: customerData?.lastName || 'Exemplo'
          };

          let paymentPayload;
          switch (paymentMethod) {
            case 'pix':
              paymentPayload = createPixPaymentPayload(amount, description, payer, externalReference);
              break;
            case 'credit_card':
              if (!cardData) return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: false, message: 'Dados do cartão são obrigatórios' }),
              };
              paymentPayload = createCreditCardPaymentPayload(amount, description, payer, cardData, installments, externalReference);
              break;
            case 'debit_card':
              if (!cardData) return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: false, message: 'Dados do cartão são obrigatórios' }),
              };
              paymentPayload = createDebitCardPaymentPayload(amount, description, payer, cardData, externalReference);
              break;
            case 'ticket':
              paymentPayload = createTicketPaymentPayload(amount, description, payer, externalReference);
              break;
            default:
              return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ success: false, message: 'Método de pagamento não suportado' }),
              };
          }

          if (webhookUrl) {
            paymentPayload.notification_url = webhookUrl;
          }

          const response = await axios.post(
            `${mercadoPagoBaseUrl}/v1/payments`,
            paymentPayload,
            {
              headers: {
                Authorization: `Bearer ${mercadoPagoAccessToken}`,
                'Content-Type': 'application/json',
                'X-Idempotency-Key': externalReference
              }
            }
          );

          const payment = response.data;
          const responseData = {
            success: true,
            externalReference,
            paymentId: payment.id,
            status: payment.status,
            paymentMethod,
            amount,
            currency: payment.currency_id
          };

          if (paymentMethod === 'pix') {
            responseData.pixQrCode = payment.point_of_interaction?.transaction_data?.qr_code;
            responseData.pixQrCodeBase64 = payment.point_of_interaction?.transaction_data?.qr_code_base64;
            responseData.pixTicketUrl = payment.point_of_interaction?.transaction_data?.ticket_url;
          } else if (paymentMethod === 'ticket') {
            responseData.ticketUrl = payment.transaction_details?.external_resource_url;
          }

          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(responseData),
          };

        } catch (error) {
          console.error('Erro detalhado na Netlify Function generate-payment-mp:', error.response?.data || error.message);
          return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              success: false, 
              message: 'Falha ao gerar pagamento',
              error: error.response?.data || error.message
            }),
          };
        }
      }
      break;

    case 'mp-webhook':
      if (event.httpMethod === 'POST') {
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
      }
      break;

    default:
      return {
        statusCode: 404,
        body: 'Não encontrado',
      };
  }

  return {
    statusCode: 400,
    body: 'Requisição inválida',
  };
};
