import { useState, useMemo } from 'react';
import {
  BookOpen,
  Copy,
  Check,
  Search,
  AtSign,
  Image as ImageIcon,
  Eye,
  History,
  Trash2,
  Sliders,
  ShieldCheck,
  Sparkles,
  VolumeX,
  Send,
  HelpCircle,
  ExternalLink
} from 'lucide-react';

interface FeatureItem {
  id: string;
  name: string;
  command: string;
  category: 'hidetag' | 'sticker' | 'rvo' | 'swgc' | 'ghost' | 'clean' | 'admin' | 'control';
  tag: string;
  shortDesc: string;
  howToUse: string[];
  examples: string[];
  silentRule: string;
  scope: 'Grup' | 'Pribadi' | 'Grup & Pribadi' | 'Web & WA' | 'Grup & Web';
}

const ALL_FEATURES: FeatureItem[] = [
  {
    id: 'hidetag',
    name: 'Hidetag Senyap (Silent Mention All)',
    command: '.h <pesan>',
    category: 'hidetag',
    tag: 'BARU',
    shortDesc: 'Menyematkan mention tersembunyi ke seluruh anggota grup WhatsApp tanpa memunculkan daftar @tag yang panjang dan berantakan.',
    howToUse: [
      'Ketik .h Pesan Anda di grup: Bot langsung mengirimkan pesan yang men-tag seluruh anggota secara tersembunyi (bubble chat Anda tetap utuh, tidak dihapus).',
      'Kirim foto/video/dokumen dengan caption .h Caption: Media akan dikirim dengan mention tersembunyi ke semua anggota.',
      'Reply pesan apa saja dengan .h: Pesan atau media yang di-reply akan diteruskan dengan mention tersembunyi.',
      'Kirim lewat Web Dashboard: Buka tab "Hidetag", pilih satu atau banyak grup sekaligus, ketik pesan, lalu klik Kirim.'
    ],
    examples: [
      '.h Rapat koordinasi malam ini jam 20:00 WIB ya!',
      '.h Pengumuman penting: besok kantor buka jam 09:00',
      'Reply foto brosur dengan: .h'
    ],
    silentRule: '100% Hening: Tidak ada balasan bot seperti "Hidetag berhasil", "Berhasil tag 50 member", atau notifikasi berisik lainnya.',
    scope: 'Grup & Web'
  },
  {
    id: 'sticker',
    name: 'Pembuat Stiker Kilat (Sticker Maker)',
    command: '.s',
    category: 'sticker',
    tag: 'BARU',
    shortDesc: 'Mengubah foto atau video/GIF langsung menjadi stiker WhatsApp resmi (WebP transparan) dengan metadata kustom (Paket & Author).',
    howToUse: [
      'Reply gambar atau video dengan .s atau .sticker: Bot langsung memproses dan mengirimkan stiker hasil konversi bersih tanpa border hitam.',
      'Kirim gambar atau video dengan caption .s atau .sticker: Bot langsung mengirimkan stiker (bubble chat asli Anda tetap utuh, tidak dihapus).',
      'Mendukung video pendek / GIF untuk menjadi stiker animasi bergerak (maksimal ~6 detik).',
      'Kustom Nama Stiker & Paket: Atur nama pembuat (misal: "rakhn") dan nama paket (misal: "stiker rakhan") di tab Pengaturan.'
    ],
    examples: [
      'Reply foto kucing dengan: .s',
      'Kirim video lucu dengan caption: .s',
      'Reply gambar dengan: .sticker'
    ],
    silentRule: '100% Hening: Bot hanya mengirimkan stiker saja ke chat tanpa kata pengantar, tanpa "Stiker berhasil dibuat", dan tanpa pesan error jika gagal. Bubble chat asli Anda tidak dihapus.',
    scope: 'Grup & Pribadi'
  },
  {
    id: 'rvo',
    name: 'Buka Media Sekali Lihat (Reveal View-Once)',
    command: '.rvo',
    category: 'rvo',
    tag: 'PILIHAN',
    shortDesc: 'Membuka dan menyimpan foto, video, atau rekaman suara (VN) sekali lihat (View Once) secara murni.',
    howToUse: [
      'Reply pesan foto/video/VN sekali lihat (lingkaran angka 1) dengan mengetik .rvo.',
      'Bot langsung mengirimkan media aslinya lengkap dengan caption aslinya (jika ada).',
      'Bisa digunakan baik di dalam grup maupun di chat pribadi.'
    ],
    examples: [
      'Reply foto sekali lihat dengan: .rvo',
      'Reply video sekali lihat dengan: .rvo'
    ],
    silentRule: '100% Hening: Tidak ada teks pengantar seperti "Media sekali lihat terbuka", teks embel-embel, ataupun notifikasi gagal jika bukan view once.',
    scope: 'Grup & Pribadi'
  },
  {
    id: 'swgc',
    name: 'Status Cerita Grup WhatsApp (SWGC)',
    command: '.swgc <pesan> --warna',
    category: 'swgc',
    tag: 'POPULER',
    shortDesc: 'Membuat status cerita yang muncul di lingkaran profil grup WhatsApp, baik berupa status teks berlatar warna maupun foto/video.',
    howToUse: [
      'Status Teks Berwarna: Ketik .swgc Pesan Anda --warna (misal --hijau, --merah, --biru, --random, --#3B82F6). Flag warna otomatis dipotong bersih sehingga tidak pernah ikut masuk ke teks status!',
      'Status Media (Foto/Video): Reply atau kirim foto/video dengan caption .swgc [caption opsional].',
      'Lewat Web Dashboard: Klik tombol "Story Grup (.swgc)" pada kartu grup atau buka modal SWGC untuk memilih warna visual / upload media.',
      'Hapus Status (.delswgc): Ketik .delswgc untuk melihat nomor urut status aktif, lalu ketik .delswgc 1 untuk menghapus dari peredaran.'
    ],
    examples: [
      '.swgc Selamat pagi rekan-rekan semua! --hijau',
      '.swgc Promo diskon khusus anggota --merah',
      '.swgc Pengumuman internal --random',
      '.delswgc 1'
    ],
    silentRule: '100% Hening: Tidak ada pesan "Status Cerita Grup Berhasil Dipublikasikan" di grup. Log keberhasilan atau kendala tersimpan rapi di Web Dashboard.',
    scope: 'Grup & Web'
  },
  {
    id: 'ghost',
    name: 'Anti-Delete & Riwayat Edit (.ghost / .edit)',
    command: '.ghost / .edit',
    category: 'ghost',
    tag: 'FITUR UTAMA',
    shortDesc: 'Melacak pesan yang dihapus untuk semua orang serta riwayat editan pesan yang direvisi berkali-kali dalam 1 bubble chat.',
    howToUse: [
      'Lihat Riwayat Edit via Reply: Cukup reply pesan yang diedit dengan mengetik .ghost atau .edit. Bot akan menampilkan isi pesan terkini di bagian atas, seluruh riwayat pesan sebelum diedit di bagian tengah, dan status ringkas di bagian bawah.',
      'Cek Pesan Dihapus / Diedit User di Grup: Ketik .ghost @user. Bot akan me-reveal pesan terhapus atau riwayat editan user tersebut.',
      'Cek di Chat Pribadi: Ketik .ghost langsung di chat pribadi.',
      'Isolasi Ketat: Riwayat grup A tidak akan pernah bocor ke grup B atau chat pribadi.'
    ],
    examples: [
      'Reply pesan yang direvisi dengan: .ghost',
      'Reply pesan yang direvisi dengan: .edit',
      'Di grup ketik: .ghost @628123456789',
      'Di chat pribadi ketik: .ghost'
    ],
    silentRule: 'Jika user belum pernah menghapus atau mengedit pesan di chat tersebut, bot akan hening 100% (tidak membalas apapun).',
    scope: 'Grup & Pribadi'
  },
  {
    id: 'ghostclear',
    name: 'Pembersih Histori Pesan (.ghostclear)',
    command: '.ghostclear [@user]',
    category: 'clean',
    tag: 'ADMIN',
    shortDesc: 'Menghapus histori pesan terhapus dan riwayat editan yang dicatat bot di grup atau chat pribadi.',
    howToUse: [
      'Di Chat Pribadi: Ketik .ghostclear untuk membersihkan seluruh riwayat chat pribadi tersebut.',
      'Di Grup (Spesifik User): Ketik .ghostclear @user untuk menghapus riwayat pesan milik anggota yang di-tag.',
      'Di Grup (Semua Anggota): Admin+ cukup mengetik .ghostclear (tanpa tag) untuk membersihkan seluruh riwayat anggota di grup tersebut.'
    ],
    examples: [
      '.ghostclear (di chat pribadi atau di grup)',
      '.ghostclear @628123456789 (di grup)'
    ],
    silentRule: '100% Hening: Bot membersihkan memori secara senyap tanpa mengirim teks balasan konfirmasi.',
    scope: 'Grup & Pribadi'
  },
  {
    id: 'cleardata',
    name: 'Pembersih Penyimpanan Web Server (.cleardata)',
    command: '.cleardata',
    category: 'clean',
    tag: 'SERVER',
    shortDesc: 'Membersihkan database analitik chat, media sementara, dan pelacakan memori di web server agar tidak memenuhi penyimpanan server.',
    howToUse: [
      'Ketik .cleardata di mana saja (grup atau chat pribadi) oleh nomor Admin+.',
      'Atau buka tab "Pengaturan" di Web Dashboard lalu klik "Bersihkan Cache & Histori Web".',
      'Sangat berguna untuk pemeliharaan berkala server.'
    ],
    examples: [
      '.cleardata'
    ],
    silentRule: '100% Hening: Tidak ada balasan chat di WhatsApp. Hasil pembersihan dicatat di log Web Dashboard.',
    scope: 'Web & WA'
  },
  {
    id: 'control',
    name: 'Kontrol Bot Grup & Master Switch',
    command: '.bot on / .bot off',
    category: 'control',
    tag: 'KONTROL',
    shortDesc: 'Mengatur saklar bot per grup secara mandiri atau saklar master global.',
    howToUse: [
      'Matikan Bot di Grup Tertentu: Ketik .bot off di dalam grup yang bersangkutan atau klik tombol "Matikan Bot" di Dashboard.',
      'Aktifkan Bot di Grup Tertentu: Ketik .bot on di dalam grup tersebut atau klik tombol "Nyalakan Bot" di Dashboard.',
      'Master Global Switch: .bot general on atau .bot general off untuk mengaktifkan/menonaktifkan seluruh fitur bot di semua chat.'
    ],
    examples: [
      '.bot off',
      '.bot on',
      '.bot general off',
      '.bot general on'
    ],
    silentRule: 'Di Dashboard Web, status bot tiap grup dapat dipantau dan diubah secara instan dengan satu klik.',
    scope: 'Grup & Web'
  },
  {
    id: 'admin',
    name: 'Manajemen Hak Akses Admin+',
    command: '.promote / .demote',
    category: 'admin',
    tag: 'KEAMANAN',
    shortDesc: 'Mengelola nomor telepon yang berhak menjalankan fitur-fitur eksklusif bot.',
    howToUse: [
      'Nomor yang terhubung sebagai bot (fromMe) selalu otomatis menjadi Admin+ tertinggi.',
      'Tambah Admin+ via Web UI: Buka tab "Pengaturan", masukkan nomor WhatsApp pada daftar Admin+.',
      'Jadikan Admin Grup: Ketik .promote me atau .promote @user di grup WhatsApp.',
      'Turunkan Admin Grup: Ketik .demote me atau .demote @user di grup WhatsApp.'
    ],
    examples: [
      '.promote me',
      '.promote @628123456789',
      '.demote @628123456789'
    ],
    silentRule: 'Jika ada nomor non-Admin+ yang mencoba memanggil perintah bot, bot akan hening 100% (tidak pernah membalas "Anda bukan admin").',
    scope: 'Web & WA'
  }
];

