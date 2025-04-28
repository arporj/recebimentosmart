import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { startOfYear, eachMonthOfInterval, isSameMonth, isAfter, isBefore, startOfMonth, endOfMonth, addMonths } from 'date-fns';
import { formatToSP, toSPDate, getCurrentSPDate } from '../lib/dates';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Database } from '../types/supabase';
import { format } from 'date-fns';

type Client = Database['public']['Tables']['clients']['Row'];
type Payment = Database['public']['Tables']['payments']['Row'];

interface PaymentHistoryProps {
  client: Client;
  refreshKey?: number;
}

// Correct mapping of payment frequencies to number of months
const FREQUENCY_MONTHS = {
  monthly: 1,    // Monthly = 1 month
  bimonthly: 2,  // Bimonthly = 2 months
  quarterly: 3,  // Quarterly = 3 months
  semiannual: 6, // Semiannual = 6 months
  annual: 12     // Annual = 12 months
};

export function PaymentHistory({ client, refreshKey }: PaymentHistoryProps) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(getCurrentSPDate().getFullYear());
  
  // Generate array of years from client start date to current year
  const [startYear] = client.start_date.split('-').map(Number);
  const currentYear = getCurrentSPDate().getFullYear();
  const availableYears = Array.from(
    { length: currentYear - startYear + 1 },
    (_, i) => startYear + i
  );

  useEffect(() => {
    async function fetchPayments() {
      try {
        const { data, error } = await supabase
          .from('payments')
          .select('*')
          .eq('client_id', client.id)
          .order('payment_date', { ascending: false });

        if (error) throw error;
        setPayments(data || []);
      } catch (error) {
        console.error('Error fetching payments:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchPayments();
  }, [client.id, refreshKey]);

  const monthsInYear = eachMonthOfInterval({
    start: startOfYear(new Date(selectedYear, 0, 1)),
    end: new Date(selectedYear, 11, 31)
  });

  const getMonthStatus = (month: Date) => {
    // Check if this month is before the client's start date
    const startDate = toSPDate(client.start_date);
    const monthStart = startOfMonth(month);
  
    if (isBefore(monthStart, startOfMonth(startDate))) {
      return {
        status: 'before-start',
        date: null,
        amount: null,
        isPaymentMonth: false
      };
    }
  
    // Verifica se existe algum pagamento que cubra este mês, considerando a frequência
    const coveringPayment = payments.find(payment => {
      if (!payment.reference_month) return false;
      const freq = FREQUENCY_MONTHS[client.payment_frequency];
      // Data inicial do período coberto
      const [y, m] = payment.reference_month.split('-').map(Number);
      const refDate = new Date(y, m - 1, 1);
      // Data final do período coberto
      const endDate = addMonths(refDate, freq - 1);
      // O mês do calendário está entre refDate e endDate?
      return (
        !isBefore(monthStart, startOfMonth(refDate)) &&
        !isAfter(monthStart, endOfMonth(endDate))
      );
    });
  
    if (coveringPayment) {
      // Checa se este é o mês de referência do pagamento (mês do pagamento)
      const isPaymentMonth = coveringPayment.reference_month === format(month, 'yyyy-MM');
      return {
        status: 'paid',
        date: formatToSP(coveringPayment.payment_date, 'dd/MM/yyyy'),
        amount: isPaymentMonth ? coveringPayment.amount : null,
        isPaymentMonth
      };
    }
  
    // Check if payment is late
    const today = getCurrentSPDate();
    const isLate = isAfter(today, month) && isAfter(today, startDate);
  
    return {
      status: isLate ? 'late' : 'upcoming',
      date: null,
      amount: null,
      isPaymentMonth: false
    };
  };

  const handlePreviousYear = () => {
    if (selectedYear > startYear) {
      setSelectedYear(selectedYear - 1);
    }
  };

  const handleNextYear = () => {
    if (selectedYear < currentYear) {
      setSelectedYear(selectedYear + 1);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-medium text-gray-900">Histórico de Pagamentos</h3>
        
        <div className="flex items-center space-x-2">
          <button
            onClick={handlePreviousYear}
            disabled={selectedYear <= startYear}
            className={`p-1 rounded-full ${
              selectedYear <= startYear
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="block w-24 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
          >
            {availableYears.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>

          <button
            onClick={handleNextYear}
            disabled={selectedYear >= currentYear}
            className={`p-1 rounded-full ${
              selectedYear >= currentYear
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>
      </div>
      
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
        {monthsInYear.map((month) => {
          const { status, date, amount, isPaymentMonth } = getMonthStatus(month);
          
          return (
            <div
              key={month.toString()}
              className={`p-4 rounded-lg border ${
                status === 'paid'
                  ? 'bg-green-50 border-green-200'
                  : status === 'late'
                  ? 'bg-red-50 border-red-200'
                  : status === 'before-start'
                  ? 'bg-gray-100 border-gray-200'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="text-sm font-medium mb-2">
                {formatToSP(month, 'MMMM')}
              </div>
              
              {status === 'paid' && (
                <div className="space-y-1">
                  <div className="text-xs text-green-800">
                    {isPaymentMonth ? 'Pago' : 'Coberto'}
                  </div>
                  {isPaymentMonth && (
                    <>
                      <div className="text-xs text-gray-600">{date}</div>
                      <div className="text-xs font-medium">R$ {amount?.toFixed(2)}</div>
                    </>
                  )}
                </div>
              )}
              
              {status === 'late' && (
                <div className="text-xs text-red-800">Em atraso</div>
              )}
              
              {status === 'upcoming' && (
                <div className="text-xs text-gray-600">Aguardando</div>
              )}

              {status === 'before-start' && (
                <div className="text-xs text-gray-400">-</div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 grid grid-cols-4 gap-4 text-sm">
        <div className="flex items-center">
          <div className="w-3 h-3 rounded-full bg-green-100 border border-green-200 mr-2"></div>
          <span>Pago</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 rounded-full bg-red-100 border border-red-200 mr-2"></div>
          <span>Em atraso</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 rounded-full bg-gray-50 border border-gray-200 mr-2"></div>
          <span>Aguardando</span>
        </div>
        <div className="flex items-center">
          <div className="w-3 h-3 rounded-full bg-gray-100 border border-gray-200 mr-2"></div>
          <span>Anterior</span>
        </div>
      </div>
    </div>

  );
}