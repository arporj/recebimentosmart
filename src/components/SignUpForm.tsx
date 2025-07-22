import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Mail, User, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

// Componente de Input reutilizável
const InputField = ({ id, label, type, value, onChange, placeholder, icon: Icon, error }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-gray-700">
      {label}
    </label>
    <div className="mt-1 relative rounded-md shadow-sm">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Icon className="h-5 w-5 text-gray-400" />
      </div>
      <input
        id={id}
        type={type}
        required
        value={value}
        onChange={onChange}
        className={`pl-10 block w-full rounded-md ${error ? 'border-red-500' : 'border-gray-300'} shadow-sm focus:border-custom focus:ring-custom sm:text-sm`}
        placeholder={placeholder}
      />
      {/* Adicionar um espaço para o ícone de mostrar/esconder senha se necessário */}
    </div>
    {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
  </div>
);

export function SignUpForm({ onSubmit, loading, referralCode, referrerName }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const newErrors = {};
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

  const handleSubmit = (e) => {
    e.preventDefault();
    const newErrors = validate();
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
    } else {
      setErrors({});
      onSubmit(formData);
    }
  };

  const handleChange = (e) => {
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
          <InputField
            id="name"
            label="Nome Completo"
            type="text"
            value={formData.name}
            onChange={handleChange}
            placeholder="Seu nome completo"
            icon={User}
            error={errors.name}
          />
          <InputField
            id="email"
            label="Email"
            type="email"
            value={formData.email}
            onChange={handleChange}
            placeholder="seu@email.com"
            icon={Mail}
            error={errors.email}
          />
          {/* Campos de senha e confirmação de senha aqui, usando um componente semelhante */}
          
          <div>
            <button
              type="submit"
              disabled={loading}
              className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-custom hover:bg-custom-hover focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-custom disabled:opacity-50"
            >
              {loading ? 'Criando conta...' : 'Criar conta gratuita (7 dias)'}
            </button>
          </div>

          <div className="text-center">
            <Link
              to="/login"
              className="inline-flex items-center text-sm font-medium text-custom hover:text-custom-hover"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Já tem uma conta? Fazer login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}