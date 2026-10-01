import express from 'express';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import { dbManager } from './server/db.ts';
import { waService } from './server/wa.ts';
import { SWGC_COLOR_PRESETS } from './server/swgcColors.ts';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Set up JSON and URL-encoded parsers with high payload limits
app.use(express.json({ limit: '64mb' }));
app.use(express.urlencoded({ extended: true, limit: '64mb' }));

// Set up multer for handling media uploads (for Web UI .swgc+ feature)
const uploadDir = path.resolve(process.cwd(), 'temp_media');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 35 * 1024 * 1024 }, // 35MB limit
});

// ==========================================
// API ROUTES FIRST
// ==========================================

// 1. Health check & status
app.get(['/health', '/api/health'], (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/status', (req, res) => {
  const db = dbManager.getDatabase();
  res.json({
    status: waService.status,
    syncProgress: waService.syncProgress,
    syncStatusText: waService.syncStatusText,
    qrDataUrl: waService.qrDataUrl,
    pairingCode: waService.pairingCode,
    activeSessionId: dbManager.getActiveSessionId(),
    sessions: dbManager.getSessions(),
    botUser: waService.botUser,
    counts: {
      groups: waService.groups.size,
      contacts: waService.contacts.size,
      admins: db.adminNumbers.length,
    },
    stats: db.stats,
    botName: db.botName,
    globalBotEnabled: dbManager.isGlobalBotEnabled(),
  });
});

// 2. Real-time QR, Pairing Code, and connection control
app.get('/api/qr', (req, res) => {
  res.json({
    status: waService.status,
    qrDataUrl: waService.qrDataUrl,
    pairingCode: waService.pairingCode,
    activeSessionId: dbManager.getActiveSessionId(),
    syncProgress: waService.syncProgress,
    syncStatusText: waService.syncStatusText,
  });
});

app.post('/api/pairing-code', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) {
      return res.status(400).json({ success: false, message: 'Nomor telepon WhatsApp wajib diisi' });
    }
    const result = await waService.requestPairingCode(phone);
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ success: false, message: err?.message || 'Gagal meminta kode pairing' });
  }
});

// Multi-Account Session Management
app.get('/api/sessions', (req, res) => {
  res.json({
    activeSessionId: dbManager.getActiveSessionId(),
    sessions: dbManager.getSessions(),
    currentStatus: waService.status,
  });
});

app.post('/api/sessions/create', async (req, res) => {
  try {
    const { name } = req.body;
    const session = await waService.createAndSwitchSession(name);
    res.json({
      success: true,
      session,
      activeSessionId: dbManager.getActiveSessionId(),
      sessions: dbManager.getSessions(),
      botUser: waService.botUser,
      groups: Array.from(waService.groups.values()),
      contacts: Array.from(waService.contacts.values()),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Gagal membuat sesi baru' });
  }
});

app.post('/api/sessions/switch', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, message: 'ID sesi wajib diisi' });
    }
    await waService.switchSession(sessionId);
    res.json({
      success: true,
      activeSessionId: sessionId,
      sessions: dbManager.getSessions(),
      botUser: waService.botUser,
      groups: Array.from(waService.groups.values()),
      contacts: Array.from(waService.contacts.values()),
      disabledGroupJids: dbManager.getDisabledGroupBotJids(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Gagal berpindah sesi' });
  }
});

