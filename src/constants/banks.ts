export interface BrazilianBank {
  name: string;
  domain: string;
  color: string;
}

export const BRAZILIAN_BANKS: BrazilianBank[] = [
  { name: 'Banco Inter', domain: 'inter.co', color: '#ff7a00' },
  { name: 'Nubank', domain: 'nubank.com.br', color: '#8a05be' },
  { name: 'Itaú', domain: 'itau.com.br', color: '#ec7000' },
  { name: 'Bradesco', domain: 'bradesco.com.br', color: '#cc092f' },
  { name: 'Santander', domain: 'santander.com.br', color: '#ec0000' },
  { name: 'Banco do Brasil', domain: 'bb.com.br', color: '#fcf200' },
  { name: 'Caixa Econômica', domain: 'caixa.gov.br', color: '#105291' },
  { name: 'XP Investimentos', domain: 'xpi.com.br', color: '#000000' },
  { name: 'BTG Pactual', domain: 'btgpactual.com', color: '#000000' },
  { name: 'C6 Bank', domain: 'c6bank.com.br', color: '#252525' },
  { name: 'Porto Seguro', domain: 'portoseguro.com.br', color: '#004587' },
  { name: 'PagBank', domain: 'pagseguro.uol.com.br', color: '#53d21e' },
  { name: 'Neon', domain: 'neon.com.br', color: '#00e5ff' },
  { name: 'Banco Pan', domain: 'bancopan.com.br', color: '#00aff0' },
  { name: 'Digio', domain: 'digio.com.br', color: '#001e32' },
  { name: 'Mercado Pago', domain: 'mercadopago.com.br', color: '#009ee3' },
  { name: 'Avenue', domain: 'avenue.us', color: '#000000' },
  { name: 'Nomad', domain: 'nomadglobal.com', color: '#000000' },
];

/**
 * Infere inteligentemente um domínio provável a partir do nome da instituição.
 * Ex: "Banco da Galera" -> "bancodagalera.com.br"
 */
export const inferBankDomain = (name: string): string => {
  if (!name || name.trim().length === 0) return '';
  const clean = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .replace(/[^a-z0-9\s-]/g, "") // Remove caracteres especiais exceto espaço e hífen
    .trim()
    .replace(/[\s-]+/g, ""); // Remove espaços e hífens internos

  if (!clean) return '';
  return `${clean}.com.br`;
};
