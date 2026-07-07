// Regressão: essa exata feature (empurrar lançamento atrasado de mês fechado pra hoje, com
// bolinha vermelha + badge de dias) já foi ativada/desativada 3x no histórico do projeto —
// a última remoção (de5033f) foi porque a versão antiga corrompia o Resumo Mensal/saldo
// previsto ao mudar instanceDate sem excluir a linha dos totais. Ver overdueRolloverInstances
// em FinancialTransactionsV2.tsx: reusa o rollover já testado de instanceExpansion.ts, mas
// filtrado só para itens de meses JÁ FECHADOS e nunca incluído em monthInstances/totals.
import { describe, it, expect } from 'vitest';
import { parseISO, isSameMonth } from 'date-fns';
import { expandTransactionInstances } from '../instanceExpansion';

describe('overdueRolloverInstances (lógica de FinancialTransactionsV2)', () => {
  const today = new Date(2026, 6, 7, 12, 0, 0); // 07/07/2026 local
  const currentMonth = new Date(2026, 6, 1); // mês visualizado = mês real atual (julho)

  function computeOverdueRollover(transactions: any[]) {
    const rolled = expandTransactionInstances(transactions, [], {
      horizonEnd: new Date(2026, 6, 31),
      rollOverUnpaidToToday: true,
      today,
    });
    return rolled.filter(t =>
      t.originalInstanceDate !== t.instanceDate &&
      !isSameMonth(parseISO(t.originalInstanceDate), currentMonth)
    );
  }

  it('empurra pra hoje um lançamento pendente de um mês já fechado (junho)', () => {
    const txs = [
      { id: 'a', type: 'expense', amount: 250, date: '2026-06-07', status: 'pending' },
    ];
    const result = computeOverdueRollover(txs as any);
    expect(result).toHaveLength(1);
    expect(result[0].instanceDate).toBe('2026-07-07');
    expect(result[0].originalInstanceDate).toBe('2026-06-07');
  });

  it('não empurra um lançamento já pago', () => {
    const txs = [
      { id: 'b', type: 'expense', amount: 250, date: '2026-06-07', status: 'paid' },
    ];
    expect(computeOverdueRollover(txs as any)).toHaveLength(0);
  });

  it('não empurra um lançamento pendente do MESMO mês visualizado (julho)', () => {
    const txs = [
      { id: 'c', type: 'expense', amount: 100, date: '2026-07-03', status: 'pending' },
    ];
    expect(computeOverdueRollover(txs as any)).toHaveLength(0);
  });

  it('não empurra uma despesa de cartão de crédito (tratada pela linha-resumo de Fatura)', () => {
    const txs = [
      { id: 'd', type: 'expense', amount: 100, date: '2026-06-10', status: 'pending', account_type: 'credit_card' },
    ];
    expect(computeOverdueRollover(txs as any)).toHaveLength(0);
  });

  it('não empurra um lançamento pendente futuro', () => {
    const txs = [
      { id: 'e', type: 'expense', amount: 100, date: '2026-08-15', status: 'pending' },
    ];
    expect(computeOverdueRollover(txs as any)).toHaveLength(0);
  });
});
