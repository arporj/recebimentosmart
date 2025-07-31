import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, User, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

interface SignUpFormProps {
  onSubmit: (formData: any) => void;
  loading: boolean;
  referralCode: string | null;
  referrerName: string | null;
}

const SignUpForm: React.FC<SignUpFormProps> = ({ onSubmit, loading, referralCode, referrerName }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name) newErrors.name = 'Nome é obrigatório.';
    if (!formData.email) {
      newErrors.email = 'Email é obrigatório.';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Endereço de email inválido.';
    }
    if (formData.password.length < 6) {
      newErrors.password = 'A senha deve ter pelo menos 6 caracteres.';
    }
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'As senhas não coincidem.';
    }
    return newErrors;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors = validate();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
    } else {
      setErrors({});
      onSubmit(formData);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { id, value } = e.target;
    setFormData(prev => ({ ...prev, [id]: value }));
  };

  return (
    <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
      <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
        {referralCode && (
          <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <span className="text-2xl">🎉</span>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-green-800">
                  Você foi indicado por um amigo!
                </h3>
                <p className="text-sm text-green-700 mt-1">
                  Código de indicação: <span className="font-mono font-bold">{referralCode}</span>
                </p>
                {referrerName && (
                  <p className="text-sm text-green-700 mt-1">
                    Indicado por: <b className="font-semibold">{referrerName}</b>
                  </p>
                )}
                <p className="text-xs text-green-600 mt-1">
                  Ao se cadastrar, você e seu amigo ganham benefícios especiais!
                </p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700">Nome Completo</label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-gray-400" />
              </div>
              <input id="name" type="text" required value={formData.name} onChange={handleChange} placeholder="Seu nome completo" className={`pl-10 block w-full rounded-md ${errors.name ? 'border-red-500' : 'border-gray-300'} shadow-sm focus:border-custom focus:ring-custom sm:text-sm`} />
            </div>
            {errors.name && <p className="mt-2 text-sm text-red-600">{errors.name}</p>}
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email</label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-gray-400" />
              </div>
              <input id="email" type="email" required value={formData.email} onChange={handleChange} placeholder="seu@email.com" className={`pl-10 block w-full rounded-md ${errors.email ? 'border-red-500' : 'border-gray-300'} shadow-sm focus:border-custom focus:ring-custom sm:text-sm`} />
            </div>
            {errors.email && <p className="mt-2 text-sm text-red-600">{errors.email}</p>}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">Senha</label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-400" />
              </div>
              <input id="password" type={showPassword ? 'text' : 'password'} required value={formData.password} onChange={handleChange} className={`pl-10 block w-full rounded-md ${errors.password ? 'border-red-500' : 'border-gray-300'} shadow-sm focus:border-custom focus:ring-custom sm:text-sm`} placeholder="Crie uma senha" />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-gray-400 hover:text-gray-500">
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            {errors.password && <p className="mt-2 text-sm text-red-600">{errors.password}</p>}
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">Confirmar Senha</label>
            <div className="mt-1 relative rounded-md shadow-sm">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-400" />
              </div>
              <input id="confirmPassword" type={showConfirmPassword ? 'text' : 'password'} required value={formData.confirmPassword} onChange={handleChange} className={`pl-10 block w-full rounded-md ${errors.confirmPassword ? 'border-red-500' : 'border-gray-300'} shadow-sm focus:border-custom focus:ring-custom sm:text-sm`} placeholder="Confirme sua senha" />
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
                <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="text-gray-400 hover:text-gray-500">
                  {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>
            {errors.confirmPassword && <p className="mt-2 text-sm text-red-600">{errors.confirmPassword}</p>}
          </div>
          
          <div>
            <button type="submit" disabled={loading} className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-custom hover:bg-custom-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-custom disabled:opacity-50">
              {loading ? 'Criando conta...' : 'Criar conta gratuita (7 dias)'}
            </button>
          </div>

          <div className="text-center">
            <Link to="/login" className="inline-flex items-center text-sm font-medium text-custom hover:text-custom-hover">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Já tem uma conta? Fazer login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SignUpForm;