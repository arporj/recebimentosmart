import React, { useState, useEffect } from 'react';
import { X, Bell, Calendar, Clock, AlertCircle, Loader2, ChevronDown } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import type { Database } from '../../../types/supabase';

type Client = Database['public']['Tables']['clients']['Row'];

type NotificationMode = 'global' | 'fixed_day' | 'based_on_due';
type NotificationStrategy = 'on_due' | 'full_cycle';

interface NotificationSettings {
  id?: string;
  notification_mode: NotificationMode;
  notify_day_of_month: number | null;
  notification_strategy: NotificationStrategy;
  notify_before_days: number;
  notify_after_days: number;
  is_active: boolean;
}

interface ClientNotificationConfigProps {
  client: Client;
  onClose: () => void;
}

const defaultSettings: NotificationSettings = {
  notification_mode: 'global',
  notify_day_of_month: null,
  notification_strategy: 'on_due',
  notify_before_days: 3,
  notify_after_days: 3,
  is_active: true,
};

export function ClientNotificationConfig({ client, onClose }: ClientNotificationConfigProps) {
  const { user } = useAuth();
  const [settings, setSettings] = useState<NotificationSettings>(defaultSettings);
  const [globalDayOfMonth, setGlobalDayOfMonth] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadSettings();
  }, [user, client.id]);

  const loadSettings = async () => {
    if (!user) return;
    setLoading(true);
    try {
      // Load global setting
      const { data: global } = await supabase
        .from('client_notification_settings')
        .select('*')
        .eq('user_id', user.id)
        .is('client_id', null)
        .maybeSingle();

      if (global?.notify_day_of_month) {
        setGlobalDayOfMonth(global.notify_day_of_month);
      }

      // Load client-specific setting
      const { data: clientSetting } = await supabase
        .from('client_notification_settings')
        .select('*')
        .eq('user_id', user.id)
        .eq('client_id', client.id)
        .maybeSingle();

      if (clientSetting) {
        setSettings({
          id: clientSetting.id,
          notification_mode: clientSetting.notification_mode as NotificationMode,
          notify_day_of_month: clientSetting.notify_day_of_month,
          notification_strategy: clientSetting.notification_strategy as NotificationStrategy,
          notify_before_days: clientSetting.notify_before_days ?? 3,
          notify_after_days: clientSetting.notify_after_days ?? 3,
          is_active: clientSetting.is_active,
        });
      }
    } catch (err) {
      toast.error('Erro ao carregar configurações.');
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
        client_id: client.id,
        notification_mode: settings.notification_mode,
        notify_day_of_month: settings.notification_mode === 'fixed_day' ? settings.notify_day_of_month : null,
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

      toast.success('Configuração de notificação salva!');
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const update = (partial: Partial<NotificationSettings>) =>
    setSettings(s => ({ ...s, ...partial }));

  const inputClass = "w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700 focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-amber-500 to-orange-500">
          <div>
            <h2 className="text-lg font-bold text-white font-manrope flex items-center gap-2">
              <Bell size={18} /> Notificações por E-mail
            </h2>
            <p className="text-amber-100 text-sm mt-0.5 truncate max-w-[260px]">
              {client.name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-amber-100 hover:text-white hover:bg-white/10 transition-colors"
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
            {/* Active toggle */}
            <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <p className="text-sm font-bold text-slate-800">Notificação ativa</p>
                <p className="text-xs text-slate-500 mt-0.5">Enviar e-mail de cobrança para este cliente</p>
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
                {/* Mode selection */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Modo de notificação
                  </label>

                  {[
                    {
                      value: 'global' as NotificationMode,
                      label: 'Usar configuração global',
                      desc: globalDayOfMonth
                        ? `Enviado todo dia ${globalDayOfMonth} do mês`
                        : 'Configuração global não definida',
                    },
                    {
                      value: 'fixed_day' as NotificationMode,
                      label: 'Dia fixo do mês',
                      desc: 'Define um dia específico para este cliente',
                    },
                    {
                      value: 'based_on_due' as NotificationMode,
                      label: 'Baseado no vencimento',
                      desc: 'Envia relativo à data de cada lançamento',
                    },
                  ].map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => update({ notification_mode: option.value })}
                      className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                        settings.notification_mode === option.value
                          ? 'border-teal-500 bg-teal-50'
                          : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        settings.notification_mode === option.value
                          ? 'border-teal-500 bg-teal-500'
                          : 'border-slate-300'
                      }`}>
                        {settings.notification_mode === option.value && (
                          <div className="w-2 h-2 rounded-full bg-white" />
                        )}
                      </div>
                      <div>
                        <p className={`text-sm font-bold ${settings.notification_mode === option.value ? 'text-teal-800' : 'text-slate-700'}`}>
                          {option.label}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">{option.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Fixed day input */}
                {settings.notification_mode === 'fixed_day' && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <Calendar size={12} /> Dia do mês para envio
                    </label>
                    <select
                      value={settings.notify_day_of_month ?? 5}
                      onChange={e => update({ notify_day_of_month: Number(e.target.value) })}
                      className={inputClass}
                    >
                      {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                        <option key={d} value={d}>Dia {d}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Based on due — strategy */}
                {settings.notification_mode === 'based_on_due' && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <Clock size={12} /> Estratégia de envio
                      </label>

                      {[
                        { value: 'on_due' as NotificationStrategy, label: 'Apenas no dia do vencimento', desc: 'Um único e-mail no dia em que o lançamento vence' },
                        { value: 'full_cycle' as NotificationStrategy, label: 'Ciclo completo', desc: 'Antes do vencimento + no dia + aviso de atraso' },
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
                          <div>
                            <p className={`text-sm font-bold ${settings.notification_strategy === opt.value ? 'text-teal-800' : 'text-slate-700'}`}>
                              {opt.label}
                            </p>
                            <p className="text-xs text-slate-500">{opt.desc}</p>
                          </div>
                        </button>
                      ))}
                    </div>

                    {settings.notification_strategy === 'full_cycle' && (
                      <div className="grid grid-cols-2 gap-4 p-4 bg-amber-50 rounded-xl border border-amber-200">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-amber-700 uppercase tracking-wider">
                            Dias antes
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={settings.notify_before_days}
                            onChange={e => update({ notify_before_days: Number(e.target.value) })}
                            className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-amber-400/20 focus:border-amber-400 transition-all text-center"
                          />
                          <p className="text-[10px] text-amber-600 text-center">aviso antecipado</p>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-amber-700 uppercase tracking-wider">
                            Dias após
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={settings.notify_after_days}
                            onChange={e => update({ notify_after_days: Number(e.target.value) })}
                            className="w-full px-3 py-2 bg-white border border-amber-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-amber-400/20 focus:border-amber-400 transition-all text-center"
                          />
                          <p className="text-[10px] text-amber-600 text-center">aviso de atraso</p>
                        </div>
                      </div>
                    )}
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
                className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold transition-all shadow-lg shadow-amber-500/20 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? (
                  <><Loader2 size={16} className="animate-spin" /> Salvando...</>
                ) : 'Salvar Configuração'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ClientNotificationConfig;
