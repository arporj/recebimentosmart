const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const https = require('https');
const fs = require('fs');
const path = require('path');

// --- Configurações ---
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

// Mercado Pago
const mercadoPagoAccessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
const mercadoPagoBaseUrl = process.env.MERCADO_PAGO_BASE_URL || 'https://api.mercadopago.com';
const webhookUrl = process.env.WEBHOOK_URL;

// Banco Inter mTLS e Credenciais
const interEnv = process.env.INTER_ENV || 'sandbox';
const certName = interEnv === 'sandbox' ? 'Sandbox_InterAPI_Certificado.crt' : 'Inter API_Certificado.crt';
const keyName = interEnv === 'sandbox' ? 'Sandbox_InterAPI_Chave.key' : 'Inter API_Chave.key';
const certPath = path.join(__dirname, 'certs', certName);
const keyPath = path.join(__dirname, 'certs', keyName);

let httpsAgent = null;

try {
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    httpsAgent = new https.Agent({
      cert: fs.readFileSync(certPath),
      key: fs.readFileSync(keyPath),
      rejectUnauthorized: false
    });
    console.log(`[mTLS] Certificados do Banco Inter (${interEnv}) carregados com sucesso.`);
  } else {
    console.warn(`[mTLS] AVISO: Certificados mTLS do Banco Inter não encontrados em: ${certPath} ou ${keyPath}. Usará fallback simulado.`);
  }
} catch (err) {
  console.error(`[mTLS] Erro ao carregar certificados do Banco Inter:`, err.message);
}

