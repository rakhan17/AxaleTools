import { useState, useMemo, useEffect, FormEvent } from 'react';
import {
  ShieldCheck,
  Users,
  Search,
  Image as ImageIcon,
  Send,
  Palette,
  Shuffle,
  Copy,
  Check,
  Power,
  PowerOff,
  Trash2,
  History,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { WAGroup, WAContact, ActiveGroupStory } from '../types.ts';

const SWGC_PRESET_COLORS = [
  { key: 'hijau', name: 'Hijau WhatsApp', hex: '#25D366' },
  { key: 'merah', name: 'Merah Terang', hex: '#D32F2F' },
  { key: 'biru', name: 'Biru Cerah', hex: '#1976D2' },
  { key: 'ungu', name: 'Ungu Elegan', hex: '#7B1FA2' },
  { key: 'pink', name: 'Merah Muda', hex: '#C2185B' },
  { key: 'orange', name: 'Oranye Segar', hex: '#F57C00' },
  { key: 'kuning', name: 'Kuning Amber', hex: '#FBC02D' },
  { key: 'tosca', name: 'Tosca / Teal', hex: '#00796B' },
  { key: 'hitam', name: 'Hitam Gelap', hex: '#212121' },
  { key: 'navy', name: 'Biru Navy', hex: '#0D47A1' },
  { key: 'coklat', name: 'Cokelat Mocha', hex: '#5D4037' },
  { key: 'cyan', name: 'Biru Cyan', hex: '#0097A7' },
  { key: 'maroon', name: 'Merah Maroon', hex: '#880E4F' },
  { key: 'abu', name: 'Abu Slate', hex: '#455A64' },
  { key: 'sunset', name: 'Oranye Sunset', hex: '#E65100' },
  { key: 'forest', name: 'Hijau Hutan', hex: '#1B5E20' },
];

interface DashboardRadarProps {
  groups: WAGroup[];
  contacts: WAContact[];
  onUploadSwgc: (payload: {
    groupIds: string[];
    file?: File | null;
    caption?: string;
    text?: string;
    backgroundColor?: string;
    font?: number;
  }) => Promise<void>;
}

export default function DashboardRadar({ groups, contacts, onUploadSwgc }: DashboardRadarProps) {
  const [activeTab, setActiveTab] = useState<'groups' | 'contacts' | 'stories'>('groups');
  const [radarFilter, setRadarFilter] = useState<'all' | 'bot_admin' | 'bot_not_admin' | 'bot_on' | 'bot_off'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Disabled group bot JIDs
  const [disabledGroupJids, setDisabledGroupJids] = useState<string[]>([]);
  const [isTogglingGroup, setIsTogglingGroup] = useState<Record<string, boolean>>({});

  // Active group stories (.delswgc)
  const [activeStories, setActiveStories] = useState<ActiveGroupStory[]>([]);
  const [isLoadingStories, setIsLoadingStories] = useState(false);
  const [deletingStoryIndex, setDeletingStoryIndex] = useState<number | null>(null);
  const [storyActionFeedback, setStoryActionFeedback] = useState<string | null>(null);

  // Modal for SWGC upload to selected group
  const [selectedGroupForStory, setSelectedGroupForStory] = useState<WAGroup | null>(null);
  const [storyMode, setStoryMode] = useState<'text' | 'media'>('text');
  const [storyText, setStoryText] = useState('');
  const [storyColor, setStoryColor] = useState('hijau');
  const [customHex, setCustomHex] = useState('#25D366');
  const [storyFile, setStoryFile] = useState<File | null>(null);
  const [storyCaption, setStoryCaption] = useState('');
  const [isSubmittingStory, setIsSubmittingStory] = useState(false);
  const [storyStatusMessage, setStoryStatusMessage] = useState<string | null>(null);
  const [copiedCmd, setCopiedCmd] = useState(false);

  // Fetch disabled groups and active stories on mount
  const fetchGroupBotSettings = async () => {
    try {
      const res = await fetch('/api/groups/bot-settings');
      if (res.ok) {
        const data = await res.json();
        setDisabledGroupJids(data.disabledGroupJids || []);
      }
    } catch {
      // Ignore background network error
    }
  };

  const fetchActiveStories = async () => {
    setIsLoadingStories(true);
    try {
      const res = await fetch('/api/swgc/stories');
      if (res.ok) {
        const data = await res.json();
        setActiveStories(data.stories || []);
      }
    } catch {
      // Ignore background network error
    } finally {
      setIsLoadingStories(false);
    }
  };

  useEffect(() => {
    fetchGroupBotSettings();
    fetchActiveStories();
  }, []);

  // Toggle Bot per group
  const handleToggleGroupBot = async (groupId: string) => {
    const currentlyDisabled = disabledGroupJids.includes(groupId);
    const newEnabledState = currentlyDisabled; // if currently disabled, new state is enabled (true)

    // Optimistic update
    setDisabledGroupJids((prev) =>
      newEnabledState ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );

    setIsTogglingGroup((prev) => ({ ...prev, [groupId]: true }));
    try {
      const res = await fetch('/api/groups/toggle-bot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId, enabled: newEnabledState }),
      });
      const data = await res.json();
      if (data.disabledGroupJids) {
        setDisabledGroupJids(data.disabledGroupJids);
      }
    } catch (err: any) {
      // Revert optimistic update
      setDisabledGroupJids((prev) =>
        currentlyDisabled ? [...prev, groupId] : prev.filter((id) => id !== groupId)
      );
    } finally {
      setIsTogglingGroup((prev) => ({ ...prev, [groupId]: false }));
    }
  };

  // Delete group story (.delswgc)
  const handleDeleteStory = async (index: number) => {
    setDeletingStoryIndex(index);
    setStoryActionFeedback(null);
    try {
      const res = await fetch(`/api/swgc/stories/${index}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Gagal menghapus status');
      }
      setStoryActionFeedback(`Berhasil menghapus status nomor urut [${index}].`);
      await fetchActiveStories();
    } catch (err: any) {
      setStoryActionFeedback(`Gagal: ${err?.message || 'Terjadi kesalahan sistem'}`);
    } finally {
      setDeletingStoryIndex(null);
    }
  };

  // Admin Radar statistics
  const radarStats = useMemo(() => {
    let botAdminCount = 0;
    let botNotAdminCount = 0;
    let botOnCount = 0;
    let botOffCount = 0;

    groups.forEach((g) => {
      if (g.botRole === 'admin' || g.botRole === 'superadmin') {
        botAdminCount++;
      } else {
        botNotAdminCount++;
      }

      if (disabledGroupJids.includes(g.id)) {
        botOffCount++;
      } else {
        botOnCount++;
      }
    });

    return {
      total: groups.length,
      botAdminCount,
      botNotAdminCount,
      botOnCount,
      botOffCount,
    };
  }, [groups, disabledGroupJids]);

  // Filtered groups based on Radar, Bot ON/OFF, and Search
  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      const isBotAdmin = g.botRole === 'admin' || g.botRole === 'superadmin';
      const isBotOff = disabledGroupJids.includes(g.id);

      // Radar filter
      if (radarFilter === 'bot_admin' && !isBotAdmin) return false;
      if (radarFilter === 'bot_not_admin' && isBotAdmin) return false;
      if (radarFilter === 'bot_on' && isBotOff) return false;
      if (radarFilter === 'bot_off' && !isBotOff) return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return g.subject.toLowerCase().includes(query) || g.id.toLowerCase().includes(query);
      }
      return true;
    });
  }, [groups, disabledGroupJids, radarFilter, searchQuery]);

  // Filtered contacts based on Search
  const filteredContacts = useMemo(() => {
    return contacts.filter((c) => {
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        return (
          c.name.toLowerCase().includes(query) ||
          c.phone.toLowerCase().includes(query) ||
          c.id.toLowerCase().includes(query)
        );
      }
      return true;
    });
  }, [contacts, searchQuery]);

  const handlePickRandomColor = () => {
    const randomIndex = Math.floor(Math.random() * SWGC_PRESET_COLORS.length);
    const picked = SWGC_PRESET_COLORS[randomIndex];
    setStoryColor(picked.key);
    setCustomHex(picked.hex);
  };

  const currentPreviewHex = useMemo(() => {
    if (storyColor === 'custom') return customHex;
    const found = SWGC_PRESET_COLORS.find((c) => c.key === storyColor);
    return found ? found.hex : '#25D366';
  }, [storyColor, customHex]);

  const handleStorySubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedGroupForStory) return;

    setIsSubmittingStory(true);
    setStoryStatusMessage(null);
    try {
      if (storyMode === 'text') {
        if (!storyText.trim()) {
          setStoryStatusMessage('Masukkan teks status terlebih dahulu.');
          setIsSubmittingStory(false);
          return;
        }
        await onUploadSwgc({
          groupIds: [selectedGroupForStory.id],
          text: storyText.trim(),
          backgroundColor: storyColor === 'custom' ? customHex : storyColor,
        });
        setStoryStatusMessage(`Status teks cerita berhasil dipublikasikan ke grup ${selectedGroupForStory.subject}!`);
      } else {
        if (!storyFile) {
          setStoryStatusMessage('Pilih file media foto atau video terlebih dahulu.');
          setIsSubmittingStory(false);
          return;
        }
        await onUploadSwgc({
          groupIds: [selectedGroupForStory.id],
          file: storyFile,
          caption: storyCaption,
        });
        setStoryStatusMessage(`Status media cerita berhasil dikirim ke grup ${selectedGroupForStory.subject}!`);
      }
      await fetchActiveStories();
      setTimeout(() => {
        setSelectedGroupForStory(null);
        setStoryFile(null);
        setStoryCaption('');
        setStoryText('');
        setStoryStatusMessage(null);
      }, 1800);
    } catch (err: any) {
      setStoryStatusMessage(`Gagal: ${err?.message || 'Error internal'}`);
    } finally {
      setIsSubmittingStory(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Navigation Tabs */}
      <div className="border border-neutral-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-200 pb-4 mb-4">
          <div>
            <h2 className="text-sm font-semibold tracking-wider uppercase text-neutral-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-black" />
              <span>Radar Grup &amp; Manajemen Fitur Bot</span>
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Atur switch aktif/mati fitur bot per grup, pantau wewenang admin, dan kelola status cerita (.delswgc)
            </p>
          </div>

          {/* Sub Tabs */}
          <div className="flex items-center gap-2 text-xs font-mono overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <button
              onClick={() => setActiveTab('groups')}
              className={`min-h-[44px] px-3.5 py-2 transition-colors whitespace-nowrap ${
                activeTab === 'groups'
                  ? 'bg-black text-white'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              Daftar Grup ({groups.length})
            </button>
            <button
              onClick={() => setActiveTab('contacts')}
              className={`min-h-[44px] px-3.5 py-2 transition-colors whitespace-nowrap ${
                activeTab === 'contacts'
                  ? 'bg-black text-white'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              Daftar Kontak ({contacts.length})
            </button>
            <button
              onClick={() => {
                setActiveTab('stories');
                fetchActiveStories();
              }}
              className={`min-h-[44px] px-3.5 py-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === 'stories'
                  ? 'bg-black text-white'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Status Cerita (.delswgc)</span>
              {activeStories.length > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 ${activeTab === 'stories' ? 'bg-white text-black' : 'bg-black text-white'}`}>
                  {activeStories.length}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Groups Radar Metric Filters */}
        {activeTab === 'groups' && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 text-xs font-mono">
            <button
              onClick={() => setRadarFilter('all')}
              className={`p-3 text-left border transition-colors min-h-[44px] ${
                radarFilter === 'all'
                  ? 'border-black bg-neutral-100 text-black font-semibold'
                  : 'border-neutral-200 bg-white hover:border-neutral-400'
              }`}
            >
              <div className="text-neutral-500 text-[10px] uppercase">Semua Grup</div>
              <div className="text-lg font-bold text-neutral-900 mt-0.5">{radarStats.total}</div>
            </button>

            <button
              onClick={() => setRadarFilter('bot_admin')}
              className={`p-3 text-left border transition-colors min-h-[44px] ${
                radarFilter === 'bot_admin'
                  ? 'border-black bg-black text-white'
                  : 'border-neutral-200 bg-white hover:border-neutral-400'
              }`}
            >
              <div className={radarFilter === 'bot_admin' ? 'text-neutral-300 text-[10px] uppercase' : 'text-neutral-500 text-[10px] uppercase'}>
                Bot Jadi Admin
              </div>
              <div className="text-lg font-bold mt-0.5">{radarStats.botAdminCount}</div>
            </button>

            <button
              onClick={() => setRadarFilter('bot_not_admin')}
              className={`p-3 text-left border transition-colors min-h-[44px] ${
                radarFilter === 'bot_not_admin'
                  ? 'border-black bg-neutral-100 text-black font-semibold'
                  : 'border-neutral-200 bg-white hover:border-neutral-400'
              }`}
            >
              <div className="text-neutral-500 text-[10px] uppercase">Bot Bukan Admin</div>
              <div className="text-lg font-bold text-neutral-700 mt-0.5">{radarStats.botNotAdminCount}</div>
            </button>

            <button
              onClick={() => setRadarFilter('bot_on')}
              className={`p-3 text-left border transition-colors min-h-[44px] ${
                radarFilter === 'bot_on'
                  ? 'border-black bg-black text-white'
                  : 'border-neutral-200 bg-white hover:border-neutral-400'
              }`}
            >
              <div className={radarFilter === 'bot_on' ? 'text-neutral-300 text-[10px] uppercase' : 'text-neutral-500 text-[10px] uppercase'}>
                Fitur Bot ON
              </div>
              <div className="text-lg font-bold mt-0.5">{radarStats.botOnCount}</div>
            </button>

            <button
              onClick={() => setRadarFilter('bot_off')}
              className={`p-3 text-left border transition-colors min-h-[44px] ${
                radarFilter === 'bot_off'
                  ? 'border-black bg-neutral-200 text-black font-semibold'
                  : 'border-neutral-200 bg-white hover:border-neutral-400'
              }`}
            >
              <div className="text-neutral-500 text-[10px] uppercase">Fitur Bot OFF</div>
              <div className="text-lg font-bold text-neutral-600 mt-0.5">{radarStats.botOffCount}</div>
            </button>
          </div>
        )}
      </div>

      {/* Search Input Bar (for Groups and Contacts) */}
      {activeTab !== 'stories' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === 'groups'
                  ? 'Cari nama grup WhatsApp atau JID grup...'
                  : 'Cari nama kontak WhatsApp atau nomor telepon...'
              }
              className="w-full pl-9 pr-4 py-2.5 text-xs border border-neutral-300 bg-white focus:outline-none focus:border-black font-mono min-h-[44px]"
            />
          </div>
          <div className="text-xs font-mono text-neutral-500 whitespace-nowrap self-end sm:self-center">
            Menampilkan {activeTab === 'groups' ? filteredGroups.length : filteredContacts.length} item
          </div>
        </div>
      )}

      {/* TAB 1: Groups List */}
      {activeTab === 'groups' && (
        <div className="border border-neutral-200 bg-white divide-y divide-neutral-200">
          {filteredGroups.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500 font-mono">
              Tidak ada grup yang sesuai dengan filter atau pencarian Anda.
            </div>
          ) : (
            filteredGroups.map((group) => {
              const isBotAdmin = group.botRole === 'admin' || group.botRole === 'superadmin';
              const isBotDisabled = disabledGroupJids.includes(group.id);
              const isUpdating = !!isTogglingGroup[group.id];

              return (
                <div
                  key={group.id}
                  className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-neutral-50 transition-colors"
                >
                  <div className="flex items-start sm:items-center space-x-3 min-w-0">
                    {/* WA Avatar */}
                    <div className="w-10 h-10 flex-shrink-0 border border-neutral-200 bg-neutral-100 flex items-center justify-center overflow-hidden">
                      <img
                        src={group.avatarUrl || `/api/avatar?jid=${encodeURIComponent(group.id)}&name=${encodeURIComponent(group.subject)}`}
                        alt={group.subject}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        loading="lazy"
                      />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                        <p className="text-sm font-semibold text-neutral-900 truncate">
                          {group.subject}
                        </p>

                        {/* Admin Badge */}
                        {isBotAdmin ? (
                          <span className="text-[10px] font-mono px-2 py-0.5 bg-black text-white font-medium">
                            BOT: ADMIN
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-2 py-0.5 bg-neutral-100 text-neutral-500 border border-neutral-200">
                            BOT: BUKAN ADMIN
                          </span>
                        )}

                        {/* Feature Status Badge */}
                        {!isBotDisabled ? (
                          <span className="text-[10px] font-mono px-2 py-0.5 bg-neutral-900 text-white font-medium">
                            FITUR: AKTIF
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-2 py-0.5 bg-neutral-200 text-neutral-700 border border-neutral-300">
                            FITUR: NONAKTIF
                          </span>
                        )}
                      </div>

                      <div className="flex items-center space-x-2 text-xs text-neutral-500 font-mono mt-0.5 truncate">
                        <span>{group.size} Anggota</span>
                        <span>•</span>
                        <span className="truncate">{group.id}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions: Toggle Bot ON/OFF & Upload Story */}
                  <div className="flex items-center space-x-2 self-stretch md:self-center flex-wrap sm:flex-nowrap gap-y-2">
                    {/* Bot ON/OFF Toggle per Group */}
                    <button
                      type="button"
                      onClick={() => handleToggleGroupBot(group.id)}
                      disabled={isUpdating}
                      title={!isBotDisabled ? 'Nonaktifkan bot di grup ini' : 'Aktifkan bot di grup ini'}
                      className={`flex-1 sm:flex-none min-h-[44px] text-xs font-mono px-3.5 py-2 transition-colors flex items-center justify-center space-x-1.5 ${
                        !isBotDisabled
                          ? 'border border-neutral-300 text-neutral-800 hover:border-black hover:text-black bg-white'
                          : 'bg-black text-white hover:bg-neutral-800'
                      }`}
                    >
                      {!isBotDisabled ? (
                        <>
                          <PowerOff className="w-3.5 h-3.5" />
                          <span>Matikan Bot</span>
                        </>
                      ) : (
                        <>
                          <Power className="w-3.5 h-3.5" />
                          <span>Nyalakan Bot</span>
                        </>
                      )}
                    </button>

                    {/* Story Upload Button */}
                    <button
                      type="button"
                      onClick={() => setSelectedGroupForStory(group)}
                      className="flex-1 sm:flex-none min-h-[44px] text-xs font-mono px-3.5 py-2 border border-neutral-300 text-neutral-800 hover:border-black hover:bg-black hover:text-white transition-colors flex items-center justify-center space-x-1.5"
                      title="Upload status cerita grup (.swgc)"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>Story Grup (.swgc)</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: Contacts List */}
      {activeTab === 'contacts' && (
        <div className="border border-neutral-200 bg-white divide-y divide-neutral-200">
          {filteredContacts.length === 0 ? (
            <div className="p-8 text-center text-xs text-neutral-500 font-mono">
              Tidak ada kontak yang sesuai dengan pencarian Anda.
            </div>
          ) : (
            filteredContacts.map((contact) => (
              <div
                key={contact.id}
                className="p-4 flex items-center justify-between gap-3 hover:bg-neutral-50 transition-colors"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-10 h-10 flex-shrink-0 border border-neutral-200 bg-neutral-100 flex items-center justify-center overflow-hidden">
                    <img
                      src={contact.avatarUrl || `/api/avatar?jid=${encodeURIComponent(contact.id)}&name=${encodeURIComponent(contact.name || contact.phone)}`}
                      alt={contact.name || contact.phone}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                      loading="lazy"
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-neutral-900 truncate">
                      {contact.name || 'Tanpa Nama'}
                    </p>
                    <p className="text-xs text-neutral-500 font-mono truncate">
                      +{contact.phone || contact.id.replace('@s.whatsapp.net', '')}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 3: Active Group Stories (.delswgc) */}
      {activeTab === 'stories' && (
        <div className="space-y-4">
          <div className="border border-neutral-200 bg-white p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-200 pb-3 mb-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-2">
                  <History className="w-4 h-4 text-black" />
                  <span>Daftar Status Cerita Grup Aktif (.delswgc)</span>
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Status cerita grup yang baru dipublikasikan. Anda dapat menghapus status dengan memilih tombol Hapus atau mengetik .delswgc [angka] di WhatsApp.
                </p>
              </div>

              <button
                type="button"
                onClick={fetchActiveStories}
                disabled={isLoadingStories}
                className="min-h-[40px] px-3 py-1.5 border border-neutral-300 text-xs font-mono hover:bg-neutral-100 flex items-center space-x-1.5 self-start sm:self-auto"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingStories ? 'animate-spin' : ''}`} />
                <span>Muat Ulang</span>
              </button>
            </div>

            {storyActionFeedback && (
              <div className="mb-4 p-3 bg-neutral-100 border border-neutral-300 text-xs font-mono text-neutral-800">
                {storyActionFeedback}
              </div>
            )}

            {activeStories.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-500 font-mono">
                Belum ada status cerita grup yang aktif pada sesi ini.
                <div className="mt-2 text-neutral-400">
                  Kirim status baru melalui tab "Daftar Grup" -&gt; "Story Grup (.swgc)" atau melalui WhatsApp chat.
                </div>
              </div>
            ) : (
              <div className="divide-y divide-neutral-200 border border-neutral-200">
                {activeStories.map((story, idx) => {
                  const storyIndex = idx + 1;
                  const dateStr = new Date(story.createdAt).toLocaleTimeString('id-ID', {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  });

                  return (
                    <div
                      key={story.id || idx}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-neutral-50 transition-colors"
                    >
                      <div className="flex items-start space-x-3 min-w-0">
                        <div className="w-9 h-9 bg-black text-white font-mono font-bold text-xs flex items-center justify-center flex-shrink-0">
                          [{storyIndex}]
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                            <span className="text-[10px] font-mono uppercase px-2 py-0.5 bg-neutral-100 text-neutral-800 border border-neutral-300 font-semibold">
                              Tipe: {story.type}
                            </span>
                            {story.colorName && (
                              <span className="text-[10px] font-mono px-2 py-0.5 bg-neutral-100 text-neutral-600 border border-neutral-200">
                                Warna: {story.colorName}
                              </span>
                            )}
                            <span className="text-[10px] font-mono text-neutral-500">
                              {story.targetCount} grup sasaran • Pukul {dateStr}
                            </span>
                          </div>

                          <p className="text-xs font-medium text-neutral-900 mt-1 break-words line-clamp-2">
                            {story.snippet || '(Status media gambar/video)'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 self-end sm:self-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteStory(storyIndex)}
                          disabled={deletingStoryIndex === storyIndex}
                          className="min-h-[44px] px-3.5 py-2 bg-neutral-100 border border-neutral-300 text-neutral-800 hover:bg-black hover:text-white transition-colors text-xs font-mono flex items-center space-x-1.5"
                          title={`Hapus status urutan nomor ${storyIndex}`}
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-600" />
                          <span>
                            {deletingStoryIndex === storyIndex ? 'Menghapus...' : `Hapus (.delswgc ${storyIndex})`}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 p-3 bg-neutral-50 border border-neutral-200 text-xs font-mono text-neutral-600">
              <div className="font-bold text-neutral-800 mb-1">Panduan Penggunaan Perintah WhatsApp (.delswgc):</div>
              <div>• Ketik <code className="text-black font-bold">.delswgc</code> di grup untuk melihat daftar urutan nomor status aktif.</div>
              <div>• Ketik <code className="text-black font-bold">.delswgc 1</code> untuk langsung menghapus status nomor urut 1 dari semua grup.</div>
            </div>
          </div>
        </div>
      )}

      {/* SWGC Upload Modal */}
      {selectedGroupForStory && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-neutral-900 max-w-lg w-full p-4 sm:p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3 mb-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-neutral-700" />
                  <span>Kirim Status Cerita Grup (.swgc)</span>
                </h3>
                <p className="text-xs text-neutral-500 font-mono mt-0.5 truncate max-w-[280px] sm:max-w-md">
                  Grup: {selectedGroupForStory.subject}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGroupForStory(null)}
                className="text-xs font-mono text-neutral-500 hover:text-black min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            {/* Mode switch */}
            <div className="grid grid-cols-2 gap-2 mb-4 text-xs font-mono">
              <button
                type="button"
                onClick={() => setStoryMode('text')}
                className={`py-2.5 min-h-[44px] transition-colors ${
                  storyMode === 'text'
                    ? 'bg-black text-white font-bold'
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                }`}
              >
                Status Teks Berwarna
              </button>
              <button
                type="button"
                onClick={() => setStoryMode('media')}
                className={`py-2.5 min-h-[44px] transition-colors ${
                  storyMode === 'media'
                    ? 'bg-black text-white font-bold'
                    : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                }`}
              >
                Status Foto / Video
              </button>
            </div>

            <form onSubmit={handleStorySubmit} className="space-y-4">
              {storyMode === 'text' ? (
                <>
                  <div>
                    <label className="block text-xs font-mono uppercase text-neutral-700 mb-1">
                      Teks Status Cerita:
                    </label>
                    <textarea
                      rows={3}
                      value={storyText}
                      onChange={(e) => setStoryText(e.target.value)}
                      placeholder="Tuliskan teks status cerita grup di sini..."
                      className="w-full text-xs p-2.5 border border-neutral-300 focus:outline-none focus:border-black font-sans resize-none min-h-[72px]"
                      required
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-mono uppercase text-neutral-700 flex items-center gap-1.5">
                        <Palette className="w-3.5 h-3.5 text-neutral-500" />
                        Pilihan Warna Background:
                      </label>
                      <button
                        type="button"
                        onClick={handlePickRandomColor}
                        className="text-[11px] font-mono text-neutral-700 hover:text-black flex items-center gap-1 px-2 py-1 border border-neutral-300 hover:bg-neutral-100 min-h-[36px]"
                        title="Pilih warna acak"
                      >
                        <Shuffle className="w-3 h-3 text-neutral-700" />
                        <span>Acak Warna</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 p-2 bg-neutral-50 border border-neutral-200">
                      {SWGC_PRESET_COLORS.map((c) => {
                        const isSelected = storyColor === c.key;
                        return (
                          <button
                            key={c.key}
                            type="button"
                            onClick={() => {
                              setStoryColor(c.key);
                              setCustomHex(c.hex);
                            }}
                            className={`flex flex-col items-center p-1 border text-center transition-all min-h-[44px] ${
                              isSelected
                                ? 'border-black ring-2 ring-black bg-white'
                                : 'border-transparent hover:bg-neutral-200'
                            }`}
                            title={`${c.name} (${c.key})`}
                          >
                            <span
                              className="w-5 h-5 rounded-full shadow-inner flex items-center justify-center text-white"
                              style={{ backgroundColor: c.hex }}
                            >
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            </span>
                            <span className="text-[9px] font-mono text-neutral-600 mt-1 truncate w-full">
                              {c.key}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex items-center gap-2 mt-2">
                      <input
                        type="color"
                        value={customHex}
                        onChange={(e) => {
                          setCustomHex(e.target.value);
                          setStoryColor('custom');
                        }}
                        className="w-8 h-8 cursor-pointer border border-neutral-300 p-0.5 bg-white min-h-[32px] min-w-[32px]"
                        title="Pilih warna custom"
                      />
                      <span className="text-xs font-mono text-neutral-600">
                        Warna: <strong>{storyColor === 'custom' ? customHex : storyColor}</strong>
                      </span>
                    </div>
                  </div>

                  <div>
                    <span className="block text-[11px] font-mono uppercase text-neutral-500 mb-1">
                      Preview di WhatsApp:
                    </span>
                    <div
                      className="p-4 rounded min-h-[85px] flex items-center justify-center text-center text-white font-medium text-sm shadow-sm transition-colors duration-200"
                      style={{ backgroundColor: currentPreviewHex }}
                    >
                      <p className="break-words max-w-full drop-shadow">
                        {storyText || 'Teks status akan tampil di sini'}
                      </p>
                    </div>
                  </div>

                  <div className="p-2.5 bg-neutral-100 border border-neutral-200 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono font-semibold text-neutral-700">
                        Format Perintah WhatsApp:
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const cmd = `.swgc ${storyText || 'IsiPesan'} --${storyColor}`;
                          navigator.clipboard.writeText(cmd);
                          setCopiedCmd(true);
                          setTimeout(() => setCopiedCmd(false), 1500);
                        }}
                        className="flex items-center gap-1 font-mono text-[10px] text-neutral-600 hover:text-black underline min-h-[32px]"
                      >
                        {copiedCmd ? <Check className="w-3 h-3 text-black" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedCmd ? 'Tersalin!' : 'Salin Perintah'}</span>
                      </button>
                    </div>
                    <code className="text-neutral-800 font-mono text-[11px] block select-all">
                      .swgc {storyText || 'IsiPesan'} --{storyColor}
                    </code>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-mono uppercase text-neutral-700 mb-1">
                      Pilih Foto atau Video:
                    </label>
                    <input
                      type="file"
                      accept="image/*,video/*"
                      required
                      onChange={(e) => setStoryFile(e.target.files?.[0] || null)}
                      className="w-full text-xs font-mono border border-neutral-300 p-2 min-h-[44px]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-mono uppercase text-neutral-700 mb-1">
                      Caption Status (Opsional):
                    </label>
                    <input
                      type="text"
                      value={storyCaption}
                      onChange={(e) => setStoryCaption(e.target.value)}
                      placeholder="Masukkan caption status..."
                      className="w-full text-xs p-2 border border-neutral-300 focus:outline-none focus:border-black min-h-[44px]"
                    />
                  </div>
                </>
              )}

              {storyStatusMessage && (
                <div className="p-2 text-xs font-mono bg-neutral-100 border border-neutral-300 text-neutral-800">
                  {storyStatusMessage}
                </div>
              )}

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-neutral-200">
                <button
                  type="button"
                  onClick={() => setSelectedGroupForStory(null)}
                  disabled={isSubmittingStory}
                  className="px-3.5 py-2 text-xs font-mono border border-neutral-300 hover:bg-neutral-100 min-h-[44px]"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingStory || (storyMode === 'text' ? !storyText.trim() : !storyFile)}
                  className="px-4 py-2 text-xs font-mono bg-black text-white hover:bg-neutral-800 disabled:opacity-50 flex items-center space-x-1.5 min-h-[44px]"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSubmittingStory ? 'Mengirim...' : 'Kirim Story Grup'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
