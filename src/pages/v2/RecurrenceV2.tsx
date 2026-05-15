import React from 'react';
import { CalendarDays, AlertTriangle } from 'lucide-react';

export default function RecurrenceV2() {
    return (
        <div className="space-y-6 max-w-7xl mx-auto animate-fadeIn">
            {/* Header da Página */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2 tracking-tight">
                        <CalendarDays className="text-[#14b8a6] w-8 h-8" />
                        Recorrências & Saldo Consolidado
                    </h1>
                    <p className="text-slate-500 mt-1 text-sm font-medium">
                        Visualize o saldo líquido acumulado por cliente e gerencie obrigações ativas de forma consolidada.
                    </p>
                </div>
            </div>

            {/* Card Provisório de Construção */}
            <div className="bg-white rounded-2xl border border-slate-200 p-8 flex flex-col items-center justify-center text-center shadow-sm min-h-[400px]">
                <div className="bg-teal-50 p-4 rounded-full mb-4">
                    <CalendarDays className="w-12 h-12 text-[#14b8a6]" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">Novo Módulo de Recorrências</h3>
                <p className="text-slate-500 max-w-md text-sm leading-relaxed mb-6">
                    Estamos construindo o seu novo painel financeiro consolidado. Em breve você visualizará o saldo (Netting) em tempo real de cada cliente e poderá importar históricos da V1.
                </p>
                <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    Módulo em fase de implementação
                </div>
            </div>
        </div>
    );
}
