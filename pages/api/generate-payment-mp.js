// API para gerar pagamentos no Mercado Pago (substitui generate-pix.js)
// Suporta PIX, cartão de crédito, boleto e outros métodos de pagamento

import axios from "axios";
import { v4 as uuidv4 } from "uuid";
import { createClient } from "@supabase/supabase-js";

// Variáveis de ambiente
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mercadoPagoAccessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
const mercadoPagoBaseUrl = process.env.MERCADO_PAGO_BASE_URL || "https://api.mercadopago.com"; // produção por padrão
const webhookUrl = process.env.WEBHOOK_URL; // URL do seu webhook

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("Erro Crítico: Variáveis de ambiente Supabase não configuradas.");
}
if (!mercadoPagoAccessToken) {
  console.error("Erro Crítico: Access Token do Mercado Pago não configurado (MERCADO_PAGO_ACCESS_TOKEN).");
}
if (!webhookUrl) {
  console.error("Aviso: URL do webhook não configurada (WEBHOOK_URL).");
}

// Cliente Supabase
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Método não permitido" });
  }

  const { 
    amount, 
    description, 
    userId, 
    paymentMethod = "pix", // pix, credit_card, debit_card, bank_transfer, ticket
    customerData,
    cardData, // Para pagamentos com cartão
    installments = 1 // Número de parcelas para cartão de crédito
  } = req.body;

  if (!amount || !description || !userId) {
    return res.status(400).json({ 
      success: false, 
      message: "Dados obrigatórios: amount, description, userId" 
    });
  }

  if (!mercadoPagoAccessToken) {
    return res.status(500).json({ 
      success: false, 
      message: "Configuração do Mercado Pago não encontrada" 
    });
  }

  try {
    const externalReference = uuidv4();
    
    // Salvar associação transação <-> usuário no Supabase
    await saveTransactionAssociation(externalReference, userId, amount, description);

    // Preparar dados do pagador
    const payer = {
      email: customerData?.email || "cliente@exemplo.com",
      identification: {
        type: "CPF",
        number: customerData?.cpf || "12345678909"
      },
      first_name: customerData?.firstName || "Cliente",
      last_name: customerData?.lastName || "Exemplo"
    };

    let paymentPayload;

    switch (paymentMethod) {
      case "pix":
        paymentPayload = createPixPaymentPayload(amount, description, payer, externalReference);
        break;
      case "credit_card":
        if (!cardData) {
          return res.status(400).json({ 
            success: false, 
            message: "Dados do cartão são obrigatórios para pagamento com cartão" 
          });
        }
        paymentPayload = createCreditCardPaymentPayload(amount, description, payer, cardData, installments, externalReference);
        break;
      case "debit_card":
        if (!cardData) {
          return res.status(400).json({ 
            success: false, 
            message: "Dados do cartão são obrigatórios para pagamento com débito" 
          });
        }
        paymentPayload = createDebitCardPaymentPayload(amount, description, payer, cardData, externalReference);
        break;
      case "ticket":
        paymentPayload = createTicketPaymentPayload(amount, description, payer, externalReference);
        break;
      default:
        return res.status(400).json({ 
          success: false, 
          message: "Método de pagamento não suportado" 
        });
    }

    // Adicionar URL de notificação se configurada
    if (webhookUrl) {
      paymentPayload.notification_url = webhookUrl;
    }

    // Fazer requisição para o Mercado Pago
    const response = await axios.post(
      `${mercadoPagoBaseUrl}/v1/payments`,
      paymentPayload,
      {
        headers: {
          Authorization: `Bearer ${mercadoPagoAccessToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": externalReference // Para evitar pagamentos duplicados
        }
      }
    );

    const payment = response.data;

    // Preparar resposta baseada no método de pagamento
    const responseData = {
      success: true,
      externalReference: externalReference,
      paymentId: payment.id,
      status: payment.status,
      paymentMethod: paymentMethod,
      amount: amount,
      currency: payment.currency_id
    };

    // Adicionar dados específicos do método de pagamento
    if (paymentMethod === "pix") {
      responseData.pixQrCode = payment.point_of_interaction?.transaction_data?.qr_code;
      responseData.pixQrCodeBase64 = payment.point_of_interaction?.transaction_data?.qr_code_base64;
      responseData.pixTicketUrl = payment.point_of_interaction?.transaction_data?.ticket_url;
    } else if (paymentMethod === "ticket") {
      responseData.ticketUrl = payment.transaction_details?.external_resource_url;
    }

    res.status(200).json(responseData);

  } catch (error) {
    console.error("Erro ao gerar pagamento no Mercado Pago:", error.response?.data || error.message);
    res.status(500).json({ 
      success: false, 
      message: "Falha ao gerar pagamento",
      error: error.response?.data || error.message
    });
  }
}

// Função para criar payload de pagamento PIX
function createPixPaymentPayload(amount, description, payer, externalReference) {
  return {
    transaction_amount: amount,
    description: description,
    payment_method_id: "pix",
    payer: payer,
    external_reference: externalReference
  };
}

// Função para criar payload de pagamento com cartão de crédito
function createCreditCardPaymentPayload(amount, description, payer, cardData, installments, externalReference) {
  return {
    transaction_amount: amount,
    description: description,
    payment_method_id: cardData.payment_method_id || "visa", // visa, master, amex, etc.
    token: cardData.token, // Token do cartão (deve ser gerado no frontend)
    installments: installments,
    payer: payer,
    external_reference: externalReference
  };
}

// Função para criar payload de pagamento com cartão de débito
function createDebitCardPaymentPayload(amount, description, payer, cardData, externalReference) {
  return {
    transaction_amount: amount,
    description: description,
    payment_method_id: cardData.payment_method_id || "debvisa", // debvisa, debmaster, etc.
    token: cardData.token, // Token do cartão (deve ser gerado no frontend)
    payer: payer,
    external_reference: externalReference
  };
}

// Função para criar payload de pagamento com boleto
function createTicketPaymentPayload(amount, description, payer, externalReference) {
  return {
    transaction_amount: amount,
    description: description,
    payment_method_id: "bolbradesco", // ou outro banco
    payer: {
      ...payer,
      address: {
        zip_code: "01310-100",
        street_name: "Av Paulista",
        street_number: 1000,
        neighborhood: "Bela Vista",
        city: "São Paulo",
        federal_unit: "SP"
      }
    },
    external_reference: externalReference
  };
}

// Função para salvar associação transação <-> usuário
async function saveTransactionAssociation(externalReference, userId, amount, description) {
  try {
    const { error } = await supabaseAdmin
      .from("payment_transactions")
      .insert({
        reference_id: externalReference,
        user_id: userId,
        amount: amount,
        description: description,
        status: "PENDING",
        created_at: new Date().toISOString()
      });

    if (error) {
      console.error("Erro ao salvar associação da transação:", error);
    }
  } catch (error) {
    console.error("Erro ao salvar associação da transação:", error);
  }
}
