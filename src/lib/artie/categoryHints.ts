// Artie — Categorização inteligente por histórico.
// A partir dos lançamentos já categorizados pelo usuário, produz dicas
// "descrição → categoria mais usada" injetadas no system prompt para que
// o modelo priorize o padrão do próprio usuário ao sugerir categoria
// (sempre com confirmação — a dica só melhora o palpite).

export interface CategoryHint {
  description: string;
  category: string;
}

const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Remove sufixo de parcela: "TV Samsung (3/10)" → "TV Samsung" */
const stripInstallmentSuffix = (s: string) => s.replace(/\s*\(\d+\/\d+\)\s*$/, '');

/**
 * Agrupa lançamentos por descrição normalizada e elege a categoria mais
 * frequente de cada grupo. Grupos com menos de 2 ocorrências são descartados
 * (uma ocorrência não é padrão). Categorias que não existem mais são ignoradas.
 */
export function buildCategoryHints(
  rows: Array<{ description: string | null; category_id: string | null }>,
  categories: Array<{ id: string; name: string }>,
  maxHints = 30,
): CategoryHint[] {
  const categoryNames = new Map(categories.map(c => [c.id, c.name]));

  // descrição normalizada -> (category_id -> ocorrências)
  const groups = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!row.description || !row.category_id || !categoryNames.has(row.category_id)) continue;
    const desc = normalize(stripInstallmentSuffix(row.description)).trim();
    if (!desc) continue;
    let counts = groups.get(desc);
    if (!counts) {
      counts = new Map();
      groups.set(desc, counts);
    }
    counts.set(row.category_id, (counts.get(row.category_id) || 0) + 1);
  }

  const ranked: Array<CategoryHint & { occurrences: number }> = [];
  for (const [description, counts] of groups) {
    let winnerId = '';
    let winnerCount = 0;
    let total = 0;
    for (const [categoryId, count] of counts) {
      total += count;
      if (count > winnerCount) {
        winnerCount = count;
        winnerId = categoryId;
      }
    }
    if (total < 2) continue;
    ranked.push({ description, category: categoryNames.get(winnerId)!, occurrences: total });
  }

  ranked.sort((a, b) => b.occurrences - a.occurrences);
  return ranked.slice(0, maxHints).map(({ description, category }) => ({ description, category }));
}
