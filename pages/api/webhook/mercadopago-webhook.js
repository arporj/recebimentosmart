// Webhook para receber notificações de pagamento do Mercado Pago
// Substitui o webhook do Banco Inter e suporta todos os métodos de pagamento

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import axios from "axios";

// Variáveis de ambiente
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mercadoPagoAccessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
const mercadoPagoBaseUrl = process.env.MERCADO_PAGO_BASE_URL || "https://api.mercadopago.com";
const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET; // Secret gerado no painel do Mercado Pago

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("Erro Crítico: Variáveis de ambiente Supabase não configuradas.");
}

// Cliente Supabase
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    console.log("Webhook Mercado Pago: Método não permitido recebido:", req.method);
    return res.status(405).json({ success: false, message: "Método não permitido" });
  }

  console.log("Webhook Mercado Pago: Notificação recebida.");

  try {
    // Validar autenticidade da notificação
    const isValid = await validateWebhookSignature(req);
    if (!isValid) {
      console.error("Webhook Mercado Pago: Falha na validação da assinatura.");
      return res.status(403).json({ success: false, message: "Assinatura inválida" });
    }

    const notification = req.body;
    
    // Verificar se é uma notificação de pagamento
    if (notification.type !== "payment") {
      console.log("Webhook Mercado Pago: Notificação não é de pagamento:", notification.type);
      return res.status(200).json({ success: true, message: "Notificação recebida mas não processada" });
    }

    const paymentId = notification.data?.id;
    if (!paymentId) {
      console.log("Webhook Mercado Pago: ID do pagamento não encontrado na notificação.");
      return res.status(200).json({ success: true, message: "ID do pagamento não encontrado" });
    }

    console.log(`Webhook Mercado Pago: Processando pagamento ${paymentId}`);

    // Buscar detalhes do pagamento na API do Mercado Pago
    const paymentDetails = await getPaymentDetails(paymentId);
    
    if (!paymentDetails) {
      console.error(`Webhook Mercado Pago: Não foi possível obter detalhes do pagamento ${paymentId}`);
      return res.status(200).json({ success: false, message: "Erro ao obter detalhes do pagamento" });
    }

    // Processar o pagamento
    await processPayment(paymentDetails);

    return res.status(200).json({ success: true, message: "Webhook processado com sucesso" });

  } catch (error) {
    console.error("Webhook Mercado Pago: Erro ao processar notificação:", error);
    return res.status(200).json({ success: false, message: "Erro interno ao processar webhook" });
  }
}

// Função para buscar detalhes do pagamento na API do Mercado Pago
async function getPaymentDetails(paymentId) {
  try {
    const response = await axios.get(
      `${mercadoPagoBaseUrl}/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${mercadoPagoAccessToken}`
        }
      }
    );

    return response.data;
  } catch (error) {
    console.error(`Erro ao buscar detalhes do pagamento ${paymentId}:`, error.response?.data || error.message);
    return null;
  }
}

