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

// Importar os novos componentes
import FeedbackForm from './components/FeedbackForm';
import PaymentIntegration from './components/PaymentIntegration';
import AdminUserManagement from './components/AdminUserManagement';
import UserProfileSettings from './components/UserProfileSettings';
import ChangePassword from './components/ChangePassword';

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
  const [view, setView] = React.useState('clients');
  
  // Adicionar listener para fechar notificações ao clique
  React.useEffect(() => {
    const handleToastClick = (e: MouseEvent) => {
      const toastElement = (e.target as Element)?.closest('[data-hot-toast-container] > div');
      if (toastElement) {
        toast.dismiss();
      }
    };
    
    document.addEventListener('click', handleToastClick);
    return () => document.removeEventListener('click', handleToastClick);
  }, []);
  
  return (
    <ClientProvider>
      <div className="min-h-screen bg-gray-50">
        <Toaster {...toasterConfig} />
        
        {/* Navigation */}
        <nav className="bg-white shadow-sm" style={{ zIndex: 100 }}>
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
                  <Link
                    to="/monthly"
                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    <Calendar className="h-4 w-4 mr-2" />
                    Pagamentos do Mês
                  </Link>
                  <Link
                    to="/reports"
                    className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                  >
                    <BarChart className="h-4 w-4 mr-2" />
                    Relatórios
                  </Link>
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
          
          {/* Novas views */}
          {view === 'feedback' && <FeedbackForm />}
          {view === 'payment' && <PaymentIntegration />}
          {view === 'admin/users' && <AdminUserManagement />}
          {view === 'profile' && <UserProfileSettings />}
          {view === 'change-password' && <ChangePassword />}
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
          <Route 
            path="/monthly" 
            element={
              <ProtectedRoute>
                <ClientProvider>
                  <div className="min-h-screen bg-gray-50">
                    <Toaster {...toasterConfig} />
                    <nav className="bg-white shadow-sm" style={{ zIndex: 100 }}>
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
                              <Link
                                to="/"
                                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                              >
                                <Users className="h-4 w-4 mr-2" />
                                Clientes
                              </Link>
                              <Link
                                to="/monthly"
                                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md bg-custom text-white hover:bg-custom-hover"
                              >
                                <Calendar className="h-4 w-4 mr-2" />
                                Pagamentos do Mês
                              </Link>
                              <Link
                                to="/reports"
                                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                              >
                                <BarChart className="h-4 w-4 mr-2" />
                                Relatórios
                              </Link>
                            </div>
                            <UserMenu />
                          </div>
                        </div>
                      </div>
                    </nav>
                    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                      <MonthlyPayments />
                    </main>
                  </div>
                </ClientProvider>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/reports" 
            element={
              <ProtectedRoute>
                <ClientProvider>
                  <div className="min-h-screen bg-gray-50">
                    <Toaster {...toasterConfig} />
                    <nav className="bg-white shadow-sm" style={{ zIndex: 100 }}>
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
                              <Link
                                to="/"
                                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                              >
                                <Users className="h-4 w-4 mr-2" />
                                Clientes
                              </Link>
                              <Link
                                to="/monthly"
                                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                              >
                                <Calendar className="h-4 w-4 mr-2" />
                                Pagamentos do Mês
                              </Link>
                              <Link
                                to="/reports"
                                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md bg-custom text-white hover:bg-custom-hover"
                              >
                                <BarChart className="h-4 w-4 mr-2" />
                                Relatórios
                              </Link>
                            </div>
                            <UserMenu />
                          </div>
                        </div>
                      </div>
                    </nav>
                    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                      <Reports />
                    </main>
                  </div>
                </ClientProvider>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/feedback" 
            element={
              <ProtectedRoute>
                <ClientProvider>
                  <div className="min-h-screen bg-gray-50">
                    <Toaster {...toasterConfig} />
                    <nav className="bg-white shadow-sm" style={{ zIndex: 100 }}>
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
                              <Link
                                to="/"
                                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                              >
                                <Users className="h-4 w-4 mr-2" />
                                Clientes
                              </Link>
                              <Link
                                to="/monthly"
                                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                              >
                                <Calendar className="h-4 w-4 mr-2" />
                                Pagamentos do Mês
                              </Link>
                              <Link
                                to="/reports"
                                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                              >
                                <BarChart className="h-4 w-4 mr-2" />
                                Relatórios
                              </Link>
                            </div>
                            <UserMenu />
                          </div>
                        </div>
                      </div>
                    </nav>
                    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                      <FeedbackForm />
                    </main>
                  </div>
                </ClientProvider>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/payment" 
            element={
              <ProtectedRoute>
                <ClientProvider>
                  <div className="min-h-screen bg-gray-50">
                    <Toaster {...toasterConfig} />
                    <nav className="bg-white shadow-sm" style={{ zIndex: 100 }}>
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
                              <Link
                                to="/"
                                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                              >
                                <Users className="h-4 w-4 mr-2" />
                                Clientes
                              </Link>
                              <Link
                                to="/monthly"
                                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                              >
                                <Calendar className="h-4 w-4 mr-2" />
                                Pagamentos do Mês
                              </Link>
                              <Link
                                to="/reports"
                                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                              >
                                <BarChart className="h-4 w-4 mr-2" />
                                Relatórios
                              </Link>
                            </div>
                            <UserMenu />
                          </div>
                        </div>
                      </div>
                    </nav>
                    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                      <PaymentIntegration />
                    </main>
                  </div>
                </ClientProvider>
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/admin/users" 
            element={
              <AdminRoute>
                <ClientProvider>
                  <div className="min-h-screen bg-gray-50">
                    <Toaster {...toasterConfig} />
                    <nav className="bg-white shadow-sm" style={{ zIndex: 100 }}>
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
                              <Link
                                to="/"
                                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                              >
                                <Users className="h-4 w-4 mr-2" />
                                Clientes
                              </Link>
                              <Link
                                to="/monthly"
                                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                              >
                                <Calendar className="h-4 w-4 mr-2" />
                                Pagamentos do Mês
                              </Link>
                              <Link
                                to="/reports"
                                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                              >
                                <BarChart className="h-4 w-4 mr-2" />
                                Relatórios
                              </Link>
                            </div>
                            <UserMenu />
                          </div>
                        </div>
                      </div>
                    </nav>
                    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                      <AdminUserManagement />
                    </main>
                  </div>
                </ClientProvider>
              </AdminRoute>
            } 
          />
          <Route 
            path="/change-password" 
            element={
              <ProtectedRoute>
                <ClientProvider>
                  <div className="min-h-screen bg-gray-50">
                    <Toaster {...toasterConfig} />
                    <nav className="bg-white shadow-sm" style={{ zIndex: 100 }}>
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
                              <Link
                                to="/"
                                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                              >
                                <Users className="h-4 w-4 mr-2" />
                                Clientes
                              </Link>
                              <Link
                                to="/monthly"
                                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                              >
                                <Calendar className="h-4 w-4 mr-2" />
                                Pagamentos do Mês
                              </Link>
                              <Link
                                to="/reports"
                                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200"
                              >
                                <BarChart className="h-4 w-4 mr-2" />
                                Relatórios
                              </Link>
                            </div>
                            <UserMenu />
                          </div>
                        </div>
                      </div>
                    </nav>
                    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                      <ChangePassword />
                    </main>
                  </div>
                </ClientProvider>
              </ProtectedRoute>
            } 
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

