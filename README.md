# Recebimento $mart

> Um sistema de gestão de clientes e pagamentos recorrentes, projetado para autônomos e pequenas empresas. Simplifique suas cobranças e organize suas finanças.

## 🚀 Sobre o Projeto

O Recebimento $mart é uma aplicação web construída para resolver um problema comum: o gerenciamento de pagamentos mensais de clientes. Ele permite que o usuário cadastre seus próprios clientes, defina um valor e um dia de vencimento, e acompanhe facilmente quem está em dia e quem está em atraso.

O projeto utiliza uma arquitetura moderna com React e Vite no frontend para uma experiência de usuário rápida e reativa, e Supabase no backend, aproveitando seus serviços de autenticação, banco de dados em tempo real e Edge Functions para lógicas de negócio seguras.

## ✨ Funcionalidades Principais

- **Autenticação de Usuários:** Sistema completo de cadastro, login e recuperação de senha.
- **Dashboard:** Visão geral e centralizada das informações mais importantes.
- **Gestão de Clientes:** CRUD completo para gerenciar a carteira de clientes.
- **Controle de Pagamentos:** Acompanhamento do status de pagamento de cada cliente (Em dia, Em atraso, Próximo).
- **Notificações Automatizadas:** Envio de e-mails para o administrador em eventos importantes (novos cadastros, primeiros pagamentos).
- **Sistema de Assinatura:** O próprio sistema é um SaaS com um período de trial de 7 dias para novos usuários.
- **Sistema de Indicação:** Usuários podem indicar amigos para ganhar benefícios.

## 🛠️ Tecnologias Utilizadas

- **Frontend:**
  - [React](https://react.dev/)
  - [TypeScript](https://www.typescriptlang.org/)
  - [Vite](https://vitejs.dev/)
  - [Tailwind CSS](https://tailwindcss.com/)
- **Backend (BaaS):**
  - [Supabase](https://supabase.com/) (Database, Auth, Edge Functions)
- **Roteamento:**
  - [React Router DOM](https://reactrouter.com/)
- **Notificações (UI):**
  - [React Hot Toast](https://react-hot-toast.com/)
- **Ícones:**
  - [Lucide React](https://lucide.dev/)
- **Requisições HTTP:**
  - [Axios](https://axios-http.com/)
- **Manipulação de Datas:**
  - [date-fns](https://date-fns.org/)

## ⚙️ Como Começar

Siga os passos abaixo para configurar e rodar o projeto em seu ambiente local.

### Pré-requisitos

- [Node.js](https://nodejs.org/en) (versão 18 ou superior)
- [npm](https://www.npmjs.com/) (geralmente vem com o Node.js)
- Uma conta no [Supabase](https://supabase.com/) para criar seu próprio backend.

### Instalação

1.  **Clone o repositório:**
    ```bash
    git clone https://github.com/seu-usuario/recebimento-smart.git
    ```
2.  **Navegue até o diretório do projeto:**
    ```bash
    cd recebimento-smart
    ```
3.  **Instale as dependências:**
    ```bash
    npm install
    ```

### Variáveis de Ambiente

Para que a aplicação se conecte ao Supabase, você precisa criar um arquivo de variáveis de ambiente.

1.  Crie um arquivo chamado `.env` na raiz do projeto.
2.  Copie o conteúdo do exemplo abaixo e cole no seu arquivo `.env`, substituindo os valores pelas chaves do seu projeto no Supabase.

    ```env
    # Arquivo .env.example

    # Chaves do Supabase (encontradas em Project Settings > API)
    VITE_SUPABASE_URL="https://SUA_URL_DO_PROJETO.supabase.co"
    VITE_SUPABASE_ANON_KEY="SUA_CHAVE_ANON"
    ```

### Rodando o Projeto

Com tudo configurado, inicie o servidor de desenvolvimento:

```bash
npm run dev
```

A aplicação estará disponível em `http://localhost:5173` (ou outra porta, se a 5173 estiver em uso).

---