export default function FeatureHub() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const categories = [
    { id: 'all', label: 'Semua Fitur' },
    { id: 'hidetag', label: 'Hidetag (.h)' },
    { id: 'sticker', label: 'Stiker (.s)' },
    { id: 'rvo', label: 'Sekali Lihat (.rvo)' },
    { id: 'swgc', label: 'Story Grup (.swgc)' },
    { id: 'ghost', label: 'Anti-Delete (.ghost)' },
    { id: 'clean', label: 'Pembersih Data' },
    { id: 'control', label: 'Kontrol & Saklar' },
  ];

  const filteredFeatures = useMemo(() => {
    return ALL_FEATURES.filter((f) => {
      const matchCat = selectedCategory === 'all' || f.category === selectedCategory;
      const q = searchQuery.toLowerCase().trim();
      if (!q) return matchCat;
      const matchText =
        f.name.toLowerCase().includes(q) ||
        f.command.toLowerCase().includes(q) ||
        f.shortDesc.toLowerCase().includes(q) ||
        f.examples.some((ex) => ex.toLowerCase().includes(q));
      return matchCat && matchText;
    });
  }, [searchQuery, selectedCategory]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="border border-neutral-200 bg-white p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-neutral-200 pb-4 mb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-black text-white flex items-center justify-center flex-shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold uppercase tracking-wider text-neutral-900">
                Katalog Fitur &amp; Perintah Lengkap
              </h2>
              <p className="text-xs text-neutral-500 font-mono">
                Panduan resmi seluruh fitur eksklusif, format perintah WhatsApp, dan cara penggunaan via Web Dashboard.
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2 text-xs font-mono px-3 py-1 bg-neutral-100 text-neutral-800 border border-neutral-200 self-start sm:self-center">
            <VolumeX className="w-3.5 h-3.5" />
            <span>Mode Senyap (Stealth Engine)</span>
          </div>
        </div>

        {/* Philosophy Note */}
        <div className="bg-neutral-50 border border-neutral-200 p-4 text-xs font-mono text-neutral-700 leading-relaxed">
          <span className="font-bold text-neutral-900">Filosofi Khusus &amp; Mode Senyap:</span> Seluruh fitur di aplikasi ini dirancang khusus untuk penggunaan personal/privat Anda sebagai Admin+. Bot tidak pernah mengirimkan spam seperti <em>"Akses ditolak"</em>, <em>"Perintah gagal"</em>, atau <em>"Berhasil dieksekusi"</em> ke ruang obrolan WhatsApp. Semua berjalan dengan hening, bersih, dan profesional.
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="border border-neutral-200 bg-white p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Cari fitur, perintah (.h, .s, .rvo, .swgc, .ghost), atau fungsi..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-xs font-mono border border-neutral-200 focus:outline-hidden focus:border-black transition-colors"
          />
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedCategory(c.id)}
              className={`px-3 py-1.5 text-xs font-mono whitespace-nowrap transition-colors flex-shrink-0 border ${
                selectedCategory === c.id
                  ? 'bg-black text-white border-black font-bold'
                  : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:border-black hover:text-black'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Feature Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {filteredFeatures.length === 0 ? (
          <div className="col-span-full border border-neutral-200 bg-white p-12 text-center text-xs font-mono text-neutral-500">
            Tidak ada fitur yang cocok dengan kata kunci pencarian Anda.
          </div>
        ) : (
          filteredFeatures.map((item) => (
            <div
              key={item.id}
              className="border border-neutral-200 bg-white p-5 flex flex-col justify-between hover:border-neutral-400 transition-colors shadow-xs"
            >
              <div>
                {/* Header Card */}
                <div className="flex items-start justify-between gap-2 border-b border-neutral-100 pb-3 mb-3">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 bg-black text-white">
                        {item.tag}
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 bg-neutral-100 text-neutral-600 border border-neutral-200">
                        {item.scope}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-neutral-900 mt-1.5">
                      {item.name}
                    </h3>
                  </div>

                  {/* Copy Command Button */}
                  <button
                    type="button"
                    onClick={() => handleCopy(item.command, item.id)}
                    className="p-1.5 border border-neutral-200 hover:border-black text-neutral-600 hover:text-black transition-colors flex-shrink-0 flex items-center gap-1 text-[11px] font-mono bg-neutral-50"
                    title="Salin sintaks perintah"
                  >
                    {copiedId === item.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-green-600" />
                        <span className="text-green-600">Disalin</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>{item.command}</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Short Description */}
                <p className="text-xs text-neutral-600 leading-relaxed mb-4">
                  {item.shortDesc}
                </p>

                {/* How to use */}
                <div className="space-y-1.5 mb-4">
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-800 font-mono">
                    Cara Menggunakan:
                  </h4>
                  <ul className="text-xs text-neutral-700 space-y-1 list-disc list-inside font-mono">
                    {item.howToUse.map((step, idx) => (
                      <li key={idx} className="leading-relaxed">
                        <span>{step}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Examples */}
                <div className="bg-neutral-50 border border-neutral-200 p-2.5 mb-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 font-mono mb-1">
                    Contoh Perintah:
                  </p>
                  <div className="space-y-1 font-mono text-xs text-neutral-900 font-medium">
                    {item.examples.map((ex, exIdx) => (
                      <div
                        key={exIdx}
                        className="flex items-center justify-between group hover:bg-neutral-200 px-1.5 py-0.5 rounded-xs transition-colors"
                      >
                        <span className="truncate">{ex}</span>
                        <button
                          type="button"
                          onClick={() => handleCopy(ex, `${item.id}-ex-${exIdx}`)}
                          className="opacity-0 group-hover:opacity-100 text-[10px] text-neutral-600 hover:text-black"
                          title="Salin contoh"
                        >
                          {copiedId === `${item.id}-ex-${exIdx}` ? 'Tersalin' : 'Salin'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Silent Rule Indicator */}
              <div className="border-t border-neutral-100 pt-3 text-[11px] font-mono text-neutral-500 flex items-start space-x-1.5">
                <VolumeX className="w-3.5 h-3.5 text-neutral-700 flex-shrink-0 mt-0.5" />
                <span>{item.silentRule}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
