import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import { ClientList } from './components/ClientList';
import { ClientForm } from './components/ClientForm';
import { ClientListV2 } from './components/v2/ClientListV2';
import { MainLayoutV2 } from './components/v2/MainLayoutV2';
import { Reports } from './components/Reports';
import { MonthlyPayments } from './components/MonthlyPayments';
import { ClientProvider } from './contexts/ClientContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginForm } from './components/LoginForm';
import { ResetPasswordPage } from './components/reset-password';
import { ForgotPasswordPage } from './components/forgot-password';
import { MainLayout } from './components/layout/MainLayout';
import { ProtectedRoute } from './components/ProtectedRoute'; // Importa a nova rota protegida
import { SubscriptionProvider } from './contexts/SubscriptionContext'; // Importa o novo provider

// Importar os novos componentes
import FeedbackPage from './pages/FeedbackPage';
import AdminFeedbackPage from './pages/AdminFeedbackPage';
import SubscriptionPageV2 from './pages/v2/SubscriptionPageV2';
import AdminUserManagementV2 from './pages/v2/AdminUserManagementV2';
import UserProfileSettings from './components/UserProfileSettings';
import { SignUpPage } from './components/SignUpPage';
import Configuracoes from './pages/Configuracoes';
import CamposPersonalizadosV2 from './pages/v2/CamposPersonalizadosV2';
import PaymentSuccessPage from './pages/payment-success';
import ReferralPageV2 from './pages/v2/ReferralPageV2';
import PaymentFailurePage from './pages/payment-failure';
import LandingPage from './pages/LandingPage';
import StitchLanding from './pages/StitchLanding';
import LoginV2 from './components/v2/LoginV2';
import SignUpV2 from './components/v2/SignUpV2';
import ForgotPasswordV2 from './components/v2/ForgotPasswordV2';
import ResetPasswordV2 from './components/v2/ResetPasswordV2';
import AdminChatPage from './pages/AdminChat'; // Importa a página de chat do admin
import MonthlyPaymentsV2 from './pages/v2/MonthlyPaymentsV2';
import ReportsV2 from './pages/v2/ReportsV2';
import FeedbackV2 from './pages/v2/FeedbackV2';
import UserProfileSettingsV2 from './pages/v2/UserProfileSettingsV2';

// Componente para rotas do plano Pró ou superior
function ProRoute({ children }: { children: React.ReactNode }) {
  const { user, plano, isAdmin, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const isProOrAdmin = isAdmin || (plano && ['pro', 'pró', 'premium'].includes(plano.trim().toLowerCase()));

  if (!isProOrAdmin) {
    return <Navigate to="/payment" replace />;
  }

  return <>{children}</>;
}

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

// Componente principal do dashboard
function Dashboard() {
  return (
    <ClientProvider>
      <div className="space-y-8">
        <ClientForm />
        <ClientList />
      </div>
    </ClientProvider>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <Routes>
      {/* Se não há usuário, mostra a landing page e rotas públicas */}
      {!user ? (
        <>
          <Route path="/" element={<LandingPage />} />
          <Route path="/v2" element={<StitchLanding />} />
          <Route path="/v2/login" element={<LoginV2 />} />
          <Route path="/v2/cadastro" element={<SignUpV2 />} />
          <Route path="/v2/forgot-password" element={<ForgotPasswordV2 />} />
          <Route path="/v2/reset-password" element={<ResetPasswordV2 />} />
          <Route path="/login" element={<LoginForm />} />
          <Route path="/cadastro" element={<SignUpPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </>
      ) : (
        <>
          {/* Rotas Protegidas (requerem login) */}
          <Route path="/dashboard" element={<ProtectedRoute><MainLayout><Dashboard /></MainLayout></ProtectedRoute>} />
          <Route path="/monthly" element={<ProtectedRoute><MainLayout><ClientProvider><MonthlyPayments /></ClientProvider></MainLayout></ProtectedRoute>} />
          <Route path="/reports" element={<ProRoute><MainLayout><ClientProvider><Reports /></ClientProvider></MainLayout></ProRoute>} />
          <Route path="/feedback" element={<ProtectedRoute><MainLayout><FeedbackPage /></MainLayout></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><MainLayout><UserProfileSettings /></MainLayout></ProtectedRoute>} />

          {/* Rotas V2 protegidas */}
          <Route path="/v2/clientes" element={<ProtectedRoute><MainLayoutV2><ClientProvider><ClientListV2 /></ClientProvider></MainLayoutV2></ProtectedRoute>} />
          <Route path="/v2/pagamentos" element={<ProtectedRoute><MainLayoutV2><ClientProvider><MonthlyPaymentsV2 /></ClientProvider></MainLayoutV2></ProtectedRoute>} />
          <Route path="/v2/relatorios" element={<ProtectedRoute><MainLayoutV2><ClientProvider><ReportsV2 /></ClientProvider></MainLayoutV2></ProtectedRoute>} />
          <Route path="/v2/feedbacks" element={<ProtectedRoute><MainLayoutV2><FeedbackV2 /></MainLayoutV2></ProtectedRoute>} />
          <Route path="/v2/campos-personalizados" element={<ProtectedRoute><MainLayoutV2><CamposPersonalizadosV2 /></MainLayoutV2></ProtectedRoute>} />
          <Route path="/v2/perfil" element={<ProtectedRoute><MainLayoutV2><UserProfileSettingsV2 /></MainLayoutV2></ProtectedRoute>} />
          <Route path="/v2/indicacoes" element={<ProtectedRoute><MainLayoutV2><ReferralPageV2 /></MainLayoutV2></ProtectedRoute>} />
          <Route path="/v2/assinatura" element={<ProtectedRoute><MainLayoutV2><SubscriptionPageV2 /></MainLayoutV2></ProtectedRoute>} />

          {/* A página de pagamento antiga - redireciona */}
          <Route path="/payment" element={<Navigate to="/v2/assinatura" replace />} />

          {/* Rotas de retorno do pagamento */}
          <Route path="/payment-success" element={<ProtectedRoute><PaymentSuccessPage /></ProtectedRoute>} />
          <Route path="/payment-failure" element={<ProtectedRoute><PaymentFailurePage /></ProtectedRoute>} />

          {/* Rotas de Admin */}
          <Route path="/v2/admin/users" element={<AdminRoute><MainLayoutV2><AdminUserManagementV2 /></MainLayoutV2></AdminRoute>} />
          <Route path="/admin/users" element={<Navigate to="/v2/admin/users" replace />} />
          <Route path="/admin/feedbacks" element={<AdminRoute><MainLayout><AdminFeedbackPage /></MainLayout></AdminRoute>} />
          <Route path="/admin/chat" element={<AdminRoute><MainLayout><AdminChatPage /></MainLayout></AdminRoute>} />
          <Route path="/configuracoes" element={<AdminRoute><MainLayout><Configuracoes /></MainLayout></AdminRoute>} />

          {/* Se o usuário logado tentar acessar rotas públicas, redireciona para o dashboard */}
          <Route path="/login" element={<Navigate to="/dashboard" replace />} />
          <Route path="/cadastro" element={<Navigate to="/dashboard" replace />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/v2" element={<Navigate to="/v2/clientes" replace />} />
          <Route path="/v2/login" element={<Navigate to="/v2/clientes" replace />} />
          <Route path="/v2/cadastro" element={<Navigate to="/v2/clientes" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
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
