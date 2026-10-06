import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  proto,
  WAMessage,
  bytesToCrockford,
} from '@skycodee/baileys';
import crypto from 'crypto';
import pino from 'pino';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { dbManager, extractPhoneFromJid, normalizePhone } from './db.ts';
import { resolveSwgcColor, SWGC_COLOR_PRESETS } from './swgcColors.ts';

export interface WAContact {
  id: string; // JID
  name: string;
  phone: string;
  avatarUrl: string | null;
}

export interface WAGroup {
  id: string; // JID
  subject: string;
  size: number;
  creation?: number;
  botRole: 'superadmin' | 'admin' | 'member';
  avatarUrl: string | null;
  admins: string[];
}

export interface BroadcastPayload {
  targetType: 'all' | 'contacts' | 'groups' | 'custom';
  customJids?: string[];
  delaySeconds: number;
  formatMode?: 'custom' | 'announcement';
  customMessage?: string;
  forwardedManyTimes?: boolean;
  templateData?: {
    from: string;
    role: string;
    type: string;
    message: string;
  };
}

export interface BroadcastProgress {
  id: string;
  isRunning: boolean;
  total: number;
  sent: number;
  failed: number;
  currentTarget?: string;
  isCompleted: boolean;
  failedTargets?: { jid: string; reason: string }[];
}

export interface ActiveGroupStory {
  id: string;
  type: 'text' | 'image' | 'video';
  snippet: string;
  colorName?: string;
  targetCount: number;
  createdAt: number;
  keys: { remoteJid: string; fromMe: boolean; id: string; participant?: string }[];
}

export interface TrackedMessageReader {
  phone: string;
  name: string;
  readAt: number;
}

export interface TrackedEditHistory {
  text: string;
  editedAt: number;
}

export interface TrackedMessage {
  id: string;
  remoteJid: string;
  senderJid: string;
  senderPhone: string;
  senderName: string;
  text: string;
  mediaType: 'image' | 'video' | 'audio' | 'sticker' | 'document' | 'text' | null;
  mediaCaption: string;
  mediaBuffer?: Buffer | null;
  createdAt: number;
  readBy: TrackedMessageReader[];
  isDeleted: boolean;
  deletedAt: number | null;
  isEdited?: boolean;
  editHistory?: TrackedEditHistory[];
}

