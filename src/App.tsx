import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import { ClientListV2 } from './components/v2/ClientListV2';
import { MainLayoutV2 } from './components/v2/MainLayoutV2';
import { ClientProvider } from './contexts/ClientContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute'; // Importa a nova rota protegida
import { SubscriptionProvider } from './contexts/SubscriptionContext'; // Importa o novo provider

// Importar os novos componentes
// AdminFeedbackPage V1 usado via redirect para V2
import SubscriptionPageV2 from './pages/v2/SubscriptionPageV2';
import AdminUserManagementV2 from './pages/v2/AdminUserManagementV2';
// Configuracoes V1 removido, agora usa redirect para V2
import CamposPersonalizadosV2 from './pages/v2/CamposPersonalizadosV2';
import ReferralPageV2 from './pages/v2/ReferralPageV2';
import StitchLanding from './pages/StitchLanding';
import LoginV2 from './components/v2/LoginV2';
import SignUpV2 from './components/v2/SignUpV2';
import ForgotPasswordV2 from './components/v2/ForgotPasswordV2';
import ResetPasswordV2 from './components/v2/ResetPasswordV2';
// AdminChatPage removido para backlog de ideias
import MonthlyPaymentsV2 from './pages/v2/MonthlyPaymentsV2';
import ReportsV2 from './pages/v2/ReportsV2';
import FeedbackV2 from './pages/v2/FeedbackV2';
import UserProfileSettingsV2 from './pages/v2/UserProfileSettingsV2';
import AdminFeedbackPageV2 from './pages/v2/AdminFeedbackPageV2';
import AdminSettingsV2 from './pages/v2/AdminSettingsV2';

// Componente para rotas de administrador
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <Routes>
      {/* Se não há usuário, mostra a landing page e rotas públicas da V2 como padrão */}
      {!user ? (
        <>
          <Route path="/" element={<StitchLanding />} />
          <Route path="/login" element={<LoginV2 />} />
          <Route path="/cadastro" element={<SignUpV2 />} />
          <Route path="/forgot-password" element={<ForgotPasswordV2 />} />
          <Route path="/reset-password" element={<ResetPasswordV2 />} />

          {/* Antigas rotas explícitas /v2 deslogadas agora redirecionam para as raízes limpas */}
          <Route path="/v2" element={<Navigate to="/" replace />} />
          <Route path="/v2/login" element={<Navigate to="/login" replace />} />
          <Route path="/v2/cadastro" element={<Navigate to="/cadastro" replace />} />
          <Route path="/v2/forgot-password" element={<Navigate to="/forgot-password" replace />} />
          <Route path="/v2/reset-password" element={<Navigate to="/reset-password" replace />} />

          {/* Fallback manda sempre para a raiz */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      ) : (
        <>
          {/* 
            ROTAS V2 PROTEGIDAS (Agora são o padrão do sistema) 
          */}
          <Route path="/v2/clientes" element={<ProtectedRoute><MainLayoutV2><ClientProvider><ClientListV2 /></ClientProvider></MainLayoutV2></ProtectedRoute>} />
          <Route path="/v2/pagamentos" element={<ProtectedRoute><MainLayoutV2><ClientProvider><MonthlyPaymentsV2 /></ClientProvider></MainLayoutV2></ProtectedRoute>} />
          <Route path="/v2/relatorios" element={<ProtectedRoute><MainLayoutV2><ClientProvider><ReportsV2 /></ClientProvider></MainLayoutV2></ProtectedRoute>} />
          <Route path="/v2/feedbacks" element={<ProtectedRoute><MainLayoutV2><FeedbackV2 /></MainLayoutV2></ProtectedRoute>} />
          <Route path="/v2/campos-personalizados" element={<ProtectedRoute><MainLayoutV2><CamposPersonalizadosV2 /></MainLayoutV2></ProtectedRoute>} />
          <Route path="/v2/perfil" element={<ProtectedRoute><MainLayoutV2><UserProfileSettingsV2 /></MainLayoutV2></ProtectedRoute>} />
          <Route path="/v2/indicacoes" element={<ProtectedRoute><MainLayoutV2><ReferralPageV2 /></MainLayoutV2></ProtectedRoute>} />
          <Route path="/v2/assinatura" element={<ProtectedRoute><MainLayoutV2><SubscriptionPageV2 /></MainLayoutV2></ProtectedRoute>} />

          {/* Rotas de Admin V2 */}
          <Route path="/v2/admin/users" element={<AdminRoute><MainLayoutV2><AdminUserManagementV2 /></MainLayoutV2></AdminRoute>} />
          <Route path="/v2/admin/feedbacks" element={<AdminRoute><MainLayoutV2><AdminFeedbackPageV2 /></MainLayoutV2></AdminRoute>} />
          <Route path="/v2/admin/configuracoes" element={<AdminRoute><MainLayoutV2><AdminSettingsV2 /></MainLayoutV2></AdminRoute>} />

          {/* 
            REDIRECIONAMENTOS V1 -> V2 
            Se qualquer usuário acessar links antigos salvos nos favoritos, será jogado para a V2 correspondente 
          */}
          <Route path="/dashboard" element={<Navigate to="/v2/clientes" replace />} />
          <Route path="/monthly" element={<Navigate to="/v2/pagamentos" replace />} />
          <Route path="/reports" element={<Navigate to="/v2/relatorios" replace />} />
          <Route path="/feedback" element={<Navigate to="/v2/feedbacks" replace />} />
          <Route path="/profile" element={<Navigate to="/v2/perfil" replace />} />
          <Route path="/payment" element={<Navigate to="/v2/assinatura" replace />} />
          <Route path="/admin/users" element={<Navigate to="/v2/admin/users" replace />} />
          <Route path="/admin/feedbacks" element={<Navigate to="/v2/admin/feedbacks" replace />} />
          <Route path="/configuracoes" element={<Navigate to="/v2/admin/configuracoes" replace />} />

          {/* 
            Se o usuário já está logado e tenta acessar as rotas de auth (públicas) da raiz 
            ou qualquer caminho não mapeado, manda para a HomePage da Área Logada (Clientes V2)
          */}
          <Route path="/login" element={<Navigate to="/v2/clientes" replace />} />
          <Route path="/cadastro" element={<Navigate to="/v2/clientes" replace />} />
          <Route path="/" element={<Navigate to="/v2/clientes" replace />} />
          <Route path="/v2" element={<Navigate to="/v2/clientes" replace />} />
          <Route path="/v2/login" element={<Navigate to="/v2/clientes" replace />} />
          <Route path="/v2/cadastro" element={<Navigate to="/v2/clientes" replace />} />
          <Route path="*" element={<Navigate to="/v2/clientes" replace />} />
        </>
      )}
    </Routes>
  );
}

// Componente de Loading Spinner
function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-custom"></div>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <SubscriptionProvider>
          <ClientProvider>
            <AppRoutes />
          </ClientProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
