import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { driver, type Driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import toast from 'react-hot-toast';
import { useAuth } from '../../../contexts/AuthContext';

type OnboardingGate = 'account_created' | 'settings_visited' | 'transaction_created';

interface TourStep {
    route?: string;
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
        selector: '[data-tour="tour-new-account-btn"]',
        gate: 'account_created',
        title: 'Crie sua primeira conta',
        description: 'Pode ser conta corrente, poupança, cartão de crédito ou investimento. É por ela que seus lançamentos entram e saem.',
    },
    {
        // Sem "gate" de propósito: o avanço desse passo é feito manualmente no onNextClick
        // (com um pequeno delay), não pelo efeito de auto-avanço — ver comentário abaixo.
        title: 'Ajuste suas configurações',
        description: 'Em Configurações da Conta você define notificações por e-mail, o tom do assistente Artie e como os valores aparecem nas telas. Dê uma olhada — o tour continua sozinho em alguns segundos.',
    },
    {
        route: '/v2/financeiro/categorias',
        selector: '[data-tour="tour-new-category-btn"]',
        title: 'Conheça suas categorias',
        description: 'Você já começa com categorias padrão prontas pra usar. Se quiser, crie novas por aqui a qualquer momento.',
    },
    {
        route: '/v2/financeiro/lancamentos',
        selector: '[data-tour="tour-new-transaction-btn"]',
        gate: 'transaction_created',
        title: 'Faça seu primeiro lançamento',
        description: 'Registre uma receita ou despesa usando a conta que você acabou de criar.',
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

// Algumas telas têm mais de um botão com o mesmo data-tour (variantes responsivas
// mobile/tablet/desktop escondidas via classes Tailwind) — pega só a que está visível.
function findVisibleElement(selector: string): Element | null {
    const candidates = document.querySelectorAll(selector);
    for (const el of candidates) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return el;
    }
    return null;
}

function waitForElement(selector: string, timeoutMs = 3000, intervalMs = 100): Promise<Element | null> {
    return new Promise((resolve) => {
        const start = Date.now();
        const check = () => {
            const el = findVisibleElement(selector);
            if (el) return resolve(el);
            if (Date.now() - start >= timeoutMs) return resolve(null);
            setTimeout(check, intervalMs);
        };
        check();
    });
}

export function OnboardingTour() {
    const { user, onboardingCompleted, onboardingProgress, markOnboardingStep, completeOnboarding } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const driverRef = useRef<Driver | null>(null);
    const [active, setActive] = useState(false);
    const [stepIndex, setStepIndex] = useState<number | null>(null);

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
        setStepIndex(index);
    };

    // Renderiza/reposiciona o passo atual do tour
    useEffect(() => {
        if (!active || stepIndex === null) return;
        const step = STEPS[stepIndex];

        if (step.route && location.pathname !== step.route) {
            navigate(step.route);
            return;
        }

        let cancelled = false;

        (async () => {
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

            if (!driverRef.current) {
                driverRef.current = driver({ animate: true, overlayOpacity: 0.6, stagePadding: 6, allowClose: false });
            }

            const isLast = stepIndex === STEPS.length - 1;
            const progressLabel = stepIndex === 0 ? '' : `Passo ${stepIndex} de ${STEPS.length - 1} · `;

            // Passos "obrigatórios" (conta e lançamento) só avançam quando a ação é concluída,
            // então não mostram botão de avançar manual — só o de fechar/pular.
            let showButtons: Array<'next' | 'previous' | 'close'> = ['close'];
            let nextBtnText = 'Próximo';
            let onNextClick = () => goToStep(stepIndex + 1);

            if (stepIndex === 0) {
                showButtons = ['next', 'close'];
                nextBtnText = 'Vamos lá';
            } else if (stepIndex === 2) {
                // Configurações: conta como concluído ao visitar a tela. Navega e dá um respiro
                // antes de avançar sozinho, pra não arrancar o usuário da tela assim que ele chega.
                showButtons = ['next', 'close'];
                nextBtnText = 'Ver Configurações';
                onNextClick = () => {
                    markOnboardingStep('settings_visited');
                    navigate('/v2/perfil');
                    driverRef.current?.destroy();
                    driverRef.current = null;
                    setTimeout(() => goToStep(stepIndex + 1), 4000);
                };
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
    }, [active, stepIndex, location.pathname]);

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