app.post('/api/sessions/logout', async (req, res) => {
  try {
    const { sessionId } = req.body;
    await waService.logoutAccount(sessionId);
    res.json({
      success: true,
      message: 'Akun berhasil dilogout dan data autentikasi dibersihkan.',
      activeSessionId: dbManager.getActiveSessionId(),
      sessions: dbManager.getSessions(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Gagal logout akun' });
  }
});

app.delete('/api/sessions/:id', async (req, res) => {
  try {
    const result = await waService.deleteSession(req.params.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Gagal menghapus sesi' });
  }
});

// Switch ON/OFF Bot per Account / Session
app.post('/api/sessions/toggle-bot', (req, res) => {
  try {
    const { sessionId, enabled } = req.body;
    const targetId = sessionId || dbManager.getActiveSessionId();
    let newStatus: boolean;
    if (enabled !== undefined) {
      newStatus = dbManager.setSessionBotEnabled(targetId, Boolean(enabled));
    } else {
      newStatus = dbManager.toggleSessionBot(targetId);
    }
    res.json({
      success: true,
      sessionId: targetId,
      botEnabled: newStatus,
      sessions: dbManager.getSessions(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Gagal mengubah status bot sesi' });
  }
});

// Group Bot Settings (Switch ON/OFF per Group)
app.get('/api/groups/bot-settings', (req, res) => {
  res.json({
    disabledGroupJids: dbManager.getDisabledGroupBotJids(),
  });
});

app.post('/api/groups/toggle-bot', (req, res) => {
  try {
    const groupJid = req.body.groupJid || req.body.groupId;
    const { enabled } = req.body;
    if (!groupJid) {
      return res.status(400).json({ success: false, message: 'JID grup wajib disertakan' });
    }
    let newStatus: boolean;
    if (enabled !== undefined) {
      newStatus = dbManager.setGroupBotEnabled(groupJid, Boolean(enabled));
    } else {
      newStatus = dbManager.toggleGroupBot(groupJid);
    }
    res.json({
      success: true,
      groupJid,
      botEnabled: newStatus,
      disabledGroupJids: dbManager.getDisabledGroupBotJids(),
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Gagal mengubah status bot grup' });
  }
});

// Master General Bot Status & Toggle
app.get('/api/bot/general-status', (req, res) => {
  res.json({
    globalBotEnabled: dbManager.isGlobalBotEnabled(),
  });
});

app.post('/api/bot/toggle-general', (req, res) => {
  try {
    const { enabled } = req.body;
    let newStatus: boolean;
    if (enabled !== undefined) {
      newStatus = dbManager.setGlobalBotEnabled(Boolean(enabled));
    } else {
      newStatus = dbManager.toggleGlobalBot();
    }
    res.json({
      success: true,
      globalBotEnabled: newStatus,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Gagal mengubah status bot global' });
  }
});

app.post('/api/connect', async (req, res) => {
  try {
    const { force, freshQr } = req.body || {};
    await waService.initConnection({ force: Boolean(force), freshQr: Boolean(freshQr) });
    res.json({ success: true, message: 'Memulai proses koneksi WhatsApp...' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Gagal menghubungkan' });
  }
});

app.post('/api/sessions/reset-credentials', async (req, res) => {
  try {
    const { sessionId } = req.body || {};
    const targetSessionId = sessionId || dbManager.getActiveSessionId() || 'session_default';
    await waService.logoutAccount(targetSessionId);
    await waService.initConnection({ force: true, freshQr: true });
    res.json({ success: true, message: 'Kredensial sesi berhasil direset dan QR baru sedang dimuat.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Gagal mereset kredensial' });
  }
});

app.post('/api/disconnect', async (req, res) => {
  try {
    await waService.logoutAndReset();
    res.json({ success: true, message: 'WhatsApp berhasil diputus dan sesi dibersihkan.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Gagal logout' });
  }
});

app.post('/api/sync', async (req, res) => {
  try {
    if (waService.status !== 'connected' && waService.status !== 'syncing') {
      return res.status(400).json({ success: false, message: 'WhatsApp belum terhubung' });
    }
    waService.performFullSync();
    res.json({ success: true, message: 'Proses sinkronisasi ulang dimulai.' });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Gagal sinkronisasi' });
  }
});

// 3. Groups & Admin Radar
app.get('/api/groups', (req, res) => {
  if (waService.groups.size === 0) {
    waService.loadSessionCache(waService.currentSessionId);
  }
  const groupList = Array.from(waService.groups.values());
  res.json({
    total: groupList.length,
    groups: groupList,
    disabledGroupJids: dbManager.getDisabledGroupBotJids(),
  });
});

// 4. Contacts
app.get('/api/contacts', (req, res) => {
  if (waService.contacts.size === 0) {
    waService.loadSessionCache(waService.currentSessionId);
  }
  const contactList = Array.from(waService.contacts.values());
  res.json({
    total: contactList.length,
    contacts: contactList,
  });
});

// 5. Avatar Proxy Endpoint (Live WhatsApp Profile Picture)
app.get('/api/avatar', async (req, res) => {
  const jid = req.query.jid as string;
  if (!jid) {
    return res.status(400).send('JID parameter required');
  }

  try {
    const url = await waService.getRealAvatar(jid);
    if (url) {
      return res.redirect(url);
    }

    // Dynamic clean SVG Fallback Avatar
    const name = (req.query.name as string) || (jid.includes('@g.us') ? 'G' : 'U');
    const initials = (name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 2) || 'WA').toUpperCase();
    const isGroup = jid.includes('@g.us');

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.send(`
      <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
        <rect width="96" height="96" fill="${isGroup ? '#27272a' : '#f4f4f5'}"/>
        <text x="50%" y="54%" font-family="ui-monospace, monospace" font-size="28" font-weight="700" fill="${isGroup ? '#ffffff' : '#52525b'}" text-anchor="middle" dominant-baseline="middle">${initials}</text>
      </svg>
    `);
  } catch {
    res.status(404).send('Avatar not found');
  }
});

// 6. Broadcast feature
app.post('/api/broadcast', async (req, res) => {
  try {
    const { targetType, customJids, delaySeconds, formatMode, customMessage, templateData, forwardedManyTimes } = req.body;

    if (formatMode === 'custom' && (!customMessage || !customMessage.trim())) {
      return res.status(400).json({ success: false, message: 'Pesan broadcast bebas tidak boleh kosong' });
    }

    if (formatMode === 'announcement' && (!templateData || !templateData.message)) {
      return res.status(400).json({ success: false, message: 'Pesan pengumuman tidak boleh kosong' });
    }

    if (!formatMode && (!customMessage && (!templateData || !templateData.message))) {
      return res.status(400).json({ success: false, message: 'Pesan broadcast tidak boleh kosong' });
    }

    const progress = await waService.startBroadcast({
      targetType: targetType || 'all',
      customJids,
      delaySeconds: Number(delaySeconds) || 3,
      formatMode: formatMode || (customMessage ? 'custom' : 'announcement'),
      customMessage,
      templateData,
      forwardedManyTimes: Boolean(forwardedManyTimes),
    });

    res.json({ success: true, broadcast: progress });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err?.message || 'Gagal memulai broadcast' });
  }
});

app.get('/api/broadcast/progress', (req, res) => {
  res.json({ activeBroadcast: waService.activeBroadcast });
});

app.post('/api/broadcast/stop', (req, res) => {
  waService.stopBroadcast();
  res.json({ success: true, message: 'Broadcast dihentikan.' });
});

// 6. Web UI Group Status Upload (.swgc+ from Web UI)
app.get('/api/swgc/colors', (req, res) => {
  res.json({ colors: SWGC_COLOR_PRESETS });
});

app.post('/api/swgc/upload', upload.single('media'), async (req, res) => {
  try {
    const file = req.file;
    const { groupIds, caption, text, backgroundColor, font } = req.body;

    let targetGroupIds: string[] = [];
    if (typeof groupIds === 'string') {
      try {
        targetGroupIds = JSON.parse(groupIds);
      } catch {
        targetGroupIds = groupIds.split(',').map((id: string) => id.trim()).filter(Boolean);
      }
    } else if (Array.isArray(groupIds)) {
      targetGroupIds = groupIds;
    }

    if (targetGroupIds.length === 0) {
      // Default to all groups where bot is participant if none specified
      targetGroupIds = Array.from(waService.groups.keys());
    }

    if (targetGroupIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Belum ada grup yang terdeteksi untuk target status.' });
    }

    // Support both Media and Text Status
    if (file) {
      const mediaBuffer = fs.readFileSync(file.path);
      const isVideo = file.mimetype.startsWith('video');

      await waService.sendGroupStatusNative(targetGroupIds, {
        ...(isVideo ? { video: mediaBuffer } : { image: mediaBuffer }),
        caption: caption || '',
      });

      // Delete temp uploaded file
      try {
        fs.unlinkSync(file.path);
      } catch {
        // Ignore cleanup error
      }

      dbManager.incrementStat('groupStatusSent');
      dbManager.addLog('swgc', `Web UI: Status media grup dikirim ke ${targetGroupIds.length} grup`);

      return res.json({
        success: true,
        message: `Status cerita media grup berhasil dipublikasikan ke ${targetGroupIds.length} grup!`,
      });
    }

    // Text Story with Background Color
    const statusText = (text || caption || '').trim();
    if (!statusText) {
      return res.status(400).json({
        success: false,
        message: 'Harap sertakan file foto/video atau masukkan teks status grup.',
      });
    }

    await waService.sendGroupStatusNative(targetGroupIds, {
      text: statusText,
      backgroundColor: backgroundColor || 'hijau',
      font: Number(font) || 1,
    });

    dbManager.incrementStat('groupStatusSent');
    dbManager.addLog(
      'swgc',
      `Web UI: Status teks grup ("${statusText.slice(0, 30)}") dikirim ke ${targetGroupIds.length} grup (Warna: ${backgroundColor || 'hijau'})`
    );

    res.json({
      success: true,
      message: `Status teks cerita grup berhasil dipublikasikan ke ${targetGroupIds.length} grup!`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Gagal mengirim status grup' });
  }
});

// List active group stories (SWGC)
app.get('/api/swgc/stories', (req, res) => {
  res.json({
    stories: waService.getActiveGroupStories(),
  });
});

// Delete group story by 1-based index (.delswgc)
app.delete('/api/swgc/stories/:index', async (req, res) => {
  try {
    const idx = parseInt(req.params.index, 10);
    const result = await waService.deleteGroupStoryByIndex(idx);
    if (!result.success) {
      return res.status(400).json(result);
    }
    dbManager.recordUserCommand(
      waService.botUser?.phone || 'admin',
      waService.botUser?.id || 'admin',
      'delswgc'
    );
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Gagal menghapus status grup' });
  }
});

// List tracked deleted messages (.ghost logs)
app.get('/api/ghost/messages', (req, res) => {
  const deleted = waService.getDeletedMessages();
  const safeList = deleted.map((d) => ({
    id: d.id,
    remoteJid: d.remoteJid,
    participant: d.senderJid,
    senderPhone: d.senderPhone,
    senderName: d.senderName,
    text: d.text,
    caption: d.mediaCaption,
    mediaType: d.mediaType,
    hasMedia: !!d.mediaBuffer,
    timestamp: d.createdAt,
    deletedAt: d.deletedAt,
    readBy: Array.from(d.readBy || []),
  }));
  res.json({ deletedMessages: safeList });
});

// 7. General Settings (Pengaturan Umum) & Analytics
app.get('/api/settings', (req, res) => {
  const db = dbManager.getDatabase();
  res.json({
    botName: db.botName,
    adminNumbers: db.adminNumbers,
    settings: db.settings,
    stats: db.stats,
    logs: db.logs.slice(0, 100),
    analytics: dbManager.getAnalytics(),
  });
});

app.get('/api/analytics', (req, res) => {
  res.json(dbManager.getAnalytics());
});

app.post('/api/analytics/reset', (req, res) => {
  dbManager.resetAnalytics();
  res.json({ success: true, message: 'Data analitik berhasil direset.' });
});

app.put('/api/settings/bot-name', (req, res) => {
  const { botName } = req.body;
  if (!botName || typeof botName !== 'string') {
    return res.status(400).json({ success: false, message: 'Nama bot tidak boleh kosong' });
  }
  dbManager.setBotName(botName);
  res.json({ success: true, botName: dbManager.getBotName() });
});

app.post('/api/settings/admin-plus', (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ success: false, message: 'Nomor WhatsApp wajib diisi' });
  }
  const result = dbManager.addAdminNumber(phone);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

app.delete('/api/settings/admin-plus/:phone', (req, res) => {
  const phone = req.params.phone;
  const result = dbManager.removeAdminNumber(phone);
  if (!result.success) {
    return res.status(400).json(result);
  }
  res.json(result);
});

app.put('/api/settings/general', (req, res) => {
  const { defaultDelaySeconds, announcementTemplate, autoSync } = req.body;
  const updated = dbManager.updateSettings({
    ...(defaultDelaySeconds !== undefined ? { defaultDelaySeconds: Number(defaultDelaySeconds) } : {}),
    ...(announcementTemplate ? { announcementTemplate } : {}),
    ...(autoSync !== undefined ? { autoSync: Boolean(autoSync) } : {}),
  });
  res.json({ success: true, settings: updated });
});

// 8. Danger Zone
app.post('/api/danger/purge-all', async (req, res) => {
  try {
    const { resetSessions } = req.body || {};
    if (resetSessions) {
      await waService.logoutAndReset();
    }
    const result = dbManager.dangerPurgeAll({ resetSessions: Boolean(resetSessions) });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, message: err?.message || 'Gagal membersihkan data' });
  }
});

// ==========================================
// VITE MIDDLEWARE & SERVER BOOTSTRAP
// ==========================================
async function startServer() {
  const isDev = process.env.NODE_ENV === 'development';
  const hasDist = fs.existsSync(path.join(process.cwd(), 'dist', 'index.html'));

  if (isDev || (!hasDist && process.env.NODE_ENV !== 'production')) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Axale Tools Plus] Server aktif pada http://0.0.0.0:${PORT}`);
    // Auto initiate WA connection if configured
    waService.initConnection();
  });

  const shutdown = () => {
    console.log('[Axale Tools Plus] Menerima sinyal shutdown, menghentikan server...');
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startServer();
