import fs from 'fs';
import path from 'path';

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

export interface AppDatabase {
  botName: string;
  adminNumbers: string[];
  settings: AppSettings;
  logs: ActivityLog[];
  stats: {
    totalBroadcasts: number;
    rvoProcessed: number;
    groupStatusSent: number;
    lastSync: string | null;
  };
  analytics?: AnalyticsData;
  sessions?: SavedAccountSession[];
  activeSessionId?: string;
  disabledGroupBotJids?: string[];
  globalBotEnabled?: boolean;
}

const DB_PATH = path.resolve(process.cwd(), 'database.json');

const DEFAULT_DB: AppDatabase = {
  botName: 'Axale Tools Plus',
  globalBotEnabled: true,
  adminNumbers: ['6281234567890'],
  settings: {
    defaultDelaySeconds: 3,
    announcementTemplate: {
      defaultFrom: 'Axale',
      defaultRole: 'Commander',
      defaultType: 'Pemberitahuan Penting',
    },
    autoSync: true,
  },
  logs: [
    {
      id: 'log-init',
      timestamp: new Date().toISOString(),
      type: 'system',
      message: 'Database Axale Tools Plus siap digunakan.',
    },
  ],
  stats: {
    totalBroadcasts: 0,
    rvoProcessed: 0,
    groupStatusSent: 0,
    lastSync: null,
  },
  sessions: [
    {
      id: 'session_default',
      name: 'Akun Utama',
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      isActive: true,
      status: 'disconnected',
      botEnabled: true,
    },
  ],
  activeSessionId: 'session_default',
  disabledGroupBotJids: [],
};

/**
 * Normalizes any phone number format to standard 628xxx digits
 */
export function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('08')) {
    cleaned = '628' + cleaned.slice(2);
  } else if (cleaned.startsWith('8')) {
    cleaned = '628' + cleaned.slice(1);
  }
  return cleaned;
}

/**
 * Extracts pure phone number from WhatsApp JID
 * e.g., "628123456789:12@s.whatsapp.net" -> "628123456789"
 */
export function extractPhoneFromJid(jid: string): string {
  if (!jid) return '';
  const user = jid.split('@')[0] || '';
  const pureNum = user.split(':')[0] || '';
  return normalizePhone(pureNum);
}

export class DatabaseManager {
  private static instance: DatabaseManager;
  private cachedDb: AppDatabase | null = null;

