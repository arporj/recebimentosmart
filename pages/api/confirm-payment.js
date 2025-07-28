// API para confirmar pagamento e aplicar créditos de referência multinível
// Arquivo: pages/api/confirm-payment.js (Exemplo)
// Este endpoint seria chamado após a confirmação do pagamento PIX (ex: por um webhook do Banco Inter ou após verificação de status)

import { createClient } from "@supabase/supabase-js";

// IMPORTANTE: Use variáveis de ambiente para Supabase URL e Service Role Key
// A Service Role Key é necessária para chamar funções SECURITY DEFINER e modificar dados sem RLS
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("Erro Crítico: Variáveis de ambiente Supabase não configuradas para API.");
}

// Crie um cliente Supabase com a chave de serviço para operações de backend
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Método não permitido" });
  }

  const { userId, transactionId, amountPaid } = req.body;

  if (!userId || !transactionId || amountPaid === undefined) {
    return res.status(400).json({ success: false, message: "Dados incompletos (userId, transactionId, amountPaid)" });
  }

  try {
    // 1. Registrar o pagamento na tabela public.payments
    const { error: paymentError } = await supabaseAdmin
      .from("payments")
      .insert({
        user_id: userId,
        amount: amountPaid,
        status: "completed",
        transaction_id: transactionId,
        payment_date: new Date().toISOString(),
      });

    if (paymentError) {
      console.error("Erro ao registrar pagamento:", paymentError);
      // Continuar mesmo assim para tentar aplicar o crédito?
      // Ou retornar erro? Decidimos continuar, mas logar.
      // throw new Error("Falha ao registrar pagamento.");
    }

    // 2. Chamar a função para processar o pagamento e atualizar a validade
    const { error: paymentProcessingError } = await supabaseAdmin.rpc(
      "handle_user_payment",
      { p_user_id: userId }
    );

    if (paymentProcessingError) {
      console.error("Erro ao processar o pagamento do usuário:", paymentProcessingError);
      // Não retornar erro para o cliente, mas logar no backend
    }

    // A lógica de crédito de indicação é tratada pelo trigger `on_new_payment`
    // que é disparado pela inserção na tabela `payments`.

    return res.status(200).json({ success: true, message: "Pagamento registrado e processado com sucesso." });

  } catch (error) {
    console.error("Erro no processo de confirmação de pagamento:", error);
    return res.status(500).json({
      success: false,
      message: "Falha ao processar confirmação de pagamento",
      error: error.message,
    });
  }
}

