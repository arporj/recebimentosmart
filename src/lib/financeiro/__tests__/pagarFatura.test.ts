import { describe, it, expect } from 'vitest';
import { calcularTotalOriginalFatura, type AcertoRow } from '../pagarFatura';

function acerto(overrides: Partial<AcertoRow>): AcertoRow {
  return { id: 'a-1', type: 'income', amount: 0, status: 'paid', ...overrides };
}

describe('calcularTotalOriginalFatura', () => {
  it('mantém o total quando a fatura não tem Acerto de Saldo', () => {
    expect(calcularTotalOriginalFatura(1200, [])).toBe(1200);
  });

  it('devolve o total original quando a fatura foi fechada por um valor MENOR (acerto de receita)', () => {
    // Fatura de 1000 fechada pagando 800 => acerto de receita de 200, total exibido vira 800.
    const acertos = [acerto({ type: 'income', amount: 200 })];
    expect(calcularTotalOriginalFatura(800, acertos)).toBe(1000);
  });

  it('devolve o total original quando a fatura foi fechada por um valor MAIOR (acerto de despesa)', () => {
    // Fatura de 1000 fechada pagando 1100 => acerto de despesa de 100, total exibido vira 1100.
    const acertos = [acerto({ type: 'expense', amount: 100 })];
    expect(calcularTotalOriginalFatura(1100, acertos)).toBe(1000);
  });

  it('desconta múltiplos acertos empilhados por fechamentos antigos', () => {
    // Ciclo reabrir → fechar de versões anteriores deixava mais de um acerto na mesma fatura.
    const acertos = [
      acerto({ id: 'a-1', type: 'income', amount: 200 }),
      acerto({ id: 'a-2', type: 'expense', amount: 50 }),
    ];
    expect(calcularTotalOriginalFatura(850, acertos)).toBe(1000);
  });

  it('é estável em edições sucessivas: o total original não muda conforme o valor pago', () => {
    // Após qualquer fechamento com acerto, o total exibido passa a ser igual ao valor pago.
    // A base de cálculo precisa continuar sendo 1000 em todas as edições.
    expect(calcularTotalOriginalFatura(800, [acerto({ type: 'income', amount: 200 })])).toBe(1000);
    expect(calcularTotalOriginalFatura(950, [acerto({ type: 'income', amount: 50 })])).toBe(1000);
    expect(calcularTotalOriginalFatura(1300, [acerto({ type: 'expense', amount: 300 })])).toBe(1000);
  });

  it('não acumula erro de ponto flutuante', () => {
    expect(calcularTotalOriginalFatura(0.1, [acerto({ type: 'income', amount: 0.2 })])).toBe(0.3);
  });
});
