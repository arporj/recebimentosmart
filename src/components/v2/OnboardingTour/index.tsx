import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import toast from 'react-hot-toast';
import { useAuth } from '../../../contexts/AuthContext';

type OnboardingGate = 'account_created' | 'settings_visited' | 'transaction_created';

interface TourStep {
    route?: string;
    /** Item do menu lateral que leva até `route` — destacado antes de navegar, pra ensinar o caminho. */
    menuSelector?: string;
    menuLabel?: string;
    selector?: string;
    gate?: OnboardingGate;
    title: string;
    description: string;
}

const STEPS: TourStep[] = [
    {
        title: 'Bem-vindo(a) ao Recebimento $mart! 🎉',
        description: 'Sua conta já foi criada. Vamos te mostrar o essencial em alguns passos rápidos.',
    },
    {
        route: '/v2/financeiro/contas',
        menuSelector: '[data-tour="tour-menu-contas"]',
        menuLabel: 'Cadastros → Contas',
        selector: '[data-tour="tour-new-account-btn"]',
        gate: 'account_created',
        title: 'Crie sua primeira conta',
        description: 'Pode ser conta corrente, poupança, cartão de crédito ou investimento. É por ela que seus lançamentos entram e saem.',
    },
    {
        // Sem selector de ação aqui: esse passo é conduzido inteiramente pelo passeio de abas
        // (SETTINGS_SUBSTEPS, mais abaixo), que marca "settings_visited" só ao final.
        route: '/v2/perfil',
        menuSelector: '[data-tour="tour-menu-config"]',
        menuLabel: 'Configurações → Configurações da Conta',
        title: 'Ajuste suas configurações',
        description: '',
    },
    {
        route: '/v2/financeiro/categorias',
        menuSelector: '[data-tour="tour-menu-categorias"]',
        menuLabel: 'Cadastros → Categorias',
        selector: '[data-tour="tour-new-category-btn"]',
        title: 'Conheça suas categorias',
        description: 'Você já começa com categorias padrão prontas pra usar. Se quiser, crie novas por aqui a qualquer momento.',
    },
    {
        route: '/v2/financeiro/lancamentos',
        menuSelector: '[data-tour="tour-menu-lancamentos"]',
        menuLabel: 'Gestão Financeira → Lançamentos',
        selector: '[data-tour="tour-new-transaction-btn"]',
        gate: 'transaction_created',
        title: 'Faça seu primeiro lançamento',
        description: 'Registre uma receita ou despesa usando a conta que você acabou de criar.',
    },
];

interface SettingsSubStep {
    tab: 'profile' | 'security' | 'preferences';
    selector: string;
    title: string;
    description: string;
}

// Passeio guiado pelas abas de Configurações da Conta — cada item troca de aba (se preciso),
// rola até o elemento e explica o que dá pra fazer ali. Os 3 últimos ficam dentro de
// "Preferências" de propósito, pra forçar a rolagem por toda a tela antes de liberar o "Próximo".
const SETTINGS_SUBSTEPS: SettingsSubStep[] = [
    {
        tab: 'profile',
        selector: '[data-tour="tour-tab-profile"]',
        title: 'Informações Pessoais',
        description: 'Aqui você edita seu nome e confere o e-mail cadastrado na conta.',
    },
    {
        tab: 'security',
        selector: '[data-tour="tour-tab-security"]',
        title: 'Segurança',
        description: 'Aqui você troca a senha de acesso à plataforma.',
    },
    {
        tab: 'preferences',
        selector: '[data-tour="tour-tab-preferences"]',
        title: 'Preferências',
        description: 'É aqui que fica a maior parte dos ajustes do sistema. Vamos dar uma olhada no que dá pra configurar.',
    },
    {
        tab: 'preferences',
        selector: '[data-tour="tour-pref-alerts"]',
        title: 'Alertas por e-mail',
        description: 'Configure lembretes automáticos de contas a vencer e do fechamento da fatura do cartão.',
    },
    {
        tab: 'preferences',
        selector: '[data-tour="tour-pref-visual"]',
        title: 'Personalização visual',
        description: 'Escolha o tema, a densidade das linhas e como os valores aparecem nas telas.',
    },
    {
        tab: 'preferences',
        selector: '[data-tour="tour-pref-layout"]',
        title: 'Disposição das linhas',
        description: 'E aqui você escolhe o layout de exibição dos seus lançamentos. Viu tudo? Pode seguir em frente.',
    },
];

