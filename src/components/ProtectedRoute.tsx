import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Este componente envolve as rotas que exigem autenticação e acesso total.
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, hasFullAccess, isAdmin, loading } = useAuth();
  const location = useLocation();

  // 1. Enquanto o estado de autenticação está carregando, não renderiza nada.
  if (loading) {
    return null; // Ou um componente de "Carregando..."
  }

  // 2. Se não há usuário logado, redireciona para a página de login.
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 3. Se o usuário é admin, permite o acesso a qualquer rota, ignorando o status de acesso.
  if (isAdmin) {
    return <>{children}</>;
  }

  // 4. Se não é admin e não tem acesso total, redireciona para a página de pagamento.
  if (!hasFullAccess && location.pathname !== '/payment') {
    return <Navigate to="/payment" replace />;
  }

  // 5. Se o usuário está logado e tem acesso total (ou é admin), permite o acesso.
  return <>{children}</>;
}