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
import UserMenu from './components/UserMenu';
import { ResetPasswordPage } from './components/reset-password';
import { ForgotPasswordPage } from './components/forgot-password';
import { Users, BarChart, AlertCircle, Calendar } from 'lucide-react';

// Importar os novos componentes
import FeedbackForm from './components/FeedbackForm';
import PaymentIntegration from './components/PaymentIntegration';
import AdminUserManagement from './components/AdminUserManagement';
import UserProfileSettings from './components/UserProfileSettings';

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
  const [view, setView] = React.useState('clients');
  
  return (
    <ClientProvider>
      <div className="min-h-screen bg-gray-50">
        <Toaster position="top-right" />
        
        {/* Navigation */}
        <nav className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex">
                <div className="sm:mx-auto sm:w-full sm:max-w-md">
                  <img
                    className="mx-auto h-12 w-auto"
                    src="/images/header.png"
                    alt="RecebimentoSmart"
                  />
                </div>
              </div>
              <div className="flex items-center space-x-4">
                {/* Botões visíveis apenas em telas médias e maiores */}
                <div className="hidden md:flex md:space-x-4">
                  <button
                    onClick={() => setView('clients')}
                    className={`inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md ${
                      view === 'clients'
                        ? 'bg-custom text-white hover:bg-custom-hover'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <Users className="h-4 w-4 mr-2" />
                    Clientes
                  </button>
                  <button
                    onClick={() => setView('monthly')}
                    className={`inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md ${
                      view === 'monthly'
                        ? 'bg-custom text-white hover:bg-custom-hover'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    Pagamentos do Mês
                  </button>
                  <button
                    onClick={() => setView('reports')}
                    className={`inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md ${
                      view === 'reports'
                        ? 'bg-custom text-white hover:bg-custom-hover'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    <BarChart className="h-4 w-4 mr-2" />
                    Relatórios
                  </button>
                </div>
                {/* Menu do usuário com os botões de navegação em telas pequenas */}
                <UserMenu currentView={view} onViewChange={setView} />
              </div>
            </div>
          </div>
        </nav>

        {/* Main content */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {view === 'clients' && (
            <div className="space-y-8">
              <ClientForm />
              <ClientList />
            </div>
          )}
          {view === 'monthly' && <MonthlyPayments />}
          {view === 'reports' && <Reports />}
          
          {/* Novas views */}
          {view === 'feedback' && <FeedbackForm />}
          {view === 'payment' && <PaymentIntegration />}
          {view === 'admin/users' && <AdminUserManagement />}
          {view === 'profile' && <UserProfileSettings />}
          {view === 'change-password' && (
            <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-md">
              <h1 className="text-2xl font-bold text-gray-800 mb-6">Trocar Senha</h1>
              {/* Implementar formulário de troca de senha aqui */}
              <p className="text-gray-600">Funcionalidade em desenvolvimento.</p>
            </div>
          )}
        </main>
      </div>
    </ClientProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/login" element={<LoginForm />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route 
            path="/" 
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            } 
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
