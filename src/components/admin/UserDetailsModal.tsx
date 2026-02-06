import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { X, Calendar, Shield, Eye, CheckCircle, DollarSign } from 'lucide-react';
import { UserProfile } from './UserTable';
import { useAuth } from '../../contexts/AuthContext';

interface Plan {
  id: string;
  name: string;
  price_monthly: number;
}

interface UserDetailsModalProps {
  user: UserProfile;
  onClose: () => void;
  onUserUpdate: (user: UserProfile) => void;
}

const UserDetailsModal: React.FC<UserDetailsModalProps> = ({ user, onClose, onUserUpdate }) => {
  const { impersonateUser } = useAuth();
  const [isAdmin, setIsAdmin] = useState(user.is_admin);
  const [selectedPlan, setSelectedPlan] = useState<string>(user.plan_name || '');
  const [validUntil, setValidUntil] = useState(user.subscription_end_date ? new Date(user.subscription_end_date).toISOString().split('T')[0] : '');
  const [plans, setPlans] = useState<Plan[]>([]);
  const [updating, setUpdating] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentAmount, setPaymentAmount] = useState<number>(0);
  const [userCredits, setUserCredits] = useState<number>(0);
  const [useCredits, setUseCredits] = useState(true);

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
      const plan = plans.find(p => p.name === selectedPlan);
      if (plan) {
        const price = plan.price_monthly;
        // Cada crédito vale 20% do valor do plano. Máximo de 5 créditos (100%).
        const creditsToUse = useCredits ? Math.min(userCredits, 5) : 0;
        const discount = creditsToUse * (price * 0.20);
        setPaymentAmount(Math.max(0, price - discount));
      }
    }
  }, [selectedPlan, plans, userCredits, useCredits]);

  const handleRegisterPayment = async () => {
    try {
      setUpdating(true);
      
      const plan = plans.find(p => p.name === selectedPlan);
      const planPrice = plan ? plan.price_monthly : 0;
      const creditsToUse = (useCredits && planPrice > 0) ? Math.min(userCredits, 5) : 0;

      const { data, error } = await supabase.rpc('register_manual_payment', {
        p_user_id: user.id,
        p_payment_date: paymentDate,
        p_amount: paymentAmount,
        p_plan_name: selectedPlan,
        p_credits_used: creditsToUse
      });

      if (error) throw error;

      if (data.success) {
        toast.success('Pagamento registrado e validade atualizada!');
        // Update local user object to reflect changes immediately in UI if possible, 
        // but onUserUpdate callback is better
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpdating(true);

    try {
      // Atualiza o plano
      if (selectedPlan !== user.plan_name) {
          const { error: planError } = await supabase.rpc('admin_set_user_plan', {
            user_id_to_update: user.id,
            new_plan_name: selectedPlan
          });
          if (planError) throw planError;
      }

      // Atualiza a validade manualmente (garantindo que sobrescreve qualquer padrão do plano)
       if (validUntil) {
           // Define a data para o final do dia selecionado (23:59:59) para garantir que o dia inteiro seja válido
           const date = new Date(validUntil);
           date.setHours(23, 59, 59, 999);
           
           const { error: validityError } = await supabase.rpc('admin_update_user_validity', {
               p_user_id: user.id,
               new_valid_until: date.toISOString()
           });
           if (validityError) throw validityError;
       }

      // Atualiza o status de admin
      const { error: adminStatusError } = await supabase.rpc('admin_update_user_admin_status', {
        p_user_id: user.id,
        p_is_admin: isAdmin
      });
      if (adminStatusError) throw adminStatusError;

      onUserUpdate({ 
          ...user, 
          plan_name: selectedPlan, 
          is_admin: isAdmin,
          subscription_end_date: validUntil ? new Date(validUntil).toISOString() : user.subscription_end_date
      });
      toast.success('Usuário atualizado com sucesso!');
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
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg">
        <div className="flex justify-between items-center mb-4 border-b pb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">{user.name || 'Detalhes do Usuário'}</h2>
            <p className="text-sm text-gray-500">{user.email}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-6 w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex items-center">
              <Calendar className="h-4 w-4 mr-2 text-gray-500" />
              <strong>Válido até:</strong>
              <input 
                type="date" 
                value={validUntil} 
                onChange={(e) => setValidUntil(e.target.value)}
                className="ml-2 p-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-center"><CheckCircle className="h-4 w-4 mr-2 text-gray-500" /> <strong>Cadastro:</strong> {new Date(user.created_at).toLocaleDateString('pt-BR')}</div>
            <div className="flex items-center col-span-2"><Calendar className="h-4 w-4 mr-2 text-gray-500" /> <strong>Último Login:</strong> {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleString('pt-BR') : '-'}</div>
          </div>

          <hr />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div>
              <label htmlFor="plan" className="block text-sm font-medium text-gray-700 mb-1">
                Plano
              </label>
              <select
                id="plan"
                value={selectedPlan}
                onChange={(e) => setSelectedPlan(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
              >
                {plans.map((p, index) => (
                  <option key={`${p.id}-${index}`} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between mt-6">
              <label htmlFor="is-admin" className="block text-sm font-medium text-gray-700 flex items-center">
                <Shield className="h-4 w-4 mr-2" />
                Administrador
              </label>
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
          </div>

          {showPaymentForm && (
            <div className="bg-gray-50 p-4 rounded-md border border-gray-200 mt-4">
              <h3 className="font-semibold text-gray-700 mb-3 flex items-center">
                <DollarSign className="h-4 w-4 mr-2" />
                Registrar Pagamento Manual
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Data do Pagamento</label>
                  <input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Valor (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(parseFloat(e.target.value))}
                    className="w-full p-2 border border-gray-300 rounded text-sm"
                  />
                </div>
              </div>
              
              {userCredits > 0 && (
                <div className="mt-3 bg-green-50 p-3 rounded border border-green-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <input
                        type="checkbox"
                        id="useCredits"
                        checked={useCredits}
                        onChange={(e) => setUseCredits(e.target.checked)}
                        className="h-4 w-4 text-green-600 focus:ring-green-500 border-gray-300 rounded"
                      />
                      <label htmlFor="useCredits" className="ml-2 block text-sm text-gray-700">
                        Abater com créditos de indicação
                      </label>
                    </div>
                    <span className="text-sm font-bold text-green-700">
                      Disponível: {userCredits} {userCredits === 1 ? 'crédito' : 'créditos'}
                    </span>
                  </div>
                  {useCredits && (
                    <div className="mt-1 ml-6">
                      <p className="text-xs text-green-600">
                        Cada crédito concede 20% de desconto no plano escolhido.
                      </p>
                      <p className="text-xs text-green-600">
                        Serão utilizados {Math.min(userCredits, 5)} créditos para reduzir o valor em {(Math.min(userCredits, 5) * 20).toFixed(0)}%.
                      </p>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end mt-3 space-x-2">
                 <button
                  type="button"
                  onClick={() => setShowPaymentForm(false)}
                  className="px-3 py-1 text-xs font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleRegisterPayment}
                  disabled={updating}
                  className="px-3 py-1 text-xs font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {updating ? 'Processando...' : 'Confirmar Pagamento'}
                </button>
              </div>
            </div>
          )}

          <div className="flex flex-col md:flex-row justify-between items-center pt-4 space-y-4 md:space-y-0">
            <div className="flex space-x-2 w-full md:w-auto">
                <button
                type="button"
                onClick={handleImpersonate}
                disabled={updating}
                className="flex-1 md:flex-none flex items-center justify-center px-4 py-2 text-sm font-medium text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200 disabled:opacity-50"
                >
                <Eye className="h-5 w-5 mr-2" />
                Acessar
                </button>
                {!showPaymentForm && (
                    <button
                    type="button"
                    onClick={() => setShowPaymentForm(true)}
                    disabled={updating}
                    className="flex-1 md:flex-none flex items-center justify-center px-4 py-2 text-sm font-medium text-green-700 bg-green-100 rounded-md hover:bg-green-200 disabled:opacity-50"
                    >
                    <DollarSign className="h-5 w-5 mr-2" />
                    Pagamento
                    </button>
                )}
            </div>
            <div className="flex space-x-4">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">
                Fechar
              </button>
              <button type="submit" disabled={updating} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50">
                {updating ? 'Salvando...' : 'Salvar Dados'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserDetailsModal;