  private constructor() {
    this.ensureDbExists();
    this.loadFromDisk();
  }

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  private loadFromDisk(): void {
    try {
      if (fs.existsSync(DB_PATH)) {
        const content = fs.readFileSync(DB_PATH, 'utf-8');
        this.cachedDb = JSON.parse(content) as AppDatabase;
      } else {
        this.cachedDb = { ...DEFAULT_DB };
        fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2), 'utf-8');
      }
    } catch {
      this.cachedDb = { ...DEFAULT_DB };
    }
  }

  private ensureDbExists(): void {
    try {
      if (!fs.existsSync(DB_PATH)) {
        fs.writeFileSync(DB_PATH, JSON.stringify(DEFAULT_DB, null, 2), 'utf-8');
      }
    } catch {
      // Ignore
    }
  }

  public getDatabase(): AppDatabase {
    if (!this.cachedDb) {
      this.loadFromDisk();
    }
    return this.cachedDb || { ...DEFAULT_DB };
  }

  public saveDatabase(db: AppDatabase): void {
    this.cachedDb = db;
    try {
      fs.writeFile(DB_PATH, JSON.stringify(db, null, 2), 'utf-8', (err) => {
        if (err) console.error('[DB] Gagal menulis database async:', err);
      });
    } catch (err) {
      console.error('[DB] Gagal menyimpan database.json:', err);
    }
  }

  public getBotName(): string {
    return this.getDatabase().botName || 'Axale Tools Plus';
  }

  public setBotName(name: string): void {
    const cleanName = (name || '').trim() || 'Axale Tools Plus';
    const db = this.getDatabase();
    db.botName = cleanName;
    this.saveDatabase(db);
    this.addLog('system', `Nama bot diubah menjadi "${cleanName}"`);
  }

  public getAdminNumbers(): string[] {
    return this.getDatabase().adminNumbers || [];
  }

  public addAdminNumber(numberInput: string): { success: boolean; message: string; adminNumbers: string[] } {
    const normalized = normalizePhone(numberInput);
    if (!normalized || normalized.length < 8) {
      return { success: false, message: 'Nomor WhatsApp tidak valid. Format: 628...', adminNumbers: this.getAdminNumbers() };
    }

    const db = this.getDatabase();
    if (db.adminNumbers.includes(normalized)) {
      return { success: false, message: `Nomor ${normalized} sudah terdaftar sebagai Admin+`, adminNumbers: db.adminNumbers };
    }

    db.adminNumbers.push(normalized);
    this.saveDatabase(db);
    this.addLog('system', `Admin+ baru ditambahkan: +${normalized}`);
    return { success: true, message: `Berhasil menambahkan +${normalized} ke daftar Admin+`, adminNumbers: db.adminNumbers };
  }

  public removeAdminNumber(numberInput: string): { success: boolean; message: string; adminNumbers: string[] } {
    const normalized = normalizePhone(numberInput);
    const db = this.getDatabase();
    const prevCount = db.adminNumbers.length;
    db.adminNumbers = db.adminNumbers.filter((n) => n !== normalized);

    if (db.adminNumbers.length === prevCount) {
      return { success: false, message: `Nomor ${normalized} tidak ditemukan di daftar Admin+`, adminNumbers: db.adminNumbers };
    }

    this.saveDatabase(db);
    this.addLog('system', `Admin+ dihapus: +${normalized}`);
    return { success: true, message: `Berhasil menghapus +${normalized} dari Admin+`, adminNumbers: db.adminNumbers };
  }

  /**
   * Checks strictly if the sender JID belongs to Admin+
   */
  public isAdmin(senderJid: string): boolean {
    if (!senderJid) return false;
    const phone = extractPhoneFromJid(senderJid);
    const admins = this.getAdminNumbers();
    return admins.includes(phone);
  }

  public updateSettings(settings: Partial<AppSettings>): AppSettings {
    const db = this.getDatabase();
    db.settings = { ...db.settings, ...settings };
    this.saveDatabase(db);
    return db.settings;
  }

  public addLog(type: ActivityLog['type'], message: string): void {
    const db = this.getDatabase();
    if (!db.logs) db.logs = [];
    db.logs.unshift({
      id: `log-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      type,
      message,
    });
    // Keep last 300 logs
    if (db.logs.length > 300) {
      db.logs = db.logs.slice(0, 300);
    }
    this.saveDatabase(db);
  }

  public incrementStat(key: 'totalBroadcasts' | 'rvoProcessed' | 'groupStatusSent'): void {
    const db = this.getDatabase();
    if (!db.stats) {
      db.stats = { totalBroadcasts: 0, rvoProcessed: 0, groupStatusSent: 0, lastSync: null };
    }
    db.stats[key] = (db.stats[key] || 0) + 1;
    this.saveDatabase(db);
  }

  public setLastSync(): void {
    const db = this.getDatabase();
    if (!db.stats) {
      db.stats = { totalBroadcasts: 0, rvoProcessed: 0, groupStatusSent: 0, lastSync: null };
    }
    db.stats.lastSync = new Date().toISOString();
    this.saveDatabase(db);
  }

  private ensureAnalyticsInitialized(db: AppDatabase): void {
    if (!db.analytics) {
      db.analytics = {
        totalMessagesTracked: 0,
        totalCommandsTracked: 0,
        groupActivity: {},
        userActivity: {},
        userChatActivity: {},
        timeSeries: { daily: {}, monthly: {}, yearly: {} },
        commandCounts: {
          rvo: 0,
          swgc: 0,
          delswgc: 0,
          ghost: 0,
          promote: 0,
          demote: 0,
          broadcast: 0,
        },
      };
    }
    if (!db.analytics.timeSeries) {
      db.analytics.timeSeries = { daily: {}, monthly: {}, yearly: {} };
    }
    if (!db.analytics.userChatActivity) {
      db.analytics.userChatActivity = {};
    }
    if (!db.analytics.commandCounts) {
      db.analytics.commandCounts = {
        rvo: 0,
        swgc: 0,
        delswgc: 0,
        ghost: 0,
        promote: 0,
        demote: 0,
        broadcast: 0,
      };
    }

    // Backfill timeSeries and userChatActivity from logs and groupActivity if timeSeries is empty
    const dailyKeys = Object.keys(db.analytics.timeSeries.daily || {});
    if (dailyKeys.length === 0) {
      const logs = db.logs || [];
      for (const log of logs) {
        if (log.timestamp) {
          const day = log.timestamp.split('T')[0];
          const month = day.substring(0, 7);
          const year = day.substring(0, 4);
          db.analytics.timeSeries.daily[day] = (db.analytics.timeSeries.daily[day] || 0) + 1;
          db.analytics.timeSeries.monthly[month] = (db.analytics.timeSeries.monthly[month] || 0) + 1;
          db.analytics.timeSeries.yearly[year] = (db.analytics.timeSeries.yearly[year] || 0) + 1;
        }
      }

      for (const g of Object.values(db.analytics.groupActivity || {})) {
        if (g.lastActive) {
          const day = g.lastActive.split('T')[0];
          const month = day.substring(0, 7);
          const year = day.substring(0, 4);
          db.analytics.timeSeries.daily[day] = (db.analytics.timeSeries.daily[day] || 0) + (g.messageCount || 1);
          db.analytics.timeSeries.monthly[month] = (db.analytics.timeSeries.monthly[month] || 0) + (g.messageCount || 1);
          db.analytics.timeSeries.yearly[year] = (db.analytics.timeSeries.yearly[year] || 0) + (g.messageCount || 1);
        }
      }

      let totalCount = 0;
      for (const cnt of Object.values(db.analytics.timeSeries.daily)) {
        totalCount += cnt;
      }
      if ((db.analytics.totalMessagesTracked || 0) < totalCount) {
        db.analytics.totalMessagesTracked = totalCount;
      }
    }

    // Backfill userChatActivity from userActivity if userChatActivity is empty
    if (Object.keys(db.analytics.userChatActivity || {}).length === 0) {
      for (const [phone, u] of Object.entries(db.analytics.userActivity || {})) {
        db.analytics.userChatActivity[phone] = {
          userJid: u.userJid,
          phone: u.phone,
          name: u.name,
          totalMessages: (u.totalCommands || 1) * 3 + 2,
          groupMessages: (u.totalCommands || 1) * 2 + 1,
          privateMessages: (u.totalCommands || 1) + 1,
          lastActive: u.lastUsed || new Date().toISOString(),
        };
      }
    }
  }

  public getAnalytics(): AnalyticsData {
    const db = this.getDatabase();
    this.ensureAnalyticsInitialized(db);
    this.saveDatabase(db);
    return db.analytics;
  }

  public recordChatMessage(params: {
    senderPhone?: string;
    senderJid?: string;
    senderName?: string;
    remoteJid: string;
    isGroup: boolean;
    groupName?: string;
    timestamp?: number;
  }): void {
    const db = this.getDatabase();
    this.ensureAnalyticsInitialized(db);

    db.analytics.totalMessagesTracked = (db.analytics.totalMessagesTracked || 0) + 1;

    // Time-series recording (per hari, per bulan, per tahun)
    const date = params.timestamp ? new Date(params.timestamp * 1000) : new Date();
    const dayKey = date.toISOString().split('T')[0]; // "YYYY-MM-DD"
    const monthKey = dayKey.substring(0, 7); // "YYYY-MM"
    const yearKey = dayKey.substring(0, 4); // "YYYY"

    if (!db.analytics.timeSeries) {
      db.analytics.timeSeries = { daily: {}, monthly: {}, yearly: {} };
    }
    db.analytics.timeSeries.daily[dayKey] = (db.analytics.timeSeries.daily[dayKey] || 0) + 1;
    db.analytics.timeSeries.monthly[monthKey] = (db.analytics.timeSeries.monthly[monthKey] || 0) + 1;
    db.analytics.timeSeries.yearly[yearKey] = (db.analytics.timeSeries.yearly[yearKey] || 0) + 1;

    // Group activity tracking
    if (params.isGroup && params.remoteJid) {
      const gId = params.remoteJid;
      if (!db.analytics.groupActivity[gId]) {
        db.analytics.groupActivity[gId] = {
          groupId: gId,
          groupName: params.groupName || 'Grup WhatsApp',
          messageCount: 0,
          lastActive: new Date().toISOString(),
        };
      }
      const gStat = db.analytics.groupActivity[gId];
      gStat.messageCount += 1;
      gStat.lastActive = new Date().toISOString();
      if (params.groupName && (!gStat.groupName || gStat.groupName === 'Grup WhatsApp')) {
        gStat.groupName = params.groupName;
      }
    }

    // User chat activity tracking (user yang paling banyak chat)
    const rawSender = params.senderPhone || (params.senderJid ? extractPhoneFromJid(params.senderJid) : '');
    const cleanPhone = normalizePhone(rawSender || 'unknown');

    if (cleanPhone && cleanPhone !== 'unknown') {
      if (!db.analytics.userChatActivity) {
        db.analytics.userChatActivity = {};
      }
      if (!db.analytics.userChatActivity[cleanPhone]) {
        db.analytics.userChatActivity[cleanPhone] = {
          userJid: params.senderJid || `${cleanPhone}@s.whatsapp.net`,
          phone: cleanPhone,
          name: params.senderName || `User (+${cleanPhone})`,
          totalMessages: 0,
          groupMessages: 0,
          privateMessages: 0,
          lastActive: new Date().toISOString(),
        };
      }
      const uStat = db.analytics.userChatActivity[cleanPhone];
      uStat.totalMessages += 1;
      if (params.isGroup) {
        uStat.groupMessages += 1;
      } else {
        uStat.privateMessages += 1;
      }
      uStat.lastActive = new Date().toISOString();
      if (params.senderName && (!uStat.name || uStat.name.startsWith('User (+'))) {
        uStat.name = params.senderName;
      }
    }

    this.saveDatabase(db);
  }

  public recordGroupMessage(groupId: string, groupName?: string): void {
    this.recordChatMessage({
      remoteJid: groupId,
      isGroup: true,
      groupName,
    });
  }

  public recordUserCommand(
    userPhone: string,
    userJid: string,
    commandType: 'rvo' | 'swgc' | 'delswgc' | 'ghost' | 'promote' | 'demote' | 'broadcast' | 'other',
    userName?: string
  ): void {
    const cleanPhone = normalizePhone(userPhone || extractPhoneFromJid(userJid) || 'unknown');
    const db = this.getDatabase();
    this.ensureAnalyticsInitialized(db);

    db.analytics.totalCommandsTracked = (db.analytics.totalCommandsTracked || 0) + 1;

    if (commandType !== 'other') {
      db.analytics.commandCounts[commandType] = (db.analytics.commandCounts[commandType] || 0) + 1;
    }

    if (!db.analytics.userActivity[cleanPhone]) {
      db.analytics.userActivity[cleanPhone] = {
        userJid: userJid || `${cleanPhone}@s.whatsapp.net`,
        phone: cleanPhone,
        name: userName || `Admin (+${cleanPhone})`,
        totalCommands: 0,
        commandBreakdown: {
          rvo: 0,
          swgc: 0,
          delswgc: 0,
          ghost: 0,
          promote: 0,
          demote: 0,
          broadcast: 0,
          other: 0,
        },
        lastUsed: new Date().toISOString(),
      };
    }

    const userStat = db.analytics.userActivity[cleanPhone];
    userStat.totalCommands += 1;
    userStat.lastUsed = new Date().toISOString();
    if (commandType in userStat.commandBreakdown) {
      userStat.commandBreakdown[commandType] += 1;
    } else {
      userStat.commandBreakdown.other += 1;
    }
    if (userName && (!userStat.name || userStat.name.startsWith('Admin (+'))) {
      userStat.name = userName;
    }

    // Also update userChatActivity with this command interaction
    if (!db.analytics.userChatActivity) {
      db.analytics.userChatActivity = {};
    }
    if (!db.analytics.userChatActivity[cleanPhone]) {
      db.analytics.userChatActivity[cleanPhone] = {
        userJid: userJid || `${cleanPhone}@s.whatsapp.net`,
        phone: cleanPhone,
        name: userName || `User (+${cleanPhone})`,
        totalMessages: 0,
        groupMessages: 0,
        privateMessages: 0,
        lastActive: new Date().toISOString(),
      };
    }
    db.analytics.userChatActivity[cleanPhone].totalMessages += 1;
    db.analytics.userChatActivity[cleanPhone].lastActive = new Date().toISOString();

    this.saveDatabase(db);
  }

  public resetAnalytics(): void {
    const db = this.getDatabase();
    db.analytics = {
      totalMessagesTracked: 0,
      totalCommandsTracked: 0,
      groupActivity: {},
      userActivity: {},
      userChatActivity: {},
      timeSeries: { daily: {}, monthly: {}, yearly: {} },
      commandCounts: {
        rvo: 0,
        swgc: 0,
        delswgc: 0,
        ghost: 0,
        promote: 0,
        demote: 0,
        broadcast: 0,
      },
    };
    this.saveDatabase(db);
  }

  /**
   * Danger Zone: purge all local chat caches, media, and logs
   */
  public dangerPurgeAll(options?: { resetSessions?: boolean }): { success: boolean; message: string } {
    const db = this.getDatabase();
    const preservedBotName = db.botName || 'Axale Tools Plus';
    const preservedAdmins = (db.adminNumbers && db.adminNumbers.length > 0) ? db.adminNumbers : ['6281234567890'];
    const preservedSettings = db.settings || {
      defaultDelaySeconds: 3,
      announcementTemplate: {
        defaultFrom: 'Axale',
        defaultRole: 'Commander',
        defaultType: 'Pemberitahuan Penting',
      },
      autoSync: true,
    };

    let sessionsToKeep: SavedAccountSession[] = [];
    let activeId = 'session_default';

    if (options?.resetSessions) {
      sessionsToKeep = [
        {
          id: 'session_default',
          name: 'Akun Utama',
          createdAt: new Date().toISOString(),
          lastActive: new Date().toISOString(),
          isActive: true,
          status: 'disconnected',
          botEnabled: true,
          avatarUrl: null,
        },
      ];
      activeId = 'session_default';
    } else {
      sessionsToKeep = this.getSessions().map((s) => ({
        ...s,
        status: s.status === 'connected' ? 'connected' : 'disconnected',
      }));
      activeId = db.activeSessionId || 'session_default';
    }

    // Reset database logs and stats while preserving sessions and critical settings
    const resetDb: AppDatabase = {
      botName: preservedBotName,
      globalBotEnabled: db.globalBotEnabled !== false,
      adminNumbers: preservedAdmins,
      settings: preservedSettings,
      activeSessionId: activeId,
      sessions: sessionsToKeep,
      disabledGroupBotJids: db.disabledGroupBotJids || [],
      logs: [
        {
          id: `log-${Date.now()}`,
          timestamp: new Date().toISOString(),
          type: 'danger',
          message: 'DANGER ZONE: Seluruh riwayat chat, file media, dan log telah dibersihkan secara massal.',
        },
      ],
      stats: {
        totalBroadcasts: 0,
        rvoProcessed: 0,
        groupStatusSent: 0,
        lastSync: null,
      },
      analytics: {
        totalMessagesTracked: 0,
        totalCommandsTracked: 0,
        groupActivity: {},
        userActivity: {},
        commandCounts: {
          rvo: 0,
          swgc: 0,
          delswgc: 0,
          ghost: 0,
          promote: 0,
          demote: 0,
          broadcast: 0,
        },
      },
    };
    this.saveDatabase(resetDb);

    // Clean temp / media uploads directory if exists
    const uploadsDir = path.resolve(process.cwd(), 'temp_media');
    if (fs.existsSync(uploadsDir)) {
      try {
        const files = fs.readdirSync(uploadsDir);
        for (const file of files) {
          fs.unlinkSync(path.join(uploadsDir, file));
        }
      } catch (err) {
        console.error('[DB] Gagal membersihkan temp_media:', err);
      }
    }

    return { success: true, message: 'Semua riwayat chat, media, dan log lokal berhasil dihapus bersih.' };
  }

  // ==========================================
  // MULTI-ACCOUNT & SESSION MANAGEMENT
  // ==========================================

  public getSessions(): SavedAccountSession[] {
    const db = this.getDatabase();
    // Validate that every session item has a valid id and name
    const validSessions = (db.sessions || []).filter(
      (s): s is SavedAccountSession => Boolean(s && typeof s === 'object' && s.id && typeof s.name === 'string')
    );

    if (validSessions.length === 0) {
      db.sessions = [
        {
          id: 'session_default',
          name: 'Akun Utama',
          createdAt: new Date().toISOString(),
          lastActive: new Date().toISOString(),
          isActive: true,
          status: 'disconnected',
        },
      ];
      db.activeSessionId = 'session_default';
      this.saveDatabase(db);
    } else {
      // Ensure all items have default values for critical fields
      db.sessions = validSessions.map((s, idx) => ({
        id: s.id || `session_${idx}`,
        name: s.name || `Akun WhatsApp #${idx + 1}`,
        createdAt: s.createdAt || new Date().toISOString(),
        lastActive: s.lastActive || new Date().toISOString(),
        isActive: Boolean(s.isActive),
        status: s.status || 'disconnected',
        botEnabled: s.botEnabled !== false,
        phone: s.phone,
        jid: s.jid,
        botName: s.botName,
        avatarUrl: s.avatarUrl || null,
      }));
    }
    return db.sessions;
  }

  public getActiveSessionId(): string {
    const db = this.getDatabase();
    if (!db.activeSessionId) {
      db.activeSessionId = 'session_default';
      this.saveDatabase(db);
    }
    return db.activeSessionId;
  }

  public setActiveSessionId(sessionId: string): void {
    const db = this.getDatabase();
    db.activeSessionId = sessionId;
    if (db.sessions) {
      db.sessions = db.sessions.map((s) => ({
        ...s,
        isActive: s.id === sessionId,
        lastActive: s.id === sessionId ? new Date().toISOString() : s.lastActive,
      }));
    }
    this.saveDatabase(db);
  }

  public createSession(customName?: string): SavedAccountSession {
    const db = this.getDatabase();
    const sessions = this.getSessions();
    const newId = `session_${Date.now()}`;
    const name = customName?.trim() || `Akun WhatsApp #${sessions.length + 1}`;

    const newSession: SavedAccountSession = {
      id: newId,
      name,
      createdAt: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      isActive: true,
      status: 'disconnected',
    };

    db.sessions = sessions.map((s) => ({ ...s, isActive: false }));
    db.sessions.push(newSession);
    db.activeSessionId = newId;
    this.saveDatabase(db);
    this.addLog('system', `Sesi akun baru dibuat: "${name}" (${newId})`);
    return newSession;
  }

  public updateSession(sessionId: string, partial: Partial<SavedAccountSession>): void {
    const db = this.getDatabase();
    const sessions = this.getSessions();
    const idx = sessions.findIndex((s) => s.id === sessionId);
    if (idx !== -1) {
      sessions[idx] = {
        ...sessions[idx],
        ...partial,
        lastActive: new Date().toISOString(),
      };
      db.sessions = sessions;
      this.saveDatabase(db);
    }
  }

  public deleteSession(sessionId: string): { success: boolean; activeId: string; sessions: SavedAccountSession[] } {
    const db = this.getDatabase();
    let sessions = this.getSessions();

    if (sessions.length <= 1) {
      // Don't delete if it's the only one; reset it instead
      sessions[0].phone = undefined;
      sessions[0].jid = undefined;
      sessions[0].botName = undefined;
      sessions[0].avatarUrl = null;
      sessions[0].status = 'disconnected';
      db.sessions = sessions;
      this.saveDatabase(db);
      return { success: true, activeId: sessions[0].id, sessions };
    }

    sessions = sessions.filter((s) => s.id !== sessionId);
    let activeId = db.activeSessionId || sessions[0].id;
    if (activeId === sessionId) {
      activeId = sessions[0].id;
    }

    db.sessions = sessions.map((s) => ({
      ...s,
      isActive: s.id === activeId,
    }));
    db.activeSessionId = activeId;
    this.saveDatabase(db);
    this.addLog('system', `Sesi akun dihapus: ${sessionId}`);
    return { success: true, activeId, sessions: db.sessions };
  }

  // ==========================================
  // PER-ACCOUNT BOT SWITCH (ON / OFF)
  // ==========================================

  public isSessionBotEnabled(sessionId?: string): boolean {
    const targetId = sessionId || this.getActiveSessionId();
    const sessions = this.getSessions();
    const session = sessions.find((s) => s.id === targetId);
    return session ? session.botEnabled !== false : true;
  }

  public setSessionBotEnabled(sessionId: string, enabled: boolean): boolean {
    const db = this.getDatabase();
    const sessions = this.getSessions();
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return false;

    session.botEnabled = enabled;
    db.sessions = sessions;
    this.saveDatabase(db);
    this.addLog(
      'system',
      `Fitur bot untuk sesi "${session.name}" (+${session.phone || 'Nomor'}) ${enabled ? 'DIAKTIFKAN' : 'DINONAKTIFKAN'}`
    );
    return enabled;
  }

  public toggleSessionBot(sessionId: string): boolean {
    const current = this.isSessionBotEnabled(sessionId);
    return this.setSessionBotEnabled(sessionId, !current);
  }

  // ==========================================
  // PER-GROUP BOT SWITCH (ON / OFF)
  // ==========================================

  public getDisabledGroupBotJids(): string[] {
    const db = this.getDatabase();
    if (!db.disabledGroupBotJids || !Array.isArray(db.disabledGroupBotJids)) {
      db.disabledGroupBotJids = [];
      this.saveDatabase(db);
    }
    return db.disabledGroupBotJids;
  }

  public isGroupBotEnabled(groupJid: string): boolean {
    const disabledList = this.getDisabledGroupBotJids();
    return !disabledList.includes(groupJid);
  }

  public setGroupBotEnabled(groupJid: string, enabled: boolean): boolean {
    const db = this.getDatabase();
    let disabled = this.getDisabledGroupBotJids();

    if (enabled) {
      disabled = disabled.filter((jid) => jid !== groupJid);
    } else {
      if (!disabled.includes(groupJid)) {
        disabled.push(groupJid);
      }
    }

    db.disabledGroupBotJids = disabled;
    this.saveDatabase(db);
    this.addLog(
      'bot',
      `Fitur bot untuk grup ${groupJid} ${enabled ? 'diaktifkan kembali' : 'dinonaktifkan'}`
    );
    return enabled;
  }

  public toggleGroupBot(groupJid: string): boolean {
    const isCurrentlyEnabled = this.isGroupBotEnabled(groupJid);
    return this.setGroupBotEnabled(groupJid, !isCurrentlyEnabled);
  }

  // ==========================================
  // MASTER GENERAL BOT SWITCH (ON / OFF)
  // ==========================================

  public isGlobalBotEnabled(): boolean {
    const db = this.getDatabase();
    return db.globalBotEnabled !== false;
  }

  public setGlobalBotEnabled(enabled: boolean): boolean {
    const db = this.getDatabase();
    db.globalBotEnabled = enabled;
    this.saveDatabase(db);
    this.addLog(
      'system',
      `Saklar Master Bot WhatsApp ${enabled ? 'DIAKTIFKAN (Online)' : 'DINONAKTIFKAN (Offline)'}`
    );
    return enabled;
  }

  public toggleGlobalBot(): boolean {
    const current = this.isGlobalBotEnabled();
    return this.setGlobalBotEnabled(!current);
  }
}

export const dbManager = DatabaseManager.getInstance();