function resumeStepIndex(progress: Record<string, boolean>): number {
    const nothingDoneYet = !progress.account_created && !progress.settings_visited && !progress.transaction_created;
    if (nothingDoneYet) return 0; // usuário totalmente novo: mostra a boas-vindas
    if (!progress.account_created) return 1;
    if (!progress.settings_visited) return 2;
    if (!progress.transaction_created) return 4; // categoria (passo 3) é informativo, não bloqueia a retomada
    return STEPS.length;
}

// Algumas telas têm mais de um elemento com o mesmo data-tour (variantes responsivas
// mobile/tablet/desktop escondidas via classes Tailwind) — pega só o que está visível.
function findVisibleElement(selector: string): Element | null {
    const candidates = document.querySelectorAll(selector);
    for (const el of candidates) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return el;
    }
    return null;
}

function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Espera o elemento existir e ficar visível e, quando encontra, rola até ele — tanto a
// página quanto qualquer contêiner com scroll próprio (ex: o menu lateral com overflow-y-auto),
// já que scrollIntoView lida com contêineres aninhados, diferente do scroll do driver.js sozinho.
async function waitForElement(selector: string, timeoutMs = 3000, intervalMs = 100): Promise<Element | null> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const el = findVisibleElement(selector);
        if (el) {
            el.scrollIntoView({ block: 'center', behavior: 'auto' });
            await wait(150);
            return el;
        }
        await wait(intervalMs);
    }
    return null;
}

// O link do menu pode estar escondido atrás do hambúrguer (mobile) ou de um submenu
// colapsado ("Cadastros"). Tenta revelar antes de desistir.
async function revealMenuTarget(selector: string): Promise<Element | null> {
    let el = findVisibleElement(selector);
    if (!el) {
        (document.querySelector('[data-tour="tour-mobile-menu-btn"]') as HTMLElement | null)?.click();
        await wait(150);
        el = findVisibleElement(selector);
    }
    if (!el) {
        (document.querySelector('[data-tour="tour-menu-cadastros-toggle"]') as HTMLElement | null)?.click();
        await wait(150);
    }
    return waitForElement(selector, 2000);
}

