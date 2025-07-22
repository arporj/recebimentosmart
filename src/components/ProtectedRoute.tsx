import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Este componente envolve as rotas que exigem autenticação e pagamento em dia.
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isPaid, loading } = useAuth();
  const location = useLocation();

  // 1. Enquanto o estado de autenticação está carregando, não renderiza nada.
  if (loading) {
    return null; // Ou um componente de "Carregando..."
  }

  // 2. Se não há usuário logado, redireciona para a página de login.
  // Guarda a página que o usuário tentou acessar para redirecioná-lo de volta após o login.
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 3. Se o usuário está logado, mas não está com o pagamento em dia, redireciona para a página de pagamento.
  // A exceção é se ele já estiver tentando acessar a própria página de pagamento.
  if (!isPaid && location.pathname !== '/payment') {
    return <Navigate to="/payment" replace />;
  }

  // 4. Se o usuário está logado e com o pagamento em dia, permite o acesso à rota solicitada.
  return <>{children}</>;
}