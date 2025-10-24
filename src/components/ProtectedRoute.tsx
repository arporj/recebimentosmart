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

  // 3. Se o usuário está logado, permite o acesso.
  return <>{children}</>;
}