export function formatWib(timestamp: number): string {
  const d = new Date(timestamp);
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const wib = new Date(utc + (3600000 * 7));
  const day = String(wib.getDate()).padStart(2, '0');
  const month = String(wib.getMonth() + 1).padStart(2, '0');
  const year = wib.getFullYear();
  const hours = String(wib.getHours()).padStart(2, '0');
  const mins = String(wib.getMinutes()).padStart(2, '0');
  const secs = String(wib.getSeconds()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${mins}:${secs}`;
}

export class WhatsAppService {
  private static instance: WhatsAppService;
  public sock: any = null;
  private authFolder: string;
  public currentSessionId: string = 'session_default';
  public pairingCode: string | null = null;
  public status: 'disconnected' | 'connecting' | 'qr_ready' | 'syncing' | 'connected' = 'disconnected';
  public qrDataUrl: string | null = null;
  public qrRaw: string | null = null;
  public syncProgress = 0;
  public syncStatusText = 'Belum terhubung';
  public botUser: { id: string; name: string; phone: string; avatarUrl: string | null } | null = null;

  public groups: Map<string, WAGroup> = new Map();
  public contacts: Map<string, WAContact> = new Map();
  public activeGroupStories: ActiveGroupStory[] = [];
  public trackedMessagesMap: Map<string, TrackedMessage> = new Map();
  public deletedMessagesList: TrackedMessage[] = [];
  public editIdToTargetIdMap: Map<string, string> = new Map();

  private avatarCache: Map<string, { url: string | null; timestamp: number }> = new Map();
  private lidToPhoneMap: Map<string, string> = new Map();
  private recentProcessedMsgIds: Set<string> = new Set();

  public activeBroadcast: BroadcastProgress | null = null;
  private isIntentionalDisconnect = false;

  private lastGroupSyncTime = 0;
  private groupSyncPromise: Promise<void> | null = null;
  private groupSyncCooldownMs = 25000;

  public getSessionFolder(sessionId: string): string {
    const rootDir = path.resolve(process.cwd(), 'wa_sessions');
    if (!fs.existsSync(rootDir)) {
      fs.mkdirSync(rootDir, { recursive: true });
    }
    const sessionDir = path.join(rootDir, sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    return sessionDir;
  }

  public saveSessionCache(sessionId: string): void {
    try {
      const folder = this.getSessionFolder(sessionId);
      const cachePath = path.join(folder, 'session_cache.json');
      // Protect against saving empty state over an existing valid cache
      if (this.groups.size === 0 && this.contacts.size === 0 && fs.existsSync(cachePath)) {
        return;
      }
      const data = {
        sessionId,
        botUser: this.botUser,
        groups: Array.from(this.groups.values()),
        contacts: Array.from(this.contacts.values()),
        activeStories: this.activeGroupStories,
        savedAt: Date.now(),
      };
      fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.warn(`[WA Cache] Gagal menyimpan cache sesi ${sessionId}:`, err);
    }
  }

  public loadSessionCache(sessionId: string): boolean {
    // ALWAYS strictly purge memory so data from previous session never leaks!
    this.groups.clear();
    this.contacts.clear();
    this.activeGroupStories = [];
    this.avatarCache.clear();
    this.lidToPhoneMap.clear();
    this.editIdToTargetIdMap.clear();

    const sessInfo = dbManager.getSessions().find((s) => s.id === sessionId);
    if (sessInfo && sessInfo.phone) {
      this.botUser = {
        id: sessInfo.jid || `${sessInfo.phone}@s.whatsapp.net`,
        name: sessInfo.botName || sessInfo.name || 'WhatsApp Account',
        phone: sessInfo.phone,
        avatarUrl: sessInfo.avatarUrl || null,
      };
    } else {
      this.botUser = null;
    }

    try {
      const folder = this.getSessionFolder(sessionId);
      const cachePath = path.join(folder, 'session_cache.json');
      if (!fs.existsSync(cachePath)) {
        console.log(`[WA Cache] Belum ada file cache untuk sesi ${sessionId}. Memori dibersihkan.`);
        return false;
      }
      const raw = fs.readFileSync(cachePath, 'utf-8');
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.groups)) {
        for (const g of data.groups) {
          if (g && g.id) {
            this.groups.set(g.id, g);
          }
        }
      }
      if (data && Array.isArray(data.contacts)) {
        for (const c of data.contacts) {
          if (c && c.id) {
            this.contacts.set(c.id, c);
          }
        }
      }
      if (data && data.botUser) {
        this.botUser = data.botUser;
      }
      if (data && Array.isArray(data.activeStories)) {
        this.activeGroupStories = data.activeStories;
      }
      console.log(`[WA Cache] Cache sesi ${sessionId} berhasil dimuat: ${this.groups.size} grup, ${this.contacts.size} kontak.`);
      return true;
    } catch (err) {
      console.warn(`[WA Cache] Gagal membaca cache sesi ${sessionId}:`, err);
      return false;
    }
  }

  private constructor() {
    this.currentSessionId = dbManager.getActiveSessionId() || 'session_default';

    this.authFolder = this.getSessionFolder(this.currentSessionId);
    // Pre-hydrate cache from disk immediately to eliminate 0-group/0-contact lag
    this.loadSessionCache(this.currentSessionId);
  }

  public static getInstance(): WhatsAppService {
    if (!WhatsAppService.instance) {
      WhatsAppService.instance = new WhatsAppService();
    }
    return WhatsAppService.instance;
  }

  /**
   * Initialize WhatsApp Baileys connection
   */
  public async initConnection(options?: { force?: boolean; freshQr?: boolean }): Promise<void> {
    if (!options?.force && this.sock && (this.status === 'connected' || this.status === 'connecting' || this.status === 'syncing')) {
      return;
    }

    if (this.sock && (options?.force || options?.freshQr)) {
      this.isIntentionalDisconnect = true;
      try {
        (this.sock as any).ev?.removeAllListeners('connection.update');
        (this.sock as any).ws?.close();
        (this.sock as any).end(undefined);
      } catch {}
      this.sock = null;
      this.isIntentionalDisconnect = false;
    }

    this.authFolder = this.getSessionFolder(this.currentSessionId);
    const socketSessionId = this.currentSessionId;

    if (options?.freshQr) {
      try {
        if (fs.existsSync(this.authFolder)) {
          fs.rmSync(this.authFolder, { recursive: true, force: true });
          fs.mkdirSync(this.authFolder, { recursive: true });
        }
      } catch (cleanErr) {
        console.warn('[WA] Gagal membersihkan folder sesi untuk QR baru:', cleanErr);
      }
    }

    this.status = 'connecting';
    this.syncProgress = 5;
    this.syncStatusText = 'Menyiapkan modul autentikasi...';

    dbManager.updateSession(socketSessionId, {
      status: 'connecting',
    });

    try {
      const { state, saveCreds } = await useMultiFileAuthState(this.authFolder);

      const logger = pino({ level: 'silent' });

      // Initialize socket using @skycodee/baileys with Ubuntu Chrome browser (optimized for QR & Pairing)
      // @ts-ignore
      this.sock = makeWASocket({
        auth: state,
        logger,
        printQRInTerminal: false,
        browser: ['Ubuntu', 'Chrome', '22.04.4'],
        syncFullHistory: false, // Lightning-fast connection and zero backlog lag
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: false,
      });

      // Save credentials event
      (this.sock as any).ev.on('creds.update', () => {
        if (this.currentSessionId !== socketSessionId) return;
        saveCreds();
      });

      // Connection update event
      (this.sock as any).ev.on('connection.update', async (update: any) => {
        // If session switched to a different account, ignore all updates from this socket!
        if (this.currentSessionId !== socketSessionId) {
          return;
        }

        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          this.qrRaw = qr;
          try {
            this.qrDataUrl = await QRCode.toDataURL(qr, {
              margin: 1,
              width: 320,
              color: {
                dark: '#000000',
                light: '#ffffff',
              },
            });
            this.status = 'qr_ready';
            this.syncProgress = 10;
            this.syncStatusText = 'Scan QR Code atau gunakan Kode Pairing';

            dbManager.updateSession(socketSessionId, {
              status: 'qr_ready',
            });
          } catch (qrErr) {
            console.error('[WA] Gagal membuat QR data URL:', qrErr);
          }
        }

        if (connection === 'connecting') {
          this.status = 'connecting';
          this.syncProgress = 15;
          this.syncStatusText = 'Menghubungkan ke server WhatsApp...';
        }

        if (connection === 'open') {
          this.qrDataUrl = null;
          this.qrRaw = null;
          this.pairingCode = null;
          this.status = 'syncing';
          this.syncProgress = 30;
          this.syncStatusText = 'Berhasil login! Membaca profil dan chat...';

          try {
            // Get user information
            const user = (this.sock as any).user;
            const myJid = user?.id ? user.id.split(':')[0] + '@s.whatsapp.net' : '';
            const myPhone = extractPhoneFromJid(myJid);
            const myName = user?.name || dbManager.getBotName();

            let myAvatar: string | null = null;
            try {
              myAvatar = await this.getRealAvatar(myJid);
            } catch {
              myAvatar = null;
            }

            this.botUser = {
              id: myJid,
              name: myName,
              phone: myPhone,
              avatarUrl: myAvatar,
            };

            dbManager.updateSession(socketSessionId, {
              status: 'connected',
              phone: myPhone,
              jid: myJid,
              botName: myName,
              avatarUrl: myAvatar,
            });

            dbManager.addLog('system', `WhatsApp terhubung sebagai ${myName} (+${myPhone}) [Sesi: ${socketSessionId}]`);

            // Automatically ensure the connected bot's phone is also in adminNumbers
            if (myPhone) {
              const currentAdmins = dbManager.getAdminNumbers();
              if (!currentAdmins.includes(myPhone)) {
                dbManager.addAdminNumber(myPhone);
              }
            }

            // Start full sync with progress reporting
            await this.performFullSync();
          } catch (syncErr) {
            console.error('[WA] Kesalahan saat sinkronisasi profil:', syncErr);
            this.status = 'connected';
            this.syncProgress = 100;
            this.syncStatusText = 'Terhubung!';
          }
        }

        if (connection === 'close') {
          if (this.currentSessionId !== socketSessionId) {
            return;
          }

          const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
          const isSessionRevoked =
            statusCode === DisconnectReason.loggedOut ||
            statusCode === 401 ||
            statusCode === 403;
          const shouldReconnect = !isSessionRevoked && !this.isIntentionalDisconnect;

          this.status = 'disconnected';
          this.qrDataUrl = null;
          this.syncProgress = 0;
          this.syncStatusText = isSessionRevoked
            ? 'Sesi telah keluar/kadaluarsa. Silakan muat QR code untuk login ulang.'
            : 'Koneksi terputus';
          this.botUser = null;

          if (isSessionRevoked) {
            // WhatsApp rejected the tokens. Wipe corrupted/expired tokens from session folder so user can login cleanly!
            try {
              if (fs.existsSync(this.authFolder)) {
                fs.rmSync(this.authFolder, { recursive: true, force: true });
                fs.mkdirSync(this.authFolder, { recursive: true });
              }
            } catch (e) {
              console.warn('[WA] Gagal membersihkan folder sesi kadaluarsa:', e);
            }
          }

          dbManager.updateSession(socketSessionId, {
            status: 'disconnected',
            ...(isSessionRevoked ? { phone: undefined, jid: undefined, avatarUrl: null } : {}),
          });

          dbManager.addLog(
            'system',
            `Koneksi WA terputus: kode status ${statusCode || 'unknown'} [Sesi: ${socketSessionId}]${
              isSessionRevoked ? ' - Sesi dibersihkan untuk login ulang.' : ''
            }`
          );

          if (shouldReconnect && this.currentSessionId === socketSessionId) {
            setTimeout(() => {
              if (this.currentSessionId === socketSessionId) {
                this.initConnection();
              }
            }, 3000);
          }
        }
      });

      // Handle incoming messages for Anti-Delete (.ghost) & Admin+ Commands with ZERO latency
      (this.sock as any).ev.on('messages.upsert', (chatUpdate: any) => {
        if (this.currentSessionId !== socketSessionId) return;
        try {
          if (!chatUpdate.messages || !Array.isArray(chatUpdate.messages)) return;

          // Dispatch all incoming messages concurrently without serial waiting
          for (const msg of chatUpdate.messages) {
            const participant = msg.key?.participant || (msg as any)?.participant;
            const participantAlt = (msg.key as any)?.participantAlt || (msg as any)?.authorPn;
            if (participant && participantAlt) {
              this.lidToPhoneMap.set(participant, participantAlt);
            }

            // Track message for .ghost (anti-delete logging)
            this.trackIncomingMessage(msg).catch((tErr) => {
              console.warn('[Anti-Delete Track Error]:', tErr?.message || tErr);
            });

            this.handleIncomingMessage(msg).catch((err) => {
              console.error('[WA] Fast command error:', err?.message || err);
            });
          }
        } catch (err) {
          console.error('[WA] Error memproses incoming messages:', err);
        }
      });

      // Listen for message updates (revokes, deletes, edits)
      (this.sock as any).ev.on('messages.update', (updates: any[]) => {
        if (this.currentSessionId !== socketSessionId) return;
        try {
          if (!Array.isArray(updates)) return;
          for (const upd of updates) {
            this.handleMessageUpdate(upd);
          }
        } catch (updErr) {
          console.warn('[WA] messages.update listener error:', updErr);
        }
      });

      // Listen for message receipts (who has read the message before deletion)
      (this.sock as any).ev.on('message-receipt.update', (receipts: any[]) => {
        if (this.currentSessionId !== socketSessionId) return;
        try {
          if (!Array.isArray(receipts)) return;
          for (const rec of receipts) {
            this.handleMessageReceipt(rec);
          }
        } catch (recErr) {
          console.warn('[WA] message-receipt.update listener error:', recErr);
        }
      });

      // Sync contacts update if emitted
      (this.sock as any).ev.on('contacts.upsert', (newContacts: any[]) => {
        if (this.currentSessionId !== socketSessionId) return;
        for (const c of newContacts) {
          if (c.id && !c.id.includes('@g.us') && !c.id.includes('status')) {
            const phone = extractPhoneFromJid(c.id);
            this.contacts.set(c.id, {
              id: c.id,
              name: c.name || c.notify || c.verifiedName || `+${phone}`,
              phone,
              avatarUrl: null,
            });
          }
        }
        this.saveSessionCache(socketSessionId);
      });

      // Sync groups update with debounce to avoid 429 rate limit
      let groupUpdateTimeout: any = null;
      (this.sock as any).ev.on('groups.update', () => {
        if (this.currentSessionId !== socketSessionId) return;
        if (groupUpdateTimeout) clearTimeout(groupUpdateTimeout);
        groupUpdateTimeout = setTimeout(() => {
          if (this.currentSessionId === socketSessionId) {
            this.syncGroupsOnly(false).catch((e) => console.warn('[WA] Throttled group update:', e?.message));
          }
        }, 3000);
      });
    } catch (err) {
      console.error('[WA] Gagal inisialisasi Baileys socket:', err);
      this.status = 'disconnected';
      this.syncProgress = 0;
      this.syncStatusText = 'Gagal inisialisasi koneksi';
    }
  }

  /**
   * Perform comprehensive sync with progress stages (15% -> 50% -> 80% -> 100%)
   */
  public async performFullSync(): Promise<void> {
    try {
      this.status = 'syncing';
      this.syncProgress = 50;
      this.syncStatusText = 'Memuat metadata seluruh grup WhatsApp...';

      // 1. Fetch all participating groups (force on full sync)
      await this.syncGroupsOnly(true);

      this.syncProgress = 75;
      this.syncStatusText = 'Memuat avatar dan direktori kontak...';

      // 2. Fetch contacts
      await this.syncContactsOnly();

      this.syncProgress = 100;
      this.syncStatusText = 'Sinkronisasi selesai! Semua grup & kontak aktif.';
      this.status = 'connected';
      dbManager.setLastSync();
    } catch (err) {
      console.error('[WA] Sinkronisasi mengalami kendala:', err);
      this.status = 'connected';
      this.syncProgress = 100;
      this.syncStatusText = 'Terhubung!';
    }
  }

  /**
   * Sync all groups and accurately detect whether bot is Admin or Member
   * Includes rate-overlimit protection (HTTP 429) & in-flight request deduplication
   */
  public async syncGroupsOnly(force: boolean = false): Promise<void> {
    if (!this.sock) return;

    if (this.groupSyncPromise) {
      return this.groupSyncPromise;
    }

    const now = Date.now();
    if (!force && this.groups.size > 0 && now - this.lastGroupSyncTime < this.groupSyncCooldownMs) {
      return;
    }

    this.groupSyncPromise = (async () => {
      try {
        // @ts-ignore
        const groupData = await (this.sock as any).groupFetchAllParticipating();
        this.lastGroupSyncTime = Date.now();

        const groupMap = new Map<string, WAGroup>();

        for (const [gid, meta] of Object.entries(groupData as Record<string, any>)) {
          const participants = meta.participants || [];
          const admins: string[] = [];
          let botRole: 'superadmin' | 'admin' | 'member' = 'member';

          for (const p of participants) {
            const pJid = p.id || '';
            const pPhone = extractPhoneFromJid(pJid);

            if (p.lid) {
              this.lidToPhoneMap.set(p.lid, pJid);
              this.lidToPhoneMap.set(extractPhoneFromJid(p.lid), pPhone);
            }
            if (pJid && pPhone) {
              this.lidToPhoneMap.set(pJid, pJid);
            }

            const isGroupAdmin = p.admin === 'admin' || p.admin === 'superadmin' || p.isAdmin === true || p.isSuperAdmin === true;
            if (isGroupAdmin) {
              admins.push(pPhone || pJid);
            }

            const matchResult = this.isParticipantBotOrAdmin(p);
            if (matchResult.isMatch && isGroupAdmin) {
              if (matchResult.isSuperAdmin) {
                botRole = 'superadmin';
              } else if (botRole !== 'superadmin') {
                botRole = 'admin';
              }
            }

            // Populate contacts from participants
            if (pJid && !pJid.includes('@g.us') && !pJid.includes('status')) {
              if (!this.contacts.has(pJid)) {
                this.contacts.set(pJid, {
                  id: pJid,
                  name: p.name || p.notify || (pPhone ? `+${pPhone}` : pJid),
                  phone: pPhone,
                  avatarUrl: null,
                });
              }
            }
          }

          // Fast avatar resolution from cache or background queue
          let avatarUrl: string | null = this.avatarCache.get(gid)?.url || null;

          groupMap.set(gid, {
            id: gid,
            subject: meta.subject || 'Grup WhatsApp',
            size: participants.length,
            creation: meta.creation,
            botRole,
            avatarUrl,
            admins,
          });
        }

        this.groups = groupMap;
        this.saveSessionCache(this.currentSessionId);

        // Start background avatar pre-fetcher for groups that lack avatar (in safe chunks of 3)
        this.prefetchAvatarsInBackground(Array.from(groupMap.keys()));
      } catch (err: any) {
        const isRateLimit =
          err?.output?.statusCode === 429 ||
          err?.data === 429 ||
          err?.message?.includes('rate-overlimit');

        if (isRateLimit) {
          console.warn('[WA] WhatsApp server rate-overlimit (429). Mengamankan sinkronisasi dengan cache grup tersimpan.');
          this.lastGroupSyncTime = Date.now() + 20000;
        } else {
          console.error('[WA] Gagal sinkronisasi grup:', err?.message || err);
        }
      } finally {
        this.groupSyncPromise = null;
      }
    })();

    return this.groupSyncPromise;
  }

  /**
   * Safe background avatar pre-fetcher with throttling to prevent 429 rate limit
   */
  private prefetchAvatarsInBackground(jids: string[]): void {
    const toFetch = jids.filter((j) => !this.avatarCache.has(j));
    if (toFetch.length === 0) return;

    (async () => {
      for (const jid of toFetch.slice(0, 40)) { // pre-fetch up to 40 recent
        if (!this.sock) break;
        try {
          const url = await this.getRealAvatar(jid);
          if (url) {
            const group = this.groups.get(jid);
            if (group) group.avatarUrl = url;
            const contact = this.contacts.get(jid);
            if (contact) contact.avatarUrl = url;
          }
          await new Promise((r) => setTimeout(r, 180)); // 180ms polite interval
        } catch {
          // Ignore background fetch error
        }
      }
    })();
  }

  /**
   * Sync contacts list
   */
  public async syncContactsOnly(): Promise<void> {
    if (!this.sock) return;

    try {
      // Baileys doesn't always have a single dump method for contacts, but we can extract from known chats and store
      const knownChats = (this.sock as any).chats || {};
      for (const [jid, chat] of Object.entries(knownChats as Record<string, any>)) {
        if (!jid.includes('@g.us') && !jid.includes('status') && !this.contacts.has(jid)) {
          const phone = extractPhoneFromJid(jid);
          this.contacts.set(jid, {
            id: jid,
            name: chat.name || chat.notify || `+${phone}`,
            phone,
            avatarUrl: this.avatarCache.get(jid)?.url || null,
          });
        }
      }
      // Background prefetch avatars for contacts
      this.prefetchAvatarsInBackground(Array.from(this.contacts.keys()));
    } catch (err) {
      console.error('[WA] Gagal sinkronisasi kontak:', err);
    }
  }

  /**
   * Fetches genuine WhatsApp avatar using 'preview' first (high success rate) then 'image' fallback
   */
  public async getRealAvatar(jid: string): Promise<string | null> {
    if (!this.sock) return null;

    const cached = this.avatarCache.get(jid);
    if (cached) {
      // If cached with a valid URL within 1 hour
      if (cached.url && Date.now() - cached.timestamp < 60 * 60 * 1000) {
        return cached.url;
      }
      // If cached as null within 45 seconds (temporary rate limit / no pp)
      if (!cached.url && Date.now() - cached.timestamp < 45 * 1000) {
        return null;
      }
    }

    try {
      let url: string | null = null;
      // Step 1: Try 'preview' first (far higher success rate in Baileys for groups & contacts)
      try {
        url = await (this.sock as any).profilePictureUrl(jid, 'preview');
      } catch {
        // Step 2: Try 'image' (high resolution)
        try {
          url = await (this.sock as any).profilePictureUrl(jid, 'image');
        } catch {
          url = null;
        }
      }

      if (url) {
        this.avatarCache.set(jid, { url, timestamp: Date.now() });
        const group = this.groups.get(jid);
        if (group) group.avatarUrl = url;
        const contact = this.contacts.get(jid);
        if (contact) contact.avatarUrl = url;
        return url;
      } else {
        // Temporary null cache
        this.avatarCache.set(jid, { url: null, timestamp: Date.now() });
        return null;
      }
    } catch {
      this.avatarCache.set(jid, { url: null, timestamp: Date.now() });
      return null;
    }
  }

  /**
   * Universal participant matcher: checks whether participant p is the connected bot
   * or any registered Admin+ number (taking into account LIDs, JIDs, and participant mapping)
   */
  public isParticipantBotOrAdmin(p: any): { isMatch: boolean; isBotExact: boolean; isAdminInGroup: boolean; isSuperAdmin: boolean } {
    if (!p) return { isMatch: false, isBotExact: false, isAdminInGroup: false, isSuperAdmin: false };

    const isAdminInGroup = p.admin === 'admin' || p.admin === 'superadmin' || p.isAdmin === true || p.isSuperAdmin === true;
    const isSuperAdmin = p.admin === 'superadmin' || p.isSuperAdmin === true;

    // Collect all bot exact identifiers
    const botIdentifiers = new Set<string>();
    const sockUser = (this.sock as any)?.user;
    const credsMe = (this.sock as any)?.authState?.creds?.me;

    if (sockUser?.id) {
      const raw = sockUser.id;
      const clean = raw.split(':')[0];
      const userPart = clean.split('@')[0];
      botIdentifiers.add(raw);
      botIdentifiers.add(clean);
      botIdentifiers.add(userPart);
      const pNorm = normalizePhone(userPart);
      if (pNorm) {
        botIdentifiers.add(pNorm);
        botIdentifiers.add(`${pNorm}@s.whatsapp.net`);
      }
    }
    if (sockUser?.lid) {
      const raw = sockUser.lid;
      const clean = raw.split(':')[0];
      botIdentifiers.add(raw);
      botIdentifiers.add(clean);
      botIdentifiers.add(clean.split('@')[0]);
    }
    if (credsMe?.id) {
      const raw = credsMe.id;
      const clean = raw.split(':')[0];
      const userPart = clean.split('@')[0];
      botIdentifiers.add(raw);
      botIdentifiers.add(clean);
      botIdentifiers.add(userPart);
      const pNorm = normalizePhone(userPart);
      if (pNorm) {
        botIdentifiers.add(pNorm);
        botIdentifiers.add(`${pNorm}@s.whatsapp.net`);
      }
    }
    if (credsMe?.lid) {
      const raw = credsMe.lid;
      const clean = raw.split(':')[0];
      botIdentifiers.add(raw);
      botIdentifiers.add(clean);
      botIdentifiers.add(clean.split('@')[0]);
    }
    if (this.botUser?.phone) {
      const norm = normalizePhone(this.botUser.phone);
      botIdentifiers.add(norm);
      botIdentifiers.add(`${norm}@s.whatsapp.net`);
      botIdentifiers.add(this.botUser.phone);
    }
    if (this.botUser?.id) {
      botIdentifiers.add(this.botUser.id);
      botIdentifiers.add(this.botUser.id.split('@')[0]);
    }
    const currentSession = dbManager.getSessions().find((s) => s.id === this.currentSessionId);
    if (currentSession?.phone) {
      const norm = normalizePhone(currentSession.phone);
      botIdentifiers.add(norm);
      botIdentifiers.add(`${norm}@s.whatsapp.net`);
      botIdentifiers.add(currentSession.phone);
    }
    if (currentSession?.jid) {
      botIdentifiers.add(currentSession.jid);
      botIdentifiers.add(currentSession.jid.split('@')[0]);
    }

    // Collect all Admin+ phone numbers
    const adminPhones = new Set<string>();
    for (const adminNum of dbManager.getAdminNumbers()) {
      const norm = normalizePhone(adminNum);
      if (norm) adminPhones.add(norm);
    }
    if (this.botUser?.phone) {
      const norm = normalizePhone(this.botUser.phone);
      if (norm) adminPhones.add(norm);
    }

    // Examine participant p with all available tokens
    const pTokens = new Set<string>();
    const addTokens = (val: string | undefined | null) => {
      if (!val) return;
      pTokens.add(val);
      const clean = val.split(':')[0];
      pTokens.add(clean);
      const userPart = clean.split('@')[0];
      pTokens.add(userPart);
      const norm = normalizePhone(userPart);
      if (norm) pTokens.add(norm);
    };

    addTokens(p.id);
    addTokens(p.lid);
    addTokens(p.phoneNumber);
    addTokens(p.jid);
    addTokens(p.userJid);

    // Also check lid-to-phone mapping
    if (p.id && this.lidToPhoneMap.has(p.id)) {
      addTokens(this.lidToPhoneMap.get(p.id));
    }
    if (p.lid && this.lidToPhoneMap.has(p.lid)) {
      addTokens(this.lidToPhoneMap.get(p.lid));
    }

    // 1. Is exact bot session?
    let isBotExact = false;
    for (const token of pTokens) {
      if (botIdentifiers.has(token)) {
        isBotExact = true;
        break;
      }
    }

    // 2. Is Admin+ user?
    let isAdminMatch = isBotExact;
    if (!isAdminMatch) {
      for (const token of pTokens) {
        if (adminPhones.has(token)) {
          isAdminMatch = true;
          break;
        }
      }
    }

    return {
      isMatch: isAdminMatch,
      isBotExact,
      isAdminInGroup,
      isSuperAdmin,
    };
  }

  /**
   * Check whether the bot or Admin+ is admin or superadmin in a group
   */
  public async checkIfBotIsAdmin(groupId: string): Promise<boolean> {
    if (!this.sock) return false;

    // Check in local cache first
    const cached = this.groups.get(groupId);
    if (cached && (cached.botRole === 'admin' || cached.botRole === 'superadmin')) {
      return true;
    }

    // Fetch fresh metadata if needed
    try {
      // @ts-ignore
      const meta = await (this.sock as any).groupMetadata(groupId);
      if (!meta || !meta.participants) return false;

      let isBotOrAdmin = false;
      for (const p of meta.participants) {
        const isGroupAdmin = p.admin === 'admin' || p.admin === 'superadmin' || p.isAdmin === true || p.isSuperAdmin === true;
        if (!isGroupAdmin) continue;

        const matchResult = this.isParticipantBotOrAdmin(p);
        if (matchResult.isMatch) {
          isBotOrAdmin = true;
          if (cached) {
            cached.botRole = matchResult.isSuperAdmin ? 'superadmin' : 'admin';
          }
          break;
        }
      }

      return isBotOrAdmin;
    } catch {
      return false;
    }
  }

  /**
   * Helper to unwrap and inspect message contents recursively
   * Handles ephemeral, viewOnce, documentWithCaption, and edited messages.
   */
  private unwrapMessage(msg: any): {
    text: string;
    message: any;
    isViewOnce: boolean;
    viewOnceMedia: any;
    contextInfo: any;
  } {
    if (!msg) return { text: '', message: null, isViewOnce: false, viewOnceMedia: null, contextInfo: null };

    let current = msg.message || msg;
    let isViewOnce = false;
    let viewOnceMedia: any = null;

    for (let i = 0; i < 5; i++) {
      if (current.ephemeralMessage?.message) {
        current = current.ephemeralMessage.message;
      } else if (current.viewOnceMessage?.message) {
        isViewOnce = true;
        viewOnceMedia = current.viewOnceMessage.message;
        current = current.viewOnceMessage.message;
      } else if (current.viewOnceMessageV2?.message) {
        isViewOnce = true;
        viewOnceMedia = current.viewOnceMessageV2.message;
        current = current.viewOnceMessageV2.message;
      } else if (current.viewOnceMessageV2Extension?.message) {
        isViewOnce = true;
        viewOnceMedia = current.viewOnceMessageV2Extension.message;
        current = current.viewOnceMessageV2Extension.message;
      } else if (current.documentWithCaptionMessage?.message) {
        current = current.documentWithCaptionMessage.message;
      } else if (current.editedMessage?.message?.protocolMessage?.editedMessage) {
        current = current.editedMessage.message.protocolMessage.editedMessage;
      } else {
        break;
      }
    }

    if (current.imageMessage?.viewOnce || current.videoMessage?.viewOnce || current.audioMessage?.viewOnce) {
      isViewOnce = true;
      viewOnceMedia = current;
    }

    const contextInfo =
      current.extendedTextMessage?.contextInfo ||
      current.imageMessage?.contextInfo ||
      current.videoMessage?.contextInfo ||
      current.audioMessage?.contextInfo ||
      current.documentMessage?.contextInfo ||
      (current as any).contextInfo ||
      null;

    const text =
      current.conversation ||
      current.extendedTextMessage?.text ||
      current.imageMessage?.caption ||
      current.videoMessage?.caption ||
      current.documentMessage?.caption ||
      '';

    return {
      text: (text || '').trim(),
      message: current,
      isViewOnce,
      viewOnceMedia,
      contextInfo,
    };
  }

  /**
   * Strictly verifies if an incoming message was sent by an Admin+
   * Handles fromMe: true, phone JIDs, WhatsApp LIDs, and participant mapping
   */
  private isMessageFromAdmin(msg: WAMessage): { isAdmin: boolean; senderPhone: string; senderJid: string } {
    const myJid = (this.sock as any).user?.id
      ? (this.sock as any).user.id.split(':')[0] + '@s.whatsapp.net'
      : '';
    const myPhone = extractPhoneFromJid(myJid);

    // 1. If sent from the connected bot's own WhatsApp session (fromMe === true), ALWAYS recognized as Admin+
    if (msg.key.fromMe) {
      return { isAdmin: true, senderPhone: myPhone, senderJid: myJid };
    }

    const adminNumbers = dbManager.getAdminNumbers();
    const normalizedAdmins = new Set(adminNumbers.map((n) => normalizePhone(n)));

    // 2. Gather all possible participant / sender identifiers
    const rawCandidates: (string | undefined | null)[] = [
      (msg.key as any)?.participantAlt,
      (msg.key as any)?.remoteJidAlt,
      (msg as any)?.authorPn,
      msg.key?.participant,
      (msg as any)?.participant,
      msg.key?.remoteJid,
      (msg as any)?.author,
    ];

    for (const raw of rawCandidates) {
      if (!raw) continue;
      const cleanPhone = extractPhoneFromJid(raw);
      if (cleanPhone && (adminNumbers.includes(cleanPhone) || normalizedAdmins.has(normalizePhone(cleanPhone)))) {
        return { isAdmin: true, senderPhone: cleanPhone, senderJid: raw };
      }

      // Check in lidToPhoneMap
      const mappedPhone = this.lidToPhoneMap.get(raw) || this.lidToPhoneMap.get(cleanPhone);
      if (mappedPhone) {
        const mappedClean = extractPhoneFromJid(mappedPhone);
        if (mappedClean && (adminNumbers.includes(mappedClean) || normalizedAdmins.has(normalizePhone(mappedClean)))) {
          return { isAdmin: true, senderPhone: mappedClean, senderJid: mappedPhone };
        }
      }
    }

    return { isAdmin: false, senderPhone: '', senderJid: '' };
  }

  /**
   * Handle incoming message strictly for Admin+ commands with high-speed execution
   */
  private async handleIncomingMessage(msg: WAMessage): Promise<void> {
    if (!msg.message) return;

    // Deduplicate identical message stanza ids
    const msgId = msg.key?.id;
    if (msgId) {
      if (this.recentProcessedMsgIds.has(msgId)) return;
      this.recentProcessedMsgIds.add(msgId);
      if (this.recentProcessedMsgIds.size > 200) {
        const oldest = this.recentProcessedMsgIds.values().next().value;
        if (oldest) this.recentProcessedMsgIds.delete(oldest);
      }
    }

    // Cache LID if available in message
    const participant = msg.key?.participant || (msg as any)?.participant;
    const participantAlt = (msg.key as any)?.participantAlt || (msg as any)?.authorPn;
    if (participant && participantAlt) {
      this.lidToPhoneMap.set(participant, participantAlt);
    }

    const remoteJid = msg.key.remoteJid || '';

    // Record incoming message in comprehensive analytics (daily/monthly/yearly time series, group chatter, user chatter)
    const isGroup = remoteJid.endsWith('@g.us');
    const groupName = isGroup ? this.groups.get(remoteJid)?.subject : undefined;
    const senderJid = msg.key.fromMe ? (this.botUser?.id || '') : (participant || remoteJid);
    const senderPhone = extractPhoneFromJid(senderJid);
    const senderName = msg.pushName || '';
    const msgTimestamp = typeof msg.messageTimestamp === 'number' ? msg.messageTimestamp : undefined;

    dbManager.recordChatMessage({
      senderPhone,
      senderJid,
      senderName,
      remoteJid,
      isGroup,
      groupName,
      timestamp: msgTimestamp,
    });

    // Check if bot feature is enabled for this active account session
    if (!dbManager.isSessionBotEnabled(this.currentSessionId)) {
      return;
    }

    // Strict Admin+ check
    const adminCheck = this.isMessageFromAdmin(msg);
    if (!adminCheck.isAdmin) {
      return;
    }

    // Unwrap message content
    const unwrapped = this.unwrapMessage(msg);
    const bodyText = unwrapped.text;
    if (!bodyText) return;

    const trimmed = bodyText.trim();
    if (!trimmed) return;

    // Support command prefixes: ., !, /, # or direct text
    const matchPrefix = trimmed.match(/^[.!\/#]\s*(.+)$/s);
    const cleanCmd = matchPrefix ? matchPrefix[1].trim() : trimmed;
    const lowerCmd = cleanCmd.toLowerCase();

    // Master General / Global Bot command handling (can be toggled by Admin+)
    if (
      lowerCmd === 'bot general on' ||
      lowerCmd === 'bot master on' ||
      lowerCmd === 'nyalakan bot general' ||
      lowerCmd === 'nyalakan bot global' ||
      lowerCmd === 'bot global on'
    ) {
      dbManager.setGlobalBotEnabled(true);
      await (this.sock as any).sendMessage(
        remoteJid,
        { text: 'Master Bot WhatsApp berhasil DIAKTIFKAN kembali secara menyeluruh.' },
        { quoted: msg }
      );
      return;
    }

    if (
      lowerCmd === 'bot general off' ||
      lowerCmd === 'bot master off' ||
      lowerCmd === 'matikan bot general' ||
      lowerCmd === 'matikan bot global' ||
      lowerCmd === 'bot global off'
    ) {
      dbManager.setGlobalBotEnabled(false);
      await (this.sock as any).sendMessage(
        remoteJid,
        { text: 'Master Bot WhatsApp berhasil DINONAKTIFKAN secara menyeluruh. Ketik .bot general on untuk menyalakan kembali.' },
        { quoted: msg }
      );
      return;
    }

    // Check Master Global Bot Switch: if off, ignore all other commands
    if (!dbManager.isGlobalBotEnabled()) {
      return;
    }

    const isBotOnCmd =
      lowerCmd === 'bot on' ||
      lowerCmd === 'bot enable' ||
      lowerCmd === 'bot start' ||
      lowerCmd === 'bot 1' ||
      lowerCmd === 'nyalakan bot' ||
      lowerCmd === 'bot aktif' ||
      lowerCmd === 'aktifkan bot';

    const isBotOffCmd =
      lowerCmd === 'bot off' ||
      lowerCmd === 'bot disable' ||
      lowerCmd === 'bot stop' ||
      lowerCmd === 'bot 0' ||
      lowerCmd === 'matikan bot' ||
      lowerCmd === 'bot nonaktif' ||
      lowerCmd === 'nonaktifkan bot';

    // Check per-group bot enable/disable status
    if (isGroup && !dbManager.isGroupBotEnabled(remoteJid)) {
      if (isBotOnCmd) {
        dbManager.setGroupBotEnabled(remoteJid, true);
        await (this.sock as any).sendMessage(
          remoteJid,
          { text: 'Fitur bot berhasil diaktifkan kembali untuk grup ini.' },
          { quoted: msg }
        );
      }
      return;
    }

    if (isGroup && isBotOffCmd) {
      dbManager.setGroupBotEnabled(remoteJid, false);
      await (this.sock as any).sendMessage(
        remoteJid,
        { text: 'Fitur bot dinonaktifkan untuk grup ini. Ketik .bot on untuk mengaktifkan kembali.' },
        { quoted: msg }
      );
      return;
    }

    if (isGroup && isBotOnCmd) {
      dbManager.setGroupBotEnabled(remoteJid, true);
      await (this.sock as any).sendMessage(
        remoteJid,
        { text: 'Fitur bot sudah aktif untuk grup ini.' },
        { quoted: msg }
      );
      return;
    }

    // Log detected Admin+ command immediately
    console.log(`[WA Command] Admin+ (+${senderPhone}) in ${remoteJid}: "${trimmed.slice(0, 60)}"`);

    // 1. Command .rvo / rvo / !rvo / /rvo (Reveal View Once)
    if (lowerCmd === 'rvo') {
      await this.handleRvoCommand(msg, remoteJid, senderJid, senderPhone);
      return;
    }

    // 2. Command .swgc / swgc / .swgc+ / swgc+ (Group Story / Status)
    if (lowerCmd.startsWith('swgc+') || lowerCmd.startsWith('swgc')) {
      let rawArg = '';
      if (lowerCmd.startsWith('swgc+')) {
        rawArg = cleanCmd.slice(5).trim();
      } else if (lowerCmd.startsWith('swgc')) {
        rawArg = cleanCmd.slice(4).trim();
      }
      await this.handleSwgcCommand(msg, remoteJid, senderJid, senderPhone, rawArg);
      return;
    }

    // 3. Command .delswgc (Hapus Status Cerita Grup)
    if (lowerCmd.startsWith('delswgc')) {
      const rawArg = cleanCmd.slice(7).trim();
      await this.handleDelswgcCommand(msg, remoteJid, senderJid, senderPhone, rawArg);
      return;
    }

    // 4. Command .ghostclear (Bersihkan Histori Pesan Terhapus)
    if (lowerCmd.startsWith('ghostclear')) {
      const rawArg = cleanCmd.slice(10).trim();
      await this.handleGhostClearCommand(msg, remoteJid, senderJid, senderPhone, rawArg);
      return;
    }

    // 5. Command .ghost / .edit (Lihat Histori Pesan Dihapus / Diedit oleh User)
    if (
      lowerCmd.startsWith('ghost') ||
      lowerCmd.startsWith('edit') ||
      lowerCmd.startsWith('cekedit') ||
      lowerCmd.startsWith('history')
    ) {
      let rawArg = '';
      if (lowerCmd.startsWith('ghost')) rawArg = cleanCmd.slice(5).trim();
      else if (lowerCmd.startsWith('edit')) rawArg = cleanCmd.slice(4).trim();
      else if (lowerCmd.startsWith('cekedit')) rawArg = cleanCmd.slice(7).trim();
      else if (lowerCmd.startsWith('history')) rawArg = cleanCmd.slice(7).trim();
      await this.handleGhostCommand(msg, remoteJid, senderJid, senderPhone, rawArg);
      return;
    }

    // 6. Command .cleardata (Bersihkan Semua Data Chat/Media Web Server)
    if (lowerCmd.startsWith('cleardata')) {
      await this.handleClearDataCommand(msg, remoteJid, senderJid, senderPhone);
      return;
    }

    // 7. Command .promote @tag / .promote me
    if (lowerCmd.startsWith('promote')) {
      await this.handlePromoteCommand(msg, remoteJid, senderJid, senderPhone, cleanCmd);
      return;
    }

    // 8. Command .demote @tag / .demote me
    if (lowerCmd.startsWith('demote')) {
      await this.handleDemoteCommand(msg, remoteJid, senderJid, senderPhone, cleanCmd);
      return;
    }
  }

  /**
   * Command .rvo implementation:
   * Downloads view once buffer, strips viewOnce, and resends media cleanly back to chat.
   */
  private async handleRvoCommand(
    msg: WAMessage,
    remoteJid: string,
    senderJid: string,
    senderPhone: string
  ): Promise<void> {
    try {
      const unwrappedMsg = this.unwrapMessage(msg);
      const quoted = unwrappedMsg.contextInfo?.quotedMessage;

      if (!quoted) {
        await (this.sock as any).sendMessage(
          remoteJid,
          { text: 'Mohon reply pesan View Once (sekali lihat) dengan perintah .rvo' },
          { quoted: msg }
        );
        return;
      }

      const unwrappedQuoted = this.unwrapMessage(quoted);
      let viewOnceMedia = unwrappedQuoted.viewOnceMedia || unwrappedQuoted.message;

      let isImage = !!viewOnceMedia?.imageMessage;
      let isVideo = !!viewOnceMedia?.videoMessage;
      let isAudio = !!viewOnceMedia?.audioMessage;

      if (!isImage && !isVideo && !isAudio) {
        if (quoted.imageMessage) {
          viewOnceMedia = quoted;
          isImage = true;
        } else if (quoted.videoMessage) {
          viewOnceMedia = quoted;
          isVideo = true;
        } else if (quoted.audioMessage) {
          viewOnceMedia = quoted;
          isAudio = true;
        }
      }

      if (!viewOnceMedia || (!isImage && !isVideo && !isAudio)) {
        await (this.sock as any).sendMessage(
          remoteJid,
          { text: 'Pesan yang Anda reply bukan media View Once (sekali lihat).' },
          { quoted: msg }
        );
        return;
      }

      const mediaContext: any = {
        key: {
          remoteJid,
          id: unwrappedMsg.contextInfo?.stanzaId || msg.key.id,
          participant: unwrappedMsg.contextInfo?.participant || msg.key.participant,
        },
        message: viewOnceMedia,
      };

      // Download buffer
      // @ts-ignore
      const buffer = (await downloadMediaMessage(mediaContext, 'buffer', {})) as Buffer;

      if (!buffer || buffer.length === 0) {
        await (this.sock as any).sendMessage(
          remoteJid,
          { text: 'Gagal mengunduh media View Once.' },
          { quoted: msg }
        );
        return;
      }

      const originalCaption =
        viewOnceMedia.imageMessage?.caption || viewOnceMedia.videoMessage?.caption || '';

      if (isImage) {
        await (this.sock as any).sendMessage(
          remoteJid,
          {
            image: buffer,
            ...(originalCaption ? { caption: originalCaption } : {}),
          },
          { quoted: msg }
        );
      } else if (isVideo) {
        await (this.sock as any).sendMessage(
          remoteJid,
          {
            video: buffer,
            ...(originalCaption ? { caption: originalCaption } : {}),
          },
          { quoted: msg }
        );
      } else if (isAudio) {
        await (this.sock as any).sendMessage(
          remoteJid,
          {
            audio: buffer,
            mimetype: 'audio/mp4',
            ptt: true,
          },
          { quoted: msg }
        );
      }

      dbManager.incrementStat('rvoProcessed');
      dbManager.recordUserCommand(senderPhone, senderJid, 'rvo');
      dbManager.addLog('rvo', `Berhasil memproses .rvo untuk Admin+ +${senderPhone} di ${remoteJid}`);
    } catch (err: any) {
      console.error('[WA] Kesalahan pemrosesan .rvo:', err);
    }
  }

  /**
   * Command .swgc / .swgc+ implementation:
   * Publishes media or text stories with background color to Group Status / Story.
   * Format for text: .swgc IsiPesan --warna
   */
  private async handleSwgcCommand(
    msg: WAMessage,
    remoteJid: string,
    senderJid: string,
    senderPhone: string,
    rawText: string
  ): Promise<void> {
    try {
      const isGroup = remoteJid.endsWith('@g.us');
      let targetGroupIds: string[] = [];

      if (isGroup) {
        targetGroupIds = [remoteJid];
      } else {
        // If sent from private chat by Admin+, target all groups the bot is in
        targetGroupIds = Array.from(this.groups.keys());
        if (targetGroupIds.length === 0) {
          await (this.sock as any).sendMessage(
            remoteJid,
            { text: 'Bot belum bergabung ke dalam grup manapun untuk mempublikasikan status cerita.' },
            { quoted: msg }
          );
          return;
        }
      }

      const unwrappedMsg = this.unwrapMessage(msg);
      const quoted = unwrappedMsg.contextInfo?.quotedMessage;
      const unwrappedQuoted = this.unwrapMessage(quoted);

      let mediaMessage = unwrappedQuoted.message?.imageMessage || unwrappedQuoted.message?.videoMessage;
      let isQuoted = true;

      if (!mediaMessage) {
        mediaMessage = unwrappedMsg.message?.imageMessage || unwrappedMsg.message?.videoMessage;
        isQuoted = false;
      }

      const isImage = !!mediaMessage && !!(isQuoted ? unwrappedQuoted.message?.imageMessage : unwrappedMsg.message?.imageMessage);
      const isVideo = !!mediaMessage && !!(isQuoted ? unwrappedQuoted.message?.videoMessage : unwrappedMsg.message?.videoMessage);

      // Case 1: Media (Image or Video) exists
      if (mediaMessage && (isImage || isVideo)) {
        const mediaContext: any = {
          key: {
            remoteJid,
            id: isQuoted
              ? unwrappedMsg.contextInfo?.stanzaId
              : msg.key.id,
            participant: isQuoted
              ? unwrappedMsg.contextInfo?.participant
              : msg.key.participant,
          },
          message: isQuoted ? unwrappedQuoted.message : unwrappedMsg.message,
        };

        // @ts-ignore
        const buffer = (await downloadMediaMessage(mediaContext, 'buffer', {})) as Buffer;
        const { text: finalCaption } = this.extractSwgcTextAndColor(rawText || mediaMessage.caption || '');

        await this.sendGroupStatusNative(targetGroupIds, {
          ...(isImage ? { image: buffer } : { video: buffer }),
          ...(finalCaption ? { caption: finalCaption } : {}),
        });

        dbManager.incrementStat('groupStatusSent');
        dbManager.recordUserCommand(senderPhone, senderJid, 'swgc');
        dbManager.addLog('swgc', `Status media berhasil dipublikasikan ke ${targetGroupIds.length} grup (Oleh Admin+ +${senderPhone})`);
        return;
      }

      // Case 2: Text Story with Background Color (.swgc IsiPesan --warna)
      const cleanInput = (rawText || '').trim();
      const lowerInput = cleanInput.toLowerCase();

      // Check if user asked for color help
      if (!cleanInput || lowerInput === 'help' || lowerInput === '--help' || lowerInput === '--warna' || lowerInput === 'warna' || lowerInput === 'list') {
        await this.sendSwgcColorGuide(remoteJid, msg);
        return;
      }

      // Ekstraksi bersih teks status dan flag warna (--random, --hijau, dsb)
      // Flag warna langsung dipotong dari teks sehingga TIDAK PERNAH masuk ke status
      const { text: statusText, color: colorArg } = this.extractSwgcTextAndColor(cleanInput);

      if (!statusText) {
        await this.sendSwgcColorGuide(remoteJid, msg);
        return;
      }

      const colorData = resolveSwgcColor(colorArg);

      await this.sendGroupStatusNative(targetGroupIds, {
        text: statusText,
        backgroundColor: colorData.hex,
        font: 1,
      });

      dbManager.incrementStat('groupStatusSent');
      dbManager.recordUserCommand(senderPhone, senderJid, 'swgc');
      dbManager.addLog('swgc', `Status teks berhasil dipublikasikan ke ${targetGroupIds.length} grup (Warna: ${colorData.name}, Oleh Admin+ +${senderPhone})`);
    } catch (err: any) {
      console.error('[WA] Gagal memproses .swgc:', err);
      dbManager.addLog('swgc', `Gagal mempublikasikan status cerita grup: ${err?.message || 'Error internal'}`);
    }
  }

  /**
   * Helper untuk mengekstrak teks status dan flag warna background secara bersih.
   * Menjamin flag warna (seperti --random, --hijau, --biru, --#HEX) terpotong bersih
   * dari pesan sehingga TIDAK PERNAH masuk ke teks status WhatsApp.
   */
  private extractSwgcTextAndColor(raw: string): { text: string; color: string } {
    let text = (raw || '').trim();
    let color = 'random';

    // Cocokkan pola --warna di akhir kalimat (dengan toleransi spasi/enter di ujungnya)
    const endMatch = text.match(/(?:^|\s+)--\s*([a-zA-Z0-9#_-]+)\s*$/i);
    if (endMatch) {
      color = endMatch[1].toLowerCase().trim();
      text = text.slice(0, endMatch.index).trim();
    } else {
      // Cocokkan jika user menuliskan --warna di tengah atau setelah spasi
      const inlineMatch = text.match(/\s+--\s*([a-zA-Z0-9#_-]+)(?:\s+|$)/i);
      if (inlineMatch) {
        color = inlineMatch[1].toLowerCase().trim();
        text = text.replace(inlineMatch[0], ' ').trim();
      }
    }

    return { text, color };
  }

  /**
   * Helper to display comprehensive color guide for .swgc
   */
  private async sendSwgcColorGuide(remoteJid: string, quotedMsg: WAMessage): Promise<void> {
    const text =
      `*PANDUAN STATUS CERITA GRUP (SWGC)*\n\n` +
      `Anda dapat membuat status teks lingkaran profil grup dengan pilihan background warna:\n\n` +
      `*Format Perintah:*\n` +
      `• \`.swgc IsiPesan --warna\`\n\n` +
      `*Contoh Penggunaan:*\n` +
      `• \`.swgc Rapat malam ini jam 20:00 WIB --merah\`\n` +
      `• \`.swgc Selamat pagi semuanya! --hijau\`\n` +
      `• \`.swgc Pengumuman penting --biru\`\n` +
      `• \`.swgc Info terkini --random\`\n` +
      `• \`.swgc Teks kustom --#3B82F6\`\n\n` +
      `*Daftar Pilihan Warna:*\n` +
      `• *hijau* (#25D366) - Khas WhatsApp\n` +
      `• *merah* (#D32F2F) - Merah Terang\n` +
      `• *biru* (#1976D2) - Biru Cerah\n` +
      `• *ungu* (#7B1FA2) - Ungu Elegan\n` +
      `• *pink* (#C2185B) - Merah Muda\n` +
      `• *orange* (#F57C00) - Oranye Segar\n` +
      `• *kuning* (#FBC02D) - Kuning Amber\n` +
      `• *tosca* / *teal* (#00796B) - Hijau Tosca\n` +
      `• *hitam* (#212121) - Hitam Gelap\n` +
      `• *navy* (#0D47A1) - Biru Navy\n` +
      `• *coklat* (#5D4037) - Cokelat Mocha\n` +
      `• *cyan* (#0097A7) - Biru Cyan\n` +
      `• *maroon* (#880E4F) - Merah Maroon\n` +
      `• *abu* (#455A64) - Abu-Abu Slate\n` +
      `• *sunset* (#E65100) - Oranye Sunset\n` +
      `• *forest* (#1B5E20) - Hijau Hutan\n` +
      `• *random* - Memilih warna acak otomatis\n` +
      `• Atau gunakan kode HEX langsung: *--#KodeHex*\n\n` +
      `*Kirim Media:* Anda juga bisa reply/kirim foto atau video dengan caption *.swgc [caption opsional]*.`;

    await (this.sock as any).sendMessage(remoteJid, { text }, { quoted: quotedMsg });
  }

  /**
   * Command .promote implementation:
   * .promote me => promotes the sender Admin+ to group admin
   * .promote @tag / .promote 628... => promotes tagged user to group admin
   */
  private async handlePromoteCommand(
    msg: WAMessage,
    remoteJid: string,
    senderJid: string,
    senderPhone: string,
    text: string
  ): Promise<void> {
    try {
      if (!remoteJid.endsWith('@g.us')) {
        await (this.sock as any).sendMessage(
          remoteJid,
          { text: 'Perintah .promote hanya dapat dijalankan di dalam grup WhatsApp.' },
          { quoted: msg }
        );
        return;
      }

      const isBotAdmin = await this.checkIfBotIsAdmin(remoteJid);
      if (!isBotAdmin) {
        await (this.sock as any).sendMessage(
          remoteJid,
          { text: 'Perintah ditolak: Nomor bot harus menjadi Admin grup terlebih dahulu untuk dapat mengubah peran anggota.' },
          { quoted: msg }
        );
        return;
      }

      let targetJid = '';
      const lower = text.toLowerCase();

      if (lower.includes(' me')) {
        targetJid = `${senderPhone}@s.whatsapp.net`;
      } else {
        const unwrapped = this.unwrapMessage(msg);
        const mentions = unwrapped.contextInfo?.mentionedJid || [];
        if (mentions.length > 0) {
          targetJid = mentions[0];
        } else {
          const quotedParticipant = unwrapped.contextInfo?.participant;
          if (quotedParticipant) {
            const mapped = this.lidToPhoneMap.get(quotedParticipant);
            targetJid = mapped || quotedParticipant;
          } else {
            const digits = text.replace(/[^0-9]/g, '');
            if (digits.length >= 8) {
              targetJid = `${digits}@s.whatsapp.net`;
            }
          }
        }
      }

      if (!targetJid) {
        await (this.sock as any).sendMessage(
          remoteJid,
          { text: 'Format salah. Gunakan: .promote me (untuk Anda sendiri) atau .promote @tag_user atau balas pesan user.' },
          { quoted: msg }
        );
        return;
      }

      const targetPhone = extractPhoneFromJid(targetJid);
      const cleanTargetJid = `${targetPhone}@s.whatsapp.net`;

      // Resolve exact target participant in group with candidate fallback loop
      let candidateIds: string[] = [];
      try {
        // @ts-ignore
        const meta = await (this.sock as any).groupMetadata(remoteJid);
        const found = (meta.participants || []).find((p: any) => {
          const pPhone = extractPhoneFromJid(p.id);
          const pLidPhone = p.lid ? extractPhoneFromJid(p.lid) : '';
          const pPhoneNum = p.phoneNumber ? extractPhoneFromJid(p.phoneNumber) : '';
          return (
            pPhone === targetPhone ||
            pLidPhone === targetPhone ||
            pPhoneNum === targetPhone ||
            p.id === targetJid ||
            p.id === cleanTargetJid ||
            (p.lid && p.lid === targetJid)
          );
        });
        if (found) {
          if (found.id) candidateIds.push(found.id);
          if (found.lid) candidateIds.push(found.lid);
          if (found.phoneNumber) candidateIds.push(found.phoneNumber);
        }
      } catch {
        // Fallback
      }
      candidateIds.push(cleanTargetJid);
      if (targetJid && !candidateIds.includes(targetJid)) {
        candidateIds.push(targetJid);
      }
      candidateIds = Array.from(new Set(candidateIds.filter(Boolean)));

      let promoted = false;
      let lastErr: any = null;
      for (const cand of candidateIds) {
        try {
          // @ts-ignore
          await (this.sock as any).groupParticipantsUpdate(remoteJid, [cand], 'promote');
          promoted = true;
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!promoted && lastErr) {
        throw lastErr;
      }

      await (this.sock as any).sendMessage(
        remoteJid,
        {
          text: `Berhasil mempromosikan @${targetPhone} menjadi Admin grup.`,
          mentions: [cleanTargetJid],
        },
        { quoted: msg }
      );

      dbManager.recordUserCommand(senderPhone, senderJid, 'promote');
      dbManager.addLog(
        'bot',
        `Admin+ +${senderPhone} mempromosikan ${targetPhone} di grup ${remoteJid}`
      );
    } catch (err: any) {
      console.error('[WA] Gagal mengeksekusi .promote:', err);
      await (this.sock as any).sendMessage(
        remoteJid,
        { text: `Gagal mempromosikan admin: ${err?.message || 'Error internal'}` },
        { quoted: msg }
      );
    }
  }

  /**
   * Command .demote implementation:
   * .demote me => demotes the sender Admin+ from group admin
   * .demote @tag / .demote 628... => demotes tagged user from group admin
   */
  private async handleDemoteCommand(
    msg: WAMessage,
    remoteJid: string,
    senderJid: string,
    senderPhone: string,
    text: string
  ): Promise<void> {
    try {
      if (!remoteJid.endsWith('@g.us')) {
        await (this.sock as any).sendMessage(
          remoteJid,
          { text: 'Perintah .demote hanya dapat dijalankan di dalam grup WhatsApp.' },
          { quoted: msg }
        );
        return;
      }

      const isBotAdmin = await this.checkIfBotIsAdmin(remoteJid);
      if (!isBotAdmin) {
        await (this.sock as any).sendMessage(
          remoteJid,
          { text: 'Perintah ditolak: Nomor bot harus menjadi Admin grup terlebih dahulu untuk dapat mengubah peran anggota.' },
          { quoted: msg }
        );
        return;
      }

      let targetJid = '';
      const lower = text.toLowerCase();

      if (lower.includes(' me')) {
        targetJid = `${senderPhone}@s.whatsapp.net`;
      } else {
        const unwrapped = this.unwrapMessage(msg);
        const mentions = unwrapped.contextInfo?.mentionedJid || [];
        if (mentions.length > 0) {
          targetJid = mentions[0];
        } else {
          const quotedParticipant = unwrapped.contextInfo?.participant;
          if (quotedParticipant) {
            const mapped = this.lidToPhoneMap.get(quotedParticipant);
            targetJid = mapped || quotedParticipant;
          } else {
            const digits = text.replace(/[^0-9]/g, '');
            if (digits.length >= 8) {
              targetJid = `${digits}@s.whatsapp.net`;
            }
          }
        }
      }

      if (!targetJid) {
        await (this.sock as any).sendMessage(
          remoteJid,
          { text: 'Format salah. Gunakan: .demote me (untuk Anda sendiri) atau .demote @tag_user atau balas pesan user.' },
          { quoted: msg }
        );
        return;
      }

      const targetPhone = extractPhoneFromJid(targetJid);
      const cleanTargetJid = `${targetPhone}@s.whatsapp.net`;

      // Resolve exact target participant in group with candidate fallback loop
      let candidateIds: string[] = [];
      try {
        // @ts-ignore
        const meta = await (this.sock as any).groupMetadata(remoteJid);
        const found = (meta.participants || []).find((p: any) => {
          const pPhone = extractPhoneFromJid(p.id);
          const pLidPhone = p.lid ? extractPhoneFromJid(p.lid) : '';
          const pPhoneNum = p.phoneNumber ? extractPhoneFromJid(p.phoneNumber) : '';
          return (
            pPhone === targetPhone ||
            pLidPhone === targetPhone ||
            pPhoneNum === targetPhone ||
            p.id === targetJid ||
            p.id === cleanTargetJid ||
            (p.lid && p.lid === targetJid)
          );
        });
        if (found) {
          if (found.id) candidateIds.push(found.id);
          if (found.lid) candidateIds.push(found.lid);
          if (found.phoneNumber) candidateIds.push(found.phoneNumber);
        }
      } catch {
        // Fallback
      }
      candidateIds.push(cleanTargetJid);
      if (targetJid && !candidateIds.includes(targetJid)) {
        candidateIds.push(targetJid);
      }
      candidateIds = Array.from(new Set(candidateIds.filter(Boolean)));

      let demoted = false;
      let lastErr: any = null;
      for (const cand of candidateIds) {
        try {
          // @ts-ignore
          await (this.sock as any).groupParticipantsUpdate(remoteJid, [cand], 'demote');
          demoted = true;
          break;
        } catch (e) {
          lastErr = e;
        }
      }
      if (!demoted && lastErr) {
        throw lastErr;
      }

      await (this.sock as any).sendMessage(
        remoteJid,
        {
          text: `Berhasil menurunkan jabatan @${targetPhone} menjadi anggota biasa.`,
          mentions: [cleanTargetJid],
        },
        { quoted: msg }
      );

      dbManager.recordUserCommand(senderPhone, senderJid, 'demote');
      dbManager.addLog(
        'bot',
        `Admin+ +${senderPhone} menurunkan ${targetPhone} di grup ${remoteJid}`
      );
    } catch (err: any) {
      console.error('[WA] Gagal mengeksekusi .demote:', err);
      await (this.sock as any).sendMessage(
        remoteJid,
        { text: `Gagal menurunkan jabatan: ${err?.message || 'Error internal'}` },
        { quoted: msg }
      );
    }
  }

  /**
   * Native execution for Group Status Story (Status Cerita Grup WhatsApp):
   * Dispatched using groupStatusMessage protocol so it creates a genuine Group Story status,
   * NOT a regular text/image chat message in the group conversation.
   * Supports both media (image/video) and text stories with genuine background color presets!
   */
  public async sendGroupStatusNative(
    groupIds: string[],
    payload: {
      image?: Buffer;
      video?: Buffer;
      caption?: string;
      text?: string;
      backgroundColor?: string;
      font?: number;
    }
  ): Promise<any> {
    const sock = this.sock as any;
    if (!sock) {
      throw new Error('Koneksi WhatsApp belum terhubung.');
    }

    const { generateWAMessageContent, generateMessageID } = await import('@skycodee/baileys');
    const results: any[] = [];
    const sentKeys: { remoteJid: string; fromMe: boolean; id: string; participant?: string }[] = [];

    for (const gid of groupIds) {
      let sent = false;
      let usedMsgId: string | undefined;

      if (payload.image || payload.video) {
        // Media status (Image / Video)
        try {
          const mediaContent: any = {};
          if (payload.image) {
            mediaContent.image = payload.image;
            if (payload.caption) mediaContent.caption = payload.caption;
          } else if (payload.video) {
            mediaContent.video = payload.video;
            if (payload.caption) mediaContent.caption = payload.caption;
          }

          const waMsgContent = await generateWAMessageContent(mediaContent, {
            upload: sock.waUploadToServer,
          });
          const innerMsg = waMsgContent.message || waMsgContent;
          const msgKey = Object.keys(innerMsg).find(
            (k) => innerMsg[k] && typeof innerMsg[k] === 'object'
          );
          if (msgKey && innerMsg[msgKey]) {
            innerMsg[msgKey].contextInfo = innerMsg[msgKey].contextInfo || {};
            innerMsg[msgKey].contextInfo.isGroupStatus = true;
            innerMsg[msgKey].contextInfo.statusSourceType = innerMsg.imageMessage ? 0 : 1;
          }

          const messageId = typeof generateMessageID === 'function' ? generateMessageID() : `swgc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          usedMsgId = messageId;
          try {
            const res = await sock.relayMessage(
              gid,
              { groupStatusMessageV2: { message: innerMsg } },
              { messageId }
            );
            results.push(res);
            sent = true;
          } catch {
            const res2 = await sock.sendMessage(gid, {
              groupStatusMessage: { message: innerMsg },
            });
            results.push(res2);
            usedMsgId = res2?.key?.id || messageId;
            sent = true;
          }
        } catch (mediaErr: any) {
          console.error(`[WA] Gagal kirim status media ke ${gid}:`, mediaErr?.message);
        }
      } else {
        // Text status story with custom background color & font
        const colorData = resolveSwgcColor(payload.backgroundColor || 'hijau');
        const argbVal = (colorData.argb >>> 0); // Unsigned 32-bit ARGB integer

        const extMessage = {
          text: payload.text || payload.caption || '',
          backgroundArgb: argbVal,
          font: payload.font || 1,
          contextInfo: {
            isGroupStatus: true,
            statusSourceType: 4,
          },
        };

        const messageId = typeof generateMessageID === 'function' ? generateMessageID() : `swgc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        usedMsgId = messageId;

        // Method A: relayMessage with groupStatusMessageV2 (modern official WhatsApp standard)
        try {
          const res = await sock.relayMessage(
            gid,
            {
              groupStatusMessageV2: {
                message: {
                  extendedTextMessage: extMessage,
                },
              },
            },
            { messageId }
          );
          results.push(res);
          sent = true;
        } catch (errA: any) {
          console.warn(`[WA] relayMessage groupStatusMessageV2 failed for ${gid}:`, errA?.message);
        }

        // Method B: relayMessage with groupStatusMessage
        if (!sent) {
          try {
            const res = await sock.relayMessage(
              gid,
              {
                groupStatusMessage: {
                  message: {
                    extendedTextMessage: extMessage,
                  },
                },
              },
              { messageId }
            );
            results.push(res);
            sent = true;
          } catch (errB: any) {
            console.warn(`[WA] relayMessage groupStatusMessage failed for ${gid}:`, errB?.message);
          }
        }

        // Method C: sendMessage with groupStatusMessage containing .message
        if (!sent) {
          try {
            const res = await sock.sendMessage(gid, {
              groupStatusMessage: {
                message: {
                  extendedTextMessage: extMessage,
                },
              },
            });
            results.push(res);
            usedMsgId = res?.key?.id || messageId;
            sent = true;
          } catch (errC: any) {
            console.warn(`[WA] sendMessage groupStatusMessage failed for ${gid}:`, errC?.message);
          }
        }
      }

      if (sent && usedMsgId) {
        sentKeys.push({ remoteJid: gid, fromMe: true, id: usedMsgId });
      }
    }

    // Record published story to activeGroupStories for .delswgc management
    if (sentKeys.length > 0) {
      const isMedia = Boolean(payload.image || payload.video);
      const storyType: 'text' | 'image' | 'video' = payload.image ? 'image' : payload.video ? 'video' : 'text';
      const snippet = (payload.caption || payload.text || (payload.image ? 'Status Gambar' : payload.video ? 'Status Video' : 'Status Teks')).trim();
      const colorData = resolveSwgcColor(payload.backgroundColor || 'hijau');

      const newStory: ActiveGroupStory = {
        id: `story_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: storyType,
        snippet: snippet.slice(0, 100),
        colorName: !isMedia ? colorData.name : undefined,
        targetCount: sentKeys.length,
        createdAt: Date.now(),
        keys: sentKeys,
      };

      this.activeGroupStories.unshift(newStory);
      if (this.activeGroupStories.length > 60) {
        this.activeGroupStories.pop();
      }
      this.saveSessionCache(this.currentSessionId);
    }

    if (results.length === 0) {
      throw new Error('Gagal mempublikasikan status ke grup target.');
    }
    return results;
  }

  /**
   * Delete a published group story by 1-based index (for .delswgc)
   */
  public async deleteGroupStoryByIndex(index: number): Promise<{ success: boolean; deletedStory?: ActiveGroupStory; message: string }> {
    if (!this.sock) {
      throw new Error('Koneksi WhatsApp belum terhubung.');
    }
    if (this.activeGroupStories.length === 0) {
      return { success: false, message: 'Belum ada riwayat status cerita grup yang tersimpan di sesi ini.' };
    }
    const targetIdx = index - 1;
    if (targetIdx < 0 || targetIdx >= this.activeGroupStories.length) {
      return {
        success: false,
        message: `Nomor urut [${index}] tidak ditemukan. Total status cerita grup aktif: ${this.activeGroupStories.length}. Ketik .delswgc untuk melihat daftar nomor urut.`,
      };
    }

    const story = this.activeGroupStories[targetIdx];
    let deletedCount = 0;
    const myJid = (this.sock as any)?.user?.id?.split(':')[0] + '@s.whatsapp.net';

    for (const key of story.keys) {
      let delSuccess = false;
      try {
        await (this.sock as any).sendMessage(key.remoteJid, {
          delete: {
            remoteJid: key.remoteJid,
            fromMe: true,
            id: key.id,
          },
        });
        delSuccess = true;
      } catch (delErr: any) {
        try {
          await (this.sock as any).relayMessage(
            key.remoteJid,
            {
              protocolMessage: {
                key: {
                  remoteJid: key.remoteJid,
                  fromMe: true,
                  id: key.id,
                },
                type: 0,
              },
            },
            {}
          );
          delSuccess = true;
        } catch (delErrRelay: any) {
          try {
            if (myJid) {
              await (this.sock as any).sendMessage(key.remoteJid, {
                delete: {
                  remoteJid: key.remoteJid,
                  fromMe: true,
                  id: key.id,
                  participant: myJid,
                },
              });
              delSuccess = true;
            }
          } catch (delErr2: any) {
            console.warn(`[WA] Gagal hapus status cerita di grup ${key.remoteJid}:`, delErr2?.message);
          }
        }
      }
      if (delSuccess) {
        deletedCount++;
      }
    }

    this.activeGroupStories.splice(targetIdx, 1);
    this.saveSessionCache(this.currentSessionId);

    return {
      success: true,
      deletedStory: story,
      message: `Status cerita grup nomor [${index}] berhasil dihapus dari ${deletedCount} grup.`,
    };
  }

  /**
   * Command .delswgc implementation:
   * .delswgc => shows numbered list of active group stories
   * .delswgc [nomor] => deletes the specific group status for everyone
   */
  private async handleDelswgcCommand(
    msg: WAMessage,
    remoteJid: string,
    senderJid: string,
    senderPhone: string,
    rawArg: string
  ): Promise<void> {
    try {
      const cleanArg = (rawArg || '').trim();
      const digits = cleanArg.replace(/[^0-9]/g, '');

      // If no valid index number provided, return numbered list
      if (!digits) {
        if (this.activeGroupStories.length === 0) {
          await (this.sock as any).sendMessage(
            remoteJid,
            {
              text:
                '*STATUS CERITA GRUP (SWGC)*\n\n' +
                'Tidak ada status cerita grup yang aktif tersimpan di memori sesi ini.\n' +
                'Kirim status baru menggunakan perintah *.swgc Pesan --warna*.',
            },
            { quoted: msg }
          );
          return;
        }

        let listText = '*DAFTAR STATUS CERITA GRUP AKTIF*\n';
        listText += '_Pilih nomor urut status yang ingin Anda hapus:_\n\n';

        this.activeGroupStories.forEach((st, i) => {
          const num = i + 1;
          const timeStr = formatWib(st.createdAt);
          const typeLabel = st.type === 'image' ? 'Gambar' : st.type === 'video' ? 'Video' : 'Teks';
          listText += `*[${num}]* [${typeLabel}] ${st.snippet}\n`;
          listText += `    Target: ${st.targetCount} grup | Dikirim: ${timeStr}\n\n`;
        });

        listText += '*Cara Menghapus:*\n';
        listText += 'Ketik *.delswgc [nomor]*\n';
        listText += 'Contoh: *.delswgc 1* (untuk menghapus status urutan ke-1)';

        await (this.sock as any).sendMessage(remoteJid, { text: listText }, { quoted: msg });
        return;
      }

      const indexNum = parseInt(digits, 10);
      const res = await this.deleteGroupStoryByIndex(indexNum);

      if (!res.success) {
        await (this.sock as any).sendMessage(remoteJid, { text: res.message }, { quoted: msg });
        return;
      }

      await (this.sock as any).sendMessage(
        remoteJid,
        {
          text:
            `*STATUS CERITA GRUP BERHASIL DIHAPUS (.delswgc)*\n\n` +
            `Nomor Urut: [${indexNum}]\n` +
            `Status: ${res.deletedStory?.snippet || '-'}\n` +
            `Hasil: Ditarik dari ${res.deletedStory?.targetCount || 0} grup target.`,
        },
        { quoted: msg }
      );

      dbManager.incrementStat('groupStatusSent');
      dbManager.recordUserCommand(senderPhone, senderJid, 'delswgc');
      dbManager.addLog('swgc', `Admin+ +${senderPhone} menghapus status cerita grup urutan ke-${indexNum}`);
    } catch (err: any) {
      console.error('[WA] Gagal mengeksekusi .delswgc:', err);
      await (this.sock as any).sendMessage(
        remoteJid,
        { text: `Gagal menghapus status grup: ${err?.message || 'Error internal'}` },
        { quoted: msg }
      );
    }
  }

  /**
   * Helper to inspect any message and extract WhatsApp edit protocol data if present
   */
  public extractEditProtocol(msg: any): { targetId: string; newText: string; editTimestamp: number; targetRemoteJid: string; editMsgId?: string } | null {
    if (!msg) return null;

    const editMsgId = msg.key?.id;

    // Helper to find protocolMessage or editedMessage anywhere in object tree
    const findProtocolOrEdited = (obj: any, depth = 0): any => {
      if (!obj || depth > 6) return null;
      if (obj.protocolMessage) return obj.protocolMessage;
      if (obj.editedMessage) {
        if (obj.editedMessage.protocolMessage) return obj.editedMessage.protocolMessage;
        if (obj.editedMessage.message?.protocolMessage) return obj.editedMessage.message.protocolMessage;
        return obj.editedMessage;
      }
      if (obj.message) return findProtocolOrEdited(obj.message, depth + 1);
      if (obj.ephemeralMessage) return findProtocolOrEdited(obj.ephemeralMessage, depth + 1);
      if (obj.viewOnceMessage) return findProtocolOrEdited(obj.viewOnceMessage, depth + 1);
      if (obj.viewOnceMessageV2) return findProtocolOrEdited(obj.viewOnceMessageV2, depth + 1);
      if (obj.documentWithCaptionMessage) return findProtocolOrEdited(obj.documentWithCaptionMessage, depth + 1);
      return null;
    };

    const targetNode = findProtocolOrEdited(msg.message || msg);
    if (!targetNode) return null;

    // If it's a protocolMessage
    if (targetNode.key && (targetNode.type === 14 || (targetNode.type as any) === 'MESSAGE_EDIT' || targetNode.editedMessage)) {
      const targetId = targetNode.key?.id;
      if (!targetId) return null;

      // Extract new text using unwrapMessage on editedMessage
      const unwrapped = this.unwrapMessage(targetNode.editedMessage || targetNode);
      const newText = unwrapped.text;

      return {
        targetId,
        newText,
        editTimestamp: Number(targetNode.timestampMs) || (Number(msg.messageTimestamp) * 1000) || Date.now(),
        targetRemoteJid: targetNode.key?.remoteJid || msg.key?.remoteJid || '',
        editMsgId,
      };
    }

    // If it's an editedMessage node directly
    if (targetNode.message || targetNode.conversation || targetNode.extendedTextMessage) {
      const unwrapped = this.unwrapMessage(targetNode);
      if (unwrapped.text && editMsgId) {
        return {
          targetId: editMsgId,
          newText: unwrapped.text,
          editTimestamp: (Number(msg.messageTimestamp) * 1000) || Date.now(),
          targetRemoteJid: msg.key?.remoteJid || '',
          editMsgId,
        };
      }
    }

    return null;
  }

  /**
   * Resolves a clean phone number from a JID, checking lidToPhoneMap and contacts.
   * If it's an LID that cannot be resolved to a phone number, returns empty string ''
   * instead of leaking raw internal LID numbers.
   */
  public resolvePhone(rawJid: string): string {
    if (!rawJid) return '';
    let jid = rawJid;
    if (this.lidToPhoneMap.has(rawJid)) {
      jid = this.lidToPhoneMap.get(rawJid) || rawJid;
    }
    const clean = jid.split('@')[0]?.split(':')[0] || '';
    if (this.lidToPhoneMap.has(clean)) {
      const mapped = this.lidToPhoneMap.get(clean) || '';
      if (mapped) jid = mapped;
    }

    if (jid.includes('@lid')) {
      for (const [cJid, c] of this.contacts.entries()) {
        if (c.phone && (cJid === jid || (c as any).lid === jid)) {
          return c.phone;
        }
      }
      return '';
    }

    const phone = extractPhoneFromJid(jid);
    if (phone.length >= 14 && phone.startsWith('10')) {
      return '';
    }
    return phone;
  }

  /**
   * Helper to format how a user is tagged / displayed in .ghost.
   * Prioritizes real phone number (e.g. @6281234567890), or contact name / pushName (e.g. @Budi).
   * NEVER displays a raw 15-digit internal LID like @104829103810293.
   */
  public formatUserDisplayTag(
    jid: string,
    phone?: string,
    pushName?: string
  ): { displayTag: string; mentionJids: string[] } {
    const realPhone = phone || this.resolvePhone(jid);
    const contact = this.contacts.get(jid) || (realPhone ? this.contacts.get(`${realPhone}@s.whatsapp.net`) : null);
    const name = contact?.name || pushName || '';

    const mentionJids: string[] = [];
    if (jid) mentionJids.push(jid);
    if (realPhone) {
      const pJid = `${realPhone}@s.whatsapp.net`;
      if (!mentionJids.includes(pJid)) mentionJids.push(pJid);
    }

    let displayTag = '';
    if (realPhone && !realPhone.startsWith('10') && realPhone.length <= 13) {
      displayTag = `@${realPhone}`;
    } else if (name && !name.startsWith('+10')) {
      displayTag = `@${name}`;
    } else {
      displayTag = pushName ? `@${pushName}` : 'Pengirim';
    }

    return { displayTag, mentionJids };
  }

  /**
   * Track incoming message for Anti-Delete & Anti-Edit (.ghost)
   */
  public async trackIncomingMessage(msg: WAMessage): Promise<void> {
    if (!msg.message) return;
    const msgId = msg.key?.id;
    if (!msgId) return;

    // 1. Detect protocol revoke messages (user pressed "Delete for everyone")
    const protocolMsg =
      msg.message?.protocolMessage ||
      msg.message?.editedMessage?.message?.protocolMessage;

    if (protocolMsg && (protocolMsg.type === 0 || (protocolMsg.type as any) === 'REVOKE')) {
      const revokedKey = protocolMsg.key;
      if (revokedKey?.id) {
        this.markMessageAsDeleted(revokedKey.id, msg.key.remoteJid || '');
      }
      return;
    }

    // 2. Detect protocol edit messages (user edited a message)
    const editInfo = this.extractEditProtocol(msg);
    if (editInfo && editInfo.targetId) {
      this.markMessageAsEdited(
        editInfo.targetId,
        editInfo.newText,
        editInfo.editTimestamp,
        editInfo.targetRemoteJid,
        editInfo.editMsgId || msgId
      );
      return;
    }

    const unwrapped = this.unwrapMessage(msg);
    const remoteJid = msg.key.remoteJid || '';
    const participant = msg.key.participant || (msg as any).participant || (msg.key.fromMe ? (this.sock as any)?.user?.id : remoteJid) || '';
    const senderPhone = this.resolvePhone(participant) || this.resolvePhone(remoteJid);
    const senderName = msg.pushName || (msg as any).verifiedName || (senderPhone ? `+${senderPhone}` : '');

    // CRITICAL: Jika pesan dengan msgId SUDAH tercatat, JANGAN menimpa dan menghapus riwayatnya!
    const existing = this.trackedMessagesMap.get(msgId);
    if (existing) {
      const newText = unwrapped.text || '';
      // Jika teksnya berubah dari yang tercatat sebelumnya, ini adalah editan!
      if (newText && newText !== existing.text) {
        this.markMessageAsEdited(
          msgId,
          newText,
          (Number(msg.messageTimestamp) || 0) * 1000 || Date.now(),
          remoteJid,
          msgId
        );
      }
      return;
    }

    let mediaType: 'text' | 'image' | 'video' | 'audio' = 'text';
    let mediaBuffer: Buffer | undefined;

    const imgMsg = unwrapped.message?.imageMessage;
    const vidMsg = unwrapped.message?.videoMessage;
    const audMsg = unwrapped.message?.audioMessage;

    if (imgMsg) {
      mediaType = 'image';
      try {
        // @ts-ignore
        mediaBuffer = (await downloadMediaMessage(msg, 'buffer', {})) as Buffer;
      } catch {}
    } else if (vidMsg) {
      mediaType = 'video';
      try {
        // @ts-ignore
        mediaBuffer = (await downloadMediaMessage(msg, 'buffer', {})) as Buffer;
      } catch {}
    } else if (audMsg) {
      mediaType = 'audio';
      try {
        // @ts-ignore
        mediaBuffer = (await downloadMediaMessage(msg, 'buffer', {})) as Buffer;
      } catch {}
    }

    const tracked: TrackedMessage = {
      id: msgId,
      remoteJid,
      senderJid: participant,
      senderPhone,
      senderName,
      text: unwrapped.text || '',
      mediaCaption: imgMsg?.caption || vidMsg?.caption || '',
      mediaType,
      mediaBuffer,
      createdAt: (Number(msg.messageTimestamp) || Math.floor(Date.now() / 1000)) * 1000,
      readBy: [],
      isDeleted: false,
      deletedAt: null,
      isEdited: false,
      editHistory: [],
    };

    this.trackedMessagesMap.set(msgId, tracked);

    if (this.trackedMessagesMap.size > 2000) {
      const oldestKey = this.trackedMessagesMap.keys().next().value;
      if (oldestKey) this.trackedMessagesMap.delete(oldestKey);
    }
  }

  /**
   * Handle messages.update event (message revoked / deleted / edited)
   */
  public handleMessageUpdate(update: any): void {
    if (!update || !update.key) return;
    const key = update.key;
    const msgId = key.id;
    if (!msgId) return;

    const isRevoke =
      update.update?.messageStubType === 68 ||
      update.update?.messageStubType === 'REVOKE' ||
      update.update?.message === null;

    if (isRevoke) {
      this.markMessageAsDeleted(msgId, key.remoteJid || '');
      return;
    }

    // Check if this update is an edit via protocol
    const editInfo = this.extractEditProtocol(update.update || update);
    if (editInfo && editInfo.targetId) {
      this.markMessageAsEdited(
        editInfo.targetId,
        editInfo.newText,
        editInfo.editTimestamp,
        editInfo.targetRemoteJid || key.remoteJid || '',
        editInfo.editMsgId || msgId
      );
      return;
    }

    if (update.update?.message || update.update?.editedMessage) {
      const unwrappedUpd = this.unwrapMessage(update.update.editedMessage || update.update.message);
      if (unwrappedUpd.text) {
        this.markMessageAsEdited(msgId, unwrappedUpd.text, Date.now(), key.remoteJid || '', msgId);
      }
    }
  }

  /**
   * Handle message-receipt.update to record readers before deletion
   */
  public handleMessageReceipt(receipt: any): void {
    if (!receipt || !receipt.key?.id) return;
    const msgId = receipt.key.id;
    const tracked = this.trackedMessagesMap.get(msgId);
    if (!tracked) return;

    const readerJid = receipt.receipt?.userJid || receipt.participant;
    if (readerJid) {
      const readerPhone = this.resolvePhone(readerJid) || extractPhoneFromJid(readerJid);
      if (readerPhone && !tracked.readBy.some((r) => r.phone === readerPhone)) {
        const contactName = this.contacts.get(readerJid)?.name || `+${readerPhone}`;
        tracked.readBy.push({
          phone: readerPhone,
          name: contactName,
          readAt: Date.now(),
        });
      }
    }
  }

  /**
   * Helper to retrieve a message by ID or any of its edit aliases
   */
  public getTrackedOrDeletedMessage(id: string): TrackedMessage | undefined {
    if (!id) return undefined;
    if (this.trackedMessagesMap.has(id)) {
      return this.trackedMessagesMap.get(id);
    }
    const targetId = this.editIdToTargetIdMap.get(id);
    if (targetId && this.trackedMessagesMap.has(targetId)) {
      return this.trackedMessagesMap.get(targetId);
    }
    let found = this.deletedMessagesList.find((d) => d.id === id);
    if (!found && targetId) {
      found = this.deletedMessagesList.find((d) => d.id === targetId);
    }
    if (!found) {
      for (const [eId, tId] of this.editIdToTargetIdMap.entries()) {
        if (eId === id) {
          found = this.deletedMessagesList.find((d) => d.id === tId);
          if (found) break;
        }
      }
    }
    return found;
  }

  /**
   * Mark message as deleted and register in deletedMessagesList
   */
  public markMessageAsDeleted(msgId: string, remoteJid: string): void {
    const actualTargetId = this.editIdToTargetIdMap.get(msgId) || msgId;
    let tracked = this.trackedMessagesMap.get(actualTargetId);
    if (!tracked && actualTargetId !== msgId) {
      tracked = this.trackedMessagesMap.get(msgId);
    }

    if (tracked) {
      if (tracked.isDeleted) return;
      tracked.isDeleted = true;
      tracked.deletedAt = Date.now();

      // Deep clone editHistory agar seluruh riwayat editan sebelum dihapus aman permanen
      const clonedHistory = Array.isArray(tracked.editHistory)
        ? tracked.editHistory.map((h) => ({ ...h }))
        : [];

      const existIdx = this.deletedMessagesList.findIndex((d) => d.id === tracked!.id);
      if (existIdx !== -1) {
        this.deletedMessagesList[existIdx] = {
          ...tracked,
          editHistory: clonedHistory,
        };
      } else {
        this.deletedMessagesList.unshift({
          ...tracked,
          editHistory: clonedHistory,
        });
      }

      if (this.deletedMessagesList.length > 500) {
        this.deletedMessagesList.pop();
      }
      dbManager.addLog(
        'bot',
        `Pesan terhapus terdeteksi dari +${tracked.senderPhone || 'User'} di ${remoteJid || tracked.remoteJid}`
      );
    }
  }

  /**
   * Mark message as edited and record previous text in editHistory
   */
  public markMessageAsEdited(
    msgId: string,
    newText: string,
    editTimestamp?: number,
    remoteJid?: string,
    editMsgId?: string
  ): void {
    if (!msgId || !newText) return;

    // Resolve target ID jika msgId merupakan alias / editMsgId
    const actualTargetId = this.editIdToTargetIdMap.get(msgId) || msgId;
    if (editMsgId && editMsgId !== actualTargetId) {
      this.editIdToTargetIdMap.set(editMsgId, actualTargetId);
    }
    if (msgId !== actualTargetId) {
      this.editIdToTargetIdMap.set(msgId, actualTargetId);
    }

    let tracked = this.trackedMessagesMap.get(actualTargetId);
    const nowTime = editTimestamp && editTimestamp > 1000000000000 ? editTimestamp : Date.now();

    if (!tracked) {
      // Cek apakah pesan sudah berada di deletedMessagesList
      const inDeleted = this.deletedMessagesList.find((d) => d.id === actualTargetId);
      if (inDeleted) {
        if (!inDeleted.editHistory) inDeleted.editHistory = [];
        if (newText !== inDeleted.text) {
          inDeleted.editHistory.push({
            text: inDeleted.text || inDeleted.mediaCaption || '(Pesan awal)',
            editedAt: inDeleted.createdAt || nowTime - 1000,
          });
          inDeleted.text = newText;
          inDeleted.isEdited = true;
        }
        return;
      }

      // Jika pesan belum tercatat, inisialisasi dengan teks baru
      const phone = this.resolvePhone(remoteJid || '');
      tracked = {
        id: actualTargetId,
        remoteJid: remoteJid || '',
        senderJid: '',
        senderPhone: phone,
        senderName: phone ? `+${phone}` : '',
        text: newText,
        mediaType: 'text',
        mediaCaption: '',
        createdAt: nowTime - 2000,
        readBy: [],
        isDeleted: false,
        deletedAt: null,
        isEdited: true,
        editHistory: [],
      };
      this.trackedMessagesMap.set(actualTargetId, tracked);
      return;
    }

    if (!tracked.editHistory) {
      tracked.editHistory = [];
    }

    // Rekam versi teks sebelumnya ke editHistory HANYA jika teks baru berbeda
    if (newText !== tracked.text) {
      const prevText = tracked.text || tracked.mediaCaption;
      if (prevText) {
        const prevTimestamp =
          tracked.editHistory.length === 0
            ? (tracked.createdAt || nowTime - 1000)
            : nowTime;

        tracked.editHistory.push({
          text: prevText,
          editedAt: prevTimestamp,
        });
      }

      tracked.text = newText;
      tracked.isEdited = true;

      // Perbarui juga data di deletedMessagesList jika pesan ini sudah tercatat terhapus
      const deletedIdx = this.deletedMessagesList.findIndex((d) => d.id === actualTargetId);
      if (deletedIdx !== -1) {
        this.deletedMessagesList[deletedIdx] = {
          ...tracked,
          editHistory: [...tracked.editHistory],
        };
      }

      dbManager.addLog(
        'bot',
        `Pesan diedit oleh +${tracked.senderPhone || 'User'} di ${tracked.remoteJid || remoteJid} (Total riwayat edit: ${tracked.editHistory.length}x)`
      );
    }
  }

  /**
   * Mengirim laporan 1 bubble chat untuk 1 pesan yang diedit dan/atau terhapus.
   * Menampilkan pesan terakhir di bagian atas, seluruh riwayat teks sebelum diedit
   * di bagian tengah, dan status ringkas serta tag pengguna di bagian bawah.
   */
  private async sendGhostMessageReport(
    remoteJid: string,
    item: TrackedMessage,
    quotedMsg: WAMessage
  ): Promise<void> {
    const currentContent = item.text || item.mediaCaption || '';

    // Format riwayat edit jika pesan ini pernah diedit (disajikan dalam 1 bubble chat)
    let editHistoryBlock = '';
    if (item.editHistory && item.editHistory.length > 0) {
      const lines = item.editHistory.map((h, i) => {
        const time = formatWib(h.editedAt);
        const label = i === 0 ? 'Pesan Awal' : `Edit ${i}`;
        return `• ${label}: ${h.text} (${time})`;
      });
      editHistoryBlock = `\n\nRiwayat Pesan Sebelum Diedit:\n${lines.join('\n')}`;
    }

    const timeStr = item.deletedAt
      ? formatWib(item.deletedAt)
      : item.editHistory && item.editHistory.length > 0
      ? formatWib(item.createdAt || item.editHistory[item.editHistory.length - 1].editedAt)
      : formatWib(item.createdAt);

    // Resolve user tag & mentions secara aman (menghindari raw LID)
    const { displayTag, mentionJids } = this.formatUserDisplayTag(
      item.senderJid,
      item.senderPhone,
      item.senderName
    );

    let actionLabel = 'Pesan';
    if (item.isDeleted && item.isEdited) {
      actionLabel = 'Diedit lalu Dihapus';
    } else if (item.isDeleted) {
      actionLabel = 'Dihapus';
    } else if (item.isEdited) {
      actionLabel = 'Diedit';
    }

    const statusText = `${actionLabel} oleh ${displayTag} (${timeStr})`;

    // Satukan pesan terkini, seluruh riwayat edit sebelum diedit, dan status ke dalam 1 BUBBLE CHAT
    let reportText = '';
    if (currentContent) {
      reportText = `${currentContent}${editHistoryBlock}\n\n${statusText}`;
    } else if (editHistoryBlock) {
      reportText = `${editHistoryBlock.trim()}\n\n${statusText}`;
    } else {
      reportText = statusText;
    }

    if (item.mediaBuffer && item.mediaType && item.mediaType !== 'text') {
      if (item.mediaType === 'image') {
        await (this.sock as any).sendMessage(
          remoteJid,
          {
            image: item.mediaBuffer,
            caption: reportText,
            mentions: mentionJids,
          },
          { quoted: quotedMsg }
        );
      } else if (item.mediaType === 'video') {
        await (this.sock as any).sendMessage(
          remoteJid,
          {
            video: item.mediaBuffer,
            caption: reportText,
            mentions: mentionJids,
          },
          { quoted: quotedMsg }
        );
      } else if (item.mediaType === 'audio') {
        await (this.sock as any).sendMessage(
          remoteJid,
          {
            text: reportText,
            mentions: mentionJids,
          },
          { quoted: quotedMsg }
        );
        await (this.sock as any).sendMessage(
          remoteJid,
          {
            audio: item.mediaBuffer,
            mimetype: 'audio/mp4',
            ptt: true,
          },
          { quoted: quotedMsg }
        );
      }
    } else {
      await (this.sock as any).sendMessage(
        remoteJid,
        {
          text: reportText,
          mentions: mentionJids,
        },
        { quoted: quotedMsg }
      );
    }
  }

  /**
   * Command .ghost implementation:
   * 1. Jika di-REPLY ke pesan tertentu: langsung me-reveal riwayat pesan yang di-reply tersebut
   *    (menampilkan isi pesan terkini, riwayat editan sebelumnya, dan status penghapusan dalam 1 bubble chat).
   * 2. Jika tanpa reply: mencari riwayat pesan terhapus/diedit pada user/chat tersebut.
   * - Hening jika tidak ada riwayat terhapus/diedit.
   */
  private async handleGhostCommand(
    msg: WAMessage,
    remoteJid: string,
    senderJid: string,
    senderPhone: string,
    rawArg: string
  ): Promise<void> {
    try {
      const isGroup = remoteJid.endsWith('@g.us');
      const unwrapped = this.unwrapMessage(msg);
      const quotedStanzaId = unwrapped.contextInfo?.stanzaId;

      // KASUS 1: User me-REPLY pesan tertentu dengan .ghost / .edit
      if (quotedStanzaId) {
        const targetMsg = this.getTrackedOrDeletedMessage(quotedStanzaId);

        if (targetMsg) {
          await this.sendGhostMessageReport(remoteJid, targetMsg, msg);
          dbManager.recordUserCommand(senderPhone, senderJid, 'ghost');
          dbManager.addLog(
            'bot',
            `Admin+ +${senderPhone} me-reveal histori pesan (id: ${quotedStanzaId}) via reply .ghost di ${remoteJid}`
          );
          return;
        } else {
          // Jika tidak ditemukan di memori bot, periksa apakah ada teks di quotedMessage
          const quotedContent = unwrapped.contextInfo?.quotedMessage;
          if (quotedContent) {
            const unwrappedQuoted = this.unwrapMessage(quotedContent);
            if (unwrappedQuoted.text) {
              const qParticipant = unwrapped.contextInfo?.participant || '';
              const qPhone = this.resolvePhone(qParticipant) || extractPhoneFromJid(qParticipant);
              const { displayTag, mentionJids } = this.formatUserDisplayTag(qParticipant, qPhone);
              await (this.sock as any).sendMessage(
                remoteJid,
                {
                  text: `${unwrappedQuoted.text}\n\nPesan oleh ${displayTag} (Pesan sebelum bot online / tidak ada riwayat editan tersimpan)`,
                  mentions: mentionJids,
                },
                { quoted: msg }
              );
              return;
            }
          }

          await (this.sock as any).sendMessage(
            remoteJid,
            { text: 'Pesan yang Anda reply tidak ditemukan dalam riwayat pelacakan bot.' },
            { quoted: msg }
          );
          return;
        }
      }

      // KASUS 2: User memanggil .ghost tanpa reply (misal .ghost @user di grup atau .ghost di pribadi)
      let targetPhone = '';
      let targetJid = '';

      if (isGroup) {
        const mentions = unwrapped.contextInfo?.mentionedJid || [];
        if (mentions.length > 0) {
          targetJid = mentions[0];
          targetPhone = this.resolvePhone(targetJid);
        } else {
          const digits = rawArg.replace(/[^0-9]/g, '');
          if (digits.length >= 8) {
            targetPhone = digits;
            targetJid = `${digits}@s.whatsapp.net`;
          }
        }
      }

      // ISOLASI KETAT: Hanya cari pesan terhapus atau diedit yang berasal dari remoteJid INI
      // 1. Ambil dari deletedMessagesList yang sesuai remoteJid
      const deletedInChat = this.deletedMessagesList.filter((d) => d.remoteJid === remoteJid);

      // 2. Ambil dari trackedMessagesMap yang pernah diedit (isEdited) di remoteJid ini
      const editedInChat: TrackedMessage[] = [];
      for (const m of this.trackedMessagesMap.values()) {
        if (m.remoteJid === remoteJid && (m.isEdited || (m.editHistory && m.editHistory.length > 0))) {
          if (!deletedInChat.some((d) => d.id === m.id)) {
            editedInChat.push(m);
          }
        }
      }

      // Gabungkan kandidat pesan (terhapus dan/atau diedit)
      const allCandidateList = [...deletedInChat, ...editedInChat];

      let targetList: TrackedMessage[] = [];
      if (isGroup && targetPhone) {
        targetList = allCandidateList.filter((d) => {
          const p = d.senderPhone || this.resolvePhone(d.senderJid);
          return p === targetPhone || d.senderJid === targetJid;
        });
      } else {
        // Di chat pribadi atau di grup tanpa tag: ambil seluruh pesan di percakapan ini
        targetList = allCandidateList;
      }

      // Jika belum ada pesan yang terhapus atau diedit: hening (jangan balas apapun)
      if (targetList.length === 0) {
        return;
      }

      // Ambil hingga 5 pesan terakhir secara kronologis (paling lama ke paling baru)
      const itemsToShow = targetList.slice(0, 5).reverse();

      for (let idx = 0; idx < itemsToShow.length; idx++) {
        await this.sendGhostMessageReport(remoteJid, itemsToShow[idx], msg);
        if (idx < itemsToShow.length - 1) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }

      dbManager.recordUserCommand(senderPhone, senderJid, 'ghost');
      dbManager.addLog(
        'bot',
        `Admin+ +${senderPhone} mengambil ${itemsToShow.length} pesan terhapus/diedit via .ghost di ${remoteJid}`
      );
    } catch (err: any) {
      console.error('[WA] Gagal memproses .ghost:', err);
    }
  }

  /**
   * Command .ghostclear implementation:
   * Membersihkan histori pesan terhapus dan riwayat editan di grup atau chat pribadi.
   * - Di pribadi: membersihkan semua histori chat pribadi tersebut.
   * - Di grup dengan tag @user: membersihkan histori user tersebut di grup.
   * - Di grup tanpa tag: membersihkan histori seluruh member di grup tersebut.
   * Respon ke chat: Hening tanpa balasan (bersih).
   */
  private async handleGhostClearCommand(
    msg: WAMessage,
    remoteJid: string,
    senderJid: string,
    senderPhone: string,
    rawArg: string
  ): Promise<void> {
    try {
      const isGroup = remoteJid.endsWith('@g.us');
      let targetPhone = '';
      let targetJid = '';

      if (isGroup) {
        const unwrapped = this.unwrapMessage(msg);
        const mentions = unwrapped.contextInfo?.mentionedJid || [];
        if (mentions.length > 0) {
          targetJid = mentions[0];
          targetPhone = this.resolvePhone(targetJid);
        } else {
          const quotedParticipant = unwrapped.contextInfo?.participant;
          if (quotedParticipant) {
            targetJid = this.lidToPhoneMap.get(quotedParticipant) || quotedParticipant;
            targetPhone = this.resolvePhone(targetJid);
          } else {
            const digits = rawArg.replace(/[^0-9]/g, '');
            if (digits.length >= 8) {
              targetPhone = digits;
              targetJid = `${digits}@s.whatsapp.net`;
            }
          }
        }
      }

      if (isGroup && targetPhone) {
        // Hapus histori user tertentu di grup ini
        this.deletedMessagesList = this.deletedMessagesList.filter((d) => {
          const p = d.senderPhone || this.resolvePhone(d.senderJid);
          return !(d.remoteJid === remoteJid && (p === targetPhone || d.senderJid === targetJid));
        });
        for (const [id, m] of this.trackedMessagesMap.entries()) {
          const p = m.senderPhone || this.resolvePhone(m.senderJid);
          if (m.remoteJid === remoteJid && (p === targetPhone || m.senderJid === targetJid)) {
            m.isDeleted = false;
            m.isEdited = false;
            m.editHistory = [];
          }
        }
        dbManager.addLog(
          'bot',
          `Admin+ +${senderPhone} membersihkan histori pesan terhapus & editan user +${targetPhone} di ${remoteJid}`
        );
      } else {
        // Hapus histori seluruh anggota di grup ini atau di chat pribadi ini
        this.deletedMessagesList = this.deletedMessagesList.filter((d) => d.remoteJid !== remoteJid);
        for (const [id, m] of this.trackedMessagesMap.entries()) {
          if (m.remoteJid === remoteJid) {
            m.isDeleted = false;
            m.isEdited = false;
            m.editHistory = [];
          }
        }
        dbManager.addLog(
          'bot',
          `Admin+ +${senderPhone} membersihkan seluruh histori pesan terhapus & editan di ${remoteJid}`
        );
      }

      // Hening tanpa respon balasan teks ke WhatsApp (bersih)
    } catch (err: any) {
      console.error('[WA] Gagal memproses .ghostclear:', err);
    }
  }

  /**
   * Command .cleardata implementation:
   * Membersihkan semua histori chat, pesan terhapus di memori, berkas media sementara,
   * dan analitik web server agar tidak memenuhi penyimpanan server.
   */
  private async handleClearDataCommand(
    msg: WAMessage,
    remoteJid: string,
    senderJid: string,
    senderPhone: string
  ): Promise<void> {
    try {
      // 1. Bersihkan database web dan file temp di server
      const result = dbManager.clearWebData();

      // 2. Kosongkan pelacakan memori aktif
      this.trackedMessagesMap.clear();
      this.deletedMessagesList = [];
      this.editIdToTargetIdMap.clear();

      dbManager.addLog(
        'system',
        `Admin+ +${senderPhone} menjalankan .cleardata: seluruh histori web dan ${result.deletedFilesCount} file media dibersihkan.`
      );

      // Balasan ringkas ke Admin+
      await (this.sock as any).sendMessage(
        remoteJid,
        { text: 'Histori chat dan penyimpanan data web berhasil dibersihkan.' },
        { quoted: msg }
      );
    } catch (err: any) {
      console.error('[WA] Gagal memproses .cleardata:', err);
      await (this.sock as any).sendMessage(
        remoteJid,
        { text: `Gagal membersihkan data web: ${err?.message || 'Error internal'}` },
        { quoted: msg }
      );
    }
  }

  /**
   * Format Announcement message strictly following WhatsApp formatting rules:
   * 🚨 *ANNOUNCEMENT*
   * From : [Nama Bebas]
   * Role : [Role Bebas]
   * Type : [Tipe Pesan]
   * Message : 
   * > [Isi Pesan]
   * (Ensuring literal > character is output)
   */
  public formatAnnouncementMessage(template: {
    from: string;
    role: string;
    type: string;
    message: string;
  }): string {
    const cleanFrom = template.from || 'Admin';
    const cleanRole = template.role || 'Super Admin';
    const cleanType = template.type || 'Pemberitahuan';
    // Format quote lines with literal '>'
    const quoteLines = (template.message || '')
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');

    return `🚨 *ANNOUNCEMENT*\nFrom : ${cleanFrom}\nRole : ${cleanRole}\nType : ${cleanType}\nMessage : \n${quoteLines}`;
  }

  /**
   * Broadcast message to selected targets with custom delay interval
   */
  public async startBroadcast(payload: BroadcastPayload): Promise<BroadcastProgress> {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('WhatsApp belum terhubung.');
    }

    if (this.activeBroadcast && this.activeBroadcast.isRunning) {
      throw new Error('Sedang ada proses broadcast yang berjalan.');
    }

    // Resolve target JIDs
    let targets: string[] = [];
    if (payload.targetType === 'all') {
      const groupJids = Array.from(this.groups.keys());
      const contactJids = Array.from(this.contacts.keys());
      targets = Array.from(new Set([...groupJids, ...contactJids]));
    } else if (payload.targetType === 'groups') {
      targets = Array.from(this.groups.keys());
    } else if (payload.targetType === 'contacts') {
      targets = Array.from(this.contacts.keys());
    } else if (payload.targetType === 'custom' && payload.customJids) {
      targets = payload.customJids;
    }

    if (targets.length === 0) {
      throw new Error('Target broadcast kosong atau belum ada kontak/grup yang tersinkronisasi.');
    }

    let messageText = '';
    if (payload.formatMode === 'custom' || payload.customMessage) {
      messageText = (payload.customMessage || '').trim();
    } else if (payload.templateData) {
      messageText = this.formatAnnouncementMessage(payload.templateData);
    }

    if (!messageText) {
      throw new Error('Pesan broadcast tidak boleh kosong.');
    }

    const delayMs = Math.max(1, payload.delaySeconds || 3) * 1000;

    const broadcastState: BroadcastProgress = {
      id: `bc-${Date.now()}`,
      isRunning: true,
      total: targets.length,
      sent: 0,
      failed: 0,
      isCompleted: false,
      failedTargets: [],
    };
    this.activeBroadcast = broadcastState;

    // Run asynchronously in background
    (async () => {
      dbManager.addLog('broadcast', `Memulai broadcast ke ${targets.length} target (jeda ${payload.delaySeconds}s)`);

      for (let i = 0; i < targets.length; i++) {
        if (!this.activeBroadcast || !this.activeBroadcast.isRunning) {
          break;
        }

        const targetJid = targets[i];
        this.activeBroadcast.currentTarget = targetJid;

        const messageOptions: any = { text: messageText };
        if (payload.forwardedManyTimes) {
          messageOptions.contextInfo = {
            isForwarded: true,
            forwardingScore: 999, // Native WhatsApp "Diteruskan berkali-kali" indicator
          };
        }

        let sentSuccess = false;
        let lastErrorMsg = '';

        // Attempt send with graceful retry for transient errors (e.g., service-unavailable)
        for (let attempt = 1; attempt <= 2; attempt++) {
          if (!this.sock) {
            lastErrorMsg = 'Soket terputus';
            break;
          }

          try {
            await (this.sock as any).sendMessage(targetJid, messageOptions);
            sentSuccess = true;
            break;
          } catch (sendErr: any) {
            const rawMsg = sendErr?.message || String(sendErr);
            lastErrorMsg = rawMsg;
            const isServiceUnavailable =
              rawMsg.includes('service-unavailable') ||
              sendErr?.output?.statusCode === 503 ||
              sendErr?.data === 503;
            const isRateLimit =
              rawMsg.includes('rate-overlimit') ||
              sendErr?.output?.statusCode === 429 ||
              sendErr?.data === 429;

            console.warn(`[WA] Percobaan ${attempt} gagal kirim broadcast ke ${targetJid}: ${rawMsg}`);

            // If transient server error or rate-limit, pause and retry once
            if (attempt === 1 && (isServiceUnavailable || isRateLimit)) {
              await new Promise((r) => setTimeout(r, 2500));
            }
          }
        }

        if (sentSuccess) {
          this.activeBroadcast.sent++;
        } else {
          console.error(`[WA] Gagal kirim broadcast ke ${targetJid}: ${lastErrorMsg}`);
          this.activeBroadcast.failed++;
          if (this.activeBroadcast.failedTargets) {
            const cleanReason = lastErrorMsg.includes('service-unavailable')
              ? 'WhatsApp server busy / service-unavailable'
              : (lastErrorMsg.slice(0, 100) || 'Unknown error');
            this.activeBroadcast.failedTargets.push({
              jid: targetJid,
              reason: cleanReason,
            });
          }
        }

        // Delay between messages
        if (i < targets.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }

      if (this.activeBroadcast) {
        this.activeBroadcast.isRunning = false;
        this.activeBroadcast.isCompleted = true;
        this.activeBroadcast.currentTarget = undefined;
      }

      dbManager.incrementStat('totalBroadcasts');
      const botPhone = this.botUser?.phone || extractPhoneFromJid((this.sock as any)?.user?.id) || 'admin';
      dbManager.recordUserCommand(botPhone, '', 'broadcast');
      dbManager.addLog(
        'broadcast',
        `Broadcast selesai: ${this.activeBroadcast?.sent} terkirim, ${this.activeBroadcast?.failed} gagal.`
      );
    })();

    return broadcastState;
  }

  public stopBroadcast(): void {
    if (this.activeBroadcast) {
      this.activeBroadcast.isRunning = false;
      this.activeBroadcast.isCompleted = true;
      dbManager.addLog('broadcast', 'Proses broadcast dihentikan manual oleh pengguna.');
    }
  }

  /**
   * Request 8-digit Pairing Code for phone number login (e.g. 628123456789)
   */
  public async requestPairingCode(phoneNumber: string): Promise<{ success: boolean; code: string; formatted: string }> {
    let cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('08')) {
      cleanPhone = '628' + cleanPhone.slice(2);
    } else if (cleanPhone.startsWith('8')) {
      cleanPhone = '628' + cleanPhone.slice(1);
    }

    if (cleanPhone.length < 9) {
      throw new Error('Nomor telepon tidak valid. Sertakan kode negara, contoh: 628123456789.');
    }

    // Ensure connection is initialized
    if (!this.sock || (this.sock as any).ws?.isClosed) {
      await this.initConnection();
    }

    // Wait until socket instance is available
    let waitAttempts = 0;
    while (!this.sock && waitAttempts < 15) {
      await new Promise((r) => setTimeout(r, 400));
      waitAttempts++;
    }

    if (!this.sock) {
      throw new Error('Socket WhatsApp belum siap.');
    }

    // Wait for the underlying WebSocket to be fully open before requesting pairing
    if (typeof (this.sock as any).waitForSocketOpen === 'function') {
      try {
        await (this.sock as any).waitForSocketOpen();
      } catch (wsErr) {
        console.warn('[WA] Socket WebSocket belum terbuka, menginisialisasi ulang...', wsErr);
        await this.initConnection();
        await (this.sock as any).waitForSocketOpen();
      }
    }

    try {
      // Generate genuine 8-character Crockford Base32 pairing code (WhatsApp official specification)
      // Do NOT rely on @skycodee/baileys default parameter which was hardcoded to "SKYZOOOO" containing illegal Crockford 'O'
      const genuinePairingCode = bytesToCrockford(crypto.randomBytes(5));
      const rawCode = await (this.sock as any).requestPairingCode(cleanPhone, genuinePairingCode);
      const codeToUse = rawCode || genuinePairingCode;
      const formatted = codeToUse && codeToUse.length === 8 ? `${codeToUse.slice(0, 4)}-${codeToUse.slice(4)}` : (codeToUse || '');
      this.pairingCode = formatted;
      this.status = 'connecting';
      this.syncStatusText = `Kode pairing: ${formatted}. Silakan masukkan di WhatsApp HP Anda.`;

      dbManager.addLog('system', `Kode pairing resmi diminta untuk nomor +${cleanPhone}: ${formatted}`);
      return { success: true, code: codeToUse, formatted };
    } catch (err: any) {
      console.error('[WA] requestPairingCode error:', err);
      throw new Error(err?.message || 'Gagal meminta kode pairing.');
    }
  }

  /**
   * Switch active session to another saved account
   */
  public async switchSession(sessionId: string): Promise<void> {
    if (this.currentSessionId === sessionId && this.status === 'connected') {
      return;
    }

    // 1. Save departing session memory state to disk cache
    this.saveSessionCache(this.currentSessionId);

    // 2. Tear down socket listeners and close connection cleanly
    this.isIntentionalDisconnect = true;
    if (this.sock) {
      try {
        (this.sock as any).ev.removeAllListeners('connection.update');
        (this.sock as any).ev.removeAllListeners('messages.upsert');
        (this.sock as any).ev.removeAllListeners('messages.update');
        (this.sock as any).ev.removeAllListeners('message-receipt.update');
        (this.sock as any).ev.removeAllListeners('contacts.upsert');
        (this.sock as any).ev.removeAllListeners('groups.update');
        (this.sock as any).ev.removeAllListeners('creds.update');
        (this.sock as any).ws?.close();
        (this.sock as any).end(undefined);
      } catch {}
      this.sock = null;
    }

    // 3. Switch active session pointers
    this.currentSessionId = sessionId;
    dbManager.setActiveSessionId(sessionId);
    this.authFolder = this.getSessionFolder(sessionId);

    // 4. Pre-hydrate target session state immediately from its disk cache
    const hasCache = this.loadSessionCache(sessionId);
    if (!hasCache) {
      this.groups.clear();
      this.contacts.clear();
      this.activeGroupStories = [];
      this.botUser = null;
    }

    this.status = 'connecting';
    this.syncProgress = 10;
    this.syncStatusText = 'Memuat sesi akun...';
    this.qrDataUrl = null;
    this.qrRaw = null;
    this.pairingCode = null;
    this.avatarCache.clear();
    this.lidToPhoneMap.clear();

    // 5. Provide 400ms grace period to ensure port and network streams release cleanly
    await new Promise((r) => setTimeout(r, 400));

    this.isIntentionalDisconnect = false;
    await this.initConnection();
  }

  /**
   * Create a new session and switch to it immediately
   */
  public async createAndSwitchSession(name?: string): Promise<any> {
    const newSession = dbManager.createSession(name);
    await this.switchSession(newSession.id);
    return newSession;
  }

  /**
   * Logout an account session and wipe its credentials
   */
  public async logoutAccount(sessionId?: string): Promise<void> {
    const targetId = sessionId || this.currentSessionId;
    const isCurrent = targetId === this.currentSessionId;

    if (isCurrent && this.sock) {
      this.isIntentionalDisconnect = true;
      try {
        await (this.sock as any).logout();
      } catch {}
      try {
        (this.sock as any).end(undefined);
      } catch {}
      this.sock = null;
    }

    // Clear folder files for targetId
    const targetFolder = this.getSessionFolder(targetId);
    try {
      if (fs.existsSync(targetFolder)) {
        fs.rmSync(targetFolder, { recursive: true, force: true });
        fs.mkdirSync(targetFolder, { recursive: true });
      }
    } catch (e) {
      console.warn('[WA] Gagal hapus kredensial folder sesi:', e);
    }

    dbManager.updateSession(targetId, {
      status: 'disconnected',
      phone: undefined,
      jid: undefined,
      botName: undefined,
      avatarUrl: null,
    });

    if (isCurrent) {
      this.status = 'disconnected';
      this.qrDataUrl = null;
      this.qrRaw = null;
      this.pairingCode = null;
      this.botUser = null;
      this.groups.clear();
      this.contacts.clear();
      this.avatarCache.clear();
      this.isIntentionalDisconnect = false;
      // Re-init socket to present QR/Pairing code for this session
      await this.initConnection();
    }
  }

  /**
   * Delete a saved session completely
   */
  public async deleteSession(sessionId: string): Promise<{ success: boolean; activeId: string; sessions: any[] }> {
    const isCurrent = sessionId === this.currentSessionId;

    // Delete folder
    const targetFolder = this.getSessionFolder(sessionId);
    try {
      if (fs.existsSync(targetFolder)) {
        fs.rmSync(targetFolder, { recursive: true, force: true });
      }
    } catch (e) {
      console.warn('[WA] Gagal hapus direktori sesi:', e);
    }

    const result = dbManager.deleteSession(sessionId);

    if (isCurrent) {
      await this.switchSession(result.activeId);
    }

    return result;
  }

  public getActiveGroupStories(): ActiveGroupStory[] {
    return this.activeGroupStories;
  }

  public getDeletedMessages(): TrackedMessage[] {
    return this.deletedMessagesList;
  }

  public async logoutAndReset(): Promise<void> {
    await this.logoutAccount(this.currentSessionId);
  }

  private clearAuthSession(): void {
    try {
      if (fs.existsSync(this.authFolder)) {
        fs.rmSync(this.authFolder, { recursive: true, force: true });
        fs.mkdirSync(this.authFolder, { recursive: true });
      }
    } catch (err) {
      console.error('[WA] Gagal membersihkan wa_auth_session:', err);
    }
  }
}

export const waService = WhatsAppService.getInstance();
