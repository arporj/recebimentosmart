# 🎨 Design System: Recebimento Smart V2

**Project ID no Stitch:** `7069731655489929626`  
Este guia estabelece as diretrizes estéticas, regras tipográficas e tokens visuais utilizados em toda a reescrita de interface da versão 2.0.

---

## 💡 1. Tema Visual & Atmosfera

A interface deve transmitir uma percepção **limpa, confiável e profissional**. Desenvolvido sob as premissas de interfaces SaaS/Fintech modernas, utiliza-se generoso espaço negativo (white-space), contornos finos, efeitos de *glassmorphism* e forte constrate tipográfico para focar a atenção nos dados do usuário.

---

## 🎨 2. Paleta de Cores & Tokens

Abaixo estão listadas as cores e papéis definidos no projeto (baseados no arquivo de configuração do Tailwind):

| Nome Técnico | Cor / Hex | Função Primária no Layout |
| :--- | :--- | :--- |
| **Teal Vibrante** | `#20B2AA` (`custom`) | Cor principal de destaque: botões ativos, links focados e badges. |
| **Teal Profundo** | `#1A9D94` (`custom-hover`) | Estado hover de componentes acionáveis primários. |
| **Verde Sucesso** | `#22C55E` | Feedback positivo: ícones de check, relatórios de lucro e indicadores de crescimento. |
| **Branco Neve** | `#FFFFFF` | Superfície e fundo principal para o Light Mode. |
| **Cinza Fumaça** | `#F9FAFB` (`gray-50`) | Fundo alternado para divisão visual de seções. |
| **Grafite Profundo** | `#0F172A` (`slate-900`) | Cores de fonte para cabeçalhos, títulos principais e texto em Dark Mode. |
| **Cinza Médio** | `#6B7280` (`gray-500`) | Texto secundário, legendas e labels desativadas. |
| **Chumbo Escuro** | `#1E293B` (`slate-800`) | Background de containers no modo escuro. |
| **Branco Translúcido** | `rgba(255, 255, 255, 0.75)` | Efeito Glassmorphism via classe `.glass`. |

---

## ✍️ 3. Tipografia

A tipografia padronizada baseia-se nas fontes nativas do sistema operacionais otimizadas para legibilidade em tela:

* **Fonte Principal:** Sans-serif nativa do Tailwind.
* **Títulos e Destaques (H1 e H2):** Peso `font-extrabold`, com tamanhos entre `text-4xl` e `text-6xl` e espaçamento entre letras mais denso (`tracking-tight`).
* **Subtítulos (H3):** Peso `font-bold` e tamanho variando de `text-xl` a `text-3xl`.
* **Corpo de Texto:** Tamanhos `text-sm` ou `text-base`, peso normal (`font-normal`), variando tons entre `slate-600` (Modo Claro) e `slate-400` (Modo Escuro).
* **Metadados & Badges:** Tamanho reduzido `text-xs`, obrigatoriamente em caixa alta (`uppercase`), negrito e com espaçamento expandido (`tracking-wider`).

---

## 📦 4. Estilização de Componentes

* **Botões Primários:** Cantos amplamente arredondados (`rounded-xl` a `rounded-full`). Devem possuir sombra com matiz teal vibrante (`shadow-lg shadow-custom/20`) e possuir animação de elevação suave no hover (`hover:-translate-y-0.5`).
* **Botões Secundários:** Estrutura com borda transparente ou contorno de 2px na cor primária. No hover, preenchem o fundo integralmente.
* **Containers & Cards:** Devem utilizar `rounded-2xl`, possuir sombra discreta ou aplicar o efeito Glassmorphism através de `backdrop-blur` leve e bordas finas e claras.
* **Campos de Formulário:** Bordas no tom `border-slate-300` com cantos `rounded-lg`. O foco (`focus-within`) deve acionar o anel de iluminação na cor `custom`.
* **Ícones:** Utilizar estritamente a biblioteca `lucide-react` em tamanhos uniformes (geralmente entre `16px` e `28px`).

---

## 📐 5. Princípios de Layout

* **Responsividade:** Implementação obrigatória de padrões Mobile-First. Otimizar breakpoints no `sm:` e `md:`.
* **Largura Máxima:** Utilizar `max-w-7xl` para painéis centrais e páginas estruturais, e `max-w-4xl` para áreas de texto focado ou fluxos únicos de leitura.
* **Respiro Visual:** Sessões intercaladas por espaçamento vertical generoso (`py-20` a `py-24`).

---

## 🤖 6. Metadados de Geração do Stitch (Stitch Prompts)

Para a criação de novas telas via MCP do Stitch, utilize o seguinte bloco de configuração básica nas instruções do prompt:

```text
DESIGN SYSTEM:
- Platform: Web, Desktop-first, fully responsive
- Theme: Light mode by default, clean, modern, fintech style
- Background: #FFFFFF with sections in #F9FAFB
- Primary Accent: Teal (#20B2AA) for primary actions
- Primary Hover: Deep Teal (#1A9D94) for states
- Typography: System Sans, extrabold titles, standard body weight
- Spacing: Large sections (py-20+), max-width 7xl
- Visuals: rounded-2xl cards, subtle glassmorphism, shadow effects
- Logo: "RecebimentoSmart" with "Smart" highlighted in primary accent
```
