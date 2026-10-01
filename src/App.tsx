import { useState, useEffect, useCallback } from 'react';
import Header from './components/Header.tsx';
import LoginModal from './components/LoginModal.tsx';
import DashboardRadar from './components/DashboardRadar.tsx';
import BroadcastPanel from './components/BroadcastPanel.tsx';
import AnalyticsPanel from './components/AnalyticsPanel.tsx';
import GeneralSettings from './components/GeneralSettings.tsx';
import { SystemStatus, WAGroup, WAContact, ActivityLog, AppStats, AnalyticsData } from './types.ts';

export default function App() {
  const [currentTab, setCurrentTab] = useState<'radar' | 'broadcast' | 'analytics' | 'settings'>('radar');
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [groups, setGroups] = useState<WAGroup[]>([]);
  const [contacts, setContacts] = useState<WAContact[]>([]);
  const [adminNumbers, setAdminNumbers] = useState<string[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [stats, setStats] = useState<AppStats>({
    totalBroadcasts: 0,
    rvoProcessed: 0,
    groupStatusSent: 0,
    lastSync: null,
  });
  const [activeBroadcast, setActiveBroadcast] = useState<any>(null);

  // Fetch full system status
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        setStatus(data);
      }
    } catch {
      // Gracefully handle temporary server restart/disconnects
    }
  }, []);

  // Fetch all groups without limit
  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/groups');
      if (res.ok) {
        const data = await res.json();
        setGroups(data.groups || []);
      }
    } catch {
      // Gracefully handle temporary server restart/disconnects
    }
  }, []);

  // Fetch all contacts without limit
  const fetchContacts = useCallback(async () => {
    try {
      const res = await fetch('/api/contacts');
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
      }
    } catch {
      // Gracefully handle temporary server restart/disconnects
    }
  }, []);

  // Fetch settings & logs & analytics
  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setAdminNumbers(data.adminNumbers || []);
        setLogs(data.logs || []);
        if (data.stats) setStats(data.stats);
        if (data.analytics) setAnalytics(data.analytics);
      }
    } catch {
      // Gracefully handle temporary server restart/disconnects
    }
  }, []);

  // Fetch dedicated analytics
  const fetchAnalytics = useCallback(async () => {
    try {
      const res = await fetch('/api/analytics');
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch {
      // Gracefully handle temporary server restart/disconnects
    }
  }, []);

  // Reset analytics data
  const handleResetAnalytics = useCallback(async () => {
    const res = await fetch('/api/analytics/reset', { method: 'POST' });
    if (!res.ok) {
      throw new Error('Gagal mereset analitik');
    }
    await fetchAnalytics();
  }, [fetchAnalytics]);

  // Check broadcast progress
  const fetchBroadcastProgress = useCallback(async () => {
    try {
      const res = await fetch('/api/broadcast/progress');
      if (res.ok) {
        const data = await res.json();
        setActiveBroadcast(data.activeBroadcast);
      }
    } catch {
      // Gracefully handle temporary server restart/disconnects
    }
  }, []);

  // Polling on intervals
  useEffect(() => {
    fetchStatus();
    fetchGroups();
    fetchContacts();
    fetchSettings();
    fetchAnalytics();
    fetchBroadcastProgress();

    const timer = setInterval(() => {
      fetchStatus();
      fetchBroadcastProgress();
    }, 2500);

    const periodicDataTimer = setInterval(() => {
      fetchGroups();
      fetchContacts();
      fetchSettings();
      fetchAnalytics();
    }, 8000);

    return () => {
      clearInterval(timer);
      clearInterval(periodicDataTimer);
    };
  }, [fetchStatus, fetchGroups, fetchContacts, fetchSettings, fetchAnalytics, fetchBroadcastProgress]);

  // Connect action
  const handleConnect = async (options?: { force?: boolean; freshQr?: boolean }) => {
    await fetch('/api/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {}),
    });
    fetchStatus();
  };

  // Reset Credentials action
  const handleResetCredentials = async (sessionId?: string) => {
    const res = await fetch('/api/sessions/reset-credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Gagal reset kredensial');
    }
    await fetchStatus();
    return data;
  };

  // Sync action
  const handleSync = async () => {
    await fetch('/api/sync', { method: 'POST' });
    fetchStatus();
    fetchGroups();
    fetchContacts();
  };

  // Switch session
  const handleSwitchSession = async (sessionId: string) => {
    // Clear data immediately so old account data never persists or leaks
    setGroups([]);
    setContacts([]);
    const res = await fetch('/api/sessions/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Gagal berpindah akun');
    }
    if (Array.isArray(data.groups)) {
      setGroups(data.groups);
    }
    if (Array.isArray(data.contacts)) {
      setContacts(data.contacts);
    }
    await fetchStatus();
    await fetchGroups();
    await fetchContacts();
    await fetchAnalytics();
  };

  // Toggle Bot feature per session
  const handleToggleSessionBot = async (sessionId: string, enabled?: boolean) => {
    const res = await fetch('/api/sessions/toggle-bot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, enabled }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Gagal mengubah status bot akun');
    }
    await fetchStatus();
  };

  // Toggle Master Global Bot Switch
  const handleToggleGlobalBot = async (enabled?: boolean) => {
    const res = await fetch('/api/bot/toggle-general', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Gagal mengubah status master bot');
    }
    await fetchStatus();
  };

  // Create new session
  const handleCreateSession = async (name: string) => {
    // Clear data immediately for clean new account setup
    setGroups([]);
    setContacts([]);
    const res = await fetch('/api/sessions/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Gagal membuat akun baru');
    }
    if (Array.isArray(data.groups)) {
      setGroups(data.groups);
    }
    if (Array.isArray(data.contacts)) {
      setContacts(data.contacts);
    }
    await fetchStatus();
    await fetchGroups();
    await fetchContacts();
  };

  // Logout session
  const handleLogoutSession = async (sessionId?: string) => {
    const res = await fetch('/api/sessions/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Gagal logout');
    }
    await fetchStatus();
    await fetchGroups();
    await fetchContacts();
  };

  // Delete session
  const handleDeleteSession = async (sessionId: string) => {
    const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Gagal menghapus sesi');
    }
    await fetchStatus();
  };

  // Request Pairing Code
  const handleRequestPairingCode = async (phone: string) => {
    const res = await fetch('/api/pairing-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Gagal meminta kode pairing');
    }
    await fetchStatus();
    return data;
  };

  // Update bot name
  const handleUpdateBotName = async (name: string) => {
    const res = await fetch('/api/settings/bot-name', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ botName: name }),
    });
    if (res.ok) {
      fetchStatus();
      fetchSettings();
    }
  };

  // Add Admin+
  const handleAddAdmin = async (phone: string) => {
    const res = await fetch('/api/settings/admin-plus', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Gagal menambahkan Admin+');
    }
    setAdminNumbers(data.adminNumbers || []);
    fetchSettings();
  };

  // Remove Admin+
  const handleRemoveAdmin = async (phone: string) => {
    const res = await fetch(`/api/settings/admin-plus/${encodeURIComponent(phone)}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Gagal menghapus Admin+');
    }
    setAdminNumbers(data.adminNumbers || []);
    fetchSettings();
  };

  // Danger purge all
  const handleDangerPurge = async (options?: { resetSessions?: boolean }) => {
    const res = await fetch('/api/danger/purge-all', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {}),
    });
    if (!res.ok) {
      throw new Error('Gagal membersihkan data');
    }
    fetchStatus();
    fetchSettings();
    fetchGroups();
    fetchContacts();
  };

  // Start broadcast
  const handleStartBroadcast = async (payload: any) => {
    const res = await fetch('/api/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Gagal broadcast');
    }
    setActiveBroadcast(data.broadcast);
  };

  // Stop broadcast
  const handleStopBroadcast = async () => {
    await fetch('/api/broadcast/stop', { method: 'POST' });
    fetchBroadcastProgress();
  };

  // Upload story / status grup (.swgc+ from Web UI: media or text with background color)
  const handleUploadSwgc = async (payload: {
    groupIds: string[];
    file?: File | null;
    caption?: string;
    text?: string;
    backgroundColor?: string;
    font?: number;
  }) => {
    const formData = new FormData();
    if (payload.file) {
      formData.append('media', payload.file);
    }
    formData.append('groupIds', JSON.stringify(payload.groupIds));
    if (payload.caption) formData.append('caption', payload.caption);
    if (payload.text) formData.append('text', payload.text);
    if (payload.backgroundColor) formData.append('backgroundColor', payload.backgroundColor);
    if (payload.font) formData.append('font', String(payload.font));

    const res = await fetch('/api/swgc/upload', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Gagal mengirim status grup');
    }
    fetchSettings();
  };

  return (
    <div className="min-h-screen bg-[#fafafa] text-neutral-900 selection:bg-neutral-900 selection:text-white">
      <Header currentTab={currentTab} onSelectTab={setCurrentTab} status={status} />

      <main className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        <LoginModal
          status={status}
          onConnect={handleConnect}
          onSync={handleSync}
          onSwitchSession={handleSwitchSession}
          onCreateSession={handleCreateSession}
          onLogoutSession={handleLogoutSession}
          onDeleteSession={handleDeleteSession}
          onToggleSessionBot={handleToggleSessionBot}
          onRequestPairingCode={handleRequestPairingCode}
          onRefreshStatus={fetchStatus}
          onResetCredentials={handleResetCredentials}
        />

        {currentTab === 'radar' && (
          <DashboardRadar groups={groups} contacts={contacts} onUploadSwgc={handleUploadSwgc} />
        )}

        {currentTab === 'broadcast' && (
          <BroadcastPanel groups={groups} contacts={contacts} onStartBroadcast={handleStartBroadcast} onStopBroadcast={handleStopBroadcast} activeBroadcast={activeBroadcast} />
        )}

        {currentTab === 'analytics' && (
          <AnalyticsPanel
            analytics={analytics}
            groups={groups}
            onRefresh={fetchAnalytics}
            onReset={handleResetAnalytics}
          />
        )}

        {currentTab === 'settings' && (
          <GeneralSettings
            botName={status?.botName || 'Axale Tools Plus'}
            adminNumbers={adminNumbers}
            logs={logs}
            stats={stats}
            globalBotEnabled={status?.globalBotEnabled ?? true}
            onToggleGlobalBot={handleToggleGlobalBot}
            onUpdateBotName={handleUpdateBotName}
            onAddAdmin={handleAddAdmin}
            onRemoveAdmin={handleRemoveAdmin}
            onDangerPurge={handleDangerPurge}
          />
        )}
      </main>
    </div>
  );
}

