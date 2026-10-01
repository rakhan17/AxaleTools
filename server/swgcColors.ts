export interface SwgcColorInfo {
  key: string;
  name: string;
  hex: string;
  argb: number;
}

export const SWGC_COLOR_PRESETS: SwgcColorInfo[] = [
  { key: 'hijau', name: 'Hijau WhatsApp', hex: '#25D366', argb: 0xFF25D366 },
  { key: 'merah', name: 'Merah Terang', hex: '#D32F2F', argb: 0xFFD32F2F },
  { key: 'biru', name: 'Biru Cerah', hex: '#1976D2', argb: 0xFF1976D2 },
  { key: 'ungu', name: 'Ungu Elegan', hex: '#7B1FA2', argb: 0xFF7B1FA2 },
  { key: 'pink', name: 'Merah Muda (Pink)', hex: '#C2185B', argb: 0xFFC2185B },
  { key: 'orange', name: 'Oranye Segar', hex: '#F57C00', argb: 0xFFF57C00 },
  { key: 'kuning', name: 'Kuning Amber', hex: '#FBC02D', argb: 0xFFFBC02D },
  { key: 'tosca', name: 'Tosca / Teal', hex: '#00796B', argb: 0xFF00796B },
  { key: 'hitam', name: 'Hitam Gelap', hex: '#212121', argb: 0xFF212121 },
  { key: 'navy', name: 'Biru Navy', hex: '#0D47A1', argb: 0xFF0D47A1 },
  { key: 'coklat', name: 'Cokelat Mocha', hex: '#5D4037', argb: 0xFF5D4037 },
  { key: 'cyan', name: 'Biru Cyan', hex: '#0097A7', argb: 0xFF0097A7 },
  { key: 'maroon', name: 'Merah Maroon', hex: '#880E4F', argb: 0xFF880E4F },
  { key: 'abu', name: 'Abu-Abu Slate', hex: '#455A64', argb: 0xFF455A64 },
  { key: 'sunset', name: 'Oranye Sunset', hex: '#E65100', argb: 0xFFE65100 },
  { key: 'forest', name: 'Hijau Hutan', hex: '#1B5E20', argb: 0xFF1B5E20 },
];

export const SWGC_COLOR_MAP: Record<string, SwgcColorInfo> = {
  // Indonesian & English Aliases
  hijau: SWGC_COLOR_PRESETS[0],
  green: SWGC_COLOR_PRESETS[0],
  wa: SWGC_COLOR_PRESETS[0],

  merah: SWGC_COLOR_PRESETS[1],
  red: SWGC_COLOR_PRESETS[1],

  biru: SWGC_COLOR_PRESETS[2],
  blue: SWGC_COLOR_PRESETS[2],

  ungu: SWGC_COLOR_PRESETS[3],
  purple: SWGC_COLOR_PRESETS[3],

  pink: SWGC_COLOR_PRESETS[4],
  merahmuda: SWGC_COLOR_PRESETS[4],

  orange: SWGC_COLOR_PRESETS[5],
  oranye: SWGC_COLOR_PRESETS[5],
  jingga: SWGC_COLOR_PRESETS[5],

  kuning: SWGC_COLOR_PRESETS[6],
  yellow: SWGC_COLOR_PRESETS[6],

  tosca: SWGC_COLOR_PRESETS[7],
  teal: SWGC_COLOR_PRESETS[7],

  hitam: SWGC_COLOR_PRESETS[8],
  black: SWGC_COLOR_PRESETS[8],
  dark: SWGC_COLOR_PRESETS[8],

  navy: SWGC_COLOR_PRESETS[9],

  coklat: SWGC_COLOR_PRESETS[10],
  brown: SWGC_COLOR_PRESETS[10],

  cyan: SWGC_COLOR_PRESETS[11],

  maroon: SWGC_COLOR_PRESETS[12],

  abu: SWGC_COLOR_PRESETS[13],
  gray: SWGC_COLOR_PRESETS[13],
  grey: SWGC_COLOR_PRESETS[13],

  sunset: SWGC_COLOR_PRESETS[14],

  forest: SWGC_COLOR_PRESETS[15],
};

/**
 * Resolves color string (e.g. 'merah', 'random', '#3B82F6', 'ff00ff') to SwgcColorInfo
 */
export function resolveSwgcColor(colorInput?: string): SwgcColorInfo {
  if (!colorInput) {
    return SWGC_COLOR_PRESETS[0]; // Default WhatsApp Green
  }

  const cleaned = colorInput.trim().toLowerCase().replace(/^--/, '');

  // Random color requested
  if (cleaned === 'random' || cleaned === 'acak') {
    const randomIndex = Math.floor(Math.random() * SWGC_COLOR_PRESETS.length);
    return SWGC_COLOR_PRESETS[randomIndex];
  }

  // Preset match
  if (SWGC_COLOR_MAP[cleaned]) {
    return SWGC_COLOR_MAP[cleaned];
  }

  // Hex code parsing (e.g. '#FF0000' or 'FF0000')
  const hexMatch = cleaned.match(/^#?([0-9a-f]{6})$/i);
  if (hexMatch) {
    const hex = '#' + hexMatch[1].toUpperCase();
    const argb = 0xFF000000 | parseInt(hexMatch[1], 16);
    return {
      key: hex,
      name: `Kustom (${hex})`,
      hex,
      argb,
    };
  }

  // Short 3-char hex (e.g. '#FFF' -> '#FFFFFF')
  const shortHexMatch = cleaned.match(/^#?([0-9a-f]{3})$/i);
  if (shortHexMatch) {
    const expanded = shortHexMatch[1].split('').map((c) => c + c).join('').toUpperCase();
    const hex = '#' + expanded;
    const argb = 0xFF000000 | parseInt(expanded, 16);
    return {
      key: hex,
      name: `Kustom (${hex})`,
      hex,
      argb,
    };
  }

  // Fallback to random if user typed an unrecognized word
  const randomIndex = Math.floor(Math.random() * SWGC_COLOR_PRESETS.length);
  return SWGC_COLOR_PRESETS[randomIndex];
}
