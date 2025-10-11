import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { ClientList } from './components/ClientList';
import { ClientForm } from './components/ClientForm';
import { Reports } from './components/Reports';
import { MonthlyPayments } from './components/MonthlyPayments';
import { ClientProvider } from './contexts/ClientContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginForm } from './components/LoginForm';
import { ResetPasswordPage } from './components/reset-password';
import { ForgotPasswordPage } from './components/forgot-password';
import { MainLayout } from './components/layout/MainLayout';
import { ProtectedRoute } from './components/ProtectedRoute'; // Importa a nova rota protegida
import { PagarmeProvider } from './contexts/PagarmeContext';

// Importar os novos componentes
import FeedbackForm from './components/FeedbackForm';
import SubscriptionPage from './pages/SubscriptionPage';
import AdminUserManagement from './components/AdminUserManagement';
import UserProfileSettings from './components/UserProfileSettings';
import ChangePassword from './components/ChangePassword';
import { SignUpPage } from './components/SignUpPage';
import ReferralPage from './components/ReferralPage';
import Configuracoes from './pages/Configuracoes';
import CamposPersonalizados from './pages/CamposPersonalizados'; // Importa a nova página
import PaymentSuccessPage from './pages/payment-success';
import PaymentFailurePage from './pages/payment-failure';
import LandingPage from './pages/LandingPage';
import AdminChatPage from './pages/AdminChat'; // Importa a página de chat do admin

// Configuração global do Toaster
const toasterConfig = {
  position: "top-right" as const,
  toastOptions: {
    duration: 4000,
    style: {
      zIndex: 50,
      marginTop: '70px',
      marginRight: '16px',
      cursor: 'pointer',
    },
    success: {
      style: {
        background: '#10B981',
        color: 'white',
      },
    },
    error: {
      style: {
        background: '#EF4444',
        color: 'white',
      },
    },
  }
};

// Componente para rotas de administrador
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAuth();
  
  if (loading) {
    return <LoadingSpinner />;
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
          <Route path="/reports" element={<ProtectedRoute><MainLayout><ClientProvider><Reports /></ClientProvider></MainLayout></ProtectedRoute>} />
          <Route path="/feedback" element={<ProtectedRoute><MainLayout><FeedbackForm /></MainLayout></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><MainLayout><UserProfileSettings /></MainLayout></ProtectedRoute>} />
          <Route path="/change-password" element={<ProtectedRoute><MainLayout><ChangePassword /></MainLayout></ProtectedRoute>} />
          <Route path="/indicacoes" element={<ProtectedRoute><MainLayout><ReferralPage /></MainLayout></ProtectedRoute>} />
          <Route path="/payment" element={<ProtectedRoute><MainLayout><SubscriptionPage /></MainLayout></ProtectedRoute>} />
          <Route path="/campos-personalizados" element={<ProtectedRoute><MainLayout><CamposPersonalizados /></MainLayout></ProtectedRoute>} />

          {/* Rotas de retorno do pagamento */}
          <Route path="/payment-success" element={<ProtectedRoute><PaymentSuccessPage /></ProtectedRoute>} />
          <Route path="/payment-failure" element={<ProtectedRoute><PaymentFailurePage /></ProtectedRoute>} />

          {/* Rotas de Admin */}
          <Route path="/admin/users" element={<AdminRoute><MainLayout><AdminUserManagement /></MainLayout></AdminRoute>} />
          <Route path="/admin/chat" element={<AdminRoute><MainLayout><AdminChatPage /></MainLayout></AdminRoute>} />
          <Route path="/configuracoes" element={<AdminRoute><MainLayout><Configuracoes /></MainLayout></AdminRoute>} />
          
          {/* Se o usuário logado tentar acessar rotas públicas, redireciona para o dashboard */}
          <Route path="/login" element={<Navigate to="/dashboard" replace />} />
          <Route path="/cadastro" element={<Navigate to="/dashboard" replace />} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
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
        <ClientProvider>
          <AppRoutes />
        </ClientProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
