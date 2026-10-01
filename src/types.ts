export interface WAContact {
  id: string;
  name: string;
  phone: string;
  avatarUrl: string | null;
}

export interface WAGroup {
  id: string;
  subject: string;
  size: number;
  creation?: number;
  botRole: 'superadmin' | 'admin' | 'member';
  avatarUrl: string | null;
  admins: string[];
}

export type BroadcastFormat = 'custom' | 'announcement';

export interface BroadcastPayload {
  targetType: 'all' | 'contacts' | 'groups' | 'custom';
  customJids?: string[];
  delaySeconds: number;
  formatMode?: 'custom' | 'announcement';
  customMessage?: string;
  templateData?: {
    from: string;
    role: string;
    type: string;
    message: string;
  };
  forwardedManyTimes?: boolean;
}

export interface GroupActivityStats {
  groupId: string;
  groupName: string;
  messageCount: number;
  lastActive: string;
}

export interface UserCommandStats {
  userJid: string;
  phone: string;
  name?: string;
  totalCommands: number;
  commandBreakdown: {
    rvo: number;
    swgc: number;
    delswgc: number;
    ghost: number;
    promote: number;
    demote: number;
    broadcast: number;
    other: number;
  };
  lastUsed: string;
}

export interface UserChatStats {
  userJid: string;
  phone: string;
  name?: string;
  totalMessages: number;
  groupMessages: number;
  privateMessages: number;
  lastActive: string;
}

export interface TimeSeriesAnalytics {
  daily: Record<string, number>;
  monthly: Record<string, number>;
  yearly: Record<string, number>;
}

export interface AnalyticsData {
  totalMessagesTracked: number;
  totalCommandsTracked: number;
  groupActivity: Record<string, GroupActivityStats>;
  userActivity: Record<string, UserCommandStats>;
  userChatActivity?: Record<string, UserChatStats>;
  timeSeries?: TimeSeriesAnalytics;
  commandCounts: {
    rvo: number;
    swgc: number;
    delswgc: number;
    ghost: number;
    promote: number;
    demote: number;
    broadcast: number;
  };
}

export interface ActiveGroupStory {
  id: string;
  type: 'text' | 'image' | 'video';
  snippet: string;
  colorName?: string;
  targetCount: number;
  createdAt: number;
}

export interface AppSettings {
  defaultDelaySeconds: number;
  announcementTemplate: {
    defaultFrom: string;
    defaultRole: string;
    defaultType: string;
  };
  autoSync: boolean;
}

export interface ActivityLog {
  id: string;
  timestamp: string;
  type: 'system' | 'bot' | 'broadcast' | 'rvo' | 'swgc' | 'danger';
  message: string;
}

export interface AppStats {
  totalBroadcasts: number;
  rvoProcessed: number;
  groupStatusSent: number;
  lastSync: string | null;
}

export interface SavedAccountSession {
  id: string;
  name: string;
  phone?: string;
  jid?: string;
  botName?: string;
  avatarUrl?: string | null;
  createdAt: string;
  lastActive: string;
  isActive: boolean;
  status: 'connected' | 'disconnected' | 'connecting' | 'qr_ready';
  botEnabled?: boolean;
}

export interface SystemStatus {
  status: 'disconnected' | 'connecting' | 'qr_ready' | 'syncing' | 'connected';
  syncProgress: number;
  syncStatusText: string;
  qrDataUrl: string | null;
  pairingCode: string | null;
  botUser: {
    id: string;
    name: string;
    phone: string;
    avatarUrl: string | null;
  } | null;
  counts: {
    groups: number;
    contacts: number;
    admins: number;
  };
  stats: AppStats;
  botName: string;
  sessions: SavedAccountSession[];
  activeSessionId: string;
  globalBotEnabled?: boolean;
}
