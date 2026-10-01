import { useState, useMemo, FormEvent, useRef } from 'react';
import {
  Clock,
  Send,
  Square,
  CheckSquare,
  Search,
  X,
  FileText,
  Sliders,
  Type,
  Users,
  User,
} from 'lucide-react';
import { WAGroup, WAContact, BroadcastFormat } from '../types.ts';

interface BroadcastPanelProps {
  groups: WAGroup[];
  contacts: WAContact[];
  onStartBroadcast: (payload: {
    targetType: 'all' | 'contacts' | 'groups' | 'custom';
    customJids?: string[];
    delaySeconds: number;
    formatMode: BroadcastFormat;
    customMessage?: string;
    forwardedManyTimes?: boolean;
    templateData?: {
      from: string;
      role: string;
      type: string;
      message: string;
    };
  }) => Promise<void>;
  onStopBroadcast: () => Promise<void>;
  activeBroadcast: any;
}

export default function BroadcastPanel({
  groups,
  contacts,
  onStartBroadcast,
  onStopBroadcast,
  activeBroadcast,
}: BroadcastPanelProps) {
  const [targetType, setTargetType] = useState<'all' | 'contacts' | 'groups' | 'custom'>('all');
  const [selectedJids, setSelectedJids] = useState<string[]>([]);
  const [delaySeconds, setDelaySeconds] = useState<number>(3);
  const [forwardedManyTimes, setForwardedManyTimes] = useState<boolean>(true);

  // Format mode selection: 'custom' or 'announcement'
  const [formatMode, setFormatMode] = useState<BroadcastFormat>('custom');

  // Custom free-form message
  const [customMessage, setCustomMessage] = useState(
    `*PEMBERITAHUAN PENTING*\n\nHalo rekan-rekan,\nInformasi terbaru terkait jadwal operasional telah diperbarui.\n\n_Silakan hubungi admin jika ada kendala._`
  );

  // Announcement template fields
  const [fromName, setFromName] = useState('Axale Core');
  const [fromRole, setFromRole] = useState('Super Admin');
  const [announcementType, setAnnouncementType] = useState('Pemberitahuan Resmi');
  const [messageBody, setMessageBody] = useState(
    'Halo semua, mohon perhatian untuk pembaruan sistem berkala kami.'
  );

  // Custom Select search & filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'groups' | 'contacts'>('all');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Formatted Live WA Preview
  const formattedPreview = useMemo(() => {
    if (formatMode === 'custom') {
      return customMessage.trim() || '(Ketik pesan kustom Anda...)';
    }

    const quoteLines = (messageBody || '')
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');

    return `🚨 *ANNOUNCEMENT*\nFrom : ${fromName || 'Admin'}\nRole : ${fromRole || 'Admin'}\nType : ${announcementType || 'Info'}\nMessage : \n${quoteLines}`;
  }, [formatMode, customMessage, fromName, fromRole, announcementType, messageBody]);

  // Target count calculation
  const targetCount = useMemo(() => {
    if (targetType === 'all') return groups.length + contacts.length;
    if (targetType === 'groups') return groups.length;
    if (targetType === 'contacts') return contacts.length;
    if (targetType === 'custom') return selectedJids.length;
    return 0;
  }, [targetType, groups.length, contacts.length, selectedJids.length]);

  // Search filtered items for Custom Select
  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();

    const groupItems = groups
      .filter((g) => filterType === 'all' || filterType === 'groups')
      .filter((g) => {
        if (!q) return true;
        return (
          g.subject.toLowerCase().includes(q) ||
          g.id.toLowerCase().includes(q)
        );
      })
      .map((g) => ({
        id: g.id,
        name: g.subject,
        subtext: `${g.size} Anggota • ${g.botRole === 'admin' || g.botRole === 'superadmin' ? 'Bot: Admin' : 'Member'}`,
        isGroup: true,
        avatarUrl: g.avatarUrl,
      }));

    const contactItems = contacts
      .filter((c) => filterType === 'all' || filterType === 'contacts')
      .filter((c) => {
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          c.phone.toLowerCase().includes(q) ||
          c.id.toLowerCase().includes(q)
        );
      })
      .map((c) => ({
        id: c.id,
        name: c.name,
        subtext: `+${c.phone}`,
        isGroup: false,
        avatarUrl: c.avatarUrl,
      }));

    return [...groupItems, ...contactItems];
  }, [groups, contacts, searchQuery, filterType]);

  const toggleCustomJid = (jid: string) => {
    if (selectedJids.includes(jid)) {
      setSelectedJids(selectedJids.filter((id) => id !== jid));
    } else {
      setSelectedJids([...selectedJids, jid]);
    }
  };

  const selectAllFiltered = () => {
    const filteredJidList = filteredItems.map((item) => item.id);
    const combined = Array.from(new Set([...selectedJids, ...filteredJidList]));
    setSelectedJids(combined);
  };

  const deselectFiltered = () => {
    const filteredJidList = new Set(filteredItems.map((item) => item.id));
    setSelectedJids(selectedJids.filter((id) => !filteredJidList.has(id)));
  };

  const selectAllCustom = () => {
    const all = [...groups.map((g) => g.id), ...contacts.map((c) => c.id)];
    setSelectedJids(all);
  };

  const clearAllCustom = () => {
    setSelectedJids([]);
  };

  // Helper to insert WhatsApp syntax around selected text
  const insertSyntax = (prefix: string, suffix: string = prefix) => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const text = customMessage;
    const selected = text.substring(start, end);
    const replacement = `${prefix}${selected || 'teks'}${suffix}`;
    const newText = text.substring(0, start) + replacement + text.substring(end);
    setCustomMessage(newText);

    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + (selected.length || 4));
    }, 10);
  };

  const handleStart = async (e: FormEvent) => {
    e.preventDefault();

    if (formatMode === 'custom' && !customMessage.trim()) {
      setFeedbackMessage('Isi pesan kustom tidak boleh kosong.');
      return;
    }

    if (formatMode === 'announcement' && !messageBody.trim()) {
      setFeedbackMessage('Isi pesan pengumuman tidak boleh kosong.');
      return;
    }

    if (targetType === 'custom' && selectedJids.length === 0) {
      setFeedbackMessage('Pilih minimal satu grup atau kontak untuk target custom.');
      return;
    }

    setIsSubmitting(true);
    setFeedbackMessage(null);
    try {
      await onStartBroadcast({
        targetType,
        customJids: targetType === 'custom' ? selectedJids : undefined,
        delaySeconds,
        formatMode,
        customMessage: formatMode === 'custom' ? customMessage : undefined,
        forwardedManyTimes,
        templateData: formatMode === 'announcement' ? {
          from: fromName,
          role: fromRole,
          type: announcementType,
          message: messageBody,
        } : undefined,
      });
      setFeedbackMessage('Proses broadcast berhasil diluncurkan!');
    } catch (err: any) {
      setFeedbackMessage(`Gagal: ${err?.message || 'Error internal'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Active Broadcast Progress Banner */}
      {activeBroadcast && activeBroadcast.isRunning && (
        <div className="border border-neutral-900 bg-neutral-900 text-white p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              <h3 className="text-xs font-mono uppercase tracking-wider font-bold">
                Broadcast Sedang Berjalan
              </h3>
            </div>
            <button
              onClick={onStopBroadcast}
              className="text-xs font-mono px-3 py-1 bg-white text-black hover:bg-neutral-200 transition-colors uppercase"
            >
              Hentikan
            </button>
          </div>

          <div className="text-xs font-mono mb-2 flex justify-between text-neutral-300">
            <span>Terkirim: {activeBroadcast.sent} / {activeBroadcast.total}</span>
          </div>

          <div className="w-full bg-neutral-800 h-2">
            <div
              className="bg-white h-2 transition-all duration-300"
              style={{
                width: `${Math.round(((activeBroadcast.sent + activeBroadcast.failed) / (activeBroadcast.total || 1)) * 100)}%`,
              }}
            />
          </div>
          {activeBroadcast.currentTarget && (
            <p className="text-[11px] font-mono text-neutral-400 mt-2 truncate">
              Target saat ini: {activeBroadcast.currentTarget}
            </p>
          )}
        </div>
      )}

      <form onSubmit={handleStart} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Side: Parameters & Editor */}
        <div className="lg:col-span-7 border border-neutral-200 bg-white p-6 space-y-5">
          <div className="border-b border-neutral-200 pb-4">
            <h2 className="text-sm font-semibold tracking-wider uppercase text-neutral-900">
              Konfigurasi Broadcast
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Kirim broadcast dengan format pesan bebas (custom) atau template resmi quote WA
            </p>
          </div>

          {/* 1. Target Selector */}
          <div>
            <label className="block text-xs font-mono uppercase text-neutral-700 mb-2">
              1. Pilih Target Penerima:
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              {[
                { id: 'all', label: 'Semua', count: groups.length + contacts.length },
                { id: 'groups', label: 'Grup Saja', count: groups.length },
                { id: 'contacts', label: 'Kontak Saja', count: contacts.length },
                { id: 'custom', label: 'Custom Select', count: selectedJids.length },
              ].map((t) => (
                <button
                  type="button"
                  key={t.id}
                  onClick={() => setTargetType(t.id as any)}
                  className={`p-2.5 text-left border transition-colors ${
                    targetType === t.id
                      ? 'border-black bg-neutral-50 font-bold'
                      : 'border-neutral-200 hover:border-neutral-400'
                  }`}
                >
                  <div>{t.label}</div>
                  <div className="text-[10px] text-neutral-500 mt-0.5">{t.count} target</div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Select Picker with Search Bar */}
          {targetType === 'custom' && (
            <div className="border border-neutral-300 p-3 bg-neutral-50 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
                <span className="font-bold uppercase tracking-wider text-neutral-800">
                  Pilih Target Manual ({selectedJids.length} Dipilih)
                </span>
                <div className="flex items-center space-x-2 text-[11px]">
                  <button
                    type="button"
                    onClick={selectAllCustom}
                    className="underline text-neutral-800 hover:text-black"
                  >
                    Pilih Semua
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={clearAllCustom}
                    className="underline text-neutral-500 hover:text-black"
                  >
                    Kosongkan
                  </button>
                </div>
              </div>

              {/* Search Bar with Search Button & Category Filter */}
              <div className="space-y-2">
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Ketik nama grup atau kontak untuk mencari..."
                    className="w-full text-xs p-2 pl-8 pr-8 border border-neutral-300 focus:outline-none focus:border-black font-mono bg-white"
                  />
                  <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 pointer-events-none" />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 text-neutral-400 hover:text-black"
                      title="Hapus pencarian"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Filter categories and bulk action buttons */}
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => setFilterType('all')}
                      className={`px-2 py-0.5 text-[10px] border transition-colors ${
                        filterType === 'all'
                          ? 'border-black bg-black text-white'
                          : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400'
                      }`}
                    >
                      Semua ({groups.length + contacts.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterType('groups')}
                      className={`px-2 py-0.5 text-[10px] border transition-colors ${
                        filterType === 'groups'
                          ? 'border-black bg-black text-white'
                          : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400'
                      }`}
                    >
                      Grup ({groups.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterType('contacts')}
                      className={`px-2 py-0.5 text-[10px] border transition-colors ${
                        filterType === 'contacts'
                          ? 'border-black bg-black text-white'
                          : 'border-neutral-300 bg-white text-neutral-700 hover:border-neutral-400'
                      }`}
                    >
                      Kontak ({contacts.length})
                    </button>
                  </div>

                  {searchQuery && (
                    <div className="flex items-center space-x-1.5 text-[10px]">
                      <button
                        type="button"
                        onClick={selectAllFiltered}
                        className="px-2 py-0.5 bg-neutral-200 text-neutral-800 hover:bg-neutral-300"
                      >
                        Pilih Hasil Filter ({filteredItems.length})
                      </button>
                      <button
                        type="button"
                        onClick={deselectFiltered}
                        className="px-2 py-0.5 bg-neutral-200 text-neutral-800 hover:bg-neutral-300"
                      >
                        Batal
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Items List with Live Profile Pictures */}
              <div className="max-h-56 overflow-y-auto divide-y divide-neutral-200 border border-neutral-300 bg-white">
                {filteredItems.length === 0 ? (
                  <div className="p-4 text-center text-xs font-mono text-neutral-400">
                    Tidak ada kontak atau grup yang cocok dengan pencarian &quot;{searchQuery}&quot;
                  </div>
                ) : (
                  filteredItems.map((item) => {
                    const isSelected = selectedJids.includes(item.id);
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleCustomJid(item.id)}
                        className={`p-2.5 flex items-center justify-between cursor-pointer transition-colors text-xs ${
                          isSelected ? 'bg-neutral-50' : 'hover:bg-neutral-50/50'
                        }`}
                      >
                        <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                          <div className="w-7 h-7 flex-shrink-0 border border-neutral-200 bg-neutral-100 overflow-hidden flex items-center justify-center">
                            <img
                              src={item.avatarUrl || `/api/avatar?jid=${encodeURIComponent(item.id)}&name=${encodeURIComponent(item.name)}`}
                              alt={item.name}
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                              loading="lazy"
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center space-x-1.5">
                              <span className="text-[10px] font-mono px-1 py-0.2 bg-neutral-100 text-neutral-600 border border-neutral-200">
                                {item.isGroup ? 'GRUP' : 'KONTAK'}
                              </span>
                              <span className="font-semibold text-neutral-900 truncate">
                                {item.name}
                              </span>
                            </div>
                            <div className="text-[10px] text-neutral-500 font-mono truncate">
                              {item.subtext}
                            </div>
                          </div>
                        </div>

                        {isSelected ? (
                          <CheckSquare className="w-4 h-4 text-black flex-shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-neutral-300 flex-shrink-0" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* 2. Format Mode Selector */}
          <div>
            <label className="block text-xs font-mono uppercase text-neutral-700 mb-2">
              2. Format Pesan Broadcast:
            </label>
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <button
                type="button"
                onClick={() => setFormatMode('custom')}
                className={`p-3 text-left border transition-colors flex items-start space-x-2.5 ${
                  formatMode === 'custom'
                    ? 'border-black bg-neutral-50 font-bold'
                    : 'border-neutral-200 hover:border-neutral-400'
                }`}
              >
                <Sliders className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-neutral-900">Format Bebas (Custom)</div>
                  <div className="text-[10px] text-neutral-500 font-normal mt-0.5">
                    Ketik format sesuka hati tanpa batas atau aturan template kaku.
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setFormatMode('announcement')}
                className={`p-3 text-left border transition-colors flex items-start space-x-2.5 ${
                  formatMode === 'announcement'
                    ? 'border-black bg-neutral-50 font-bold'
                    : 'border-neutral-200 hover:border-neutral-400'
                }`}
              >
                <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <div className="text-neutral-900">Format Quote Resmi</div>
                  <div className="text-[10px] text-neutral-500 font-normal mt-0.5">
                    Struktur From, Role, Type, &amp; Quote kutipan resmi WhatsApp (&gt;).
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* 3. Delay Interval Setting */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-mono uppercase text-neutral-700 flex items-center space-x-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>3. Jeda Antar Pesan (Detik):</span>
              </label>
              <span className="text-xs font-mono font-bold">{delaySeconds} Detik</span>
            </div>
            <input
              type="range"
              min="1"
              max="30"
              value={delaySeconds}
              onChange={(e) => setDelaySeconds(Number(e.target.value))}
              className="w-full accent-black cursor-pointer"
            />
            <p className="text-[11px] text-neutral-500 font-mono mt-1">
              Rekomendasi aman: minimal 3-5 detik per pesan untuk mencegah spam detection WhatsApp.
            </p>
          </div>

          {/* 4. Message Editor depending on formatMode */}
          {formatMode === 'custom' ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-mono uppercase text-neutral-700 flex items-center space-x-1.5">
                  <Type className="w-3.5 h-3.5" />
                  <span>4. Isi Pesan Custom:</span>
                </label>
                {/* Text Formatting Helper Bar */}
                <div className="flex items-center space-x-1 font-mono text-[10px]">
                  <button
                    type="button"
                    onClick={() => insertSyntax('*')}
                    className="px-2 py-0.5 border border-neutral-300 hover:bg-neutral-100 font-bold"
                    title="Tebal (*teks*)"
                  >
                    B
                  </button>
                  <button
                    type="button"
                    onClick={() => insertSyntax('_')}
                    className="px-2 py-0.5 border border-neutral-300 hover:bg-neutral-100 italic font-serif"
                    title="Miring (_teks_)"
                  >
                    I
                  </button>
                  <button
                    type="button"
                    onClick={() => insertSyntax('~')}
                    className="px-2 py-0.5 border border-neutral-300 hover:bg-neutral-100 line-through"
                    title="Coret (~teks~)"
                  >
                    S
                  </button>
                  <button
                    type="button"
                    onClick={() => insertSyntax('```')}
                    className="px-2 py-0.5 border border-neutral-300 hover:bg-neutral-100"
                    title="Monospace (```teks```)"
                  >
                    Mono
                  </button>
                  <button
                    type="button"
                    onClick={() => insertSyntax('> ')}
                    className="px-2 py-0.5 border border-neutral-300 hover:bg-neutral-100"
                    title="Kutipan (> teks)"
                  >
                    &gt; Quote
                  </button>
                </div>
              </div>

              <textarea
                ref={textareaRef}
                rows={7}
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                placeholder="Tulis pesan sesuka Anda di sini (mendukung emoji, format *bold*, _italic_, enter berulang, dll)..."
                className="w-full text-xs p-3 border border-neutral-300 focus:outline-none focus:border-black font-mono leading-relaxed"
              />

              {/* Quick Template Presets */}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-neutral-600">
                <span className="text-neutral-400">Preset:</span>
                <button
                  type="button"
                  onClick={() =>
                    setCustomMessage(
                      `📢 *PENGUMUMAN PENTING*\n\nKepada seluruh anggota:\nKami ingin menginformasikan bahwa agenda meeting akan diadakan esok hari pukul 19:30 WIB.\n\nTerima kasih atas perhatiannya.`
                    )
                  }
                  className="px-2 py-0.5 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200"
                >
                  Pengumuman Rapat
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCustomMessage(
                      `⚠️ *PERINGATAN PEMELIHARAAN SISTEM*\n\nServer akan melakukan maintenance berkala selama 30 menit ke depan.\nMohon amankan data transaksi Anda terlebih dahulu.`
                    )
                  }
                  className="px-2 py-0.5 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200"
                >
                  Maintenance
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCustomMessage(
                      `✨ Halo teman-teman!\nSemoga hari kalian menyenangkan. Jangan lupa cek informasi update terbaru di link berikut ya!\n\nSalam hangat, Admin.`
                    )
                  }
                  className="px-2 py-0.5 bg-neutral-100 hover:bg-neutral-200 border border-neutral-200"
                >
                  Pesan Santai
                </button>
              </div>
            </div>
          ) : (
            /* Announcement Template Metadata Fields */
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-mono uppercase text-neutral-600 mb-1">
                    From :
                  </label>
                  <input
                    type="text"
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    placeholder="Nama Pengirim"
                    className="w-full text-xs p-2 border border-neutral-300 focus:outline-none focus:border-black font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono uppercase text-neutral-600 mb-1">
                    Role :
                  </label>
                  <input
                    type="text"
                    value={fromRole}
                    onChange={(e) => setFromRole(e.target.value)}
                    placeholder="Role"
                    className="w-full text-xs p-2 border border-neutral-300 focus:outline-none focus:border-black font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono uppercase text-neutral-600 mb-1">
                    Type :
                  </label>
                  <input
                    type="text"
                    value={announcementType}
                    onChange={(e) => setAnnouncementType(e.target.value)}
                    placeholder="Tipe Pesan"
                    className="w-full text-xs p-2 border border-neutral-300 focus:outline-none focus:border-black font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-neutral-700 mb-1">
                  Isi Pesan Quote:
                </label>
                <textarea
                  rows={5}
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  placeholder="Tuliskan pesan yang akan dibungkus ke dalam format quote WA..."
                  className="w-full text-xs p-3 border border-neutral-300 focus:outline-none focus:border-black font-mono leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* Option: Forwarded many times (Diteruskan berkali-kali) */}
          <div className="p-3 bg-neutral-50 border border-neutral-200 flex items-start space-x-3">
            <input
              type="checkbox"
              id="forwardedManyTimes"
              checked={forwardedManyTimes}
              onChange={(e) => setForwardedManyTimes(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-neutral-300 text-black focus:ring-black accent-black cursor-pointer"
            />
            <label htmlFor="forwardedManyTimes" className="cursor-pointer text-xs font-mono select-none flex-1">
              <div className="font-bold text-neutral-900 flex items-center space-x-1.5">
                <span>Format Diteruskan Berkali-kali</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-black text-white uppercase font-sans tracking-wide">
                  Sakti
                </span>
              </div>
              <div className="text-[11px] text-neutral-500 mt-0.5">
                Mengaktifkan tanda WhatsApp &ldquo;Diteruskan berkali-kali&rdquo; (Forwarded many times) dengan skor forwarding 999.
              </div>
            </label>
          </div>

          {feedbackMessage && (
            <div className="p-3 text-xs font-mono bg-neutral-50 border border-neutral-300 text-neutral-900">
              {feedbackMessage}
            </div>
          )}

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || (activeBroadcast && activeBroadcast.isRunning) || targetCount === 0}
              className="w-full py-3 bg-black text-white text-xs font-mono uppercase tracking-wider hover:bg-neutral-800 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Mulai Broadcast ({targetCount} Penerima)</span>
            </button>
          </div>
        </div>

        {/* Right Side: Live WhatsApp Message Preview */}
        <div className="lg:col-span-5 border border-neutral-200 bg-neutral-50 p-6 flex flex-col justify-between">
          <div>
            <div className="border-b border-neutral-200 pb-3 mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-mono uppercase tracking-wider text-neutral-700 font-bold">
                  Live WhatsApp Preview
                </h3>
                <p className="text-[11px] text-neutral-500 font-mono mt-0.5">
                  {formatMode === 'custom'
                    ? 'Format kustom murni langsung dikirim'
                    : 'Format kutipan resmi WhatsApp (>)'}
                </p>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 bg-neutral-200 text-neutral-800 uppercase">
                {formatMode}
              </span>
            </div>

            {/* Bubble simulation */}
            <div className="bg-white border border-neutral-300 p-4 font-mono text-xs text-neutral-900 leading-relaxed whitespace-pre-wrap shadow-none min-h-[160px]">
              {forwardedManyTimes && (
                <div className="flex items-center space-x-1.5 text-[11px] text-neutral-500 italic mb-2 select-none border-b border-neutral-100 pb-1.5 font-sans">
                  <span className="font-bold tracking-tighter">≫</span>
                  <span>Diteruskan berkali-kali</span>
                </div>
              )}
              {formattedPreview}
            </div>
          </div>

          <div className="mt-6 border-t border-neutral-200 pt-4 text-[11px] font-mono text-neutral-500 space-y-1">
            <p>• Format aktif: <strong>{formatMode === 'custom' ? 'Custom / Bebas' : 'Quote Announcement'}</strong></p>
            <p>• Status forwarded: <strong>{forwardedManyTimes ? 'Diteruskan Berkali-kali (Aktif)' : 'Normal'}</strong></p>
            <p>• Estimasi durasi broadcast: ~{targetCount * delaySeconds} detik</p>
            <p>• Status dikirim via background engine Baileys</p>
          </div>
        </div>
      </form>
    </div>
  );
}

