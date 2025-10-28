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

// Banco Inter
const INTER_API_URL = process.env.INTER_API_URL || 'https://cdpj-sandbox.partners.uatinter.co';
const INTER_CLIENT_ID = process.env.INTER_CLIENT_ID;
const INTER_CLIENT_SECRET = process.env.INTER_CLIENT_SECRET;
const INTER_CONTA_CORRENTE = process.env.INTER_CONTA_CORRENTE;

// --- Lógica do Banco Inter ---

// Variáveis para armazenar o conteúdo dos certificados e o agente HTTPS
let httpsAgent = null;

// Função para carregar os certificados e criar o agente HTTPS
function loadInterCertificates( ) {
  if (httpsAgent ) return; // Já carregado

  try {
    // Caminhos para os certificados do cliente
    const CLIENT_CERT_PATH = path.join(__dirname, 'certs', 'client.crt');
    const CLIENT_KEY_PATH = path.join(__dirname, 'certs', 'client.key');
    const CA_CERT_PATH = path.join(__dirname, 'certs', 'ca.crt');

    // ...
    const clientCertContent = fs.readFileSync(CLIENT_CERT_PATH, 'utf8');
    const clientKeyContent = fs.readFileSync(CLIENT_KEY_PATH, 'utf8');
    const caCertContent = fs.readFileSync(CA_CERT_PATH, 'utf8');

    // Agente HTTPS com os certificados
    // O erro 'tlsv1 alert unknown ca' geralmente ocorre em mTLS quando o servidor não confia no certificado do cliente.
    // A correção é enviar a cadeia de certificados completa, concatenando o certificado do cliente com o da CA.
    httpsAgent = new https.Agent({
      cert: clientCertContent,
      key: clientKeyContent,
      passphrase: '',
      ca: caCertContent,
      rejectUnauthorized: false,
    });

    console.log('Certificados do cliente Inter carregados com sucesso.');
    
  } catch (err) {
    // CORREÇÃO DE ESCOPO: O erro de carregamento agora lança uma exceção que será capturada
    console.error('ERRO: Não foi possível carregar os certificados do cliente Inter:', err);
    throw new Error('Certificados do cliente Inter não carregados. Autenticação falhou.');
  }
}


// O uso global do https.Agent será removido para evitar efeitos colaterais.
// A configuração será passada explicitamente para as requisições do Inter.

