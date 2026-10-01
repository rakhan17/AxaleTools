import { useState, FormEvent } from 'react';
import { Shield, Plus, Trash2, AlertOctagon, Save, Power, PowerOff } from 'lucide-react';
import { ActivityLog, AppStats } from '../types.ts';

interface GeneralSettingsProps {
  botName: string;
  adminNumbers: string[];
  logs: ActivityLog[];
  stats: AppStats;
  globalBotEnabled?: boolean;
  onToggleGlobalBot?: (enabled?: boolean) => Promise<void>;
  onUpdateBotName: (name: string) => Promise<void>;
  onAddAdmin: (phone: string) => Promise<void>;
  onRemoveAdmin: (phone: string) => Promise<void>;
  onDangerPurge: (options?: { resetSessions?: boolean }) => Promise<void>;
}

export default function GeneralSettings({
  botName,
  adminNumbers,
  logs,
  stats,
  globalBotEnabled = true,
  onToggleGlobalBot,
  onUpdateBotName,
  onAddAdmin,
  onRemoveAdmin,
  onDangerPurge,
}: GeneralSettingsProps) {
  const [currentBotName, setCurrentBotName] = useState(botName);
  const [newAdminPhone, setNewAdminPhone] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);
  const [isAddingAdmin, setIsAddingAdmin] = useState(false);
  const [isTogglingGlobalBot, setIsTogglingGlobalBot] = useState(false);
  const [dangerConfirm, setDangerConfirm] = useState(false);
  const [isPurging, setIsPurging] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const handleToggleBot = async () => {
    if (!onToggleGlobalBot) return;
    setIsTogglingGlobalBot(true);
    setFeedback(null);
    try {
      await onToggleGlobalBot(!globalBotEnabled);
      setFeedback(`Saklar Master Bot berhasil diubah menjadi: ${!globalBotEnabled ? 'AKTIF (Online)' : 'NONAKTIF (Mati)'}`);
    } catch (err: any) {
      setFeedback(`Gagal mengubah status master bot: ${err?.message || 'Error'}`);
    } finally {
      setIsTogglingGlobalBot(false);
    }
  };

  const handleSaveBotName = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentBotName.trim()) return;
    setIsSavingName(true);
    setFeedback(null);
    try {
      await onUpdateBotName(currentBotName.trim());
      setFeedback('Nama bot berhasil diperbarui secara bersih.');
    } catch (err: any) {
      setFeedback(`Gagal update nama: ${err?.message || 'Error'}`);
    } finally {
      setIsSavingName(false);
    }
  };

  const handleAddAdmin = async (e: FormEvent) => {
    e.preventDefault();
    if (!newAdminPhone.trim()) return;
    setIsAddingAdmin(true);
    setFeedback(null);
    try {
      await onAddAdmin(newAdminPhone.trim());
      setNewAdminPhone('');
      setFeedback('Nomor Admin+ berhasil didaftarkan ke database.json.');
    } catch (err: any) {
      setFeedback(`Gagal: ${err?.message || 'Error'}`);
    } finally {
      setIsAddingAdmin(false);
    }
  };

  const handlePurge = async (resetSessions = false) => {
    setIsPurging(true);
    setFeedback(null);
    try {
      await onDangerPurge({ resetSessions });
      setDangerConfirm(false);
      setFeedback(
        resetSessions
          ? 'Danger Zone: Database lokal & seluruh kredensial sesi WhatsApp berhasil dibersihkan total. Anda dapat memulai koneksi baru.'
          : 'Danger Zone: Seluruh riwayat chat, media, dan log lokal berhasil dibersihkan.'
      );
    } catch (err: any) {
      setFeedback(`Gagal purge: ${err?.message || 'Error'}`);
    } finally {
      setIsPurging(false);
    }
  };

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {feedback && (
        <div className="p-3 bg-neutral-100 border border-neutral-900 text-xs font-mono text-neutral-900">
          {feedback}
        </div>
      )}

      {/* 0. SAKLAR MASTER BOT GENERAL (ON / OFF) */}
      <div className="border border-neutral-200 bg-white p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  globalBotEnabled ? 'bg-neutral-900 animate-pulse' : 'bg-neutral-400'
                }`}
              />
              <h2 className="text-sm font-semibold tracking-wider uppercase text-neutral-900">
                Saklar Utama Bot WhatsApp (General)
              </h2>
            </div>
            <p className="text-xs text-neutral-500 mt-1 max-w-xl">
              Matikan atau hidupkan seluruh respons bot (.rvo, .swgc, .ghost, dan perintah admin lainnya) secara global di seluruh obrolan dan grup.
            </p>
          </div>

          <button
            type="button"
            onClick={handleToggleBot}
            disabled={isTogglingGlobalBot || !onToggleGlobalBot}
            className={`min-h-[44px] px-5 py-2.5 text-xs font-mono uppercase font-bold tracking-wider transition-colors flex items-center justify-center space-x-2 ${
              globalBotEnabled
                ? 'bg-black text-white hover:bg-neutral-800'
                : 'border border-neutral-900 bg-white text-neutral-900 hover:bg-neutral-100'
            } disabled:opacity-50`}
          >
            {globalBotEnabled ? (
              <>
                <PowerOff className="w-4 h-4" />
                <span>{isTogglingGlobalBot ? 'Memproses...' : 'Matikan Bot General'}</span>
              </>
            ) : (
              <>
                <Power className="w-4 h-4" />
                <span>{isTogglingGlobalBot ? 'Memproses...' : 'Nyalakan Bot General'}</span>
              </>
            )}
          </button>
        </div>

        <div className="mt-4 pt-3 border-t border-neutral-100 flex items-center justify-between text-xs font-mono text-neutral-600">
          <span>Status Sistem Saat Ini:</span>
          <span
            className={`font-semibold px-2 py-0.5 ${
              globalBotEnabled ? 'bg-neutral-100 text-neutral-900' : 'bg-neutral-200 text-neutral-700'
            }`}
          >
            {globalBotEnabled ? 'AKTIF (MENERIMA PERINTAH)' : 'NONAKTIF (SEMUA FITUR OFF)'}
          </span>
        </div>
      </div>

      {/* 1. Pengaturan Nama Bot (Bersih tanpa embel-embel) */}
      <div className="border border-neutral-200 bg-white p-6">
        <div className="border-b border-neutral-200 pb-3 mb-4">
          <h2 className="text-sm font-semibold tracking-wider uppercase text-neutral-900">
            Nama Bot (Clean Identity)
          </h2>
          <p className="text-xs text-neutral-500 mt-0.5">
            Nama bersih langsung tanpa embel-embel aneh (tersimpan di database.json)
          </p>
        </div>

        <form onSubmit={handleSaveBotName} className="flex flex-col sm:flex-row gap-2.5 max-w-md">
          <input
            type="text"
            value={currentBotName}
            onChange={(e) => setCurrentBotName(e.target.value)}
            placeholder="Contoh: Axale Tools Plus"
            className="flex-1 text-xs font-mono p-2.5 border border-neutral-300 focus:outline-none focus:border-black min-h-[44px]"
          />
          <button
            type="submit"
            disabled={isSavingName}
            className="min-h-[44px] px-4 py-2.5 bg-black text-white text-xs font-mono uppercase hover:bg-neutral-800 disabled:opacity-50 flex items-center justify-center space-x-1.5"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSavingName ? 'Menyimpan...' : 'Simpan'}</span>
          </button>
        </form>
      </div>

      {/* 2. Manajemen Nomor Admin+ */}
      <div className="border border-neutral-200 bg-white p-4 sm:p-6">
        <div className="border-b border-neutral-200 pb-3 mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold tracking-wider uppercase text-neutral-900 flex items-center space-x-2">
                <Shield className="w-4 h-4 text-black" />
                <span>Daftar Nomor Admin+</span>
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Hanya nomor-nomor ini yang dapat mengeksekusi bot commands (.rvo dan .swgc+). Pesan selain dari nomor ini akan 100% diabaikan bot.
              </p>
            </div>
            <span className="self-start sm:self-center text-xs font-mono px-2 py-0.5 bg-neutral-100 text-neutral-700">
              {adminNumbers.length} Admin+
            </span>
          </div>
        </div>

        {/* Add Admin Form */}
        <form onSubmit={handleAddAdmin} className="flex flex-col sm:flex-row gap-2.5 max-w-md mb-5">
          <input
            type="text"
            value={newAdminPhone}
            onChange={(e) => setNewAdminPhone(e.target.value)}
            placeholder="Format: 628123456789 atau 08..."
            className="flex-1 text-xs font-mono p-2.5 border border-neutral-300 focus:outline-none focus:border-black min-h-[44px]"
          />
          <button
            type="submit"
            disabled={isAddingAdmin}
            className="min-h-[44px] px-4 py-2.5 bg-black text-white text-xs font-mono uppercase hover:bg-neutral-800 disabled:opacity-50 flex items-center justify-center space-x-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isAddingAdmin ? 'Menambah...' : 'Tambah Admin+'}</span>
          </button>
        </form>

        {/* Admin List */}
        <div className="border border-neutral-200 divide-y divide-neutral-200">
          {adminNumbers.length === 0 ? (
            <div className="p-4 text-xs font-mono text-neutral-400 text-center">
              Belum ada nomor Admin+ terdaftar.
            </div>
          ) : (
            adminNumbers.map((phone) => (
              <div key={phone} className="p-3 flex items-center justify-between text-xs font-mono">
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 bg-black rounded-none" />
                  <span className="font-semibold text-neutral-900">+{phone}</span>
                </div>
                <button
                  onClick={() => onRemoveAdmin(phone)}
                  className="text-neutral-400 hover:text-black p-1 transition-colors"
                  title="Hapus Admin+"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 3. Log Aktivitas Baileys & Database */}
      <div className="border border-neutral-200 bg-white p-6">
        <div className="border-b border-neutral-200 pb-3 mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold tracking-wider uppercase text-neutral-900">
              Riwayat Log Aktivitas
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Monitoring eksekusi perintah .rvo, .swgc+, broadcast, dan autentikasi
            </p>
          </div>
          <div className="text-xs font-mono text-neutral-500">
            RVO: {stats.rvoProcessed} | SWGC: {stats.groupStatusSent}
          </div>
        </div>

        <div className="max-h-60 overflow-y-auto font-mono text-[11px] divide-y divide-neutral-200 border border-neutral-200 bg-neutral-50 p-2">
          {logs.length === 0 ? (
            <div className="p-4 text-center text-neutral-400">Belum ada log.</div>
          ) : (
            logs.map((l) => (
              <div key={l.id} className="py-1.5 px-2 flex items-start space-x-2">
                <span className="text-neutral-400 whitespace-nowrap">
                  {new Date(l.timestamp).toLocaleTimeString()}
                </span>
                <span className="uppercase text-[10px] px-1 bg-neutral-200 text-neutral-700">
                  {l.type}
                </span>
                <span className="text-neutral-800 flex-1">{l.message}</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 4. Danger Zone */}
      <div className="border border-neutral-900 bg-neutral-50 p-6">
        <div className="flex items-start space-x-3 mb-4">
          <AlertOctagon className="w-5 h-5 text-neutral-900 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
              Danger Zone
            </h3>
            <p className="text-xs text-neutral-600 mt-1 leading-relaxed">
              Hapus massal semua riwayat chat lokal, file media sementara, dan log aktivitas.
              Nomor Admin+ dan nama bot pada <code>database.json</code> akan tetap dipertahankan dengan aman.
            </p>
          </div>
        </div>

        {!dangerConfirm ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setDangerConfirm(true)}
              className="px-4 py-2 border border-black text-black text-xs font-mono uppercase tracking-wider hover:bg-black hover:text-white transition-colors"
            >
              Bersihkan Riwayat &amp; Log
            </button>
          </div>
        ) : (
          <div className="border border-black p-4 bg-white space-y-3">
            <p className="text-xs font-mono text-neutral-900 font-bold">
              Konfirmasi Pembersihan: Pilih jenis pembersihan data di bawah. Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => handlePurge(false)}
                disabled={isPurging}
                className="px-4 py-2 bg-black text-white text-xs font-mono uppercase hover:bg-neutral-800 disabled:opacity-50"
              >
                {isPurging ? 'Membersihkan...' : 'Bersihkan Riwayat & Log Saja'}
              </button>
              <button
                type="button"
                onClick={() => handlePurge(true)}
                disabled={isPurging}
                className="px-4 py-2 bg-neutral-900 text-white text-xs font-mono uppercase hover:bg-black border border-black disabled:opacity-50"
                title="Menghapus database dan mereset total sesi kredensial WhatsApp"
              >
                {isPurging ? 'Mereset...' : 'Reset Total (Database + Sesi WA)'}
              </button>
              <button
                type="button"
                onClick={() => setDangerConfirm(false)}
                disabled={isPurging}
                className="px-4 py-2 border border-neutral-300 text-xs font-mono uppercase hover:bg-neutral-100"
              >
                Batal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
