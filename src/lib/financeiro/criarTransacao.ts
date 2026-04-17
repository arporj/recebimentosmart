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
  total_installments?: number;
  periodicidade?: 'diaria' | 'semanal' | 'mensal' | 'anual';
  start_installment?: number;
  is_total_value?: boolean;
  due_day?: number;
  recurrence_interval?: number;
}

const addPeriod = (date: Date, amount: number, periodicidade: string) => {
  switch (periodicidade) {
    case 'diaria': return addDays(date, amount);
    case 'semanal': return addWeeks(date, amount);
    case 'anual': return addYears(date, amount);
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

  const totalInstallments = input.total_installments || 1;
  const startInstallment = input.start_installment || 1;
  const periodicidade = input.periodicidade || 'mensal';
  
  // Ajustar o valor se for o valor total
  const finalAmount = input.is_total_value 
    ? Number((input.amount / totalInstallments).toFixed(2))
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

    for (let i = startInstallment; i <= totalInstallments; i++) {
        const indexOffset = i - startInstallment;
        const dueDate = addPeriod(startDate, indexOffset, periodicidade);
        
        parcels.push({
          ...baseTransaction,
          description: `${input.description} (${i}/${totalInstallments})`,
          date: format(dueDate, 'yyyy-MM-dd'),
          installment_number: i,
          total_installments: totalInstallments,
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
      recurrence_period: periodicidade === 'diaria' ? 'daily' : periodicidade === 'semanal' ? 'weekly' : periodicidade === 'anual' ? 'yearly' : 'monthly',
      recurrence_interval: recurrenceInterval,
      recurrence_enabled: true,
    }).select().single();

    if (parentError) return { data: null, error: parentError };

    const occurrences = [];
    const startDate = parseLocalDate(input.date);

    // Gerar 12 ocorrências iniciais respeitando o intervalo
    for (let i = 1; i <= 12; i++) {
      const occurrenceDate = addPeriod(startDate, i * recurrenceInterval, periodicidade);
      occurrences.push({
        ...baseTransaction,
        parent_id: parentData.id,
        date: format(occurrenceDate, 'yyyy-MM-dd'),
        recurrence_period: periodicidade === 'diaria' ? 'daily' : periodicidade === 'semanal' ? 'weekly' : periodicidade === 'anual' ? 'yearly' : 'monthly',
        recurrence_interval: recurrenceInterval,
      });
    }

    return await supabase.from('financial_transactions').insert(occurrences);
  }

  return { data: null, error: new Error('Modalidade inválida') };
}