// Função para processar um pagamento
async function processPayment(payment) {
  const paymentId = payment.id;
  const status = payment.status;
  const amount = payment.transaction_amount;
  const externalReference = payment.external_reference;
  const paymentMethodId = payment.payment_method_id;

  console.log(`Webhook Mercado Pago: Processando pagamento ${paymentId}, status ${status}, método ${paymentMethodId}`);

  try {
    // Buscar o usuário associado à transação
    const { data: transaction, error: transactionError } = await supabaseAdmin
      .from("payment_transactions")
      .select("user_id, amount, description")
      .eq("reference_id", externalReference)
      .single();

    if (transactionError || !transaction) {
      console.error(`Webhook Mercado Pago: Transação não encontrada para referência ${externalReference}:`, transactionError);
      return;
    }

    const userId = transaction.user_id;

    // Atualizar status da transação
    await updateTransactionStatus(externalReference, status, paymentId, paymentMethodId);

    // Se o pagamento foi aprovado, registrar no sistema
    if (isPaymentApproved(status)) {
      console.log(`Webhook Mercado Pago: Pagamento aprovado para usuário ${userId}, valor ${amount}`);

      // Registrar pagamento na tabela payments
      const { error: paymentError } = await supabaseAdmin
        .from("payments")
        .insert({
          user_id: userId,
          amount: amount,
          status: "completed",
          transaction_id: paymentId.toString(),
          payment_date: new Date().toISOString(),
          payment_method: paymentMethodId,
          reference_id: externalReference
        })
        .select()
        .maybeSingle();

      if (paymentError && paymentError.code !== "23505") { // Ignorar erro de duplicata
        console.error(`Webhook Mercado Pago: Erro ao registrar pagamento para ${paymentId}:`, paymentError);
      }

      // Aplicar créditos de referência (se aplicável)
      try {
        const { error: creditError } = await supabaseAdmin.rpc(
          "apply_referral_credit_multilevel",
          { p_referred_user_id: userId }
        );

        if (creditError) {
          console.error(`Webhook Mercado Pago: Erro ao aplicar créditos para usuário ${userId}:`, creditError);
        }
      } catch (creditError) {
        console.error(`Webhook Mercado Pago: Erro ao aplicar créditos para usuário ${userId}:`, creditError);
      }

      console.log(`Webhook Mercado Pago: Pagamento e créditos processados para usuário ${userId}, pagamento ${paymentId}`);
    } else {
      console.log(`Webhook Mercado Pago: Status ${status} não indica pagamento aprovado para pagamento ${paymentId}`);
    }

  } catch (error) {
    console.error(`Webhook Mercado Pago: Erro ao processar pagamento ${paymentId}:`, error);
  }
}

// Função para verificar se o pagamento foi aprovado
function isPaymentApproved(status) {
  const approvedStatuses = ["approved"];
  return approvedStatuses.includes(status);
}

// Função para atualizar status da transação
async function updateTransactionStatus(externalReference, status, paymentId, paymentMethodId) {
  try {
    const { error } = await supabaseAdmin
      .from("payment_transactions")
      .update({
        status: status,
        charge_id: paymentId.toString(),
        payment_method: paymentMethodId,
        updated_at: new Date().toISOString()
      })
      .eq("reference_id", externalReference);

    if (error) {
      console.error(`Webhook Mercado Pago: Erro ao atualizar status da transação ${externalReference}:`, error);
    }
  } catch (error) {
    console.error(`Webhook Mercado Pago: Erro ao atualizar status da transação ${externalReference}:`, error);
  }
}

// Função para validar assinatura do webhook
async function validateWebhookSignature(req) {
  if (!webhookSecret) {
    console.warn("Webhook Mercado Pago: Secret não configurado, pulando validação");
    return true; // Por enquanto, aceitar sem validação se não houver secret
  }

  try {
    const xSignature = req.headers["x-signature"];
    const xRequestId = req.headers["x-request-id"];
    
    if (!xSignature) {
      console.warn("Webhook Mercado Pago: Assinatura não encontrada no header");
      return false;
    }

    // Extrair timestamp e assinatura do header x-signature
    const parts = xSignature.split(",");
    let ts, v1;
    
    for (const part of parts) {
      const [key, value] = part.split("=");
      if (key === "ts") {
        ts = value;
      } else if (key === "v1") {
        v1 = value;
      }
    }

    if (!ts || !v1) {
      console.error("Webhook Mercado Pago: Timestamp ou assinatura não encontrados");
      return false;
    }

    // Construir template conforme documentação do Mercado Pago
    const dataId = req.query["data.id"] || "";
    const template = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

    // Gerar HMAC SHA256
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(template)
      .digest("hex");

    // Comparar assinaturas
    return expectedSignature === v1;

  } catch (error) {
    console.error("Webhook Mercado Pago: Erro ao validar assinatura:", error);
    return false;
  }
}

// Configuração para permitir body parsing
export const config = {
  api: {
    bodyParser: {
      sizeLimit: "1mb",
    },
  },
};
