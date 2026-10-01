import { Users, Send, Settings, BarChart3, Smartphone } from 'lucide-react';
import { SystemStatus } from '../types.ts';

interface HeaderProps {
  currentTab: 'radar' | 'broadcast' | 'analytics' | 'settings';
  onSelectTab: (tab: 'radar' | 'broadcast' | 'analytics' | 'settings') => void;
  status: SystemStatus | null;
}

export default function Header({ currentTab, onSelectTab, status }: HeaderProps) {
  const isConnected = status?.status === 'connected';
  const activeSessionName = status?.botUser?.name || status?.sessions?.find(s => s && s.id === status?.activeSessionId)?.name || 'Akun Utama';

  return (
    <header className="border-b border-neutral-200 bg-white sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between py-2 sm:py-0 sm:h-16 gap-2">
          {/* Brand Identity & Status */}
          <div className="flex items-center justify-between sm:justify-start space-x-3 min-w-0">
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="w-8 h-8 bg-black text-white flex items-center justify-center font-bold font-mono text-sm flex-shrink-0">
                AX
              </div>
              <div className="min-w-0">
                <div className="flex items-center space-x-1.5">
                  <h1 className="text-sm font-bold tracking-tight uppercase text-neutral-900 truncate">
                    {status?.botName || 'Axale Tools Plus'}
                  </h1>
                </div>
                <div className="flex items-center space-x-2 text-[11px] font-mono text-neutral-500">
                  <div className="flex items-center space-x-1">
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isConnected ? 'bg-black' : 'bg-neutral-400'
                      }`}
                    />
                    <span>{isConnected ? 'Terhubung' : 'Standby'}</span>
                  </div>
                  <span className="text-neutral-300">•</span>
                  <span className="truncate max-w-[120px] sm:max-w-none text-neutral-600">
                    {activeSessionName}
                  </span>
                </div>
              </div>
            </div>

            {/* Mobile phone indicator */}
            {status?.botUser?.phone && (
              <div className="sm:hidden text-[10px] font-mono px-2 py-0.5 bg-neutral-100 text-neutral-700 border border-neutral-200 flex-shrink-0">
                +{String(status.botUser.phone).slice(-6)}
              </div>
            )}
          </div>

          {/* Navigation Bar (Horizontally scrollable on mobile with min 44px touch targets) */}
          <nav className="flex items-center space-x-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none text-xs font-mono -mx-2 px-2 sm:mx-0 sm:px-0">
            <button
              onClick={() => onSelectTab('radar')}
              className={`min-h-[44px] px-3 py-2 transition-colors flex items-center space-x-1.5 whitespace-nowrap flex-shrink-0 ${
                currentTab === 'radar'
                  ? 'border-b-2 border-black text-black font-bold'
                  : 'text-neutral-500 hover:text-black'
              }`}
            >
              <Users className="w-4 h-4 flex-shrink-0" />
              <span>Radar <span className="hidden md:inline">&amp; Grup</span></span>
            </button>

            <button
              onClick={() => onSelectTab('broadcast')}
              className={`min-h-[44px] px-3 py-2 transition-colors flex items-center space-x-1.5 whitespace-nowrap flex-shrink-0 ${
                currentTab === 'broadcast'
                  ? 'border-b-2 border-black text-black font-bold'
                  : 'text-neutral-500 hover:text-black'
              }`}
            >
              <Send className="w-4 h-4 flex-shrink-0" />
              <span>Broadcast</span>
            </button>

            <button
              onClick={() => onSelectTab('analytics')}
              className={`min-h-[44px] px-3 py-2 transition-colors flex items-center space-x-1.5 whitespace-nowrap flex-shrink-0 ${
                currentTab === 'analytics'
                  ? 'border-b-2 border-black text-black font-bold'
                  : 'text-neutral-500 hover:text-black'
              }`}
            >
              <BarChart3 className="w-4 h-4 flex-shrink-0" />
              <span>Analitik</span>
            </button>

            {/* TAB PALING KANAN: Pengaturan Umum */}
            <button
              onClick={() => onSelectTab('settings')}
              className={`min-h-[44px] px-3 py-2 transition-colors flex items-center space-x-1.5 whitespace-nowrap flex-shrink-0 ${
                currentTab === 'settings'
                  ? 'border-b-2 border-black text-black font-bold'
                  : 'text-neutral-500 hover:text-black'
              }`}
            >
              <Settings className="w-4 h-4 flex-shrink-0" />
              <span>Pengaturan <span className="hidden md:inline">Umum</span></span>
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
}
