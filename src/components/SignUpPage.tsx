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
    setLoading(true);
    try {
      // 1. Tenta criar o usuário primeiro
      await signUp(
        formData.name,
        formData.email,
        formData.password,
        referralCode
      );

      // 2. Se o cadastro for bem-sucedido, envia o e-mail de notificação
      try {
        const subject = `Novo Cadastro: ${formData.name}`;
        const htmlContent = `
          <p>Um novo usuário se cadastrou no Recebimento $mart:</p>
          <ul>
            <li><b>Nome:</b> ${formData.name}</li>
            <li><b>Email:</b> ${formData.email}</li>
            ${referralCode ? `<li><b>Código de Indicação:</b> ${referralCode}</li>` : ''}
            ${referrerName ? `<li><b>Indicado por:</b> ${referrerName}</li>` : ''}
          </ul>
          <p>Data do Cadastro: ${new Date().toLocaleString('pt-BR')}</p>
          <p>Atenciosamente,<br>Equipe Recebimento $mart</p>
        `;

        const { error: emailError } = await supabase.functions.invoke('send-notification-email', {
          body: {
            subject,
            htmlContent,
            recipientEmail: 'financeiro@recebimentosmart.com.br',
          },
        });

        if (emailError) {
          // Loga o erro do e-mail, mas não impede o fluxo do usuário
          console.error('Erro ao enviar e-mail de notificação de cadastro:', emailError);
          toast.error('Houve um problema ao enviar a notificação, mas seu cadastro foi criado.');
        }

      } catch (emailError) {
        console.error('Erro crítico ao tentar enviar e-mail de notificação:', emailError);
      }

      // 3. Informa o usuário e redireciona
      toast.success('Conta criada com sucesso! Verifique seu e-mail para confirmação.');
      navigate('/login');

    } catch (error) {
      // O erro do signUp do AuthContext já mostra um toast
      // Não é necessário mostrar outro aqui, apenas logar se desejar.
      console.error("Erro no processo de signUp:", error);
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