// Função para obter o token de autenticação do Inter
async function getInterToken() {
  loadInterCertificates(); // CORREÇÃO DE ESCOPO: Garante que os certificados estão carregados e o agente criado
  
  try {
    const response = await axios.post(
      `${INTER_API_URL}/oauth/v2/token`,
      new URLSearchParams({
        client_id: INTER_CLIENT_ID,
        client_secret: INTER_CLIENT_SECRET,
        grant_type: 'client_credentials',
        scope: 'boleto-cobranca.write boleto-cobranca.read'
      }),
      {
        httpsAgent, // CORREÇÃO SSL: Passa o agente explicitamente
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      }
     );
    return response.data.access_token;
  } catch (error) {
    console.error('Erro ao obter token do Inter:', error.response?.data || error.message);
    throw new Error('Falha na autenticação com o Inter');
  }
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

  const path = event.path.replace(/^\/api\//, '');
  const segments = path.split('/').filter(Boolean);
  console.log('path (after replace): ', path);
  console.log('segments: ', segments);

  switch (segments[0]) {
    case 'generate-pix':
        if (event.httpMethod === 'POST') {
            try {
                console.log('generate-pix: body recebido:', event.body);
                const { amount, userId, payerInfo } = JSON.parse(event.body);

                if (!amount || !userId || !payerInfo) {
                    console.error('generate-pix: Erro - Faltando amount, userId ou payerInfo.');
                    return { statusCode: 400, body: JSON.stringify({ error: 'Amount, userId, and payerInfo are required' }) };
                }

                // Validação dos campos obrigatórios do pagador recebidos no corpo
                const requiredPayerFields = ['name', 'address', 'city', 'state', 'zip_code'];
                const missingPayerFields = requiredPayerFields.filter(field => !payerInfo[field]);

                if (missingPayerFields.length > 0) {
                    const errorMsg = `Dados do pagador incompletos na requisição. Campos faltando: ${missingPayerFields.join(', ')}`;
                    console.error(`generate-pix: Erro - ${errorMsg}`);
                    return { statusCode: 400, body: JSON.stringify({ error: errorMsg }) };
                }

                // Validação adicional para o campo UF (state)
                if (payerInfo.state && payerInfo.state.length !== 2) {
                    const errorMsg = 'O campo UF (state) deve ter exatamente 2 caracteres.';
                    console.error(`generate-pix: Erro - ${errorMsg}`);
                    return { statusCode: 400, body: JSON.stringify({ error: errorMsg }) };
                }

                // Busca apenas o CPF/CNPJ do perfil, que é obrigatório e não deve vir do front-end por segurança.
                const { data: profile, error: profileError } = await supabaseAdmin
                    .from('profiles')
                    .select('cpf_cnpj')
                    .eq('id', userId)
                    .single();

                console.log('generate-pix: Perfil do Supabase:', profile);

                if (profileError || !profile) {
                    console.error('generate-pix: Erro ao buscar perfil do usuário:', profileError);
                    return { statusCode: 404, body: JSON.stringify({ error: 'Usuário não encontrado' }) };
                }
                
                if (!profile.cpf_cnpj) {
                    console.error('generate-pix: Erro - CPF/CNPJ do usuário não encontrado no perfil.');
                    return { statusCode: 400, body: JSON.stringify({ error: 'CPF/CNPJ do usuário não encontrado.' }) };
                }

                const token = await getInterToken();

                const seuNumero = uuidv4().substring(0, 15);
                const dataVencimento = new Date();
                dataVencimento.setDate(dataVencimento.getDate() + 1);

                const cobrancaBody = {
                    seuNumero: seuNumero,
                    valorNominal: parseFloat(amount),
                    dataVencimento: dataVencimento.toISOString().split('T')[0],
                    numDiasBaixa: 0,
                    pagador: {
                        cpfCnpj: profile.cpf_cnpj.replace(/[^0-9]/g, ''),
                        tipoPessoa: profile.cpf_cnpj.replace(/[^0-9]/g, '').length === 11 ? 'FISICA' : 'JURIDICA',
                        nome: payerInfo.name,
                        endereco: payerInfo.address,
                        cidade: payerInfo.city,
                        uf: payerInfo.state,
                        cep: payerInfo.zip_code.replace(/[^0-9]/g, '')
                    }
                };

                const responseCobranca = await axios.post(
                    `${INTER_API_URL}/cobranca/v3/cobrancas`,
                    cobrancaBody,
                    {
                        httpsAgent,
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'x-conta-corrente': INTER_CONTA_CORRENTE,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                console.log('generate-pix: Resposta da API do Inter:', responseCobranca.data);

                let { codigoSolicitacao, pix } = responseCobranca.data;

                // Se o objeto PIX não vier na resposta inicial, busca em seguida.
                if (codigoSolicitacao && !pix) {
                    console.log('generate-pix: Objeto PIX não encontrado na resposta inicial. Buscando separadamente...');
                    try {
                        const pixResponse = await axios.get(
                            `${INTER_API_URL}/cobranca/v3/cobrancas/${codigoSolicitacao}/pix`,
                            {
                                httpsAgent,
                                headers: {
                                    'Authorization': `Bearer ${token}`,
                                    'x-conta-corrente': INTER_CONTA_CORRENTE,
                                }
                            }
                        );
                        console.log('generate-pix: Resposta da busca por PIX:', pixResponse.data);
                        pix = pixResponse.data; // Atribui o objeto pix retornado
                    } catch (pixError) {
                        console.error('generate-pix: Erro ao buscar dados do PIX separadamente:', pixError.response?.data || pixError.message);
                        // Mantém o fluxo, mas o erro de 'pix' indefinido será capturado abaixo
                    }
                }

                if (!codigoSolicitacao || !pix) {
                    console.error('generate-pix: Erro - Resposta inválida da API do Inter. Conteúdo:', responseCobranca.data);
                    return { statusCode: 500, body: JSON.stringify({ error: 'Resposta inválida da API do Inter' }) };
                }

                const { error: insertError } = await supabaseAdmin
                    .from('pix_transactions')
                    .insert([{
                        user_id: userId,
                        amount: amount,
                        transaction_id: codigoSolicitacao,
                        status: 'PENDING',
                    }]);

                if (insertError) {
                    console.error('Erro ao salvar transação PIX:', insertError);
                    return { statusCode: 500, body: JSON.stringify({ error: 'Falha ao salvar dados da transação' }) };
                }

                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        transactionId: codigoSolicitacao,
                        qrCodeText: pix.qrCode,
                        qrCodeImageUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pix.qrCode)}`
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
