-- Script de migração para suportar a nova integração Mercado Pago
-- Execute este script no seu banco Supabase

-- Criar tabela para rastrear transações de pagamento
CREATE TABLE IF NOT EXISTS payment_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    reference_id VARCHAR(255) UNIQUE NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    amount DECIMAL(10,2) NOT NULL,
    description TEXT,
    status VARCHAR(50) DEFAULT 'PENDING',
    charge_id VARCHAR(255),
    payment_method VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Adicionar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_payment_transactions_reference_id ON payment_transactions(reference_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id ON payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);

-- Adicionar coluna payment_method na tabela payments existente (se não existir)
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'pix';

-- Adicionar coluna reference_id na tabela payments existente (se não existir)
ALTER TABLE payments 
ADD COLUMN IF NOT EXISTS reference_id VARCHAR(255);

-- Criar índice para reference_id na tabela payments
CREATE INDEX IF NOT EXISTS idx_payments_reference_id ON payments(reference_id);

-- Comentários para documentação
COMMENT ON TABLE payment_transactions IS 'Tabela para rastrear transações de pagamento do Mercado Pago';
COMMENT ON COLUMN payment_transactions.reference_id IS 'ID de referência único gerado para cada transação (external_reference no Mercado Pago)';
COMMENT ON COLUMN payment_transactions.charge_id IS 'ID do pagamento retornado pelo Mercado Pago';
COMMENT ON COLUMN payment_transactions.payment_method IS 'Método de pagamento: pix, credit_card, debit_card, ticket, bank_transfer, etc.';
COMMENT ON COLUMN payment_transactions.status IS 'Status da transação: pending, approved, authorized, in_process, in_mediation, rejected, cancelled, refunded, charged_back';

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para atualizar updated_at automaticamente
DROP TRIGGER IF EXISTS update_payment_transactions_updated_at ON payment_transactions;
CREATE TRIGGER update_payment_transactions_updated_at
    BEFORE UPDATE ON payment_transactions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();