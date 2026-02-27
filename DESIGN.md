# Design System: Recebimento Smart V2
**Project ID:** 7069731655489929626

## 1. Visual Theme & Atmosphere
O layout transmite uma sensação **limpa, arejada e confiável**. Inspirado no estilo SaaS moderno/fintech, com generoso espaço em branco, elementos glassmórficos sutis e hierarquia visual clara. A atmosfera é de **profissionalismo acessível** — sofisticado o bastante para transmitir segurança, mas leve e amigável para não intimidar.

## 2. Color Palette & Roles

| Nome Descritivo | Hex | Função |
|---|---|---|
| Teal Vibrante | `#20B2AA` (Tailwind: `custom`) | Cor primária — botões, links, destaques, ícones ativos |
| Teal Profundo | `#1A9D94` (Tailwind: `custom-hover`) | Hover/pressed state dos botões primários |
| Verde Claro Sutil | `secondary-50` a `secondary-100` | Backgrounds de seção, badges, trust signals |
| Branco Neve | `#FFFFFF` | Fundo principal do modo light |
| Cinza Fumaça | `#F9FAFB` (Tailwind: `gray-50`) | Fundo alternativo de seções (light mode) |
| Grafite Profundo | `#0F172A` (Tailwind: `slate-900`) | Texto de título no modo escuro |
| Cinza Médio | `#6B7280` (Tailwind: `gray-500`) | Texto secundário e labels |
| Slate Chumbo | `#1E293B` (Tailwind: `slate-800`) | Superfícies do dark mode |
| Branco Translúcido | `rgba(255, 255, 255, 0.75)` | Efeito glassmorphism (`.glass`) |
| Verde Sucesso | `#22C55E` | Ícones de check, confirmação, trending up |

## 3. Typography Rules
- **Família tipográfica:** Sans-serif do sistema (fonte padrão do Tailwind)
- **Títulos (h1-h2):** `font-extrabold`, tamanhos `text-4xl` a `text-6xl`, tracking tight
- **Subtítulos (h3):** `font-bold`, `text-xl` a `text-3xl`
- **Corpo:** `text-sm` a `text-base`, peso normal, cor `slate-600` (light) ou `slate-400` (dark)
- **Labels/Badges:** `text-xs`, `uppercase`, `tracking-wider`, `font-bold`

## 4. Component Stylings
* **Botões Primários:** Cantos generosamente arredondados (`rounded-xl` a `rounded-full`), fundo `custom`, texto branco, sombra `shadow-lg` com tint da cor primária. Hover: escurece levemente + `hover:-translate-y-1`.
* **Botões Secundários:** Borda 2px `custom`, texto `custom`, fundo transparente. Hover: preenche com cor primária.
* **Cards/Containers:** Cantos arredondados (`rounded-2xl`), efeito glassmorphism com backdrop-blur sutil (`glass`), borda fina translúcida.
* **Cards Destacados:** Fundo preenchido `custom` com texto branco, sombra elevada com tint primária (`shadow-xl shadow-custom/20`).
* **Inputs/Forms:** Borda `border-slate-300`, cantos `rounded-lg`, focus ring na cor `custom`, fundo branco.
* **Ícones:** via `lucide-react`, tamanho 16-28px, cor `custom` ou branco (em fundo colorido).

## 5. Layout Principles
- **Max-width:** `max-w-7xl` para conteúdo geral, `max-w-4xl` para hero/texto centralizado
- **Espaçamento vertical:** Seções com `py-20` a `py-24`, generoso breathing room
- **Grid:** `grid-cols-1` mobile → `md:grid-cols-2` ou `md:grid-cols-3` desktop
- **Alinhamento:** Centralizado para hero e CTA, left-aligned para conteúdo informativo
- **Responsividade:** Mobile-first, breakpoints no `md:` e `sm:`

## 6. Design System Notes for Stitch Generation

```
DESIGN SYSTEM (REQUIRED):
- Platform: Web, Desktop-first, responsivo
- Theme: Light mode por padrão, clean, moderno, SaaS/fintech
- Background: Branco (#FFFFFF) com seções alternadas em Cinza Claro (#F9FAFB)
- Primary Accent: Teal Vibrante (#20B2AA) para botões, links e destaques
- Primary Hover: Teal Profundo (#1A9D94) para hover states
- Text Primary: Grafite (#111827) para títulos e labels
- Text Secondary: Cinza Médio (#6B7280) para corpo e descrições
- Buttons: Generosamente arredondados (rounded-xl), sombra com tint primária, transição suave
- Cards: rounded-2xl, glassmorphism sutil com backdrop-blur, borda translúcida
- Inputs: Borda cinza clara, rounded-lg, focus ring teal
- Icons: Lucide-style outline, tamanhos 16-28px
- Typography: Sans-serif do sistema, títulos extrabold, corpo normal
- Spacing: Generoso, seções com py-20+, max-width 7xl
- Marca: Logo "RecebimentoSmart" com "Smart" em teal, ícone wallet em caixa teal arredondada
```