async function getInterOAuthToken() {
  const baseUrl = interEnv === 'sandbox' 
    ? 'https://cdpj-sandbox.partners.uatinter.co' 
    : 'https://cdpj.partners.bancointer.com.br';
  
  const tokenUrl = `${baseUrl}/oauth/v2/token`;
  const clientId = process.env.INTER_CLIENT_ID;
  const clientSecret = process.env.INTER_CLIENT_SECRET;

  if (!httpsAgent) {
    throw new Error('Certificados mTLS do Banco Inter não foram carregados corretamente.');
  }

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('scope', 'cob.write cob.read pix.read');

  if (clientId && clientSecret) {
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
  }

  const response = await axios.post(tokenUrl, params.toString(), {
    httpsAgent,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  return response.data.access_token;
}



// --- Funções Auxiliares (Mercado Pago) ---
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

  let cleanPath = event.path;
  cleanPath = cleanPath.replace(/^\/\.netlify\/functions\/api/, '');
  cleanPath = cleanPath.replace(/^\/api/, '');
  
  const segments = cleanPath.split('/').filter(Boolean);
  console.log('cleanPath: ', cleanPath);
  console.log('segments: ', segments);

  switch (segments[0]) {
    case 'pix':
      if (segments[1] === 'create-payment' && event.httpMethod === 'POST') {
        try {
          const { amount, planName, userId } = JSON.parse(event.body);

          if (!amount || !userId || !planName) {
            return {
              statusCode: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
              body: JSON.stringify({ success: false, message: 'Parâmetros obrigatórios ausentes.' })
            };
          }

          let finalAmount = parseFloat(amount);
          if (interEnv === 'sandbox') {
            finalAmount = planName.toLowerCase().includes('pro') ? 2.00 : 1.00;
          }

          try {
            const token = await getInterOAuthToken();
            const baseUrl = interEnv === 'sandbox' 
              ? 'https://cdpj-sandbox.partners.uatinter.co' 
              : 'https://cdpj.partners.bancointer.com.br';
            
            const cobUrl = `${baseUrl}/pix/v2/cob`;
            const interChavePix = process.env.INTER_CHAVE_PIX || '37.905.181/0001-05';

            const payload = {
              calendario: { expiracao: 3600 },
              valor: { original: finalAmount.toFixed(2) },
              chave: interChavePix.replace(/[^a-zA-Z0-9]/g, ''),
              solicitacaoPagador: `Recebimento Smart - Assinatura ${planName}`
            };

            const response = await axios.post(cobUrl, payload, {
              httpsAgent,
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            });

            const { txid, pixCopiaECola } = response.data;

            const { error: dbError } = await supabaseAdmin
              .from('pix_transactions')
              .insert({
                user_id: userId,
                transaction_id: txid,
                amount: finalAmount,
                status: 'PENDING',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              });

            if (dbError) throw dbError;

            return {
              statusCode: 201,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
              body: JSON.stringify({ success: true, txid, pixCopiaECola, simulated: false })
            };

          } catch (error) {
            console.error('[PIX] Falha no Banco Inter, usando fallback de Sandbox:', error.message);

            if (interEnv === 'sandbox') {
              const mockTxid = 'SIMULADO_' + uuidv4().replace(/-/g, '').substring(0, 24);
              const mockPixCopiaECola = `00020101021226870014br.gov.bcb.pix2565379051810001055204000053039865404${finalAmount.toFixed(2)}5802BR5925RECEBIMENTO SMART6009SAO PAULO62300526${mockTxid}6304`;

              try {
                const { error: dbError } = await supabaseAdmin
                  .from('pix_transactions')
                  .insert({
                    user_id: userId,
                    transaction_id: mockTxid,
                    amount: finalAmount,
                    status: 'PENDING',
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                  });
                if (dbError) {
                  console.error('[DB Error] Erro ao salvar mock no banco:', dbError.message);
                }
              } catch (dbCatchError) {
                console.error('[DB] Erro no mock:', dbCatchError.message);
              }

              return {
                statusCode: 201,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ success: true, txid: mockTxid, pixCopiaECola: mockPixCopiaECola, simulated: true })
              };
            }

            return {
              statusCode: 500,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
              body: JSON.stringify({ success: false, message: 'Não foi possível gerar a cobrança.', details: error.message })
            };
          }
        } catch (err) {
          return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: err.message })
          };
        }
      }

      if (segments[1] === 'simulate-webhook' && event.httpMethod === 'POST') {
        if (interEnv !== 'sandbox') {
          return {
            statusCode: 403,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Apenas para Sandbox' })
          };
        }
        try {
          const { txid } = JSON.parse(event.body);
          if (!txid) {
            return {
              statusCode: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
              body: JSON.stringify({ error: 'txid obrigatório' })
            };
          }

          const mockPayload = {
            pix: [{
              txid: txid,
              valor: "1.00",
              endToEndId: "E" + Date.now() + "12345678",
              horario: new Date().toISOString(),
              status: "CONCLUIDO"
            }]
          };

          const host = event.headers.host || 'www.recebimentosmart.com.br';
          const protocol = event.headers['x-forwarded-proto'] || 'https';
          
          await axios.post(`${protocol}://${host}/webhooks/inter`, mockPayload, {
            headers: { 'Content-Type': 'application/json' }
          });

          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ success: true, message: 'Simulação disparada!' })
          };
        } catch (err) {
          return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: err.message })
          };
        }
      }
      break;

    case 'webhooks':
      if (segments[1] === 'inter' && event.httpMethod === 'POST') {
        try {
          console.log('[Webhook] Notificação Banco Inter recebida em Netlify Functions.');
          const body = JSON.parse(event.body);

          if (!body || !body.pix || !Array.isArray(body.pix)) {
            return {
              statusCode: 400,
              headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
              body: JSON.stringify({ error: 'Payload inválido' })
            };
          }

          for (const pix of body.pix) {
            const { txid, endToEndId, valor } = pix;
            const transactionId = txid || endToEndId;

            if (!transactionId) continue;

            const { data, error } = await supabaseAdmin
              .from('pix_transactions')
              .update({ status: 'COMPLETED', updated_at: new Date().toISOString() })
              .eq('transaction_id', transactionId)
              .select('*');

            if (error || !data || data.length === 0) continue;

            const transaction = data[0];
            const userId = transaction.user_id;
            const amountPaid = parseFloat(transaction.amount);

            let planName = 'basico';
            if (amountPaid >= 20.00 || amountPaid === 2.00) {
              planName = 'pro';
            }

            await supabaseAdmin.rpc('update_user_subscription', {
              p_user_id: userId,
              p_plan_name: planName
            });

            try {
              await supabaseAdmin.from('payments').insert({
                user_id: userId,
                amount: amountPaid,
                status: 'completed',
                transaction_id: transactionId,
                payment_method: 'pix'
              });
            } catch (err) {
              console.error('Erro pagto:', err.message);
            }

            try {
              await supabaseAdmin.rpc('grant_referral_credit', {
                referred_user_id: userId,
                paid_plan: planName
              });
            } catch (err) {
              console.error('Erro referral:', err.message);
            }
          }

          return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ success: true })
          };
        } catch (err) {
          console.error('[Webhook Error]', err.message);
          return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: err.message })
          };
        }
      }
      break;

    case 'generate-pix':
        if (event.httpMethod === 'POST') {
            try {
                console.log('generate-pix: body recebido:', event.body);
                const { amount, userId } = JSON.parse(event.body);

                if (!amount || !userId) {
                    return { statusCode: 400, body: JSON.stringify({ error: 'Amount and userId are required' }) };
                }

                const { data: profile, error: profileError } = await supabaseAdmin
                    .from('profiles')
                    .select('cpf_cnpj, name, email')
                    .eq('id', userId)
                    .single();

                if (profileError || !profile) {
                    console.error('Erro ao buscar perfil do usuário:', profileError);
                    return { statusCode: 404, body: JSON.stringify({ error: 'Usuário não encontrado' }) };
                }

                const pagarmeApi = axios.create({
                    baseURL: 'https://api.pagar.me/core/v5',
                    headers: {
                        'Authorization': `Basic ${Buffer.from(process.env.PAGARME_API_KEY + ':').toString('base64')}`,
                        'Content-Type': 'application/json'
                    }
                });

                const expires_in = 3600; // 1 hora

                const cobrancaBody = {
                    customer: {
                        name: profile.name || 'Nome não informado',
                        email: profile.email,
                        document: profile.cpf_cnpj,
                        type: 'individual'
                    },
                    items: [{
                        amount: Math.round(amount * 100),
                        description: 'Pagamento Assinatura Anual',
                        quantity: 1,
                    }],
                    payments: [{
                        payment_method: 'pix',
                        pix: {
                            expires_in: expires_in,
                            additional_information: [
                                { name: 'Referente a', value: 'Assinatura Anual' }
                            ]
                        }
                    }]
                };

                const responseCobranca = await pagarmeApi.post('/orders', cobrancaBody);

                const { id: transactionId, charges } = responseCobranca.data;
                const qrCodeData = charges[0].last_transaction.qr_code;
                const qrCodeImageUrl = charges[0].last_transaction.qr_code_url;

                if (!transactionId || !qrCodeData) {
                    return { statusCode: 500, body: JSON.stringify({ error: 'Resposta inválida da API do Pagar.me' }) };
                }

                const { error: insertError } = await supabaseAdmin
                    .from('pix_transactions')
                    .insert([{
                        user_id: userId,
                        amount: amount,
                        transaction_id: transactionId,
                        status: 'PENDING',
                        qr_code: qrCodeData,
                        qr_code_url: qrCodeImageUrl,
                        expires_at: new Date(new Date().getTime() + expires_in * 1000).toISOString(),
                    }]);

                if (insertError) {
                    console.error('Erro ao salvar transação PIX:', insertError);
                    return { statusCode: 500, body: JSON.stringify({ error: 'Falha ao salvar dados da transação' }) };
                }

                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        transactionId: transactionId,
                        qrCodeText: qrCodeData,
                        qrCodeImageUrl: qrCodeImageUrl
                    })
                };

            } catch (error) {
                console.error('Erro ao gerar cobrança PIX:', error.response?.data || error.message);
                return { statusCode: 500, body: JSON.stringify({ error: 'Erro interno do servidor ao gerar PIX' }) };
            }
        }
        break;

    case 'payment-details':
      if (event.httpMethod === 'GET' && segments[1]) {
        const userId = segments[1];
        const baseFee = 35.00; 

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
          const { topic, id } = JSON.parse(event.body); 

          if (topic === 'payment') {
            const response = await axios.get(
              `${mercadoPagoBaseUrl}/v1/payments/${id}`,
              {
                headers: {
                  Authorization: `Bearer ${mercadoPagoAccessToken}`,
                },
              }
            );

            const payment = response.data;

            if (payment.status === 'approved') {
              const externalReference = payment.external_reference;

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

                const { error: subscriptionError } = await supabaseAdmin
                  .from('subscriptions')
                  .insert({
                    user_id: transaction.user_id,
                    start_date: new Date().toISOString(), 
                    end_date: new Date(new Date().setMonth(new Date().getMonth() + 1)).toISOString(), 
                    status: 'active',
                    plan_id: 'monthly_plan', 
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

    case 'pagarme-webhook':
      if (event.httpMethod === 'POST') {
        try {
          const signature = event.headers['x-hub-signature'];
          if (!signature) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Assinatura inválida' }) };
          }

          const [algorithm, signed] = signature.split('=');
          const expectedSignature = crypto
            .createHmac(algorithm, process.env.PAGARME_API_KEY)
            .update(event.body, 'utf8')
            .digest('hex');

          if (!crypto.timingSafeEqual(Buffer.from(signed), Buffer.from(expectedSignature))) {
            return { statusCode: 401, body: JSON.stringify({ error: 'Assinatura inválida' }) };
          }

          const { id: orderId, charges } = JSON.parse(event.body);
          const status = charges[0].last_transaction.status;

          if (status === 'paid') {
            const { error: updateError } = await supabaseAdmin
              .from('pix_transactions')
              .update({ status: 'PAID' })
              .eq('transaction_id', orderId);

            if (updateError) {
              console.error('Erro ao atualizar status do pagamento:', updateError);
              return { statusCode: 500, body: JSON.stringify({ error: 'Erro ao processar pagamento' }) };
            }
          }

          return { statusCode: 200, body: JSON.stringify({ received: true }) };
        } catch (error) {
          console.error('Erro no webhook do Pagar.me:', error.response?.data || error.message);
          return { statusCode: 500, body: JSON.stringify({ message: 'Erro interno do servidor' }) };
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
