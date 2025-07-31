import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { toast, Toaster } from 'react-hot-toast';
import { useLocation, useNavigate } from 'react-router-dom';
import SignUpForm from './SignUpForm';
import { supabase } from '../lib/supabase';

export function SignUpPage() {
  const { signUp } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referrerName, setReferrerName] = useState<string | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const refCode = urlParams.get('ref');
    if (refCode) {
      setReferralCode(refCode);
      const fetchReferrerName = async () => {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('name')
            .eq('referral_code', refCode)
            .single();
          if (error) throw error;
          if (data) {
            setReferrerName(data.name);
          }
        } catch (error) {
          console.error("Erro ao buscar nome do indicador:", error);
        }
      };
      fetchReferrerName();
    }
  }, [location]);

  const handleSignUp = async (formData) => {
    try {
      setLoading(true);
      await signUp(
        formData.name,
        formData.email,
        formData.password,
        referralCode
      );
      toast.success('Conta criada com sucesso! Redirecionando para o login...');
      navigate('/login');
    } catch (error) {
      if (error instanceof Error) {
        toast.error(error.message);
      } else {
        toast.error('Erro ao criar conta');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <img
          className="mx-auto h-40 w-auto"
          src="/images/landing.png"
          alt="RecebimentoSmart"
        />
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Criar sua conta gratuita
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          7 dias grátis para testar todas as funcionalidades
        </p>
      </div>

      <SignUpForm 
        onSubmit={handleSignUp} 
        loading={loading} 
        referralCode={referralCode} 
        referrerName={referrerName}
      />

      <Toaster position="top-right" />
    </div>
  );
}