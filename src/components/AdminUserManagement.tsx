import React from 'react';
import { DollarSign, Users, UserPlus, CheckCircle } from 'lucide-react';
import KpiCard from './admin/KpiCard';
import PriceManagement from './admin/PriceManagement';
import UserTable from './admin/UserTable';

import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';
import { DollarSign, Users, UserPlus, CheckCircle } from 'lucide-react';
import KpiCard from './admin/KpiCard';
import PriceManagement from './admin/PriceManagement';
import UserTable from './admin/UserTable';

interface KpiData {
  monthlyRevenue: number;
  activeUsers: number;
  newUsers: number;
  convertedTrials: number;
}

const AdminDashboard = () => {
  const [kpiData, setKpiData] = useState<KpiData | null>(null);
  const [loadingKpis, setLoadingKpis] = useState(true);

  useEffect(() => {
    const fetchKpis = async () => {
      setLoadingKpis(true);
      try {
        const { data, error } = await supabase.rpc('get_admin_dashboard_kpis');
        if (error) throw error;
        setKpiData(data);
      } catch (error: any) {
        console.error('Erro ao buscar KPIs:', error);
        toast.error('Falha ao carregar as métricas do dashboard.');
      } finally {
        setLoadingKpis(false);
      }
    };

    fetchKpis();
  }, []);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Dashboard Administrativo</h1>

      {/* Seção de KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <KpiCard 
          title="Receita do Mês"
          value={loadingKpis ? '...' : `R$ ${kpiData?.monthlyRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
          icon={<DollarSign className="h-8 w-8 text-green-500" />}
        />
        <KpiCard 
          title="Usuários Ativos"
          value={loadingKpis ? '...' : kpiData?.activeUsers.toString()}
          icon={<Users className="h-8 w-8 text-blue-500" />}
        />
        <KpiCard 
          title="Novos Usuários (30d)"
          value={loadingKpis ? '...' : kpiData?.newUsers.toString()}
          icon={<UserPlus className="h-8 w-8 text-purple-500" />}
        />
        <KpiCard 
          title="Conversões de Trial"
          value={loadingKpis ? '...' : kpiData?.convertedTrials.toString()}
          icon={<CheckCircle className="h-8 w-8 text-yellow-500" />}
        />
      </div>

      {/* Seção de Gestão */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Coluna Principal: Tabela de Usuários */}
        <div className="lg:col-span-2 bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-bold text-gray-700 mb-4">Gerenciar Usuários</h2>
          <UserTable />
        </div>

        {/* Coluna Lateral: Gestão de Preço */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-bold text-gray-700 mb-4">Configurações</h2>
          <PriceManagement />
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
