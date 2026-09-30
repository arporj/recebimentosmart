import { supabase } from '../supabase';
import { encerrarSerieAPartirDe } from './serieRecorrente';

export type DeleteScope = 'this' | 'following' | 'all';

interface DeleteOptions {
  transactionId: string;
  scope?: DeleteScope;
  /** Required for virtual instances — the date shown in the UI */
  instanceDate?: string;
  installmentCurrent?: number;
}

export async function deletarTransacao(
  transactionIdOrOptions: string | DeleteOptions,
  scopeArg: DeleteScope = 'this'
) {
  // Normalize arguments: support both old signature and new options object
  const opts: DeleteOptions =
    typeof transactionIdOrOptions === 'string'
      ? { transactionId: transactionIdOrOptions, scope: scopeArg }
      : transactionIdOrOptions;

  const { transactionId, scope = 'this', instanceDate, installmentCurrent } = opts;

  // 1. Fetch context
  const { data: current, error: fetchError } = await supabase
    .from('financial_transactions')
    .select('*')
    .eq('id', transactionId)
    .single();

  if (fetchError || !current) throw new Error('Erro ao buscar transação');

  const { modalidade, parent_id, date: currentDate } = current as unknown as {
    modalidade: 'unica' | 'parcelada' | 'recorrente';
    parent_id: string | null;
    date: string;
  };

  // Helper: determine the reference (parent) id for the recurrence chain
  const refId = parent_id || current.id;
  const effectiveDate = instanceDate || currentDate;

  let effectiveScope = scope;
  let motherDate: string | undefined;
  if (effectiveScope === 'following' || effectiveScope === 'all') {
    const parentRecord = parent_id
      ? (await supabase.from('financial_transactions').select('date').eq('id', parent_id).single()).data
      : current;
    motherDate = parentRecord?.date;

    if (effectiveScope === 'following' && parentRecord && effectiveDate <= parentRecord.date) {
      effectiveScope = 'all';
    }
  }

  const isShared = current.shared_status || current.shared_original_transaction_id || current.shared_by_user_id;

  // ── SCOPE: THIS ──────────────────────────────────────────────────────
  if (modalidade === 'unica' || effectiveScope === 'this') {
    // For single transactions, delete normally (physically if not shared, logically if shared)
    if (modalidade === 'unica') {
      if (isShared) {
        return supabase
          .from('financial_transactions')
          .update({ status: 'cancelled', shared_status: 'modified' })
          .eq('id', transactionId);
      }
      return supabase.from('financial_transactions').delete().eq('id', transactionId);
    }

    // Virtual instance: insert a physical "cancelled" blocker so the generator skips it
    const isVirtual = instanceDate && instanceDate !== currentDate;
    if (isVirtual) {
      // Build a blocker record from the parent
      const parentRecord = parent_id
        ? (await supabase.from('financial_transactions').select('*').eq('id', parent_id).single()).data
        : current;

      if (!parentRecord) throw new Error('Registro pai não encontrado');

      const { id: _id, created_at: _created_at, updated_at: _updated_at, ...parentFields } = parentRecord as unknown as Record<string, unknown>;

      return supabase.from('financial_transactions').insert({
        ...parentFields,
        date: instanceDate,
        status: 'cancelled',
        parent_id: refId,
        recurrence_enabled: false,
        installment_current: installmentCurrent || null,
        ...(isShared ? { shared_status: 'modified' } : {}),
      });
    }

    // Physical instance: soft-delete → mark as cancelled
    return supabase
      .from('financial_transactions')
      .update({ 
        status: 'cancelled',
        ...(isShared ? { shared_status: 'modified' } : {})
      })
      .eq('id', transactionId);
  }

  // ── SCOPE: ALL / FOLLOWING ───────────────────────────────────────────
  // Ambos encerram também os pedaços da mesma série criados por edições "este e os
  // futuros" anteriores (ver serieRecorrente.ts) — encerrar só a mãe da ocorrência
  // deixava esses pedaços ativos e o lançamento "excluído" continuava aparecendo.
  if (effectiveScope === 'all' || effectiveScope === 'following') {
    if (isShared && effectiveScope === 'all') {
      // Mantém a mãe compartilhada visível como cancelada para o outro usuário
      const { error: cancelMotherError } = await supabase
        .from('financial_transactions')
        .update({ status: 'cancelled', shared_status: 'modified' })
        .eq('id', refId);
      if (cancelMotherError) return { data: null, error: cancelMotherError };
    }

    try {
      await encerrarSerieAPartirDe({
        motherId: refId,
        userId: current.user_id,
        cutFrom: effectiveScope === 'all' ? (motherDate || currentDate) : effectiveDate,
        keepPaidChildren: false,
        cancelChildren: !!isShared,
      });
    } catch (error) {
      return { data: null, error };
    }

    return { data: null, error: null };
  }

  return { data: null, error: new Error('Escopo inválido') };
}
