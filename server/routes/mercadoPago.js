const express = require('express');
const router = express.Router();
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { supabase } = require('../lib/supabase');

// Variáveis de ambiente
const mercadoPagoAccessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
const mercadoPagoBaseUrl = process.env.MERCADO_PAGO_BASE_URL || "https://api.mercadopago.com";
const webhookUrl = process.env.WEBHOOK_URL;
const webhookSecret = process.env.MERCADO_PAGO_WEBHOOK_SECRET;

// Rota para buscar o nome de quem indicou através do código
router.get('/referrer-info/:referralCode', async (req, res) => {
    const { referralCode } = req.params;
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('name')
            .eq('referral_code', referralCode)
            .single();

        if (error || !profile) {
            return res.status(404).json({ success: false, message: "Código de indicação não encontrado." });
        }

        res.status(200).json({ success: true, name: profile.name });

    } catch (error) {
        console.error("Erro ao buscar informações do indicador:", error.message);
        res.status(500).json({ success: false, message: "Falha ao buscar informações do indicador." });
    }
});

// Rota para obter detalhes do pagamento
router.get('/payment-details/:userId', async (req, res) => {
    const { userId } = req.params;
    let baseFee = 35; // Valor padrão caso não encontre no DB
    let initialDiscount = 0;

    try {
        // Buscar o preço da assinatura do banco de dados
        const { data: settings, error: settingsError } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'subscription_price')
            .single();

        if (settingsError) console.error("Erro ao buscar subscription_price:", settingsError.message);
        if (settings && settings.value) {
            baseFee = parseFloat(settings.value);
        }

        // Verificar se este usuário foi indicado e se é o primeiro pagamento dele
        // Verificar se este usuário foi indicado e se é o primeiro pagamento dele
        const { data: referralCredit, error: referralError } = await supabase
            .from('referral_credits')
            .select('status')
            .eq('referred_user_id', userId)
            .single();

        // Se o usuário foi indicado e o crédito ainda está pendente, aplica o desconto inicial
        if (referralCredit && referralCredit.status === 'pending') {
            initialDiscount = baseFee * 0.20; // 20% de desconto
        }

        // Contar quantos créditos por indicação o usuário tem para usar
        const { count: paidReferrals, error: creditsError } = await supabase
            .from('referral_credits')
            .select('id', { count: 'exact' })
            .eq('referrer_user_id', userId)
            .eq('status', 'credited');

        if (creditsError) throw creditsError;

        const referralCreditsValue = (paidReferrals || 0) * (baseFee * 0.20);
        const totalDiscount = initialDiscount + referralCreditsValue;
        const amountToPay = Math.max(0, baseFee - totalDiscount);

        res.status(200).json({
            success: true,
            baseFee,
            totalCredits: totalDiscount,
            amountToPay,
            creditsUsed: paidReferrals || 0,
            initialDiscount: initialDiscount > 0
        });

    } catch (error) {
        console.error("Erro ao buscar detalhes de pagamento:", error.message);
        res.status(500).json({ success: false, message: "Falha ao buscar detalhes de pagamento", error: error.message });
    }
});

// Rota para obter estatísticas de indicação
router.get('/referral-stats/:userId', async (req, res) => {
    const { userId } = req.params;

    try {
        // 1. Obter o código de indicação do usuário
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('referral_code')
            .eq('id', userId)
            .single();

        if (profileError) throw profileError;

        const referralLink = `https://www.recebimentosmart.com.br/cadastro?ref=${profile.referral_code}`;

        // 2. Contar total de usuários cadastrados com o código
        const { count: totalRegistered, error: totalError } = await supabase
            .from('referrals') // Alterado para a tabela 'referrals'
            .select('*', { count: 'exact', head: true })
            .eq('referrer_id', userId); // Alterado para 'referrer_id'

        if (totalError) throw totalError;

        // 3. Contar total de usuários que pagaram (status 'credited' ou 'used')
        const { count: totalPaid, error: paidError } = await supabase
            .from('referral_credits')
            .select('*', { count: 'exact', head: true })
            .eq('referrer_user_id', userId)
            .in('status', ['credited', 'used']);
        
        if (paidError) throw paidError;

        // 4. Contar créditos disponíveis (status 'credited')
        const { count: availableCredits, error: creditsError } = await supabase
            .from('referral_credits')
            .select('*', { count: 'exact', head: true })
            .eq('referrer_user_id', userId)
            .eq('status', 'credited');

        if (creditsError) throw creditsError;

        res.status(200).json({
            success: true,
            referralLink,
            totalRegistered: totalRegistered || 0,
            totalPaid: totalPaid || 0,
            availableCredits: availableCredits || 0,
        });

    } catch (error) {
        console.error("Erro ao buscar estatísticas de indicação:", error.message);
        res.status(500).json({ success: false, message: "Falha ao buscar estatísticas de indicação", error: error.message });
    }
});


