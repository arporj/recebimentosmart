// Função para formatar um valor numérico para o padrão de moeda BRL (Real Brasileiro).
export const formatCurrency = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined || value === '') return 'R$ 0,00';

  const numericValue = typeof value === 'string' ? parseFloat(value.replace(',', '.')) : value;

  if (isNaN(numericValue)) return 'R$ 0,00';

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(numericValue);
};

// Função para manipular a entrada de valores monetários em um input, aplicando uma máscara.
export const handleCurrencyInputChange = (e: React.ChangeEvent<HTMLInputElement>): string => {
  let value = e.target.value;
  value = value.replace(/\D/g, ''); // Remove tudo que não é dígito

  if (value === '') return '';

  // Converte para número, divide por 100 para ter os centavos
  const numberValue = parseInt(value, 10) / 100;

  // Formata como string no padrão brasileiro, mas sem o símbolo da moeda para edição
  const formattedValue = numberValue.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return formattedValue;
};

// Função para converter a string de moeda formatada (ex: "35,50") de volta para um número (ex: 35.50)
export const parseCurrency = (value: string): number => {
  if (!value) return 0;
  // Remove o ponto de milhar e substitui a vírgula decimal por ponto
  const cleanedValue = value.replace(/\./g, '').replace(',', '.');
  return parseFloat(cleanedValue);
};
