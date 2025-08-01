const serverless = require('serverless-http');
const app = require('../../server'); // Caminho relativo para o seu arquivo index.js do Express

exports.handler = serverless(app);