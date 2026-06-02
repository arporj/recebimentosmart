import { supabase } from '../supabase';
import { format, subDays, parseISO } from 'date-fns';

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

  const { modalidade, parent_id, date: currentDate, recurrence_enabled } = current as any;

  // Helper: determine the reference (parent) id for the recurrence chain
  const refId = parent_id || current.id;
  const effectiveDate = instanceDate || currentDate;

  let effectiveScope = scope;
  if (effectiveScope === 'following') {
    const parentRecord = parent_id 
      ? (await supabase.from('financial_transactions').select('date').eq('id', parent_id).single()).data
      : current;
      
    if (parentRecord && effectiveDate <= parentRecord.date) {
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

      const { id, created_at, updated_at, ...parentFields } = parentRecord as any;

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

  // ── SCOPE: ALL ───────────────────────────────────────────────────────
  if (effectiveScope === 'all') {
    if (isShared) {
      return supabase
        .from('financial_transactions')
        .update({ status: 'cancelled', shared_status: 'modified' })
        .or(`id.eq.${refId},parent_id.eq.${refId}`);
    }
    // Delete the parent and all children
    return supabase
      .from('financial_transactions')
      .delete()
      .or(`id.eq.${refId},parent_id.eq.${refId}`);
  }

  // ── SCOPE: FOLLOWING ─────────────────────────────────────────────────
  if (effectiveScope === 'following') {
    const endDate = format(subDays(parseISO(effectiveDate), 1), 'yyyy-MM-dd');

    // Set recurrence_end_date on the parent to stop virtual generation
    await supabase
      .from('financial_transactions')
      .update({ recurrence_end_date: endDate })
      .eq('id', refId);

    // Delete all physical children on or after the effective date (logically if shared)
    if (isShared) {
      await supabase
        .from('financial_transactions')
        .update({ status: 'cancelled', shared_status: 'modified' })
        .or(`id.eq.${refId},parent_id.eq.${refId}`)
        .gte('date', effectiveDate);
    } else {
      await supabase
        .from('financial_transactions')
        .delete()
        .eq('parent_id', refId)
        .gte('date', effectiveDate);
    }

    return { data: null, error: null };
  }

  return { data: null, error: new Error('Escopo inválido') };
}
