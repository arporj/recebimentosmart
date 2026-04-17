import { supabase } from '../supabase';
import { addDays, addWeeks, addMonths, addYears, format } from 'date-fns';

export interface TransactionInput {
  description: string;
  amount: number;
  type: 'income' | 'expense';
  date: string;
  category_id?: string;
  account_id?: string;
  modalidade: 'unica' | 'parcelada' | 'recorrente';
  installment_total?: number;
  recurrence_period?: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  start_installment?: number;
  is_total_value?: boolean;
  due_day?: number;
  recurrence_interval?: number;
}

const addPeriod = (date: Date, amount: number, period: string) => {
  switch (period) {
    case 'daily': return addDays(date, amount);
    case 'weekly': return addWeeks(date, amount);
    case 'yearly': return addYears(date, amount);
    default: return addMonths(date, amount);
  }
};

const parseLocalDate = (dateStr: string) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export async function criarTransacao(input: TransactionInput) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Usuário não autenticado');

  const installmentTotal = input.installment_total || 1;
  const startInstallment = input.start_installment || 1;
  const recurrencePeriod = input.recurrence_period || 'monthly';
  
  // Ajustar o valor se for o valor total
  const finalAmount = input.is_total_value 
    ? Number((input.amount / installmentTotal).toFixed(2))
    : input.amount;

  const baseTransaction = {
    user_id: userData.user.id,
    description: input.description,
    amount: finalAmount,
    type: input.type,
    category_id: input.category_id,
    account_id: input.account_id,
    modalidade: input.modalidade,
    status: 'pending',
  };

  if (input.modalidade === 'unica') {
    return await supabase.from('financial_transactions').insert({
      ...baseTransaction,
      date: input.date,
      amount: input.amount // Valor único não divide
    });
  }

  if (input.modalidade === 'parcelada') {
    const startDate = parseLocalDate(input.date);
    const parcels = [];

    for (let i = startInstallment; i <= installmentTotal; i++) {
        const indexOffset = i - startInstallment;
        const dueDate = addPeriod(startDate, indexOffset, recurrencePeriod);
        
        parcels.push({
          ...baseTransaction,
          description: `${input.description} (${i}/${installmentTotal})`,
          date: format(dueDate, 'yyyy-MM-dd'),
          installment_current: i,
          installment_total: installmentTotal,
          modalidade: 'parcelada'
        });
    }
    
    if (parcels.length === 0) return { data: null, error: new Error('Nenhuma parcela a criar') };

    const { data: firstData, error: firstError } = await supabase.from('financial_transactions').insert(parcels[0]).select().single();
    if (firstError) return { data: null, error: firstError };

    if (parcels.length > 1) {
        const remainingParcels = parcels.slice(1).map(p => ({ ...p, parent_id: firstData.id }));
        return await supabase.from('financial_transactions').insert(remainingParcels);
    }

    return { data: firstData, error: null };
  }

  if (input.modalidade === 'recorrente') {
    const recurrenceInterval = input.recurrence_interval || 1;
    
    const { data: parentData, error: parentError } = await supabase.from('financial_transactions').insert({
      ...baseTransaction,
      date: input.date,
      recurrence_period: recurrencePeriod,
      recurrence_interval: recurrenceInterval,
      recurrence_enabled: true,
    }).select().single();

    if (parentError) return { data: null, error: parentError };

    const occurrences = [];
    const startDate = parseLocalDate(input.date);

    // Gerar 12 ocorrências iniciais respeitando o intervalo
    for (let i = 1; i <= 12; i++) {
      const occurrenceDate = addPeriod(startDate, i * recurrenceInterval, recurrencePeriod);
      occurrences.push({
        ...baseTransaction,
        parent_id: parentData.id,
        date: format(occurrenceDate, 'yyyy-MM-dd'),
        recurrence_period: recurrencePeriod,
        recurrence_interval: recurrenceInterval,
      });
    }

    return await supabase.from('financial_transactions').insert(occurrences);
  }

  return { data: null, error: new Error('Modalidade inválida') };
}
