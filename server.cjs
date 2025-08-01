require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');

// --- Configuração e Inicialização ---
const app = express();
const PORT = process.env.API_PORT || 3001;

// --- Variáveis de Ambiente ---
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const mercadoPagoAccessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
const mercadoPagoBaseUrl = process.env.MERCADO_PAGO_BASE_URL || 'https://api.mercadopago.com';
const webhookUrl = process.env.WEBHOOK_URL;

// Validação das Variáveis
if (!supabaseUrl || !supabaseServiceRoleKey || !mercadoPagoAccessToken) {
  console.error('ERRO CRÍTICO: Variáveis de ambiente essenciais (Supabase, Mercado Pago) não estão definidas. Verifique seu arquivo .env');
  process.exit(1); // Encerra o servidor se a configuração for inválida
}

// --- Middlewares ---
app.use(cors());
app.use(express.json());

// --- Cliente Supabase ---
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

// --- Iniciar Servidor ---
app.listen(PORT, () => {
  console.log(`Servidor de API rodando na porta ${PORT}`);
});
