import { supabase } from '../supabase';
import { addMonths, format } from 'date-fns';

export interface TransactionInput {
  description: string;
  amount: number;
  type: 'income' | 'expense';
  date: string;
  category_id?: string;
  account_id?: string;
  modalidade: 'unica' | 'parcelada' | 'recorrente';
  total_installments?: number;
  recurrence_period?: 'monthly';
  due_day?: number;
}

export async function criarTransacao(input: TransactionInput) {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error('Usuário não autenticado');

  const baseTransaction = {
    user_id: userData.user.id,
    description: input.description,
    amount: input.amount,
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
    });
  }

  if (input.modalidade === 'parcelada' && input.total_installments) {
    const startDate = new Date(input.date);
    
    // 1. Criar a primeira parcela
    const { data: firstParcel, error: firstError } = await supabase.from('financial_transactions').insert({
      ...baseTransaction,
      description: `${input.description} (1/${input.total_installments})`,
      date: format(startDate, 'yyyy-MM-dd'),
      installment_number: 1,
      total_installments: input.total_installments,
    }).select().single();

    if (firstError) return { data: null, error: firstError };

    // 2. Criar as demais parcelas vinculadas à primeira
    const otherParcels = [];
    for (let i = 2; i <= input.total_installments; i++) {
      const dueDate = addMonths(startDate, i - 1);
      otherParcels.push({
        ...baseTransaction,
        parent_id: firstParcel.id,
        description: `${input.description} (${i}/${input.total_installments})`,
        date: format(dueDate, 'yyyy-MM-dd'),
        installment_number: i,
        total_installments: input.total_installments,
      });
    }
    
    return await supabase.from('financial_transactions').insert(otherParcels);
  }

  if (input.modalidade === 'recorrente') {
    // Para recorrente, criamos a "mãe" e as ocorrências dos próximos 12 meses
    const { data: parentData, error: parentError } = await supabase.from('financial_transactions').insert({
      ...baseTransaction,
      date: input.date,
      due_day: input.due_day || new Date(input.date).getDate(),
    }).select().single();

    if (parentError) return { data: null, error: parentError };

    const occurrences = [];
    const startDate = new Date(input.date);

    for (let i = 1; i <= 12; i++) {
      const occurrenceDate = addMonths(startDate, i);
      occurrences.push({
        ...baseTransaction,
        parent_id: parentData.id,
        date: format(occurrenceDate, 'yyyy-MM-dd'),
        due_day: input.due_day || new Date(input.date).getDate(),
      });
    }

    return await supabase.from('financial_transactions').insert(occurrences);
  }

  return { data: null, error: new Error('Modalidade inválida') };
}
