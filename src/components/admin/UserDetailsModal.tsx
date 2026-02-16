import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { X, Calendar, Shield, Eye, CheckCircle, DollarSign } from 'lucide-react';
import { UserProfile } from './UserTable';
import { useAuth } from '../../contexts/AuthContext';
import { CurrencyInput } from '../ui/CurrencyInput';

interface Plan {
  name: string;
  price_monthly: number;
}

// Função auxiliar para normalizar strings (remover acentos e case insensitive)
const normalizeString = (str: string) => {
  return str ? str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : "";
};

interface UserDetailsModalProps {
  user: UserProfile;
  onClose: () => void;
  onUserUpdate: (user: UserProfile) => void;
  onUserDeleted?: () => void;
}

const UserDetailsModal: React.FC<UserDetailsModalProps> = ({ user, onClose, onUserUpdate, onUserDeleted }) => {
  const { impersonateUser } = useAuth();
  const [activeTab, setActiveTab] = useState<'overview' | 'subscription' | 'danger'>('overview');

  // ... (rest of state) ...

  // State for Overview
  const [isAdmin, setIsAdmin] = useState(user.is_admin);

  // State for Subscription
  const [selectedPlan, setSelectedPlan] = useState<string>(user.plan_name || '');
  const [validUntil, setValidUntil] = useState(user.subscription_end_date ? new Date(user.subscription_end_date).toISOString().split('T')[0] : '');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [userCredits, setUserCredits] = useState<number>(0);
  const [useCredits, setUseCredits] = useState(true);

  // Global loading state
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const { data, error } = await supabase.rpc('get_all_plans_with_prices');
        if (error) throw error;
        setPlans(data);
      } catch (error) {
        console.error('Erro ao buscar planos:', error);
        toast.error('Falha ao carregar os planos.');
      }
    };
    fetchPlans();
  }, []);

  useEffect(() => {
    const fetchCredits = async () => {
      if (!showPaymentForm) return;
      try {
        const { data, error } = await supabase.rpc('get_full_referral_stats', { p_user_id: user.id });
        if (error) throw error;
        if (data && data.length > 0) {
          setUserCredits(data[0].available_credits || 0);
        }
      } catch (error) {
        console.error('Erro ao buscar créditos:', error);
      }
    };
    fetchCredits();
  }, [user.id, showPaymentForm]);

  useEffect(() => {
    if (selectedPlan && plans.length > 0) {
      const normalizedSelected = normalizeString(selectedPlan);
      const plan = plans.find(p => normalizeString(p.name) === normalizedSelected);

      if (plan) {
        const price = Number(plan.price_monthly) || 0;
        const creditsToUse = useCredits ? Math.min(userCredits || 0, 5) : 0;
        const discount = creditsToUse * (price * 0.20);
        setPaymentAmount(Math.max(0, price - discount));
      } else {
        setPaymentAmount(0);
      }
    }
  }, [selectedPlan, plans, userCredits, useCredits]);

  const handleRegisterPayment = async () => {
    try {
      setUpdating(true);

      const normalizedSelected = normalizeString(selectedPlan);
      const plan = plans.find(p => normalizeString(p.name) === normalizedSelected);
      const planPrice = plan ? plan.price_monthly : 0;
      const creditsToUse = (useCredits && planPrice > 0) ? Math.min(userCredits || 0, 5) : 0;

      const { data, error } = await supabase.rpc('register_manual_payment', {
        p_user_id: user.id,
        p_payment_date: paymentDate,
        p_amount: paymentAmount,
        p_plan_name: plan ? plan.name : selectedPlan,
        p_credits_used: creditsToUse
      });

      if (error) throw error;

      if (data.success) {
        toast.success('Pagamento registrado e validade atualizada!');
        const updatedUser = {
          ...user,
          subscription_end_date: data.new_valid_until,
          plan_name: selectedPlan,
          subscription_status: new Date(data.new_valid_until) > new Date() ? 'active' : 'expired'
        };
        onUserUpdate(updatedUser);
        setShowPaymentForm(false);
      } else {
        toast.error('Erro ao registrar pagamento: ' + data.error);
      }
    } catch (error: any) {
      console.error('Erro ao registrar pagamento:', error);
      toast.error('Erro ao registrar pagamento: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setUpdating(false);
    }
  };

  const handleImpersonate = async () => {
    try {
      setUpdating(true);
      await impersonateUser(user.id);
      onClose();
    } catch (error) {
      console.error('Erro ao impersonar usuário:', error instanceof Error ? error.message : error);
      toast.error('Erro ao acessar como este usuário');
    } finally {
      setUpdating(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!window.confirm('TEM CERTEZA? Essa ação apagará permanentemente o usuário e todos os dados relacionados (pagamentos, clientes, etc). Não pode ser desfeito.')) {
      return;
    }

    setUpdating(true);
    try {
      const { error } = await supabase.rpc('admin_delete_user', { p_user_id: user.id });
      if (error) throw error;

      toast.success('Usuário excluído com sucesso.');

      if (onUserDeleted) {
        onUserDeleted();
      } else {
        onClose();
      }
    } catch (error: any) {
      console.error('Erro ao excluir usuário:', error);
      toast.error('Erro ao excluir usuário: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setUpdating(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);

    try {
      // 1. Update Plan if changed
      if (selectedPlan !== user.plan_name) {
        const normalizedSelected = normalizeString(selectedPlan);
        // ... (Same plan mapping logic as before) ...
        const planMap: Record<string, string> = {
          'basico': 'basico', 'basic': 'basico',
          'pro': 'pro', 'pró': 'pro',
          'premium': 'premium', 'trial': 'trial'
        };
        const dbPlanName = planMap[normalizedSelected] || normalizedSelected;

        const { error: planError } = await supabase.rpc('admin_set_user_plan', {
          user_id_to_update: user.id,
          new_plan_name: dbPlanName
        });
        if (planError) throw planError;
      }

      // 2. Update Validity manually
      if (validUntil) {
        const [year, month, day] = validUntil.split('-').map(Number);
        const date = new Date(year, month - 1, day);
        date.setHours(23, 59, 59, 999);

        const { error: validityError } = await supabase.rpc('admin_update_user_validity', {
          p_user_id: user.id,
          new_valid_until: date.toISOString()
        });
        if (validityError) throw validityError;
      }

      // 3. Update Admin Status
      if (isAdmin !== user.is_admin) {
        const { error: adminStatusError } = await supabase.rpc('admin_update_user_admin_status', {
          p_user_id: user.id,
          p_is_admin: isAdmin
        });
        if (adminStatusError) throw adminStatusError;
      }

      onUserUpdate({
        ...user,
        plan_name: selectedPlan,
        is_admin: isAdmin,
        subscription_end_date: validUntil ? new Date(validUntil).toISOString() : user.subscription_end_date
      });
      toast.success('Dados atualizados!');
      onClose();

    } catch (error) {
      console.error('Erro ao atualizar usuário:', error);
      const message = error instanceof Error ? error.message : 'Falha ao atualizar o usuário.';
      toast.error(message);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b">
          <div>
            <h2 className="text-xl font-bold text-gray-800">{user.name || 'Usuário Sem Nome'}</h2>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b bg-gray-50">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex-1 py-3 text-sm font-medium ${activeTab === 'overview' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Visão Geral
          </button>
          <button
            onClick={() => setActiveTab('subscription')}
            className={`flex-1 py-3 text-sm font-medium ${activeTab === 'subscription' ? 'text-indigo-600 border-b-2 border-indigo-600 bg-white' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Assinatura
          </button>
          <button
            onClick={() => setActiveTab('danger')}
            className={`flex-1 py-3 text-sm font-medium ${activeTab === 'danger' ? 'text-red-600 border-b-2 border-red-600 bg-red-50' : 'text-gray-500 hover:text-red-600'}`}
          >
            Zona de Perigo
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center text-gray-700">
                  <CheckCircle className="h-4 w-4 mr-2 text-gray-400" />
                  <strong>Cadastro:</strong>
                </div>
                <div className="text-right">{new Date(user.created_at).toLocaleDateString('pt-BR')}</div>

                <div className="flex items-center text-gray-700">
                  <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                  <strong>Último Login:</strong>
                </div>
                <div className="text-right">{user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('pt-BR') : '-'}</div>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <Shield className="h-5 w-5 mr-3 text-indigo-600" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">Acesso Administrativo</p>
                    <p className="text-xs text-gray-500">Permite gerenciar todo o sistema</p>
                  </div>
                </div>
                <div className="relative inline-block w-10 align-middle select-none transition duration-200 ease-in">
                  <input
                    type="checkbox"
                    id="is-admin"
                    checked={isAdmin}
                    onChange={() => setIsAdmin(!isAdmin)}
                    className="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer"
                  />
                  <label htmlFor="is-admin" className="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label>
                </div>
              </div>

              <button
                type="button"
                onClick={handleImpersonate}
                className="w-full flex items-center justify-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200"
              >
                <Eye className="h-4 w-4 mr-2" />
                Acessar Painel como Usuário
              </button>
            </div>
          )}

          {activeTab === 'subscription' && (
            <form onSubmit={handleUpdateProfile} className="space-y-6">
              <div>
                <label htmlFor="plan" className="block text-sm font-medium text-gray-700 mb-1">Alterar Plano Atual</label>
                <select
                  id="plan"
                  value={selectedPlan}
                  onChange={(e) => setSelectedPlan(e.target.value)}
                  className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                >
                  {plans.filter(p => p.name !== 'Premium').map((p, index) => (
                    <option key={`${p.name}-${index}`} value={p.name}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Validade da Assinatura</label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  className="block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                />
              </div>

              <div className="pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setShowPaymentForm(!showPaymentForm)}
                  className="flex items-center text-sm text-green-600 hover:text-green-700 font-medium"
                >
                  <DollarSign className="h-4 w-4 mr-1" />
                  {showPaymentForm ? 'Cancelar Pagamento Manual' : 'Registrar Pagamento Manual'}
                </button>

                {showPaymentForm && (
                  <div className="mt-4 bg-gray-50 p-4 rounded-md border border-gray-200 animate-fadeIn">
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Data</label>
                        <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} className="w-full p-2 border rounded text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Valor</label>
                        <CurrencyInput
                          value={Math.round(paymentAmount * 100)}
                          onValueChange={(val) => setPaymentAmount(val / 100)}
                          showSymbol={false}
                          className="w-full p-2 border rounded text-sm"
                        />
                      </div>
                    </div>

                    {/* Credits Section */}
                    {userCredits > 0 && (
                      <div className="mb-4 flex items-start p-2 bg-green-50 rounded border border-green-100">
                        <input
                          type="checkbox"
                          id="useCredits"
                          checked={useCredits}
                          onChange={(e) => setUseCredits(e.target.checked)}
                          className="mt-1 h-4 w-4 text-green-600 rounded"
                        />
                        <div className="ml-2">
                          <label htmlFor="useCredits" className="text-sm font-medium text-gray-700">Usar Créditos ({userCredits})</label>
                          {useCredits && <p className="text-xs text-green-600 mt-1">Desconto aplicado: R$ {(Math.min(userCredits, 5) * ((plans.find(p => p.name === selectedPlan)?.price_monthly || 0) * 0.20)).toFixed(2)}</p>}
                        </div>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleRegisterPayment}
                      disabled={updating}
                      className="w-full py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                    >
                      {updating ? 'Processando...' : 'Confirmar Pagamento'}
                    </button>
                  </div>
                )}
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  onClick={handleUpdateProfile}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                  disabled={updating}
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          )}

          {activeTab === 'danger' && (
            <div className="space-y-4">
              <div className="bg-red-50 border-l-4 border-red-400 p-4">
                <div className="flex">
                  <div className="flex-shrink-0">
                    <X className="h-5 w-5 text-red-400" />
                  </div>
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">Zona de Perigo</h3>
                    <div className="mt-2 text-sm text-red-700">
                      <p>Ações aqui são irreversíveis. Tenha certeza absoluta antes de prosseguir.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="border border-red-200 rounded-md p-4">
                <h4 className="text-sm font-medium text-gray-900">Excluir Usuário</h4>
                <p className="text-sm text-gray-500 mt-1 mb-4">
                  Isso apagará permanentemente a conta, histórico de pagamentos, clientes e todos os dados associados.
                </p>
                <button
                  onClick={handleDeleteUser}
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
                >
                  EXCLUIR USUÁRIO
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserDetailsModal;