// Rota para gerar um novo pagamento
router.post('/generate-payment-mp', async (req, res) => {
    const { 
        amount, 
        description, 
        userId, 
        customerData
    } = req.body;

    if (!amount || !description || !userId) {
        return res.status(400).json({ success: false, message: "Dados obrigatórios: amount, description, userId" });
    }

    try {
        const externalReference = uuidv4();
        await saveTransactionAssociation(externalReference, userId, amount, description);

        const payer = {
            email: customerData?.email || "cliente@exemplo.com",
            identification: { type: "CPF", number: customerData?.cpf || "12345678909" },
            first_name: customerData?.firstName || "Cliente",
            last_name: customerData?.lastName || "Exemplo"
        };

        const paymentPayload = createPixPaymentPayload(amount, description, payer, externalReference);

        if (webhookUrl) {
            paymentPayload.notification_url = webhookUrl;
        }

        const response = await axios.post(`${mercadoPagoBaseUrl}/v1/payments`, paymentPayload, {
            headers: {
                Authorization: `Bearer ${mercadoPagoAccessToken}`,
                "Content-Type": "application/json",
                "X-Idempotency-Key": externalReference
            }
        });

        const payment = response.data;
        const responseData = {
            success: true,
            paymentId: payment.id,
            status: payment.status,
            paymentMethod: 'pix',
            pixQrCode: payment.point_of_interaction?.transaction_data?.qr_code,
            pixQrCodeBase64: payment.point_of_interaction?.transaction_data?.qr_code_base64
        };

        res.status(200).json(responseData);

    } catch (error) {
        console.error("Erro ao gerar pagamento no Mercado Pago:", error.response?.data || error.message);
        res.status(500).json({ success: false, message: "Falha ao gerar pagamento", error: error.response?.data || error.message });
    }
});

// Rota para o webhook
router.post('/webhook', async (req, res) => {
    console.log('--- INÍCIO DO WEBHOOK ---');
    console.log('Webhook recebido (body):', req.body);
    console.log('Headers do Webhook:', req.headers);
    try {
        const isValid = await validateWebhookSignature(req);
        if (!isValid) {
            console.warn('Webhook: Assinatura inválida ou secreta não configurada.');
            return res.status(403).json({ success: false, message: "Assinatura inválida ou secreta não configurada" });
        }

        const notification = req.body;
        console.log('Webhook: Tipo de notificação recebida:', notification.type);

        if (notification.type !== "payment") {
            console.log('Webhook: Notificação não é de pagamento, ignorando.');
            return res.status(200).json({ success: true, message: "Notificação não é de pagamento" });
        }

        const paymentId = notification.data?.id;
        if (!paymentId) {
            console.warn('Webhook: ID do pagamento não encontrado na notificação.');
            return res.status(200).json({ success: true, message: "ID do pagamento não encontrado" });
        }

        console.log(`Webhook: Processando pagamento com ID: ${paymentId}`);
        const paymentDetails = await getPaymentDetails(paymentId);

        if (paymentDetails) {
            console.log('Webhook: Detalhes do pagamento obtidos, iniciando processamento...');
            await processPayment(paymentDetails);
        } else {
            console.warn(`Webhook: Não foi possível obter detalhes para o pagamento ID: ${paymentId}`);
        }

        res.status(200).json({ success: true, message: "Webhook processado com sucesso" });

    } catch (error) {
        console.error("Webhook Mercado Pago: Erro ao processar notificação:", error.message, error.stack);
        res.status(200).json({ success: false, message: "Erro interno ao processar webhook" });
    }
});

// --- Funções Auxiliares ---

async function saveTransactionAssociation(externalReference, userId, amount, description) {
    const { error } = await supabase
      .from("payment_transactions")
      .insert({ reference_id: externalReference, user_id: userId, amount, description, status: "PENDING" });
    if (error) console.error("Erro ao salvar associação da transação:", error);
}

function createPixPaymentPayload(amount, description, payer, externalReference) {
    return { transaction_amount: amount, description, payment_method_id: "pix", payer, external_reference: externalReference };
}

async function getPaymentDetails(paymentId) {
    try {
        const response = await axios.get(`${mercadoPagoBaseUrl}/v1/payments/${paymentId}`, { headers: { Authorization: `Bearer ${mercadoPagoAccessToken}` } });
        return response.data;
    } catch (error) {
        console.error(`Erro ao buscar detalhes do pagamento ${paymentId}:`, error.response?.data || error.message);
        return null;
    }
}

