// Arquivo principal do servidor Express para RecebimentoSmart
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const webhookRoutes = require('./webhook/inter-pix');

// Carregar variáveis de ambiente
dotenv.config();

// Inicializar o app Express
const app = express();

// Middleware
app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*', // Permitir requisições do frontend
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rota de status/saúde
app.get('/', (req, res) => {
  res.json({ 
    status: 'online',
    message: 'RecebimentoSmart API está funcionando!',
    timestamp: new Date().toISOString()
  });
});

// Montar rotas de webhook
app.use('/webhooks/inter-pix', webhookRoutes);

// Montar rotas de autenticação
app.use('/api', authRoutes);

// Porta do servidor
const PORT = process.env.PORT || 3000;

// Iniciar o servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Webhook disponível em: http://localhost:${PORT}/webhooks/inter-pix`);
});
