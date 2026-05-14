import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Sparkles, ExternalLink } from 'lucide-react';

// Tipos suportados de posicionamento do banner
type AdFormat = 'sidebar' | 'horizontal' | 'inline';

interface AdBannerProps {
  format?: AdFormat;
  slotId?: string; // Caso precise injetar um slot de anúncio específico do Google AdSense
  className?: string;
}

export const AdBanner: React.FC<AdBannerProps> = ({ 
  format = 'horizontal', 
  slotId = 'default-slot', 
  className = '' 
}) => {
  const { plano } = useAuth();
  const [isDev, setIsDev] = useState(false);

  // Apenas usuários no plano Free visualizam anúncios
  const shouldShowAd = plano === 'free';

  useEffect(() => {
    // Detecta se está rodando localmente (localhost ou 127.0.0.1)
    const hostname = window.location.hostname;
    setIsDev(hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168'));
  }, []);

  useEffect(() => {
    // Apenas injeta a lógica do AdSense se NÃO for dev, se for Free, e se houver a variável global pronta
    if (shouldShowAd && !isDev) {
      try {
        // Insere dinamicamente o script do AdSense no head se já não estiver lá
        const clientId = import.meta.env.VITE_ADSENSE_CLIENT_ID || 'ca-pub-YOUR_PUB_ID';
        const scriptId = 'google-adsense-script';
        
        if (!document.getElementById(scriptId)) {
          const script = document.createElement('script');
          script.id = scriptId;
          script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${clientId}`;
          script.async = true;
          script.crossOrigin = 'anonymous';
          document.head.appendChild(script);
        }

        // Chama o push do Adsense para renderizar a tag ins do DOM
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const win = window as any;
        (win.adsbygoogle = win.adsbygoogle || []).push({});
      } catch (err) {
        console.warn('AdSense falhou ou bloqueador de anúncios ativo:', err);
      }
    }
  }, [shouldShowAd, isDev, format, slotId]);

  if (!shouldShowAd) return null;

  const containerStyles = {
    sidebar: "w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-center items-center space-y-3 min-h-[250px]",
    horizontal: "w-full bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-row md:flex-nowrap flex-wrap justify-between items-center min-h-[90px] overflow-hidden",
    inline: "w-full aspect-[21/9] md:aspect-[32/9] bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl p-6 flex flex-col justify-center items-center text-center space-y-4"
  }[format];

  // Em produção (quando não é localhost), renderiza o bloco padrão do Google AdSense
  if (!isDev) {
    return (
      <div className={`ad-container flex justify-center my-4 w-full overflow-hidden ${className}`}>
        <ins 
          className="adsbygoogle"
          style={{ display: 'block' }}
          data-ad-client={import.meta.env.VITE_ADSENSE_CLIENT_ID || 'ca-pub-YOUR_PUB_ID'}
          data-ad-slot={slotId}
          data-ad-format={format === 'horizontal' ? 'horizontal' : format === 'sidebar' ? 'vertical' : 'auto'}
          data-full-width-responsive="true"
        />
      </div>
    );
  }

  // Mockup Premium com apelo de Upgrade para desenvolvimento e homologação
  return (
    <div className={`${containerStyles} relative select-none group overflow-hidden transition-all duration-300 hover:shadow-md ${className}`}>
      {/* Tarja educacional de Anúncio */}
      <div className="absolute top-0 right-0 bg-slate-200 dark:bg-slate-800 text-[10px] font-medium tracking-wider text-slate-500 px-2 py-0.5 rounded-bl">
        ANÚNCIO LOCAL
      </div>

      {format === 'sidebar' && (
        <>
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 dark:bg-indigo-400/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform">
            <Sparkles size={24} />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1 leading-tight">
              Cresça Sem Limites
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Remova anúncios e expanda suas cotas mensais assinando o Pró.
            </p>
          </div>
          <a 
            href="/v2/assinatura" 
            className="w-full flex items-center justify-center gap-1 text-xs font-medium py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
          >
            Fazer Upgrade <ExternalLink size={12} />
          </a>
        </>
      )}

      {format === 'horizontal' && (
        <>
          <div className="flex items-center gap-3 flex-1 min-w-[200px]">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 flex-shrink-0">
              <Sparkles size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                Desbloqueie todos os Recursos 
                <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 text-[9px] uppercase text-slate-600 rounded font-normal">Plano Free Ativo</span>
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Libere a inserção ilimitada de clientes e emita lembretes automáticos sem barreiras.
              </p>
            </div>
          </div>
          <div className="mt-3 md:mt-0 w-full md:w-auto">
            <a 
              href="/v2/assinatura" 
              className="flex items-center justify-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400 hover:text-amber-700 px-4 py-2 border border-amber-500/30 hover:bg-amber-500/5 rounded-lg transition-all whitespace-nowrap"
            >
              Conhecer Planos <ExternalLink size={12} />
            </a>
          </div>
        </>
      )}

      {format === 'inline' && (
        <>
          <div className="p-4 rounded-2xl bg-indigo-500/10 text-indigo-600">
            <Sparkles size={32} className="animate-pulse" />
          </div>
          <div className="max-w-md">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Sua Contabilidade Merece o Melhor
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">
              Controle até 120 transações mensais, remova anúncios, integre múltiplos bancos e configure campos extras agora.
            </p>
            <a 
              href="/v2/assinatura" 
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm rounded-xl shadow-sm shadow-indigo-600/20 hover:shadow-md transition-all"
            >
              Migrar para o Plano Pró <ExternalLink size={14} />
            </a>
          </div>
        </>
      )}
    </div>
  );
};
