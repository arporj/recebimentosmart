exports.handler = async (event, context) => {
  console.log('--- TESTE DE LOG SIMPLES DA FUNÇÃO NETLIFY ---');
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Função Netlify de teste executada com sucesso!' }),
  };
};