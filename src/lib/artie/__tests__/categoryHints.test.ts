import { describe, it, expect } from 'vitest';
import { buildCategoryHints } from '../categoryHints';

const categories = [
  { id: 'cat-transporte', name: 'Transporte' },
  { id: 'cat-alimentacao', name: 'Alimentação' },
];

describe('buildCategoryHints', () => {
  it('elege a categoria mais frequente por descrição', () => {
    const rows = [
      { description: 'Posto BR', category_id: 'cat-transporte' },
      { description: 'posto br', category_id: 'cat-transporte' },
      { description: 'Posto BR', category_id: 'cat-alimentacao' },
    ];
    const hints = buildCategoryHints(rows, categories);
    expect(hints).toEqual([{ description: 'posto br', category: 'Transporte' }]);
  });

  it('descarta descrições com uma única ocorrência', () => {
    const rows = [
      { description: 'Compra avulsa', category_id: 'cat-alimentacao' },
      { description: 'Mercado', category_id: 'cat-alimentacao' },
      { description: 'Mercado', category_id: 'cat-alimentacao' },
    ];
    const hints = buildCategoryHints(rows, categories);
    expect(hints).toEqual([{ description: 'mercado', category: 'Alimentação' }]);
  });

  it('remove sufixo de parcela e normaliza acentos ao agrupar', () => {
    const rows = [
      { description: 'TV Samsung (1/10)', category_id: 'cat-alimentacao' },
      { description: 'TV Samsung (2/10)', category_id: 'cat-alimentacao' },
    ];
    const hints = buildCategoryHints(rows, categories);
    expect(hints).toEqual([{ description: 'tv samsung', category: 'Alimentação' }]);
  });

  it('ignora lançamentos de categorias que não existem mais', () => {
    const rows = [
      { description: 'Antigo', category_id: 'cat-removida' },
      { description: 'Antigo', category_id: 'cat-removida' },
    ];
    expect(buildCategoryHints(rows, categories)).toEqual([]);
  });

  it('ignora linhas sem descrição ou sem categoria', () => {
    const rows = [
      { description: null, category_id: 'cat-transporte' },
      { description: 'Uber', category_id: null },
      { description: 'Uber', category_id: 'cat-transporte' },
      { description: 'Uber', category_id: 'cat-transporte' },
    ];
    expect(buildCategoryHints(rows, categories)).toEqual([
      { description: 'uber', category: 'Transporte' },
    ]);
  });

  it('respeita o limite máximo, ordenando por frequência', () => {
    const rows = [
      { description: 'A', category_id: 'cat-transporte' },
      { description: 'A', category_id: 'cat-transporte' },
      { description: 'A', category_id: 'cat-transporte' },
      { description: 'B', category_id: 'cat-alimentacao' },
      { description: 'B', category_id: 'cat-alimentacao' },
    ];
    const hints = buildCategoryHints(rows, categories, 1);
    expect(hints).toEqual([{ description: 'a', category: 'Transporte' }]);
  });
});