async function processPayment(payment) {
    console.log('Iniciando processamento do pagamento:', payment);
    const { id, status, transaction_amount, external_reference, payment_method_id } = payment;

    const { data: transaction } = await supabase.from("payment_transactions").select("user_id").eq("reference_id", external_reference).single();
    if (!transaction) {
        console.log('Transação não encontrada para external_reference:', external_reference);
        return;
    }
    console.log('Transação encontrada:', transaction);

    const { error: updateTransactionError } = await supabase.from("payment_transactions").update({ status, charge_id: id.toString(), payment_method: payment_method_id }).eq("reference_id", external_reference);
    if (updateTransactionError) {
        console.error('Erro ao atualizar status da transação:', updateTransactionError);
        return;
    }
    console.log('Status da transação atualizado para:', status);

    if (status === 'approved') {
        console.log('Pagamento aprovado. Inserindo registro de pagamento e atualizando validade.');
        // Insere o registro de pagamento
        const { error: insertPaymentError } = await supabase.from("payments").insert({ 
            user_id: transaction.user_id, 
            amount: transaction_amount, 
            status: "completed", 
            transaction_id: id.toString(), 
            payment_method: payment_method_id, 
            reference_id: external_reference 
        });
        if (insertPaymentError) {
            console.error('Erro ao inserir registro de pagamento:', insertPaymentError);
            return;
        }
        console.log('Registro de pagamento inserido.');

        // Calcula a nova data de validade (30 dias a partir de hoje)
        const newExpiryDate = new Date();
        newExpiryDate.setDate(newExpiryDate.getDate() + 30);

        // Atualiza o perfil do usuário com a nova data de validade
        const { error: updateProfileError } = await supabase
            .from('profiles')
            .update({ valid_until: newExpiryDate.toISOString() })
            .eq('id', transaction.user_id);

        if (updateProfileError) {
            console.error("Erro ao atualizar a data de validade do usuário:", updateProfileError);
        } else {
            console.log(`Data de validade atualizada para o usuário ${transaction.user_id}: ${newExpiryDate.toISOString()}`);
        }

        // Chamar RPC de crédito de referência se necessário
    }
}

async function validateWebhookSignature(req) {
    if (!webhookSecret) return true; // Pular se não houver secret
    const signature = req.headers['x-signature'];
    const requestId = req.headers['x-request-id'];
    const dataId = req.query["data.id"] || "";
    if (!signature || !requestId) return false;

    const [ts, v1] = signature.split(",").map(part => part.split("=")[1]);
    const template = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const expectedSignature = crypto.createHmac("sha256", webhookSecret).update(template).digest("hex");
    return expectedSignature === v1;
}

// Rota para criar uma preferência de pagamento
router.post('/create-preference', async (req, res) => {
    const { title, unit_price, quantity, userId, deviceId } = req.body;

    if (!title || !unit_price || !quantity || !userId) {
        return res.status(400).json({ success: false, message: "Dados obrigatórios: title, unit_price, quantity, userId" });
    }

    try {
        // Buscar dados do usuário para o payer
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('email, raw_user_meta_data->>name as name')
            .eq('id', userId)
            .single();

        if (userError) {
            throw new Error('Usuário não encontrado para adicionar como pagador.');
        }

        // Dados hard coded para teste Mercado Pago
        const preferencePayload = {
            items: [
                {
                    id: "TEST_ITEM_001",
                    title: title || "Teste Mercado Pago",
                    description: "Pagamento de teste Mercado Pago",
                    category_id: "others",
                    unit_price: unit_price,
                    quantity: quantity,
                },
            ],
            payer: {
                id: "2541606571",
                email: "test_user_1191943637@testuser.com",
                first_name: "TESTUSER1191943637",
                last_name: "CompradorTeste",
                identification: {
                    type: "CPF",
                    number: "12345678909"
                },
                address: {
                    street_name: "Rua Teste",
                    street_number: 123,
                    zip_code: "01000-000"
                }
            },
            back_urls: {
                success: "https://www.recebimentosmart.com.br/payment-success",
                failure: "https://www.recebimentosmart.com.br/payment-failure",
                pending: "https://www.recebimentosmart.com.br/payment-pending",
            },
            auto_return: 'approved',
            external_reference: uuidv4(), // Associar a transação ao usuário
            statement_descriptor: "RECEBIMENTO SMART",
            metadata: deviceId ? { device_id: deviceId } : undefined
        };

        if (webhookUrl) {
            preferencePayload.notification_url = webhookUrl;
        }

        // Usar access token do vendedor de teste fornecido
        const TEST_SELLER_ACCESS_TOKEN = "TEST-6058466609332947-072217-b82dec033b5106f14bdb573acc981ed9-6402098";
        const response = await axios.post(`${mercadoPagoBaseUrl}/checkout/preferences`, preferencePayload, {
            headers: {
                Authorization: `Bearer ${TEST_SELLER_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
        });

        const preference = response.data;

        // Salvar a associação da preferência com o usuário no seu banco de dados
        await saveTransactionAssociation(preferencePayload.external_reference, userId, unit_price * quantity, title);

        // Retorna o init_point correto (sandbox ou produção)
        res.status(201).json({
            success: true,
            preferenceId: preference.id,
            init_point: preference.sandbox_init_point || preference.init_point,
        });

    } catch (error) {
        console.error("Erro ao criar preferência no Mercado Pago:", error.response?.data || error.message);
        res.status(500).json({ success: false, message: "Falha ao criar preferência", error: error.response?.data || error.message });
    }
});

module.exports = router;
