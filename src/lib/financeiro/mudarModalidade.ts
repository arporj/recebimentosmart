import { supabase } from '../supabase';
import { criarTransacao, type TransactionInput } from './criarTransacao';
import type { TransactionUpdate } from './editarTransacao';

const LIQUIDATED_STATUSES = ['paid', 'partial'];

/**
 * Troca a modalidade de uma transação: apaga a parte pendente/futura da série
 * (a partir da ocorrência editada) e reconstrói do zero com criarTransacao(),
 * reutilizando toda a lógica de criação por modalidade já existente.
 *
 * Histórico liquidado (paid/partial) e tudo que aconteceu antes da ocorrência
 * editada nunca é tocado. scope ('this'/'following'/'all') é ignorado de
 * propósito: uma mudança estrutural de modalidade sempre age da ocorrência
 * editada em diante, como o modo 'following' já faz para outras edições.
 */
export async function mudarModalidadeTransacao(
  transactionId: string,
  current: any,
  cleanUpdate: TransactionUpdate & { tags?: string[]; type?: string }
) {
  // Templates nunca representam dinheiro real (quem é pago são os filhos
  // físicos) — não usar o status "cru" do template para não bloquear a
  // edição de ocorrências virtuais cujo template tenha nascido com status
  // herdado de criarTransacao.
  const effectiveStatus = current.is_template ? 'pending' : current.status;
  if (LIQUIDATED_STATUSES.includes(effectiveStatus)) {
    throw new Error(
      'Não é possível alterar a modalidade de um lançamento já pago ou parcialmente pago. ' +
      'Edite uma ocorrência pendente da série, ou apague e recrie o lançamento.'
    );
  }

  let rootId: string;
  if (current.modalidade === 'recorrente') {
    rootId = current.is_template ? current.id : (current.parent_id || current.id);
  } else if (current.modalidade === 'parcelada') {
    rootId = current.parent_id || current.id;
  } else {
    rootId = current.id;
  }

  const { data: seriesRows, error: seriesError } = await supabase
    .from('financial_transactions')
    .select('*')
    .or(`id.eq.${rootId},parent_id.eq.${rootId}`);

  if (seriesError) throw seriesError;
  const rows = seriesRows && seriesRows.length > 0 ? seriesRows : [current];

  // shared_original_transaction_id é ponteiro durável usado por
  // SharerStatementModalV2 — não pode ser recriado com IDs novos.
  const isShared = rows.some(
    (r: any) => r.shared_status || r.shared_original_transaction_id || r.shared_by_user_id
  );
  if (isShared) {
    throw new Error(
      'Não é possível alterar a modalidade de uma transação compartilhada. ' +
      'Desvincule o compartilhamento ou exclua e recrie o lançamento manualmente.'
    );
  }

  // Preferir cleanUpdate.date (sempre enviado pela UI e correto mesmo quando
  // o id editado é o de um template representando uma ocorrência virtual
  // futura) a current.date (que, nesse caso, seria a data-âncora original da
  // série, não a da ocorrência que o usuário está vendo).
  const anchorDate: string = cleanUpdate.date || current.date;

  const idsToDelete = rows
    .filter((r: any) => {
      if (r.is_template) return true; // o "contrato" antigo é sempre encerrado
      if (LIQUIDATED_STATUSES.includes(r.status)) return false; // nunca mexe em histórico liquidado
      return r.date >= anchorDate; // preserva tudo antes da ocorrência editada
    })
    .map((r: any) => r.id);

  if (idsToDelete.length > 0) {
    const { error: deleteError } = await supabase
      .from('financial_transactions')
      .delete()
      .in('id', idsToDelete);
    if (deleteError) throw deleteError;
  }
  // Linhas preservadas cujo parent_id apontava para uma linha apagada (ex.:
  // uma ocorrência futura já paga) ficam com parent_id = NULL automaticamente
  // (FK ON DELETE SET NULL) — sem necessidade de re-parenting manual.

  let tags = cleanUpdate.tags;
  if (tags === undefined) {
    const { data: existingTagLinks } = await supabase
      .from('transaction_tags')
      .select('tag_id')
      .eq('transaction_id', transactionId);
    tags = (existingTagLinks || []).map((t: any) => t.tag_id);
  }

  const input: TransactionInput = {
    description: cleanUpdate.description ?? current.description,
    amount: cleanUpdate.amount ?? current.amount,
    type: (cleanUpdate.type ?? current.type) as TransactionInput['type'],
    date: anchorDate,
    category_id: cleanUpdate.category_id ?? current.category_id ?? undefined,
    account_id: cleanUpdate.account_id ?? current.account_id ?? undefined,
    destination_account_id:
      cleanUpdate.destination_account_id ?? current.destination_account_id ?? undefined,
    client_id: cleanUpdate.client_id ?? current.client_id ?? undefined,
    modalidade: cleanUpdate.modalidade!,
    installment_total:
      cleanUpdate.modalidade === 'parcelada' ? (cleanUpdate.installment_total || 2) : undefined,
    recurrence_period:
      cleanUpdate.modalidade === 'parcelada' || cleanUpdate.modalidade === 'recorrente'
        ? cleanUpdate.recurrence_period || 'monthly'
        : undefined,
    start_installment: 1,
    is_total_value: false,
    due_day:
      cleanUpdate.modalidade === 'recorrente'
        ? cleanUpdate.due_day || new Date(anchorDate + 'T12:00:00').getDate()
        : undefined,
    recurrence_interval: cleanUpdate.recurrence_interval ?? current.recurrence_interval ?? 1,
    invoice_month: undefined, // deixa criarTransacao/trigger recalcular
    card_holder_name: cleanUpdate.card_holder_name ?? current.card_holder_name ?? null,
    status: 'pending',
    tags,
    auto_confirm: current.auto_confirm ?? false,
  };

  const { data, error } = await criarTransacao(input);
  if (error) throw error;

  return { data, error: null };
}
