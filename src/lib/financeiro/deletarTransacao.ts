import { supabase } from '../supabase';
import { format, subDays, parseISO } from 'date-fns';

export type DeleteScope = 'this' | 'following' | 'all';

interface DeleteOptions {
  transactionId: string;
  scope?: DeleteScope;
  /** Required for virtual instances — the date shown in the UI */
  instanceDate?: string;
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

  const { transactionId, scope = 'this', instanceDate } = opts;

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

  // ── SCOPE: THIS ──────────────────────────────────────────────────────
  if (modalidade === 'unica' || effectiveScope === 'this') {
    // For single transactions, just delete normally
    if (modalidade === 'unica') {
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
      });
    }

    // Physical instance: soft-delete → mark as cancelled
    return supabase
      .from('financial_transactions')
      .update({ status: 'cancelled' })
      .eq('id', transactionId);
  }

  // ── SCOPE: ALL ───────────────────────────────────────────────────────
  if (effectiveScope === 'all') {
    // Check if any record in the chain is already paid
    const { data: chainRecords } = await supabase
      .from('financial_transactions')
      .select('id, status')
      .or(`id.eq.${refId},parent_id.eq.${refId}`);

    const hasPaidRecords = chainRecords?.some((r: any) => r.status === 'paid');

    if (hasPaidRecords) {
      // Protect paid history: keep paid, remove only pending/partial children
      const pendingIds = chainRecords!
        .filter((r: any) => r.status !== 'paid' && r.status !== 'cancelled')
        .map((r: any) => r.id);

      if (pendingIds.length > 0) {
        await supabase
          .from('financial_transactions')
          .delete()
          .in('id', pendingIds);
      }

      // Disable future recurrence on the parent
      return supabase
        .from('financial_transactions')
        .update({ recurrence_enabled: false })
        .eq('id', refId);
    }

    // No paid records → safe to hard-delete everything
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

    // Delete only pending/partial physical children on or after the effective date
    const { data: futureChildren } = await supabase
      .from('financial_transactions')
      .select('id, status')
      .eq('parent_id', refId)
      .gte('date', effectiveDate);

    if (futureChildren && futureChildren.length > 0) {
      const deletableIds = futureChildren
        .filter((r: any) => r.status !== 'paid')
        .map((r: any) => r.id);

      if (deletableIds.length > 0) {
        await supabase
          .from('financial_transactions')
          .delete()
          .in('id', deletableIds);
      }
    }

    return { data: null, error: null };
  }

  return { data: null, error: new Error('Escopo inválido') };
}
