import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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

// Importar os novos componentes
import FeedbackForm from './components/FeedbackForm';
import PaymentIntegration from './components/PaymentIntegration';
import AdminUserManagement from './components/AdminUserManagement';
import UserProfileSettings from './components/UserProfileSettings';
import ChangePassword from './components/ChangePassword';
import { SignUpPage } from './components/SignUpPage';
import ReferralPage from './components/ReferralPage';

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
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div>Carregando...</div>; // Pode ser um spinner
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  const isAdmin = user.email === 'arporj@gmail.com' || user.email === 'andre@andreric.com';
  
  if (!isAdmin) {
    return <Navigate to="/" replace />;
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

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster {...toasterConfig} />
        <Routes>
          {/* Rotas Públicas */}
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/login" element={<LoginForm />} />
          <Route path="/cadastro" element={<SignUpPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Rota de Pagamento (acessível mesmo sem pagamento em dia) */}
          <Route 
            path="/payment" 
            element={
              <ProtectedRoute>
                <MainLayout>
                  <PaymentIntegration />
                </MainLayout>
              </ProtectedRoute>
            } 
          />

          {/* Rotas Protegidas por Pagamento */}
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <MainLayout>
                  <Dashboard />
                </MainLayout>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/monthly" 
            element={
              <ProtectedRoute>
                <MainLayout currentView='monthly'>
                  <ClientProvider>
                    <MonthlyPayments />
                  </ClientProvider>
                </MainLayout>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/reports" 
            element={
              <ProtectedRoute>
                <MainLayout currentView='reports'>
                  <ClientProvider>
                    <Reports />
                  </ClientProvider>
                </MainLayout>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/feedback" 
            element={
              <ProtectedRoute>
                <MainLayout>
                  <FeedbackForm />
                </MainLayout>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/profile" 
            element={
              <ProtectedRoute>
                <MainLayout>
                  <UserProfileSettings />
                </MainLayout>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/change-password" 
            element={
              <ProtectedRoute>
                <MainLayout>
                  <ChangePassword />
                </MainLayout>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/indicacoes" 
            element={
              <ProtectedRoute>
                <MainLayout>
                  <ReferralPage />
                </MainLayout>
              </ProtectedRoute>
            } 
          />

          {/* Rota de Admin */}
          <Route 
            path="/admin/users" 
            element={
              <AdminRoute>
                <MainLayout>
                  <AdminUserManagement />
                </MainLayout>
              </AdminRoute>
            } 
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;