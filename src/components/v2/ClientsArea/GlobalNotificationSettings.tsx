import React, { useState, useEffect } from 'react';
import { X, Globe, Calendar, Loader2, Info } from 'lucide-react';
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

const defaultSettings: GlobalSettings = {
  notify_day_of_month: 5,
  notification_strategy: 'on_due',
  notify_before_days: 3,
  notify_after_days: 3,
  is_active: true,
};

export function GlobalNotificationSettings({ onClose }: GlobalNotificationSettingsProps) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<GlobalSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadSettings();
  }, [user]);

  const loadSettings = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('client_notification_settings')
        .select('*')
        .eq('user_id', user.id)
        .is('client_id', null)
        .maybeSingle();

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
    } catch {
      toast.error('Erro ao carregar configuração global.');
    } finally {
      setLoading(false);
    }
  };

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

  const update = (partial: Partial<GlobalSettings>) =>
    setSettings(s => ({ ...s, ...partial }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-slate-700 to-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white font-manrope flex items-center gap-2">
              <Globe size={18} /> Configuração Global de Notificações
            </h2>
            <p className="text-slate-300 text-sm mt-0.5">
              Padrão aplicado a todos os clientes sem config específica
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {loading ? (
          <div className="py-16 flex items-center justify-center">
            <Loader2 size={24} className="animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="p-6 space-y-5">
            {/* Info */}
            <div className="flex items-start gap-3 p-4 bg-blue-50 rounded-xl border border-blue-200">
              <Info size={16} className="text-blue-600 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 font-medium leading-relaxed">
                Esta é a configuração padrão. Clientes com configuração específica ignoram esta. 
                Clientes sem configuração específica e com modo "global" usam estas regras.
              </p>
            </div>

            {/* Active toggle */}
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <p className="text-sm font-bold text-slate-800">Notificações globais ativas</p>
                <p className="text-xs text-slate-500 mt-0.5">Habilitar envio automático para todos os clientes</p>
              </div>
              <button
                type="button"
                onClick={() => update({ is_active: !settings.is_active })}
                className={`relative w-12 h-6 rounded-full transition-colors ${settings.is_active ? 'bg-teal-500' : 'bg-slate-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.is_active ? 'translate-x-6' : 'translate-x-0'}`} />
              </button>
            </div>

            {settings.is_active && (
              <>
                {/* Day of month */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Calendar size={12} /> Dia do mês para envio padrão
                  </label>
                  <select
                    value={settings.notify_day_of_month}
                    onChange={e => update({ notify_day_of_month: Number(e.target.value) })}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all cursor-pointer"
                  >
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d}>Dia {d} de cada mês</option>
                    ))}
                  </select>
                </div>

                {/* Strategy */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Estratégia padrão para modo "baseado no vencimento"
                  </label>
                  {[
                    { value: 'on_due' as NotificationStrategy, label: 'Apenas no dia do vencimento' },
                    { value: 'full_cycle' as NotificationStrategy, label: 'Ciclo completo (antes + no dia + após)' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => update({ notification_strategy: opt.value })}
                      className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all ${
                        settings.notification_strategy === opt.value
                          ? 'border-teal-500 bg-teal-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        settings.notification_strategy === opt.value ? 'border-teal-500 bg-teal-500' : 'border-slate-300'
                      }`}>
                        {settings.notification_strategy === opt.value && (
                          <div className="w-2 h-2 rounded-full bg-white" />
                        )}
                      </div>
                      <span className={`text-sm font-semibold ${settings.notification_strategy === opt.value ? 'text-teal-800' : 'text-slate-700'}`}>
                        {opt.label}
                      </span>
                    </button>
                  ))}
                </div>

                {settings.notification_strategy === 'full_cycle' && (
                  <div className="grid grid-cols-2 gap-4 p-4 bg-amber-50 rounded-xl border border-amber-200">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-amber-700 uppercase tracking-wider">Dias antes</label>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={settings.notify_before_days}
                        onChange={e => update({ notify_before_days: Number(e.target.value) })}
                        className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-sm font-bold text-slate-800 text-center focus:ring-2 focus:ring-amber-400/20 focus:border-amber-400"
                      />
                      <p className="text-[10px] text-amber-600 text-center">aviso antecipado</p>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-amber-700 uppercase tracking-wider">Dias após</label>
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={settings.notify_after_days}
                        onChange={e => update({ notify_after_days: Number(e.target.value) })}
                        className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-sm font-bold text-slate-800 text-center focus:ring-2 focus:ring-amber-400/20 focus:border-amber-400"
                      />
                      <p className="text-[10px] text-amber-600 text-center">aviso de atraso</p>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-sm font-bold transition-all shadow-lg shadow-slate-700/20 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? (
                  <><Loader2 size={16} className="animate-spin" /> Salvando...</>
                ) : 'Salvar Configuração Global'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default GlobalNotificationSettings;
