import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';
import { ClientList } from './components/ClientList';
import { ClientForm } from './components/ClientForm';
import { Reports } from './components/Reports';
import { MonthlyPayments } from './components/MonthlyPayments';
import { ClientProvider } from './contexts/ClientContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginForm } from './components/LoginForm';
import UserMenu from './components/UserMenu';
import { ResetPasswordPage } from './components/reset-password';
import { ForgotPasswordPage } from './components/forgot-password';
import { Users, BarChart, AlertCircle, Calendar } from 'lucide-react';

import { MainLayout } from './components/layout/MainLayout';

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
      zIndex: 50, // Menor que o z-index do menu
      marginTop: '70px', // Espaço para não sobrepor o menu
      marginRight: '16px',
      cursor: 'pointer', // Indica que é clicável
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

// Componente para rotas protegidas
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div>Carregando...</div>;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

// Componente para rotas de administrador
function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  
  if (loading) {
    return <div>Carregando...</div>;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  // Verificar se o usuário é administrador
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
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/login" element={<LoginForm />} />
          <Route path="/cadastro" element={<SignUpPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
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
                  <ClientProvider>
                    <FeedbackForm />
                  </ClientProvider>
                </MainLayout>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/payment" 
            element={
              <ProtectedRoute>
                <MainLayout>
                  <ClientProvider>
                    <PaymentIntegration />
                  </ClientProvider>
                </MainLayout>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/users" 
            element={
              <ProtectedRoute>
                <MainLayout>
                  <ClientProvider>
                    <AdminUserManagement />
                  </ClientProvider>
                </MainLayout>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/profile" 
            element={
              <ProtectedRoute>
                <MainLayout>
                  <ClientProvider>
                    <UserProfileSettings />
                  </ClientProvider>
                </MainLayout>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/change-password" 
            element={
              <ProtectedRoute>
                <MainLayout>
                  <ClientProvider>
                    <ChangePassword />
                  </ClientProvider>
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
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

