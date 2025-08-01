const serverless = require('serverless-http');
const app = require('../../server'); // Caminho relativo para o seu arquivo index.js do Express

exports.handler = async (event, context) => {
  console.log('--- INÍCIO DA FUNÇÃO NETLIFY ---');
  console.log('Evento recebido (body):', event.body);
  console.log('Evento recebido (headers):', event.headers);
  console.log('express-api function invoked');
  return serverless(app)(event, context);
};