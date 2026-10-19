import { useState, useMemo, ChangeEvent, FormEvent } from 'react';
import {
  AtSign,
  Send,
  Users,
  Search,
  Check,
  Paperclip,
  X,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
  Sparkles,
  Info
} from 'lucide-react';
import { WAGroup } from '../types.ts';

interface HidetagPanelProps {
  groups: WAGroup[];
}

export default function HidetagPanel({ groups }: HidetagPanelProps) {
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageText, setMessageText] = useState('');
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [statusFeedback, setStatusFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Filter groups by search query
  const filteredGroups = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.subject.toLowerCase().includes(q) ||
        g.id.toLowerCase().includes(q)
    );
  }, [groups, searchQuery]);

  // Select all or deselect all
  const handleToggleSelectAll = () => {
    if (selectedGroupIds.length === filteredGroups.length) {
      setSelectedGroupIds([]);
    } else {
      setSelectedGroupIds(filteredGroups.map((g) => g.id));
    }
  };

  const handleToggleGroup = (id: string) => {
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((gid) => gid !== id) : [...prev, id]
    );
  };

  // Handle file attachment
  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setMediaFile(file);
      if (file.type.startsWith('image/')) {
        setMediaPreview(URL.createObjectURL(file));
      } else {
        setMediaPreview(null);
      }
    }
  };

  const handleRemoveMedia = () => {
    setMediaFile(null);
    if (mediaPreview) {
      URL.revokeObjectURL(mediaPreview);
      setMediaPreview(null);
    }
  };

  // Quick message template insertion
  const handleInsertTemplate = (tpl: string) => {
    setMessageText((prev) => (prev ? `${prev}\n\n${tpl}` : tpl));
  };

  // Send Hidetag API call
  const handleSendHidetag = async (e: FormEvent) => {
    e.preventDefault();
    if (selectedGroupIds.length === 0) {
      setStatusFeedback({
        type: 'error',
        text: 'Pilih minimal satu grup target untuk mengirim Hidetag.',
      });
      return;
    }

    if (!messageText.trim() && !mediaFile) {
      setStatusFeedback({
        type: 'error',
        text: 'Masukkan pesan teks atau lampirkan berkas media untuk Hidetag.',
      });
      return;
    }

    setIsSending(true);
    setStatusFeedback(null);

    try {
      const formData = new FormData();
      formData.append('groupIds', JSON.stringify(selectedGroupIds));
      if (messageText.trim()) {
        formData.append('text', messageText.trim());
      }
      if (mediaFile) {
        formData.append('media', mediaFile);
      }

      const res = await fetch('/api/hidetag/send', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Gagal mengirim hidetag');
      }

      setStatusFeedback({
        type: 'success',
        text: `Hidetag berhasil dikirim ke ${data.sent || selectedGroupIds.length} grup secara hening!`,
      });

      // Clear form
      setMessageText('');
      handleRemoveMedia();
    } catch (err: any) {
      setStatusFeedback({
        type: 'error',
        text: err?.message || 'Terjadi kesalahan saat mengirim Hidetag.',
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="border border-neutral-200 bg-white p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 pb-4 mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-black text-white flex items-center justify-center flex-shrink-0">
              <AtSign className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold uppercase tracking-wider text-neutral-900">
                Kirim Hidetag (Silent Mention)
              </h2>
              <p className="text-xs text-neutral-500 font-mono">
                Menyematkan mention tersembunyi ke seluruh anggota grup tanpa menampilkan teks @ tag yang berantakan.
              </p>
            </div>
          </div>
          <div className="text-[11px] font-mono px-3 py-1 bg-neutral-100 text-neutral-700 border border-neutral-200 flex items-center gap-1.5 self-start sm:self-center">
            <Sparkles className="w-3.5 h-3.5 text-neutral-900" />
            <span>Mode Hening: Tanpa Notif Bot</span>
          </div>
        </div>

        {/* Info Box */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-mono bg-neutral-50 border border-neutral-200 p-3.5">
          <div className="flex items-start space-x-2">
            <Info className="w-4 h-4 text-neutral-700 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-bold text-neutral-900">Kirim Lewat Web:</span>
              <p className="text-neutral-600 mt-0.5">
                Pilih grup di bawah, ketik pesan, lalu klik Kirim. Seluruh anggota grup akan menerima pemberitahuan mention secara hening tanpa simbol @.
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-2">
            <AtSign className="w-4 h-4 text-neutral-700 mt-0.5 flex-shrink-0" />
            <div>
              <span className="font-bold text-neutral-900">Kirim Lewat Chat WA:</span>
              <p className="text-neutral-600 mt-0.5">
                Ketik <code className="bg-neutral-200 px-1 py-0.5 font-bold text-black">.h Pesan Anda</code> di grup atau reply pesan dengan <code className="bg-neutral-200 px-1 py-0.5 font-bold text-black">.h</code>. Bubble chat <code className="bg-neutral-200 px-1 py-0.5">.h</code> otomatis dihapus dan diteruskan bersih!
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Group Selector & Message Composer */}
      <form onSubmit={handleSendHidetag} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Group Selector (5 cols) */}
        <div className="lg:col-span-5 border border-neutral-200 bg-white p-4 sm:p-5 flex flex-col h-[580px] shadow-xs">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-200 mb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-1.5">
              <Users className="w-4 h-4" />
              <span>Pilih Target Grup ({selectedGroupIds.length}/{groups.length})</span>
            </h3>
            <button
              type="button"
              onClick={handleToggleSelectAll}
              className="text-[11px] font-mono text-neutral-600 hover:text-black underline min-h-[36px] flex items-center px-1"
            >
              {selectedGroupIds.length === filteredGroups.length && filteredGroups.length > 0
                ? 'Batal Semua'
                : 'Pilih Semua'}
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative mb-3">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Cari nama grup target..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs font-mono border border-neutral-200 focus:outline-hidden focus:border-black transition-colors"
            />
          </div>

          {/* Group List */}
          <div className="flex-1 overflow-y-auto divide-y divide-neutral-100 border border-neutral-200 pr-1">
            {filteredGroups.length === 0 ? (
              <div className="p-8 text-center text-xs text-neutral-400 font-mono">
                Tidak ada grup yang sesuai.
              </div>
            ) : (
              filteredGroups.map((g) => {
                const isSelected = selectedGroupIds.includes(g.id);
                return (
                  <div
                    key={g.id}
                    onClick={() => handleToggleGroup(g.id)}
                    className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${
                      isSelected ? 'bg-neutral-100 font-medium' : 'hover:bg-neutral-50'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div
                        className={`w-4 h-4 border flex items-center justify-center transition-colors flex-shrink-0 ${
                          isSelected ? 'bg-black border-black text-white' : 'border-neutral-300 bg-white'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs text-neutral-900 truncate font-semibold">
                          {g.subject || 'Grup WhatsApp'}
                        </p>
                        <p className="text-[10px] text-neutral-500 font-mono">
                          {g.size} Anggota
                        </p>
                      </div>
                    </div>
                    {g.botRole === 'admin' && (
                      <span className="text-[9px] font-mono px-1.5 py-0.5 bg-neutral-200 text-neutral-800 flex-shrink-0">
                        Admin
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Message Composer (7 cols) */}
        <div className="lg:col-span-7 border border-neutral-200 bg-white p-4 sm:p-5 flex flex-col justify-between shadow-xs">
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-1.5">
                <AtSign className="w-4 h-4" />
                <span>Isi Pesan Hidetag</span>
              </h3>
              <span className="text-[11px] font-mono text-neutral-500">
                {messageText.length} Karakter
              </span>
            </div>

            {/* Quick Templates */}
            <div>
              <p className="text-[11px] font-mono text-neutral-500 mb-1.5">Templat Cepat:</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => handleInsertTemplate('🚨 *PENGUMUMAN PENTING*\nMohon perhatian seluruh anggota grup.')}
                  className="text-[11px] font-mono px-2 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border border-neutral-200 transition-colors"
                >
                  + Pengumuman
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertTemplate('📢 *INFO RAPAT / PERTEMUAN*\nWaktu: \nAgenda: \nTempat: ')}
                  className="text-[11px] font-mono px-2 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border border-neutral-200 transition-colors"
                >
                  + Info Rapat
                </button>
                <button
                  type="button"
                  onClick={() => handleInsertTemplate('⏰ *REMINDER / PENGINGAT*\nJangan lupa untuk cek tugas atau jadwal.')}
                  className="text-[11px] font-mono px-2 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border border-neutral-200 transition-colors"
                >
                  + Reminder
                </button>
              </div>
            </div>

            {/* Textarea */}
            <div>
              <label className="block text-xs font-mono font-medium text-neutral-700 mb-1.5">
                Teks Pengumuman (Didukung format WhatsApp *tebal*, _miring_, ~coret~)
              </label>
              <textarea
                rows={6}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Tulis pesan hidetag di sini... Seluruh anggota grup yang dipilih akan di-mention secara tidak terlihat (silent tag)."
                className="w-full p-3 text-xs font-mono border border-neutral-200 focus:outline-hidden focus:border-black transition-colors resize-y leading-relaxed"
              />
            </div>

            {/* Media Attachment */}
            <div>
              <label className="block text-xs font-mono font-medium text-neutral-700 mb-1.5">
                Lampiran Media Opsional (Foto / Video / Dokumen)
              </label>

              {!mediaFile ? (
                <label className="flex flex-col items-center justify-center p-4 border border-dashed border-neutral-300 hover:border-black cursor-pointer bg-neutral-50 transition-colors text-center">
                  <Paperclip className="w-5 h-5 text-neutral-500 mb-1" />
                  <span className="text-xs font-mono text-neutral-700 font-medium">
                    Klik untuk memilih gambar atau video
                  </span>
                  <span className="text-[10px] font-mono text-neutral-400 mt-0.5">
                    JPG, PNG, MP4, PDF, dsb. (Pesan di atas akan menjadi caption)
                  </span>
                  <input
                    type="file"
                    onChange={handleFileChange}
                    className="hidden"
                    accept="image/*,video/*,application/pdf"
                  />
                </label>
              ) : (
                <div className="flex items-center justify-between p-3 border border-neutral-200 bg-neutral-50">
                  <div className="flex items-center space-x-3 min-w-0">
                    {mediaPreview ? (
                      <img
                        src={mediaPreview}
                        alt="Preview"
                        className="w-12 h-12 object-cover border border-neutral-200 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 bg-neutral-200 flex items-center justify-center flex-shrink-0 font-mono text-[10px] text-neutral-600">
                        FILE
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-mono font-medium text-neutral-900 truncate">
                        {mediaFile.name}
                      </p>
                      <p className="text-[10px] font-mono text-neutral-500">
                        {(mediaFile.size / (1024 * 1024)).toFixed(2)} MB • {mediaFile.type || 'Berkas'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveMedia}
                    className="p-1.5 text-neutral-500 hover:text-black transition-colors"
                    title="Hapus berkas"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Status Feedback */}
            {statusFeedback && (
              <div
                className={`p-3 text-xs font-mono flex items-start space-x-2 border ${
                  statusFeedback.type === 'success'
                    ? 'bg-neutral-100 border-black text-neutral-900'
                    : 'bg-red-50 border-red-200 text-red-700'
                }`}
              >
                {statusFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-black flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <span>{statusFeedback.text}</span>
              </div>
            )}
          </div>

          {/* Submit Action */}
          <div className="pt-4 border-t border-neutral-200 mt-4">
            <button
              type="submit"
              disabled={isSending || selectedGroupIds.length === 0 || (!messageText.trim() && !mediaFile)}
              className="w-full min-h-[44px] bg-black text-white hover:bg-neutral-800 disabled:bg-neutral-300 disabled:text-neutral-500 font-mono text-xs font-bold uppercase tracking-wider flex items-center justify-center space-x-2 transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              {isSending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full" />
                  <span>Mengirim Hidetag ({selectedGroupIds.length} Grup)...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Kirim Hidetag ke {selectedGroupIds.length} Grup</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
