import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import { X, Calendar, Shield, Eye, CheckCircle } from 'lucide-react';
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
  const [plans, setPlans] = useState<Plan[]>([]);
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
      const { error: planError } = await supabase.rpc('admin_set_user_plan', {
        user_id_to_update: user.id,
        new_plan_name: selectedPlan
      });
      if (planError) throw planError;

      // Atualiza o status de admin
      const { error: adminStatusError } = await supabase.rpc('admin_update_user_admin_status', {
        p_user_id: user.id,
        p_is_admin: isAdmin
      });
      if (adminStatusError) throw adminStatusError;

      onUserUpdate({ ...user, plan_name: selectedPlan, is_admin: isAdmin });
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
            <div className="flex items-center"><Calendar className="h-4 w-4 mr-2 text-gray-500" /> <strong>Válido até:</strong> {user.subscription_end_date ? new Date(user.subscription_end_date).toLocaleDateString('pt-BR') : '-'}</div>
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

          <div className="flex flex-col md:flex-row justify-between items-center pt-4 space-y-4 md:space-y-0">
            <button
              type="button"
              onClick={handleImpersonate}
              disabled={updating}
              className="w-full md:w-auto flex items-center justify-center px-4 py-2 text-sm font-medium text-green-700 bg-green-100 rounded-md hover:bg-green-200 disabled:opacity-50"
            >
              <Eye className="h-5 w-5 mr-2" />
              Acessar como Usuário
            </button>
            <div className="flex space-x-4">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">
                Cancelar
              </button>
              <button type="submit" disabled={updating} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50">
                {updating ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UserDetailsModal;
