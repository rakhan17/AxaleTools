import { useState, useMemo } from 'react';
import {
  BarChart3,
  TrendingUp,
  MessageSquare,
  Bot,
  Users,
  RefreshCw,
  Trash2,
  Clock,
  Award,
  Calendar,
  Search,
  Zap,
  Crown,
  MessageCircle,
  Flame,
  Filter,
  Eye,
} from 'lucide-react';
import { AnalyticsData, WAGroup } from '../types.ts';

interface AnalyticsPanelProps {
  analytics: AnalyticsData | null;
  groups: WAGroup[];
  onRefresh: () => Promise<void>;
  onReset: () => Promise<void>;
}

type TimePeriod = 'daily' | 'monthly' | 'yearly';
type RankingTab = 'chatter' | 'commands' | 'groups';

export default function AnalyticsPanel({
  analytics,
  groups,
  onRefresh,
  onReset,
}: AnalyticsPanelProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Time series period filter: daily, monthly, yearly
  const [activePeriod, setActivePeriod] = useState<TimePeriod>('daily');

  // Ranking category tab: most chat (users), most commands (users), most comments/chat (groups)
  const [activeRankingTab, setActiveRankingTab] = useState<RankingTab>('chatter');

  // Search query for leaderboard filtering
  const [searchQuery, setSearchQuery] = useState('');

  // Group name lookup map
  const groupNameMap = useMemo(() => {
    const map = new Map<string, string>();
    groups.forEach((g) => map.set(g.id, g.subject));
    return map;
  }, [groups]);

  // Top groups sorted by message count
  const sortedGroups = useMemo(() => {
    if (!analytics?.groupActivity) return [];
    return Object.values(analytics.groupActivity)
      .sort((a, b) => b.messageCount - a.messageCount);
  }, [analytics?.groupActivity]);

  // Top users sorted by total commands
  const sortedCommandUsers = useMemo(() => {
    if (!analytics?.userActivity) return [];
    return Object.values(analytics.userActivity)
      .sort((a, b) => b.totalCommands - a.totalCommands);
  }, [analytics?.userActivity]);

  // Top users sorted by total chats (user chat activity)
  const sortedChatUsers = useMemo(() => {
    if (!analytics?.userChatActivity) return [];
    return Object.values(analytics.userChatActivity)
      .sort((a, b) => b.totalMessages - a.totalMessages);
  }, [analytics?.userChatActivity]);

  // Filtered lists based on search
  const filteredChatUsers = useMemo(() => {
    if (!searchQuery.trim()) return sortedChatUsers;
    const q = searchQuery.toLowerCase();
    return sortedChatUsers.filter(
      (u) =>
        u.phone.toLowerCase().includes(q) ||
        (u.name && u.name.toLowerCase().includes(q))
    );
  }, [sortedChatUsers, searchQuery]);

  const filteredCommandUsers = useMemo(() => {
    if (!searchQuery.trim()) return sortedCommandUsers;
    const q = searchQuery.toLowerCase();
    return sortedCommandUsers.filter(
      (u) =>
        u.phone.toLowerCase().includes(q) ||
        (u.name && u.name.toLowerCase().includes(q))
    );
  }, [sortedCommandUsers, searchQuery]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return sortedGroups;
    const q = searchQuery.toLowerCase();
    return sortedGroups.filter((g) => {
      const name = g.groupName || groupNameMap.get(g.groupId) || '';
      return name.toLowerCase().includes(q) || g.groupId.toLowerCase().includes(q);
    });
  }, [sortedGroups, groupNameMap, searchQuery]);

  // Max calculations for relative progress bars
  const maxGroupMessages = useMemo(() => {
    if (sortedGroups.length === 0) return 1;
    return sortedGroups[0].messageCount || 1;
  }, [sortedGroups]);

  const maxChatUserMessages = useMemo(() => {
    if (sortedChatUsers.length === 0) return 1;
    return sortedChatUsers[0].totalMessages || 1;
  }, [sortedChatUsers]);

  const maxCommandUserCount = useMemo(() => {
    if (sortedCommandUsers.length === 0) return 1;
    return sortedCommandUsers[0].totalCommands || 1;
  }, [sortedCommandUsers]);

  // Time series entries
  const timeSeriesData = useMemo(() => {
    const ts = analytics?.timeSeries;
    if (!ts) return { entries: [], maxVal: 1, totalPeriod: 0 };

    let record: Record<string, number> = {};
    if (activePeriod === 'daily') {
      record = ts.daily || {};
    } else if (activePeriod === 'monthly') {
      record = ts.monthly || {};
    } else {
      record = ts.yearly || {};
    }

    const entries = Object.entries(record)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.key.localeCompare(a.key)); // newest first

    let maxVal = 1;
    let totalPeriod = 0;
    for (const e of entries) {
      if (e.count > maxVal) maxVal = e.count;
      totalPeriod += e.count;
    }

    return { entries, maxVal, totalPeriod };
  }, [analytics?.timeSeries, activePeriod]);

  // Total commands count
  const totalCommandCount = useMemo(() => {
    if (!analytics?.commandCounts) return 0;
    const c = analytics.commandCounts;
    return (
      (c.rvo || 0) +
      (c.swgc || 0) +
      (c.delswgc || 0) +
      (c.ghost || 0) +
      (c.promote || 0) +
      (c.demote || 0) +
      (c.broadcast || 0)
    );
  }, [analytics?.commandCounts]);

  const handleRefreshClick = async () => {
    setIsRefreshing(true);
    setFeedback(null);
    try {
      await onRefresh();
      setFeedback('Data analitik berhasil diperbarui secara real-time.');
    } catch {
      setFeedback('Gagal memuat ulang data analitik.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleResetClick = async () => {
    setIsResetting(true);
    setFeedback(null);
    try {
      await onReset();
      setConfirmReset(false);
      setFeedback('Data analitik berhasil direset ke nol.');
    } catch {
      setFeedback('Gagal mereset data analitik.');
    } finally {
      setIsResetting(false);
    }
  };

  // Helper date formatters
  const formatPeriodLabel = (key: string, period: TimePeriod): string => {
    try {
      if (period === 'daily') {
        const parts = key.split('-');
        if (parts.length === 3) {
          const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
          return d.toLocaleDateString('id-ID', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          });
        }
        return key;
      } else if (period === 'monthly') {
        const parts = key.split('-');
        if (parts.length === 2) {
          const d = new Date(Number(parts[0]), Number(parts[1]) - 1, 1);
          return d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
        }
        return key;
      }
      return `Tahun ${key}`;
    } catch {
      return key;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Quick Action Buttons */}
      <div className="border border-neutral-200 bg-white p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black text-white flex items-center justify-center">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-wider uppercase text-neutral-900">
                Analitik Detail Aktivitas & Penggunaan Bot
              </h2>
              <p className="text-xs text-neutral-500">
                Pantau statistik chat harian/bulanan/tahunan, user teraktif, grup terpadat, dan eksekusi perintah bot
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleRefreshClick}
            disabled={isRefreshing}
            className="px-3 py-1.5 border border-neutral-300 text-neutral-800 hover:border-black hover:bg-black hover:text-white text-xs font-mono transition-colors flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Memuat...' : 'Segarkan Data'}</span>
          </button>

          {!confirmReset ? (
            <button
              onClick={() => setConfirmReset(true)}
              className="px-3 py-1.5 border border-neutral-300 text-neutral-600 hover:text-red-700 hover:border-red-400 text-xs font-mono transition-colors flex items-center space-x-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Reset Data</span>
            </button>
          ) : (
            <div className="flex items-center space-x-1.5 bg-neutral-100 p-1 border border-neutral-300">
              <span className="text-[11px] font-mono text-neutral-700 px-1">Yakin reset?</span>
              <button
                onClick={handleResetClick}
                disabled={isResetting}
                className="px-2 py-1 bg-red-600 text-white text-[10px] font-mono uppercase hover:bg-red-700 disabled:opacity-50 cursor-pointer"
              >
                {isResetting ? '...' : 'Ya, Reset'}
              </button>
              <button
                onClick={() => setConfirmReset(false)}
                className="px-2 py-1 border border-neutral-300 bg-white text-[10px] font-mono uppercase hover:bg-neutral-50 cursor-pointer"
              >
                Batal
              </button>
            </div>
          )}
        </div>
      </div>

      {feedback && (
        <div className="p-3 bg-neutral-50 border border-neutral-300 text-xs font-mono text-neutral-900 flex items-center justify-between">
          <span>{feedback}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-neutral-500 hover:text-black text-xs font-mono underline"
          >
            Tutup
          </button>
        </div>
      )}

      {/* 5 Primary Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Card 1: Total Chat WhatsApp */}
        <div className="border border-neutral-200 bg-white p-4">
          <div className="flex items-center justify-between text-neutral-500 mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider">Total Chat Masuk</span>
            <MessageSquare className="w-4 h-4 text-neutral-700" />
          </div>
          <div className="text-2xl font-bold font-mono text-neutral-900">
            {analytics?.totalMessagesTracked || 0}
          </div>
          <p className="text-[10px] text-neutral-500 font-mono mt-1">
            Di seluruh grup & kontak WhatsApp
          </p>
        </div>

        {/* Card 2: Total Perintah Bot */}
        <div className="border border-neutral-200 bg-white p-4">
          <div className="flex items-center justify-between text-neutral-500 mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider">Total Eksekusi Bot</span>
            <Bot className="w-4 h-4 text-neutral-700" />
          </div>
          <div className="text-2xl font-bold font-mono text-neutral-900">
            {totalCommandCount || analytics?.totalCommandsTracked || 0}
          </div>
          <p className="text-[10px] text-neutral-500 font-mono mt-1">
            .rvo, .swgc, .delswgc, .ghost, dll
          </p>
        </div>

        {/* Card 3: Grup Paling Ramai Chat */}
        <div className="border border-neutral-200 bg-white p-4">
          <div className="flex items-center justify-between text-neutral-500 mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider">Grup Paling Ramai</span>
            <Flame className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-sm font-bold truncate text-neutral-900">
            {sortedGroups[0]?.groupName ||
              (sortedGroups[0]?.groupId ? groupNameMap.get(sortedGroups[0].groupId) : null) ||
              'Belum ada data'}
          </div>
          <p className="text-[10px] text-neutral-500 font-mono mt-1">
            {sortedGroups[0]
              ? `${sortedGroups[0].messageCount} pesan terkirim`
              : 'Menunggu aktivitas'}
          </p>
        </div>

        {/* Card 4: User Paling Banyak Chat */}
        <div className="border border-neutral-200 bg-white p-4">
          <div className="flex items-center justify-between text-neutral-500 mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider">Top Chatter (Pesan)</span>
            <Crown className="w-4 h-4 text-yellow-600" />
          </div>
          <div className="text-sm font-bold truncate font-mono text-neutral-900">
            {sortedChatUsers[0]
              ? `+${sortedChatUsers[0].phone}`
              : sortedCommandUsers[0]
              ? `+${sortedCommandUsers[0].phone}`
              : 'Belum ada data'}
          </div>
          <p className="text-[10px] text-neutral-500 font-mono mt-1 truncate">
            {sortedChatUsers[0]
              ? `${sortedChatUsers[0].totalMessages} chat (${sortedChatUsers[0].name || 'User'})`
              : 'Menunggu chat pengguna'}
          </p>
        </div>

        {/* Card 5: User Paling Banyak Command */}
        <div className="border border-neutral-200 bg-white p-4">
          <div className="flex items-center justify-between text-neutral-500 mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider">Top User (Command)</span>
            <Award className="w-4 h-4 text-black" />
          </div>
          <div className="text-sm font-bold truncate font-mono text-neutral-900">
            {sortedCommandUsers[0] ? `+${sortedCommandUsers[0].phone}` : 'Belum ada data'}
          </div>
          <p className="text-[10px] text-neutral-500 font-mono mt-1">
            {sortedCommandUsers[0]
              ? `${sortedCommandUsers[0].totalCommands} kali eksekusi bot`
              : 'Menunggu perintah bot'}
          </p>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: STATISTIK WAKTU (TOTAL CHAT PER HARI, PER BULAN, PER TAHUN)   */}
      {/* ========================================================================= */}
      <div className="border border-neutral-200 bg-white p-5 space-y-4">
        <div className="border-b border-neutral-200 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-mono uppercase tracking-wider text-neutral-900 font-bold flex items-center gap-2">
              <Calendar className="w-4 h-4 text-black" />
              <span>Volume Total Chat Berdasarkan Rentang Waktu</span>
            </h3>
            <p className="text-[11px] text-neutral-500 font-mono mt-0.5">
              Rincian komprehensif total pesan yang dikirim dan diterima per hari, per bulan, dan per tahun
            </p>
          </div>

          {/* Time Period Filter Tabs */}
          <div className="flex items-center border border-neutral-300 p-0.5 bg-neutral-100">
            <button
              onClick={() => setActivePeriod('daily')}
              className={`px-3 py-1 text-xs font-mono uppercase transition-colors cursor-pointer ${
                activePeriod === 'daily'
                  ? 'bg-black text-white font-bold'
                  : 'text-neutral-700 hover:text-black hover:bg-white'
              }`}
            >
              📅 Per Hari
            </button>
            <button
              onClick={() => setActivePeriod('monthly')}
              className={`px-3 py-1 text-xs font-mono uppercase transition-colors cursor-pointer ${
                activePeriod === 'monthly'
                  ? 'bg-black text-white font-bold'
                  : 'text-neutral-700 hover:text-black hover:bg-white'
              }`}
            >
              🗓️ Per Bulan
            </button>
            <button
              onClick={() => setActivePeriod('yearly')}
              className={`px-3 py-1 text-xs font-mono uppercase transition-colors cursor-pointer ${
                activePeriod === 'yearly'
                  ? 'bg-black text-white font-bold'
                  : 'text-neutral-700 hover:text-black hover:bg-white'
              }`}
            >
              📆 Per Tahun
            </button>
          </div>
        </div>

        {/* Visual Bar Chart for Time-Series */}
        <div className="pt-2">
          {timeSeriesData.entries.length === 0 ? (
            <div className="py-8 text-center text-xs font-mono text-neutral-400">
              Belum ada riwayat aktivitas pesan untuk rentang waktu ini.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Histogram Bars */}
              <div className="p-4 bg-neutral-50 border border-neutral-200">
                <div className="flex items-center justify-between mb-3 text-[11px] font-mono text-neutral-600">
                  <span>Grafik Tren ({activePeriod === 'daily' ? 'Harian' : activePeriod === 'monthly' ? 'Bulanan' : 'Tahunan'})</span>
                  <span>Puncak: {timeSeriesData.maxVal} chat</span>
                </div>

                <div className="flex items-end gap-2 sm:gap-3 h-36 pt-4 px-2 border-b border-neutral-300 overflow-x-auto">
                  {/* Show chronologically: oldest to newest for visual flow */}
                  {[...timeSeriesData.entries].reverse().slice(-14).map((entry) => {
                    const heightPercent = Math.max(8, Math.round((entry.count / timeSeriesData.maxVal) * 100));
                    const isPeak = entry.count === timeSeriesData.maxVal;

                    return (
                      <div
                        key={entry.key}
                        className="flex-1 min-w-[48px] max-w-[72px] flex flex-col items-center gap-1 group relative"
                      >
                        {/* Hover Tooltip */}
                        <div className="absolute -top-7 opacity-0 group-hover:opacity-100 transition-opacity bg-black text-white text-[10px] font-mono py-0.5 px-1.5 whitespace-nowrap z-10 pointer-events-none">
                          {entry.count} chat
                        </div>

                        {/* Bar Value on Top */}
                        <span className="text-[10px] font-mono text-neutral-600 font-bold mb-0.5">
                          {entry.count}
                        </span>

                        {/* Bar Pillar */}
                        <div
                          className={`w-full transition-all duration-300 ${
                            isPeak ? 'bg-black' : 'bg-neutral-400 group-hover:bg-neutral-800'
                          }`}
                          style={{ height: `${heightPercent}%` }}
                        />

                        {/* Date Label Below */}
                        <span className="text-[10px] font-mono text-neutral-600 truncate w-full text-center mt-1">
                          {activePeriod === 'daily'
                            ? entry.key.split('-').slice(1).join('/')
                            : activePeriod === 'monthly'
                            ? entry.key.split('-')[1] + '/' + entry.key.split('-')[0].slice(2)
                            : entry.key}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Data Table Breakdown of Dates */}
              <div className="border border-neutral-200 overflow-hidden">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-neutral-100 text-neutral-700 border-b border-neutral-200">
                    <tr>
                      <th className="py-2.5 px-4 font-semibold uppercase text-[10px]">
                        {activePeriod === 'daily' ? 'Tanggal' : activePeriod === 'monthly' ? 'Bulan' : 'Tahun'}
                      </th>
                      <th className="py-2.5 px-4 font-semibold uppercase text-[10px]">Total Chat</th>
                      <th className="py-2.5 px-4 font-semibold uppercase text-[10px]">Persentase</th>
                      <th className="py-2.5 px-4 font-semibold uppercase text-[10px] text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 bg-white">
                    {timeSeriesData.entries.map((item, idx) => {
                      const percent = timeSeriesData.totalPeriod > 0
                        ? Math.round((item.count / timeSeriesData.totalPeriod) * 100)
                        : 0;
                      const isPeak = item.count === timeSeriesData.maxVal;

                      return (
                        <tr key={item.key} className="hover:bg-neutral-50 transition-colors">
                          <td className="py-2.5 px-4 font-bold text-neutral-900">
                            {formatPeriodLabel(item.key, activePeriod)}
                            <span className="text-[10px] text-neutral-400 ml-2 font-normal">
                              ({item.key})
                            </span>
                          </td>
                          <td className="py-2.5 px-4 font-bold text-neutral-900">
                            {item.count} chat
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-24 bg-neutral-100 h-1.5 overflow-hidden">
                                <div
                                  className="bg-black h-1.5"
                                  style={{ width: `${Math.max(4, percent)}%` }}
                                />
                              </div>
                              <span className="text-[11px] text-neutral-600">{percent}%</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-right">
                            {isPeak ? (
                              <span className="px-2 py-0.5 bg-black text-white text-[10px] uppercase font-bold">
                                Puncak Ramai
                              </span>
                            ) : idx === 0 ? (
                              <span className="px-2 py-0.5 bg-neutral-200 text-neutral-800 text-[10px] uppercase">
                                Terkini
                              </span>
                            ) : (
                              <span className="text-neutral-400 text-[11px]">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: LEADERBOARDS & RANKINGS (USER CHAT, COMMANDS, GRUP TERPADAT)   */}
      {/* ========================================================================= */}
      <div className="border border-neutral-200 bg-white p-5 space-y-4">
        {/* Navigation & Search Bar */}
        <div className="border-b border-neutral-200 pb-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Category Tabs */}
          <div className="flex items-center border border-neutral-300 p-0.5 bg-neutral-100 overflow-x-auto">
            <button
              onClick={() => {
                setActiveRankingTab('chatter');
                setSearchQuery('');
              }}
              className={`px-3 py-1.5 text-xs font-mono uppercase transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                activeRankingTab === 'chatter'
                  ? 'bg-black text-white font-bold'
                  : 'text-neutral-700 hover:text-black hover:bg-white'
              }`}
            >
              <Crown className="w-3.5 h-3.5" />
              <span>👑 User Paling Banyak Chat ({sortedChatUsers.length})</span>
            </button>

            <button
              onClick={() => {
                setActiveRankingTab('commands');
                setSearchQuery('');
              }}
              className={`px-3 py-1.5 text-xs font-mono uppercase transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                activeRankingTab === 'commands'
                  ? 'bg-black text-white font-bold'
                  : 'text-neutral-700 hover:text-black hover:bg-white'
              }`}
            >
              <Zap className="w-3.5 h-3.5" />
              <span>⚡ User Paling Banyak Command ({sortedCommandUsers.length})</span>
            </button>

            <button
              onClick={() => {
                setActiveRankingTab('groups');
                setSearchQuery('');
              }}
              className={`px-3 py-1.5 text-xs font-mono uppercase transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                activeRankingTab === 'groups'
                  ? 'bg-black text-white font-bold'
                  : 'text-neutral-700 hover:text-black hover:bg-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>💬 Grup Paling Banyak Komen & Chat ({sortedGroups.length})</span>
            </button>
          </div>

          {/* Search Input */}
          <div className="relative min-w-[220px]">
            <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nomor, nama, atau grup..."
              className="w-full pl-8 pr-3 py-1.5 border border-neutral-300 text-xs font-mono focus:border-black focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-neutral-400 hover:text-black"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* TAB 1: User Paling Banyak Chat */}
        {activeRankingTab === 'chatter' && (
          <div>
            <div className="mb-3 flex items-center justify-between text-xs font-mono text-neutral-500">
              <span>Daftar pengguna yang paling sering mengirim pesan/chat di WhatsApp</span>
              <span>Total {filteredChatUsers.length} Pengguna Terdata</span>
            </div>

            {filteredChatUsers.length === 0 ? (
              <div className="py-12 text-center text-xs font-mono text-neutral-400 border border-neutral-100">
                {searchQuery
                  ? `Tidak ada pengguna yang cocok dengan pencarian "${searchQuery}".`
                  : 'Belum ada data percakapan pengguna yang tercatat. Sistem akan mendata secara otomatis saat pesan masuk.'}
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredChatUsers.map((user, idx) => {
                  const percent = Math.round((user.totalMessages / maxChatUserMessages) * 100);
                  const isTop1 = idx === 0;
                  const isTop2 = idx === 1;
                  const isTop3 = idx === 2;

                  return (
                    <div
                      key={user.userJid || user.phone}
                      className="p-3.5 border border-neutral-200 hover:border-black hover:bg-neutral-50 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                        <div className="flex items-center space-x-3 min-w-0">
                          <span
                            className={`w-6 h-6 flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
                              isTop1
                                ? 'bg-amber-400 text-black shadow-sm'
                                : isTop2
                                ? 'bg-neutral-300 text-neutral-900'
                                : isTop3
                                ? 'bg-amber-700 text-white'
                                : 'bg-neutral-100 text-neutral-600'
                            }`}
                          >
                            {isTop1 ? '🥇' : isTop2 ? '🥈' : isTop3 ? '🥉' : idx + 1}
                          </span>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold text-neutral-900">
                                +{user.phone}
                              </span>
                              {user.name && (
                                <span className="text-xs text-neutral-700 font-semibold truncate">
                                  ({user.name})
                                </span>
                              )}
                              {isTop1 && (
                                <span className="px-1.5 py-0.2 bg-black text-white text-[9px] font-mono uppercase font-bold">
                                  Top Chatter
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] font-mono text-neutral-400 mt-0.5">
                              <span>Chat di Grup: {user.groupMessages || 0}</span>
                              <span>•</span>
                              <span>Chat Pribadi: {user.privateMessages || 0}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center sm:flex-col sm:items-end gap-1">
                          <span className="text-sm font-mono font-bold text-neutral-900 whitespace-nowrap">
                            {user.totalMessages} pesan
                          </span>
                          <span className="text-[10px] font-mono text-neutral-400 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {user.lastActive ? new Date(user.lastActive).toLocaleString('id-ID') : '-'}
                          </span>
                        </div>
                      </div>

                      {/* Visual Relative Progress Bar */}
                      <div className="w-full bg-neutral-100 h-1.5 overflow-hidden">
                        <div
                          className={`h-1.5 transition-all duration-300 ${
                            isTop1 ? 'bg-black' : isTop2 ? 'bg-neutral-700' : 'bg-neutral-400'
                          }`}
                          style={{ width: `${Math.max(4, percent)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: User Paling Banyak Command */}
        {activeRankingTab === 'commands' && (
          <div>
            <div className="mb-3 flex items-center justify-between text-xs font-mono text-neutral-500">
              <span>Daftar pengguna yang paling sering mengeksekusi fitur perintah bot (.rvo, .swgc, promote, dll)</span>
              <span>Total {filteredCommandUsers.length} Pengguna Terdata</span>
            </div>

            {filteredCommandUsers.length === 0 ? (
              <div className="py-12 text-center text-xs font-mono text-neutral-400 border border-neutral-100">
                {searchQuery
                  ? `Tidak ada pengguna yang cocok dengan pencarian "${searchQuery}".`
                  : 'Belum ada eksekusi perintah bot tercatat.'}
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredCommandUsers.map((user, idx) => {
                  const percent = Math.round((user.totalCommands / maxCommandUserCount) * 100);
                  const b = user.commandBreakdown || {
                    rvo: 0,
                    swgc: 0,
                    delswgc: 0,
                    ghost: 0,
                    promote: 0,
                    demote: 0,
                    broadcast: 0,
                    other: 0,
                  };
                  const isTop1 = idx === 0;
                  const isTop2 = idx === 1;
                  const isTop3 = idx === 2;

                  return (
                    <div
                      key={user.userJid || user.phone}
                      className="p-3.5 border border-neutral-200 hover:border-black hover:bg-neutral-50 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                        <div className="flex items-center space-x-3 min-w-0">
                          <span
                            className={`w-6 h-6 flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
                              isTop1
                                ? 'bg-black text-white'
                                : isTop2
                                ? 'bg-neutral-300 text-neutral-900'
                                : isTop3
                                ? 'bg-neutral-200 text-neutral-800'
                                : 'bg-neutral-100 text-neutral-600'
                            }`}
                          >
                            {isTop1 ? '🥇' : isTop2 ? '🥈' : isTop3 ? '🥉' : idx + 1}
                          </span>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold text-neutral-900">
                                +{user.phone}
                              </span>
                              {user.name && (
                                <span className="text-xs text-neutral-700 font-semibold truncate">
                                  ({user.name})
                                </span>
                              )}
                              {isTop1 && (
                                <span className="px-1.5 py-0.2 bg-black text-white text-[9px] font-mono uppercase font-bold">
                                  Top Commander
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-mono text-neutral-400 block mt-0.5">
                              {user.userJid}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center sm:flex-col sm:items-end gap-1">
                          <span className="text-sm font-mono font-bold text-neutral-900 whitespace-nowrap">
                            {user.totalCommands} kali perintah
                          </span>
                          <span className="text-[10px] font-mono text-neutral-400 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {user.lastUsed ? new Date(user.lastUsed).toLocaleString('id-ID') : '-'}
                          </span>
                        </div>
                      </div>

                      {/* Visual Relative Progress Bar */}
                      <div className="w-full bg-neutral-100 h-1.5 overflow-hidden mb-2">
                        <div
                          className="bg-black h-1.5 transition-all duration-300"
                          style={{ width: `${Math.max(4, percent)}%` }}
                        />
                      </div>

                      {/* Detailed Command Breakdown Badges */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-neutral-600">
                        {b.rvo > 0 && (
                          <span className="px-2 py-0.5 bg-neutral-100 border border-neutral-200 font-semibold">
                            .rvo: {b.rvo}
                          </span>
                        )}
                        {b.swgc > 0 && (
                          <span className="px-2 py-0.5 bg-neutral-100 border border-neutral-200 font-semibold">
                            .swgc: {b.swgc}
                          </span>
                        )}
                        {b.delswgc > 0 && (
                          <span className="px-2 py-0.5 bg-neutral-100 border border-neutral-200 font-semibold">
                            .delswgc: {b.delswgc}
                          </span>
                        )}
                        {b.ghost > 0 && (
                          <span className="px-2 py-0.5 bg-neutral-100 border border-neutral-200 font-semibold">
                            .ghost: {b.ghost}
                          </span>
                        )}
                        {b.promote > 0 && (
                          <span className="px-2 py-0.5 bg-neutral-100 border border-neutral-200 font-semibold">
                            .promote: {b.promote}
                          </span>
                        )}
                        {b.demote > 0 && (
                          <span className="px-2 py-0.5 bg-neutral-100 border border-neutral-200 font-semibold">
                            .demote: {b.demote}
                          </span>
                        )}
                        {b.broadcast > 0 && (
                          <span className="px-2 py-0.5 bg-neutral-100 border border-neutral-200 font-semibold">
                            broadcast: {b.broadcast}
                          </span>
                        )}
                        {b.other > 0 && (
                          <span className="px-2 py-0.5 bg-neutral-100 border border-neutral-200 font-semibold">
                            lainnya: {b.other}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Grup Paling Banyak Komen dan Chat */}
        {activeRankingTab === 'groups' && (
          <div>
            <div className="mb-3 flex items-center justify-between text-xs font-mono text-neutral-500">
              <span>Daftar grup WhatsApp terpadat berdasarkan akumulasi pesan dan komentar yang masuk</span>
              <span>Total {filteredGroups.length} Grup Terpantau</span>
            </div>

            {filteredGroups.length === 0 ? (
              <div className="py-12 text-center text-xs font-mono text-neutral-400 border border-neutral-100">
                {searchQuery
                  ? `Tidak ada grup yang cocok dengan pencarian "${searchQuery}".`
                  : 'Belum ada data percakapan grup tercatat.'}
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredGroups.map((item, idx) => {
                  const displayName = item.groupName || groupNameMap.get(item.groupId) || item.groupId;
                  const percent = Math.round((item.messageCount / maxGroupMessages) * 100);
                  const isTop1 = idx === 0;
                  const isTop2 = idx === 1;
                  const isTop3 = idx === 2;

                  return (
                    <div
                      key={item.groupId}
                      className="p-3.5 border border-neutral-200 hover:border-black hover:bg-neutral-50 transition-colors"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                        <div className="flex items-center space-x-3 min-w-0">
                          <span
                            className={`w-6 h-6 flex items-center justify-center text-xs font-mono font-bold shrink-0 ${
                              isTop1
                                ? 'bg-black text-white'
                                : isTop2
                                ? 'bg-neutral-300 text-neutral-900'
                                : isTop3
                                ? 'bg-neutral-200 text-neutral-800'
                                : 'bg-neutral-100 text-neutral-600'
                            }`}
                          >
                            {isTop1 ? '🥇' : isTop2 ? '🥈' : isTop3 ? '🥉' : idx + 1}
                          </span>

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-neutral-900 truncate">
                                {displayName}
                              </span>
                              {isTop1 && (
                                <span className="px-1.5 py-0.2 bg-black text-white text-[9px] font-mono uppercase font-bold">
                                  Grup Teramai
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-mono text-neutral-400 truncate block mt-0.5">
                              {item.groupId}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center sm:flex-col sm:items-end gap-1">
                          <span className="text-sm font-mono font-bold text-neutral-900 whitespace-nowrap">
                            {item.messageCount} chat & komen
                          </span>
                          <span className="text-[10px] font-mono text-neutral-400 flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {item.lastActive ? new Date(item.lastActive).toLocaleString('id-ID') : '-'}
                          </span>
                        </div>
                      </div>

                      {/* Visual Relative Progress Bar */}
                      <div className="w-full bg-neutral-100 h-1.5 overflow-hidden">
                        <div
                          className="bg-black h-1.5 transition-all duration-300"
                          style={{ width: `${Math.max(4, percent)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 3: KOMPOSISI & DISTRIBUSI PERINTAH BOT (COMMAND BREAKDOWN)        */}
      {/* ========================================================================= */}
      <div className="border border-neutral-200 bg-white p-5 space-y-4">
        <div className="border-b border-neutral-200 pb-3 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-mono uppercase tracking-wider text-neutral-900 font-bold flex items-center gap-2">
              <Bot className="w-4 h-4 text-black" />
              <span>Distribusi Fitur & Perintah Bot</span>
            </h3>
            <p className="text-[11px] text-neutral-500 font-mono mt-0.5">
              Frekuensi panggilan masing-masing fitur bot WhatsApp
            </p>
          </div>
          <span className="text-[11px] font-mono px-2 py-0.5 bg-neutral-100 text-neutral-700 font-bold">
            Total {totalCommandCount} Eksekusi
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs font-mono">
          <div className="p-3 border border-neutral-200 bg-neutral-50">
            <span className="text-[10px] uppercase text-neutral-500 block">.rvo (Sekali Lihat)</span>
            <span className="text-lg font-bold text-neutral-900 block mt-1">
              {analytics?.commandCounts?.rvo || 0}
            </span>
            <span className="text-[9px] text-neutral-400">Anti View Once</span>
          </div>

          <div className="p-3 border border-neutral-200 bg-neutral-50">
            <span className="text-[10px] uppercase text-neutral-500 block">.swgc (Story Grup)</span>
            <span className="text-lg font-bold text-neutral-900 block mt-1">
              {analytics?.commandCounts?.swgc || 0}
            </span>
            <span className="text-[9px] text-neutral-400">Status Grup</span>
          </div>

          <div className="p-3 border border-neutral-200 bg-neutral-50">
            <span className="text-[10px] uppercase text-neutral-500 block">.delswgc (Hapus SW)</span>
            <span className="text-lg font-bold text-neutral-900 block mt-1">
              {analytics?.commandCounts?.delswgc || 0}
            </span>
            <span className="text-[9px] text-neutral-400">Hapus Status</span>
          </div>

          <div className="p-3 border border-neutral-200 bg-neutral-50">
            <span className="text-[10px] uppercase text-neutral-500 block">.ghost (Anti Hapus)</span>
            <span className="text-lg font-bold text-neutral-900 block mt-1">
              {analytics?.commandCounts?.ghost || 0}
            </span>
            <span className="text-[9px] text-neutral-400">Ghost Reader</span>
          </div>

          <div className="p-3 border border-neutral-200 bg-neutral-50">
            <span className="text-[10px] uppercase text-neutral-500 block">.promote (Admin)</span>
            <span className="text-lg font-bold text-neutral-900 block mt-1">
              {analytics?.commandCounts?.promote || 0}
            </span>
            <span className="text-[9px] text-neutral-400">Jadikan Admin</span>
          </div>

          <div className="p-3 border border-neutral-200 bg-neutral-50">
            <span className="text-[10px] uppercase text-neutral-500 block">.demote (Admin)</span>
            <span className="text-lg font-bold text-neutral-900 block mt-1">
              {analytics?.commandCounts?.demote || 0}
            </span>
            <span className="text-[9px] text-neutral-400">Turunkan Admin</span>
          </div>

          <div className="p-3 border border-neutral-200 bg-neutral-50">
            <span className="text-[10px] uppercase text-neutral-500 block">Broadcast</span>
            <span className="text-lg font-bold text-neutral-900 block mt-1">
              {analytics?.commandCounts?.broadcast || 0}
            </span>
            <span className="text-[9px] text-neutral-400">Siaran Massal</span>
          </div>
        </div>
      </div>
    </div>
  );
}
