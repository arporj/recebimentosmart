const serverless = require('serverless-http');
const app = require('../../server/index'); // Importa seu app Express

module.exports.handler = serverless(app);