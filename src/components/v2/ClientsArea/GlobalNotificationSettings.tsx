import React, { useState, useEffect } from 'react';
import { X, Globe, Loader2, Info, ChevronDown } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';

type NotificationStrategy = 'on_due' | 'full_cycle';

interface GlobalSettings {
  id?: string;
  notify_day_of_month: number;
  notification_strategy: NotificationStrategy;
  notify_before_days: number;
  notify_after_days: number;
  is_active: boolean;
}

interface GlobalNotificationSettingsProps {
  onClose: () => void;
}

export function GlobalNotificationSettings({ onClose }: GlobalNotificationSettingsProps) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<GlobalSettings>({
    notify_day_of_month: 5,
    notification_strategy: 'on_due',
    notify_before_days: 3,
    notify_after_days: 3,
    is_active: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    supabase
      .from('client_notification_settings')
      .select('*')
      .eq('user_id', user.id)
      .is('client_id', null)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSettings({
            id: data.id,
            notify_day_of_month: data.notify_day_of_month ?? 5,
            notification_strategy: data.notification_strategy as NotificationStrategy,
            notify_before_days: data.notify_before_days ?? 3,
            notify_after_days: data.notify_after_days ?? 3,
            is_active: data.is_active,
          });
        }
      })
      .catch(() => toast.error('Erro ao carregar configuração.'))
      .finally(() => setLoading(false));
  }, [user]);

  const update = (partial: Partial<GlobalSettings>) =>
    setSettings(s => ({ ...s, ...partial }));

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload = {
        user_id: user.id,
        client_id: null,
        notification_mode: 'global',
        notify_day_of_month: settings.notify_day_of_month,
        notification_strategy: settings.notification_strategy,
        notify_before_days: settings.notify_before_days,
        notify_after_days: settings.notify_after_days,
        is_active: settings.is_active,
      };
      if (settings.id) {
        const { error } = await supabase
          .from('client_notification_settings')
          .update(payload)
          .eq('id', settings.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('client_notification_settings')
          .insert(payload);
        if (error) throw error;
      }
      toast.success('Configuração global salva!');
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const selectClass = "w-full px-3 py-2.5 bg-slate-800/80 border border-slate-700 rounded-lg text-sm font-medium text-slate-100 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all cursor-pointer appearance-none";
  const numClass = "w-full px-3 py-2.5 bg-slate-800 border border-amber-800/50 rounded-lg text-sm font-bold text-amber-200 text-center focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-[#1e293b] border border-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
              <Globe size={16} className="text-teal-400" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-100">Notificações Globais</h2>
              <p className="text-xs text-slate-400">Padrão para todos os clientes</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="py-10 flex items-center justify-center">
            <Loader2 size={22} className="animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="p-5 space-y-4">
            {/* Toggle ativo */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-200">Ativado</p>
                <p className="text-xs text-slate-400">Envio automático para todos</p>
              </div>
              <button
                type="button"
                onClick={() => update({ is_active: !settings.is_active })}
                className={`relative w-11 h-6 rounded-full transition-colors ${settings.is_active ? 'bg-teal-500' : 'bg-slate-700'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>

            {settings.is_active && (
              <>
                <div className="h-px bg-slate-800" />

                {/* Dia do mês */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                    Dia padrão de envio
                  </label>
                  <div className="relative">
                    <select
                      value={settings.notify_day_of_month}
                      onChange={e => update({ notify_day_of_month: Number(e.target.value) })}
                      className={selectClass}
                    >
                      {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                        <option key={d} value={d} className="bg-slate-900 text-slate-100">Dia {d} de cada mês</option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>

                {/* Estratégia */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                    Quando enviar
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { value: 'on_due' as NotificationStrategy, label: 'No vencimento' },
                      { value: 'full_cycle' as NotificationStrategy, label: 'Ciclo completo' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => update({ notification_strategy: opt.value })}
                        className={`py-2.5 px-3 rounded-lg text-xs font-bold border transition-all text-center ${
                          settings.notification_strategy === opt.value
                            ? 'border-teal-500 bg-teal-500/20 text-teal-300'
                            : 'border-slate-700 bg-slate-800/40 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dias antes/depois (só no ciclo completo) */}
                {settings.notification_strategy === 'full_cycle' && (
                  <div className="grid grid-cols-2 gap-3 p-3 bg-amber-950/20 rounded-xl border border-amber-900/40">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-amber-400 uppercase tracking-wide block text-center">
                        Dias antes
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={settings.notify_before_days}
                        onChange={e => update({ notify_before_days: Number(e.target.value) })}
                        className={numClass}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-amber-400 uppercase tracking-wide block text-center">
                        Dias após
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={settings.notify_after_days}
                        onChange={e => update({ notify_after_days: Number(e.target.value) })}
                        className={numClass}
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Info note */}
            <div className="flex items-start gap-2 text-xs text-slate-400">
              <Info size={12} className="mt-0.5 shrink-0 text-slate-400" />
              <span>Clientes com configuração própria ignoram estes valores.</span>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-slate-700 text-sm font-bold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-sm font-bold transition-all disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {saving ? <><Loader2 size={14} className="animate-spin" /> Salvando...</> : 'Salvar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default GlobalNotificationSettings;
