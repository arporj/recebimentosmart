import React, { useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { ClientList } from './components/ClientList';
import { ClientForm } from './components/ClientForm';
import { Reports } from './components/Reports';
import { MonthlyPayments } from './components/MonthlyPayments';
import { Users, BarChart, AlertCircle, Calendar } from 'lucide-react';
import { ClientProvider } from './contexts/ClientContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginForm } from './components/LoginForm';
import { UserMenu } from './components/UserMenu';

type View = 'clients' | 'reports' | 'status' | 'monthly';

function AppContent() {
  const [view, setView] = useState<View>('clients');
  const { user } = useAuth();

  if (!user) {
    return <LoginForm />;
  }

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
                    src="/images/header.png" // Atualize o caminho da sua imagem
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
        </main>
      </div>
    </ClientProvider>
  );
}

function App() {
  return (
    <AuthProvider>
        <AppContent />
    </AuthProvider>
  );
}

export default App;