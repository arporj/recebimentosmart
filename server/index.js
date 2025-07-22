const dotenv = require('dotenv');
const path = require('path');

// Carrega as variáveis de ambiente ANTES de qualquer outro módulo que possa usá-las
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const cors = require('cors');
const authRoutes = require('./routes/auth');
const mercadoPagoRoutes = require('./routes/mercadoPago'); // Novas rotas

// Inicializar o app Express
const app = express();

// Middleware
app.use(express.json());
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
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

// Montar rotas
app.use('/api', authRoutes);
app.use('/api/mp', mercadoPagoRoutes); // Usando as novas rotas do Mercado Pago

// Porta do servidor
const PORT = process.env.PORT || 3000;

// Iniciar o servidor
// app.listen(PORT, () => {
//   console.log(`Servidor rodando na porta ${PORT}`);
//   console.log(`Webhook do Mercado Pago disponível em: http://localhost:${PORT}/api/mp/webhook`);
// });

module.exports = app;