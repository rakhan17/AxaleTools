import { useState, FormEvent } from 'react';
import {
  RefreshCw,
  QrCode,
  Smartphone,
  Plus,
  LogOut,
  Trash2,
  Check,
  Copy,
  Users,
  ShieldCheck,
  KeyRound,
  AlertCircle,
  Power,
  PowerOff,
  RotateCcw
} from 'lucide-react';
import { SystemStatus, SavedAccountSession } from '../types.ts';

interface LoginModalProps {
  status: SystemStatus | null;
  onConnect: (options?: { force?: boolean; freshQr?: boolean }) => void;
  onSync: () => void;
  onSwitchSession: (sessionId: string) => Promise<void>;
  onCreateSession: (name: string) => Promise<void>;
  onLogoutSession: (sessionId?: string) => Promise<void>;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onToggleSessionBot?: (sessionId: string, enabled?: boolean) => Promise<void>;
  onRequestPairingCode: (phone: string) => Promise<{ code: string; formatted: string }>;
  onRefreshStatus?: () => void;
  onResetCredentials?: (sessionId?: string) => Promise<any>;
}

export default function LoginModal({
  status,
  onConnect,
  onSync,
  onSwitchSession,
  onCreateSession,
  onLogoutSession,
  onDeleteSession,
  onToggleSessionBot,
  onRequestPairingCode,
  onRefreshStatus,
  onResetCredentials,
}: LoginModalProps) {
  // Login mode: 'qr' vs 'pairing'
  const [loginMethod, setLoginMethod] = useState<'qr' | 'pairing'>('qr');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pairingCodeResult, setPairingCodeResult] = useState<string | null>(status?.pairingCode || null);
  const [isRequestingCode, setIsRequestingCode] = useState(false);
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // New session modal / form state
  const [isAddingSession, setIsAddingSession] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [isSubmittingSession, setIsSubmittingSession] = useState(false);

  // Action states
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmingSessionAction, setConfirmingSessionAction] = useState<{
    id: string;
    type: 'logout' | 'delete' | 'reset';
    name: string;
  } | null>(null);

  const isConnected = status?.status === 'connected';
  const isSyncing = status?.status === 'syncing';
  const isQrReady = status?.status === 'qr_ready';
  const isConnecting = status?.status === 'connecting';

  const validStatusSessions = (status?.sessions || []).filter(
    (s): s is SavedAccountSession => Boolean(s && typeof s === 'object' && s.id)
  );

  const sessions: SavedAccountSession[] = validStatusSessions.length > 0
    ? validStatusSessions.map((s, idx) => ({
        ...s,
        name: s.name || `Akun #${idx + 1}`,
      }))
    : [
        {
          id: 'session_default',
          name: 'Akun Utama',
          createdAt: new Date().toISOString(),
          lastActive: new Date().toISOString(),
          isActive: true,
          status: status?.status === 'connected' ? 'connected' : 'disconnected',
          phone: status?.botUser?.phone,
          botName: status?.botUser?.name,
          avatarUrl: status?.botUser?.avatarUrl,
        },
      ];

  const activeSessionId = status?.activeSessionId || 'session_default';
  const activeSession = sessions.find((s) => s.id === activeSessionId) || sessions[0];

  // Request Pairing Code
  const handleRequestPairing = async (e: FormEvent) => {
    e.preventDefault();
    setPairingError(null);
    if (!phoneNumber.trim()) {
      setPairingError('Masukkan nomor telepon WhatsApp Anda.');
      return;
    }

    setIsRequestingCode(true);
    try {
      const res = await onRequestPairingCode(phoneNumber.trim());
      setPairingCodeResult(res.formatted || res.code);
    } catch (err: any) {
      setPairingError(err?.message || 'Gagal meminta kode pairing. Pastikan server terhubung.');
    } finally {
      setIsRequestingCode(false);
    }
  };

  // Copy pairing code to clipboard
  const handleCopyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code.replace(/-/g, ''));
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {
      // Fallback
    }
  };

  // Create new session
  const handleCreateSession = async (e: FormEvent) => {
    e.preventDefault();
    const name = newSessionName.trim() || `Akun ${sessions.length + 1}`;
    setIsSubmittingSession(true);
    setActionError(null);
    try {
      await onCreateSession(name);
      setNewSessionName('');
      setIsAddingSession(false);
      setPairingCodeResult(null);
      if (onRefreshStatus) onRefreshStatus();
    } catch (err: any) {
      setActionError(err?.message || 'Gagal menambahkan akun baru.');
    } finally {
      setIsSubmittingSession(false);
    }
  };

  // Switch session
  const handleSwitch = async (sessionId: string) => {
    if (sessionId === activeSessionId) return;
    setIsProcessingAction(true);
    setActionError(null);
    try {
      await onSwitchSession(sessionId);
      setPairingCodeResult(null);
      if (onRefreshStatus) onRefreshStatus();
    } catch (err: any) {
      setActionError(err?.message || 'Gagal beralih sesi.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Logout session trigger (opens inline confirmation)
  const handleLogout = (sessionId?: string) => {
    const targetId = sessionId || activeSessionId;
    const targetSession = sessions.find((s) => s.id === targetId)?.name || 'akun ini';
    setConfirmingSessionAction({
      id: targetId,
      type: 'logout',
      name: targetSession,
    });
  };

  // Delete session trigger (opens inline confirmation)
  const handleDeleteSession = (sessionId: string) => {
    const sessionToDelete = sessions.find((s) => s.id === sessionId);
    setConfirmingSessionAction({
      id: sessionId,
      type: 'delete',
      name: sessionToDelete?.name || sessionId,
    });
  };

  // Reset credentials trigger (opens inline confirmation)
  const handleResetCredentials = (sessionId?: string) => {
    const targetId = sessionId || activeSessionId;
    const targetSession = sessions.find((s) => s.id === targetId)?.name || 'akun ini';
    setConfirmingSessionAction({
      id: targetId,
      type: 'reset',
      name: targetSession,
    });
  };

  // Execute confirmed action
  const handleExecuteConfirmedAction = async () => {
    if (!confirmingSessionAction) return;
    const { id, type } = confirmingSessionAction;
    setIsProcessingAction(true);
    setActionError(null);
    try {
      if (type === 'logout') {
        await onLogoutSession(id);
        setPairingCodeResult(null);
      } else if (type === 'delete') {
        await onDeleteSession(id);
      } else if (type === 'reset') {
        if (onResetCredentials) {
          await onResetCredentials(id);
        } else {
          await onLogoutSession(id);
          onConnect({ force: true, freshQr: true });
        }
        setPairingCodeResult(null);
      }
      setConfirmingSessionAction(null);
      if (onRefreshStatus) onRefreshStatus();
    } catch (err: any) {
      setActionError(err?.message || 'Gagal mengeksekusi tindakan');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Toggle Bot feature per account session
  const handleToggleBot = async (sessionId: string, newEnabledState: boolean) => {
    if (!onToggleSessionBot) return;
    setIsProcessingAction(true);
    setActionError(null);
    try {
      await onToggleSessionBot(sessionId, newEnabledState);
      if (onRefreshStatus) onRefreshStatus();
    } catch (err: any) {
      setActionError(err?.message || 'Gagal mengubah status bot sesi.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  return (
    <div className="border border-neutral-200 bg-white p-4 sm:p-6 mb-8">
      {/* Top Header & Session Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-neutral-200 pb-4 mb-5 gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-sm font-semibold tracking-wider uppercase text-neutral-900">
              Manajemen Akun & Sesi WhatsApp
            </h2>
            <span className="text-[11px] font-mono px-2 py-0.5 bg-neutral-100 text-neutral-600 border border-neutral-200">
              {sessions.length} Akun Tersimpan
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            Kelola multiple akun WhatsApp dengan penyimpanan sesi terisolasi dan aman
          </p>
        </div>

        <div className="flex items-center space-x-2 flex-wrap gap-y-2">
          {/* Add Account Button */}
          <button
            onClick={() => setIsAddingSession(true)}
            className="min-h-[38px] px-3 py-1.5 bg-black text-white text-xs font-mono uppercase tracking-wider hover:bg-neutral-800 transition-colors flex items-center space-x-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Tambah Akun Baru</span>
          </button>

          {/* Quick Refresh Status */}
          {onRefreshStatus && (
            <button
              onClick={onRefreshStatus}
              title="Perbarui Status Sesi"
              className="min-h-[38px] px-2.5 py-1.5 border border-neutral-300 text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Global Action Error Alert */}
      {actionError && (
        <div className="mb-4 p-3 bg-neutral-50 border border-neutral-300 text-neutral-900 text-xs font-mono flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-neutral-700 flex-shrink-0" />
            <span>{actionError}</span>
          </div>
          <button onClick={() => setActionError(null)} className="text-neutral-500 hover:text-black">
            Tutup
          </button>
        </div>
      )}

      {/* Inline Confirmation Prompt for Account Actions (Iframe-Safe) */}
      {confirmingSessionAction && (
        <div className="mb-6 p-4 border-2 border-black bg-neutral-100 text-xs font-mono">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="font-bold text-neutral-900 flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-black" />
                <span>
                  {confirmingSessionAction.type === 'logout' && `Konfirmasi Logout: ${confirmingSessionAction.name}`}
                  {confirmingSessionAction.type === 'delete' && `Konfirmasi Hapus Sesi: ${confirmingSessionAction.name}`}
                  {confirmingSessionAction.type === 'reset' && `Konfirmasi Reset Kredensial: ${confirmingSessionAction.name}`}
                </span>
              </p>
              <p className="text-neutral-600 text-[11px] mt-1">
                {confirmingSessionAction.type === 'logout' && 'Koneksi akun ini akan diputus dan kredensialnya di-reset dengan aman.'}
                {confirmingSessionAction.type === 'delete' && 'Sesi dan folder kredensial akun ini akan dihapus permanen dari sistem.'}
                {confirmingSessionAction.type === 'reset' && 'Folder kredensial autentikasi WhatsApp sesi ini akan dibersihkan untuk memulai login bersih.'}
              </p>
            </div>
            <div className="flex items-center space-x-2 flex-shrink-0">
              <button
                type="button"
                onClick={handleExecuteConfirmedAction}
                disabled={isProcessingAction}
                className="px-4 py-2 bg-black text-white text-xs font-mono uppercase font-bold hover:bg-neutral-800 disabled:opacity-50 min-h-[38px]"
              >
                {isProcessingAction ? 'Memproses...' : 'Ya, Lanjutkan'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingSessionAction(null)}
                disabled={isProcessingAction}
                className="px-3 py-2 border border-neutral-400 text-neutral-700 text-xs font-mono uppercase hover:bg-neutral-200 min-h-[38px]"
              >
                Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Account Creation Inline Modal/Card */}
      {isAddingSession && (
        <div className="mb-6 p-4 border border-neutral-900 bg-neutral-50">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <Plus className="w-4 h-4 text-neutral-900" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
                Tambah Akun WhatsApp Baru
              </h3>
            </div>
            <button
              onClick={() => setIsAddingSession(false)}
              className="text-xs text-neutral-500 hover:text-neutral-900 font-mono"
            >
              Batal
            </button>
          </div>
          <p className="text-xs text-neutral-600 mb-3">
            Akun baru akan dibuatkan folder kredensial terpisah. Akun lama Anda akan tetap tersimpan dan tidak terganggu.
          </p>
          <form onSubmit={handleCreateSession} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              placeholder="Label Akun (cth: Akun Bisnis, CS WhatsApp 2)..."
              className="flex-1 px-3 py-2 text-xs border border-neutral-300 bg-white focus:outline-none focus:border-black font-mono min-h-[44px]"
              autoFocus
            />
            <button
              type="submit"
              disabled={isSubmittingSession}
              className="px-4 py-2 bg-black text-white text-xs font-mono uppercase tracking-wider hover:bg-neutral-800 disabled:opacity-50 min-h-[44px]"
            >
              {isSubmittingSession ? 'Menyiapkan Sesi...' : 'Simpan & Beralih'}
            </button>
          </form>
        </div>
      )}

      {/* Multi-Account Sessions Cards */}
      <div className="mb-6">
        <div className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider mb-2">
          Daftar Akun WhatsApp:
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sessions.map((sess) => {
            const isSessActive = sess.id === activeSessionId;
            const isSessConnected = isSessActive
              ? isConnected
              : sess.status === 'connected';

            return (
              <div
                key={sess.id}
                className={`p-3.5 border transition-all ${
                  isSessActive
                    ? 'border-neutral-900 bg-white ring-1 ring-neutral-900 shadow-sm'
                    : 'border-neutral-200 bg-neutral-50 hover:bg-white'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2.5">
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-none border border-neutral-300 bg-white flex items-center justify-center flex-shrink-0 overflow-hidden">
                      {sess.avatarUrl ? (
                        <img
                          src={sess.avatarUrl}
                          alt={sess.name || 'WA'}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-[11px] font-bold font-mono text-neutral-600">
                          {(sess.name || 'WA').slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <p className="text-xs font-bold text-neutral-900 truncate">
                          {sess.name}
                        </p>
                        {isSessActive && (
                          <span className="text-[9px] font-mono uppercase px-1.5 py-0.2 bg-black text-white">
                            AKTIF
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] font-mono text-neutral-500 truncate">
                        {sess.phone ? `+${sess.phone}` : 'Belum tertaut'}
                      </p>
                    </div>
                  </div>

                  {/* Status Pill */}
                  <div>
                    {isSessConnected ? (
                      <span className="inline-flex items-center text-[10px] font-mono px-2 py-0.5 bg-black text-white">
                        TERHUBUNG
                      </span>
                    ) : isSessActive && (isSyncing || isConnecting) ? (
                      <span className="inline-flex items-center text-[10px] font-mono px-2 py-0.5 bg-neutral-200 text-neutral-800">
                        CONNECTING
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-[10px] font-mono px-2 py-0.5 bg-neutral-100 text-neutral-500 border border-neutral-200">
                        OFFLINE
                      </span>
                    )}
                  </div>
                </div>

                {/* Bot Feature Switch per Account */}
                <div className="flex items-center justify-between bg-neutral-100 px-2.5 py-1.5 mt-2.5 text-[11px] font-mono border border-neutral-200">
                  <div className="flex items-center space-x-1.5">
                    {sess.botEnabled !== false ? (
                      <Power className="w-3 h-3 text-black" />
                    ) : (
                      <PowerOff className="w-3 h-3 text-neutral-400" />
                    )}
                    <span className="text-neutral-700">Fitur Bot:</span>
                    <span className={`font-bold ${sess.botEnabled !== false ? 'text-black' : 'text-neutral-400'}`}>
                      {sess.botEnabled !== false ? 'ON' : 'OFF'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleBot(sess.id, !(sess.botEnabled !== false))}
                    disabled={isProcessingAction}
                    title={sess.botEnabled !== false ? 'Matikan fitur bot pada akun ini' : 'Nyalakan fitur bot pada akun ini'}
                    className={`px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider transition-colors ${
                      sess.botEnabled !== false
                        ? 'bg-white border border-neutral-300 text-neutral-700 hover:border-black hover:text-black'
                        : 'bg-black text-white hover:bg-neutral-800'
                    }`}
                  >
                    {sess.botEnabled !== false ? 'Matikan' : 'Nyalakan'}
                  </button>
                </div>

                {/* Account Action Buttons */}
                <div className="flex items-center justify-between border-t border-neutral-200 pt-2 mt-2 text-xs font-mono">
                  <div>
                    {!isSessActive ? (
                      <button
                        onClick={() => handleSwitch(sess.id)}
                        disabled={isProcessingAction}
                        className="px-2.5 py-1 text-[11px] font-mono border border-neutral-900 text-neutral-900 hover:bg-neutral-900 hover:text-white transition-colors disabled:opacity-50 min-h-[32px]"
                      >
                        Pilih Akun Ini
                      </button>
                    ) : (
                      <span className="text-[11px] text-neutral-500">
                        Sedang Digunakan
                      </span>
                    )}
                  </div>

                  <div className="flex items-center space-x-1.5">
                    {/* Reset Credentials Button */}
                    <button
                      onClick={() => handleResetCredentials(sess.id)}
                      disabled={isProcessingAction}
                      title={`Reset kredensial sesi ${sess.name}`}
                      className="px-2 py-1 text-[11px] text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200 transition-colors flex items-center space-x-1 min-h-[32px]"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span className="hidden sm:inline">Reset</span>
                    </button>

                    {/* Logout Button */}
                    <button
                      onClick={() => handleLogout(sess.id)}
                      disabled={isProcessingAction}
                      title={`Logout akun ${sess.name}`}
                      className="px-2 py-1 text-[11px] text-neutral-600 hover:text-neutral-900 hover:bg-neutral-200 transition-colors flex items-center space-x-1 min-h-[32px]"
                    >
                      <LogOut className="w-3 h-3" />
                      <span className="hidden sm:inline">Logout</span>
                    </button>

                    {/* Delete session button (disabled if only 1 session left) */}
                    {sessions.length > 1 && (
                      <button
                        onClick={() => handleDeleteSession(sess.id)}
                        disabled={isProcessingAction}
                        title={`Hapus sesi ${sess.name}`}
                        className="p-1 text-neutral-400 hover:text-neutral-900 hover:bg-neutral-200 transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Syncing Progress Bar */}
      {(isSyncing || (isConnecting && (status?.syncProgress || 0) > 0)) && (
        <div className="mb-6 p-4 bg-neutral-50 border border-neutral-200">
          <div className="flex justify-between text-xs font-mono mb-2">
            <span className="text-neutral-700">{status?.syncStatusText || 'Sedang sinkronisasi akun...'}</span>
            <span className="font-semibold text-neutral-900">{status?.syncProgress || 0}%</span>
          </div>
          <div className="w-full bg-neutral-200 h-2 overflow-hidden">
            <div
              className="bg-black h-2 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(5, status?.syncProgress || 0))}%` }}
            />
          </div>
        </div>
      )}

      {/* =========================================================================
          IF CONNECTED: Show Connected Bot Details & Controls
         ========================================================================= */}
      {isConnected && (
        <div className="p-4 border border-neutral-200 bg-neutral-50 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            {status?.botUser?.avatarUrl ? (
              <img
                src={status.botUser.avatarUrl}
                alt={status.botUser.name}
                className="w-12 h-12 rounded-none border border-neutral-300 object-cover flex-shrink-0"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-12 h-12 border border-neutral-300 bg-white flex items-center justify-center text-xs font-mono font-bold flex-shrink-0">
                WA
              </div>
            )}
            <div>
              <div className="flex items-center space-x-2">
                <p className="text-sm font-semibold text-neutral-900">
                  {status?.botUser?.name || activeSession?.name}
                </p>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-black text-white">
                  ONLINE
                </span>
              </div>
              <p className="text-xs font-mono text-neutral-500">
                +{status?.botUser?.phone || activeSession?.phone}
              </p>
              <p className="text-[11px] text-neutral-400 font-mono mt-0.5">
                Sesi aktif: {activeSession?.name} ({activeSessionId})
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 flex-wrap gap-y-2">
            <button
              onClick={onSync}
              className="min-h-[44px] px-3.5 py-2 border border-neutral-900 text-neutral-900 hover:bg-neutral-900 hover:text-white transition-colors flex items-center space-x-1.5 text-xs font-mono"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Sinkron Ulang</span>
            </button>
            <button
              onClick={() => handleResetCredentials(activeSessionId)}
              disabled={isProcessingAction}
              className="min-h-[44px] px-3.5 py-2 border border-neutral-300 text-neutral-700 hover:bg-neutral-100 transition-colors flex items-center space-x-1.5 text-xs font-mono"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Kredensial</span>
            </button>
            <button
              onClick={() => handleLogout(activeSessionId)}
              disabled={isProcessingAction}
              className="min-h-[44px] px-3.5 py-2 border border-neutral-300 text-neutral-700 hover:bg-neutral-100 transition-colors flex items-center space-x-1.5 text-xs font-mono"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log Out Akun Ini</span>
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          IF NOT CONNECTED: DUAL LOGIN OPTIONS (QR CODE vs KODE PAIRING)
         ========================================================================= */}
      {!isConnected && (
        <div className="border border-neutral-200 bg-white p-4 sm:p-5">
          <div className="mb-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold tracking-wider uppercase text-neutral-900">
                  Login Akun: {activeSession?.name}
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Pilih salah satu metode login: Scan QR Code atau Gunakan Kode Pairing
                </p>
              </div>
            </div>

            {/* Method Tabs */}
            <div className="grid grid-cols-2 gap-2 mt-4 max-w-md">
              <button
                type="button"
                onClick={() => setLoginMethod('qr')}
                className={`min-h-[44px] px-3 py-2 text-xs font-mono flex items-center justify-center space-x-2 border transition-colors ${
                  loginMethod === 'qr'
                    ? 'border-black bg-black text-white font-bold'
                    : 'border-neutral-300 bg-neutral-50 text-neutral-700 hover:bg-white'
                }`}
              >
                <QrCode className="w-4 h-4" />
                <span>Metode 1: QR Code</span>
              </button>

              <button
                type="button"
                onClick={() => setLoginMethod('pairing')}
                className={`min-h-[44px] px-3 py-2 text-xs font-mono flex items-center justify-center space-x-2 border transition-colors ${
                  loginMethod === 'pairing'
                    ? 'border-black bg-black text-white font-bold'
                    : 'border-neutral-300 bg-neutral-50 text-neutral-700 hover:bg-white'
                }`}
              >
                <KeyRound className="w-4 h-4" />
                <span>Metode 2: Kode Pairing</span>
              </button>
            </div>
          </div>

          {/* METHOD 1: SCAN QR CODE */}
          {loginMethod === 'qr' && (
            <div className="flex flex-col items-center justify-center p-6 border border-dashed border-neutral-300 bg-neutral-50">
              {status?.qrDataUrl ? (
                <div className="flex flex-col items-center">
                  <div className="p-3 bg-white border border-neutral-900 shadow-none">
                    <img
                      src={status.qrDataUrl}
                      alt="WhatsApp QR Code"
                      className="w-56 h-56 sm:w-64 sm:h-64 object-contain"
                    />
                  </div>
                  <div className="mt-4 text-center max-w-sm">
                    <p className="text-xs font-bold text-neutral-900 font-mono">
                      Langkah Menautkan via QR Code:
                    </p>
                    <ol className="text-[11px] text-neutral-600 mt-1.5 space-y-1 text-left list-decimal list-inside font-mono">
                      <li>Buka WhatsApp di HP Anda</li>
                      <li>Buka Menu (titik tiga atau Pengaturan) &gt; <strong>Perangkat Tertaut</strong></li>
                      <li>Klik <strong>Tautkan Perangkat</strong> &amp; scan QR Code di atas</li>
                    </ol>
                  </div>
                  <div className="mt-4 flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => onConnect({ force: true, freshQr: true })}
                      disabled={isProcessingAction}
                      className="min-h-[38px] px-3 py-1.5 bg-black text-white text-xs font-mono uppercase tracking-wider hover:bg-neutral-800 transition-colors flex items-center space-x-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Muat Ulang QR Baru</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResetCredentials(activeSessionId)}
                      disabled={isProcessingAction}
                      className="min-h-[38px] px-3 py-1.5 border border-neutral-300 bg-white text-neutral-700 text-xs font-mono uppercase tracking-wider hover:bg-neutral-100 transition-colors flex items-center space-x-1.5"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reset Sesi</span>
                    </button>
                  </div>
                </div>
              ) : isConnecting ? (
                <div className="flex flex-col items-center py-8 text-center max-w-sm">
                  <RefreshCw className="w-7 h-7 animate-spin text-neutral-800 mb-3" />
                  <p className="text-xs text-neutral-700 font-mono font-medium">
                    {status?.syncStatusText || 'Menyiapkan QR Code server WhatsApp...'}
                  </p>
                  <p className="text-[11px] text-neutral-500 font-mono mt-1 mb-4">
                    Jika proses tertunda, klik tombol di bawah untuk memaksa pembuatan QR baru atau mereset sesi.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => onConnect({ force: true, freshQr: true })}
                      disabled={isProcessingAction}
                      className="min-h-[38px] px-3 py-1.5 bg-black text-white text-xs font-mono uppercase tracking-wider hover:bg-neutral-800 transition-colors"
                    >
                      Paksa Muat Ulang QR
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResetCredentials(activeSessionId)}
                      disabled={isProcessingAction}
                      className="min-h-[38px] px-3 py-1.5 border border-neutral-400 bg-white text-neutral-800 text-xs font-mono uppercase tracking-wider hover:bg-neutral-100 transition-colors"
                    >
                      Reset Kredensial Sesi
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center py-8 text-center max-w-sm">
                  <QrCode className="w-10 h-10 text-neutral-400 stroke-1 mb-2" />
                  <p className="text-sm font-medium text-neutral-800">QR Code Siap Dimuat</p>
                  <p className="text-xs text-neutral-500 mt-1 mb-4">
                    Klik tombol di bawah untuk menghasilkan QR Code login WhatsApp.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => onConnect({ force: true, freshQr: true })}
                      disabled={isProcessingAction}
                      className="min-h-[44px] px-4 py-2 bg-black text-white text-xs font-mono uppercase tracking-wider hover:bg-neutral-800 transition-colors"
                    >
                      Muat QR Code Sekarang
                    </button>
                    <button
                      type="button"
                      onClick={() => handleResetCredentials(activeSessionId)}
                      disabled={isProcessingAction}
                      className="min-h-[44px] px-3.5 py-2 border border-neutral-300 bg-white text-neutral-700 text-xs font-mono uppercase tracking-wider hover:bg-neutral-100 transition-colors"
                    >
                      Bersihkan Sesi
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* METHOD 2: KODE PAIRING (NOMOR HP) */}
          {loginMethod === 'pairing' && (
            <div className="p-4 sm:p-6 border border-neutral-300 bg-neutral-50">
              <div className="max-w-lg mx-auto">
                <div className="flex items-center space-x-2 mb-3">
                  <Smartphone className="w-4 h-4 text-neutral-900" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-900">
                    Tautkan Perangkat Menggunakan Kode Pairing 8 Digit
                  </h4>
                </div>
                <p className="text-xs text-neutral-600 mb-4">
                  Metode ini cocok jika kamera HP Anda rusak atau jika Anda ingin menautkan nomor WhatsApp tanpa perlu scan QR.
                </p>

                {pairingError && (
                  <div className="mb-4 p-3 bg-neutral-100 border border-neutral-400 text-xs font-mono text-neutral-900 flex items-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-neutral-800 flex-shrink-0" />
                    <span>{pairingError}</span>
                  </div>
                )}

                {/* Phone Input Form */}
                <form onSubmit={handleRequestPairing} className="mb-5">
                  <label className="block text-xs font-mono text-neutral-700 mb-1.5">
                    Nomor WhatsApp HP Anda (sertakan kode negara atau awali 08/628):
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="Contoh: 08123456789 atau 628123456789"
                      className="flex-1 px-3 py-2 text-xs font-mono border border-neutral-300 bg-white focus:outline-none focus:border-black min-h-[44px]"
                    />
                    <button
                      type="submit"
                      disabled={isRequestingCode}
                      className="min-h-[44px] px-4 py-2 bg-black text-white text-xs font-mono uppercase tracking-wider hover:bg-neutral-800 disabled:opacity-50 flex items-center justify-center space-x-1.5"
                    >
                      {isRequestingCode ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Meminta Kode...</span>
                        </>
                      ) : (
                        <span>Minta Kode Pairing</span>
                      )}
                    </button>
                  </div>
                </form>

                {/* Display Pairing Code Result */}
                {pairingCodeResult && (
                  <div className="p-4 bg-white border border-neutral-900 mb-4">
                    <div className="text-center">
                      <span className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider">
                        Kode Pairing WhatsApp Anda:
                      </span>
                      <div className="text-3xl sm:text-4xl font-mono font-bold text-neutral-900 tracking-widest my-2 select-all">
                        {pairingCodeResult}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleCopyCode(pairingCodeResult)}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 border border-neutral-900 text-xs font-mono hover:bg-neutral-900 hover:text-white transition-colors min-h-[38px]"
                      >
                        {copiedCode ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-black" />
                            <span>Tersalin ke Clipboard!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5" />
                            <span>Salin Kode Pairing</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Step-by-step pairing instructions */}
                    <div className="mt-4 pt-4 border-t border-neutral-200">
                      <p className="text-xs font-bold text-neutral-900 font-mono mb-2 flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5 text-black" />
                        <span>Cara Memasukkan Kode di WhatsApp HP:</span>
                      </p>
                      <ol className="text-[11px] text-neutral-700 space-y-2 list-decimal list-inside font-mono">
                        <li>Buka aplikasi <strong>WhatsApp</strong> resmi di HP Anda</li>
                        <li>Tekan menu titik tiga (⋮) di kanan atas &gt; pilih <strong>Perangkat tertaut (Linked devices)</strong></li>
                        <li>Klik tombol <strong>Tautkan Perangkat (Link a device)</strong></li>
                        <li>Di bawah area pemindai kamera QR, ketuk teks: <strong>"Tautkan dengan nomor telepon saja" (Link with phone number instead)</strong></li>
                        <li>Ketik 8 karakter kode resmi di atas: <strong className="bg-neutral-100 px-1.5 py-0.5 border border-neutral-300 text-black">{pairingCodeResult}</strong> (tanda strip "-" akan otomatis terisi di WhatsApp)</li>
                      </ol>

                      <div className="mt-3 p-2.5 bg-neutral-100 border border-neutral-300 text-[10px] font-mono text-neutral-600">
                        💡 <strong>Catatan:</strong> Kode ini adalah kode acak resmi dari protokol WhatsApp (bukan dummy). Kode berlaku selama ~60-120 detik. Jika kode kadaluarsa di HP, cukup klik tombol <em>Minta Kode Pairing</em> di atas untuk menghasilkan kode baru.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