export function OnboardingTour() {
    const { user, onboardingCompleted, onboardingProgress, markOnboardingStep, completeOnboarding } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const driverRef = useRef<Driver | null>(null);
    const [active, setActive] = useState(false);
    const [stepIndex, setStepIndex] = useState<number | null>(null);
    const [settingsSubIndex, setSettingsSubIndex] = useState(0);

    useEffect(() => {
        if (user && !onboardingCompleted && !active) {
            setStepIndex(resumeStepIndex(onboardingProgress));
            setActive(true);
        }
        if ((!user || onboardingCompleted) && active) {
            driverRef.current?.destroy();
            driverRef.current = null;
            setActive(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, onboardingCompleted]);

    useEffect(() => {
        return () => { driverRef.current?.destroy(); };
    }, []);

    const finishOnboarding = () => {
        driverRef.current?.destroy();
        driverRef.current = null;
        setActive(false);
        completeOnboarding();
    };

    const goToStep = (index: number) => {
        if (index >= STEPS.length) {
            driverRef.current?.destroy();
            driverRef.current = null;
            setActive(false);
            completeOnboarding();
            toast.success('Tudo pronto! Você já sabe o essencial por aqui. 🎉');
            return;
        }
        setSettingsSubIndex(0);
        setStepIndex(index);
    };

    // Renderiza/reposiciona o passo atual do tour
    useEffect(() => {
        if (!active || stepIndex === null) return;
        const step = STEPS[stepIndex];
        const progressLabel = stepIndex === 0 ? '' : `Passo ${stepIndex} de ${STEPS.length - 1} · `;
        const needsMenuPhase = !!step.menuSelector && !!step.route && location.pathname !== step.route;

        let cancelled = false;

        (async () => {
            if (!driverRef.current) {
                driverRef.current = driver({ animate: true, smoothScroll: true, overlayOpacity: 0.6, stagePadding: 6, allowClose: false });
            }

            // ── Fase 1: mostra onde no menu fica a próxima tela, antes de ir pra lá ──
            if (needsMenuPhase) {
                const menuEl = await revealMenuTarget(step.menuSelector!);
                if (cancelled) return;

                driverRef.current.highlight({
                    element: menuEl ?? undefined,
                    popover: {
                        title: `${progressLabel}${step.title}`,
                        description: `Isso fica em ${step.menuLabel}. Clique abaixo pra ir até lá.`,
                        showButtons: ['next', 'close'],
                        nextBtnText: 'Ir até lá',
                        onNextClick: () => {
                            driverRef.current?.destroy();
                            driverRef.current = null;
                            navigate(step.route!);
                        },
                        onCloseClick: finishOnboarding,
                    },
                });
                return;
            }

            // ── Configurações é um caso especial: passeio guiado pelas 3 abas em vez de um
            // único destaque, forçando o usuário a rolar toda a aba Preferências antes de avançar.
            if (stepIndex === 2) {
                const sub = SETTINGS_SUBSTEPS[settingsSubIndex];

                (document.querySelector(`[data-tour="tour-tab-${sub.tab}"]`) as HTMLElement | null)?.click();
                await wait(150);

                const el = await waitForElement(sub.selector);
                if (cancelled) return;

                const isLastSub = settingsSubIndex === SETTINGS_SUBSTEPS.length - 1;

                driverRef.current.highlight({
                    element: el ?? undefined,
                    popover: {
                        title: `Configurações · ${sub.title}`,
                        description: sub.description,
                        showButtons: ['next', 'close'],
                        nextBtnText: 'Próximo',
                        onNextClick: () => {
                            if (isLastSub) {
                                markOnboardingStep('settings_visited');
                                goToStep(stepIndex + 1);
                            } else {
                                setSettingsSubIndex(settingsSubIndex + 1);
                            }
                        },
                        onCloseClick: finishOnboarding,
                    },
                });
                return;
            }

            // ── Fase 2: já na tela certa — destaca a ação em si ──
            const element = step.selector ? await waitForElement(step.selector) : null;
            if (cancelled) return;

            // O overlay do driver.js usa z-index gigantesco (fica acima de tudo por design),
            // o que prende modais do próprio app (z-50) atrás dele quando o botão em destaque
            // é clicado. Assim que o usuário clica no elemento real, derrubamos o overlay na
            // hora pra liberar o modal — o passo seguinte recria o destaque normalmente.
            if (element) {
                element.addEventListener('click', () => {
                    driverRef.current?.destroy();
                    driverRef.current = null;
                }, { once: true });
            }

            const isLast = stepIndex === STEPS.length - 1;

            // Passos "obrigatórios" (conta e lançamento) só avançam quando a ação é concluída,
            // então não mostram botão de avançar manual — só o de fechar/pular.
            let showButtons: Array<'next' | 'previous' | 'close'> = ['close'];
            let nextBtnText = 'Próximo';
            const onNextClick = () => goToStep(stepIndex + 1);

            if (stepIndex === 0) {
                showButtons = ['next', 'close'];
                nextBtnText = 'Vamos lá';
            } else if (stepIndex === 3) {
                // Categoria: informativo, não bloqueia — avança com o botão normal
                showButtons = ['next', 'close'];
            } else if (isLast) {
                showButtons = ['close'];
            }

            driverRef.current.highlight({
                element: element ?? undefined,
                popover: {
                    title: `${progressLabel}${step.title}`,
                    description: step.description,
                    showButtons,
                    nextBtnText,
                    onNextClick,
                    onCloseClick: finishOnboarding,
                },
            });
        })();

        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, stepIndex, location.pathname, settingsSubIndex]);

    // Avança sozinho quando o passo obrigatório atual é concluído em background
    useEffect(() => {
        if (!active || stepIndex === null) return;
        const step = STEPS[stepIndex];
        if (step.gate && onboardingProgress[step.gate]) {
            goToStep(stepIndex + 1);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [onboardingProgress, active, stepIndex]);

    return null;
}

export default OnboardingTour;
