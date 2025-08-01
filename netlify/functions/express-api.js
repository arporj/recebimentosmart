const serverless = require('serverless-http');
const app = require('../../server'); // Caminho relativo para o seu arquivo index.js do Express

exports.handler = async (event, context) => {
  console.log('--- INÍCIO DA FUNÇÃO NETLIFY ---');
  console.log('Evento COMPLETO recebido:', JSON.stringify(event, null, 2));
  console.log('express-api function invoked');
  return serverless(app)(event, context);
};