import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import {
  getOrCreateUser,
  getSqlAppUsers,
  upsertSqlAppUser,
  deleteSqlAppUser,
  getSqlTasks,
  upsertSqlTask,
  deleteSqlTask,
  getSqlAuditLogs,
  insertSqlAuditLog,
  upsertSqlCalendarEvent,
  deleteSqlCalendarEvent,
  upsertSqlChatMessage,
} from './src/db/users.ts';
import { SINGLE_ADMIN_CEDULA } from './src/constants.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Rutas de API protegidas con Firebase Auth para Cloud SQL (PostgreSQL)
  app.post('/api/auth/sync', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user?.uid;
      const email = req.user?.email || '';
      if (!uid) {
        return res.status(400).json({ error: 'Missing user UID' });
      }
      const userRecord = await getOrCreateUser(uid, email);
      res.json({ user: userRecord });
    } catch (error: unknown) {
      console.error('Failed to sync authenticated user:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to sync authenticated user',
      });
    }
  });

  app.get('/api/users', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const records = await getSqlAppUsers();
      res.json(records);
    } catch (error: unknown) {
      console.error('Failed to fetch users:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to fetch users',
      });
    }
  });

  app.post('/api/users', requireAuth, async (req: AuthRequest, res) => {
    try {
      const body = req.body;
      const cedula = String(body.cedula || '').trim();
      if (!cedula) {
        return res.status(400).json({ error: 'Cédula requerida' });
      }
      const isSingleAdmin = cedula === SINGLE_ADMIN_CEDULA;
      const saved = await upsertSqlAppUser({
        cedula,
        uid: req.user?.uid || null,
        name: String(body.name || 'Usuario'),
        password: String(body.password || '1234'),
        role: isSingleAdmin ? 'admin' : 'user',
        email: String(body.email || ''),
        department: String(body.department || 'Operaciones'),
        approvalStatus: isSingleAdmin ? 'aprobado' : String(body.approvalStatus || 'aprobado'),
        isOnline: Boolean(body.isOnline),
        lastSeen: String(body.lastSeen || new Date().toISOString()),
        canCreateTasks: isSingleAdmin ? true : Boolean(body.canCreateTasks),
        canEditTasks: isSingleAdmin ? true : Boolean(body.canEditTasks),
        canDeleteTasks: isSingleAdmin ? true : Boolean(body.canDeleteTasks),
        canSendChat: isSingleAdmin ? true : Boolean(body.canSendChat),
        canViewVault: isSingleAdmin ? true : Boolean(body.canViewVault),
        canExportReports: isSingleAdmin ? true : Boolean(body.canExportReports),
        cedulaIssuePlace: String(body.cedulaIssuePlace || ''),
        cedulaIssueDate: String(body.cedulaIssueDate || ''),
        birthDate: String(body.birthDate || ''),
        birthPlace: String(body.birthPlace || ''),
        bloodType: String(body.bloodType || ''),
        maritalStatus: String(body.maritalStatus || ''),
        phone: String(body.phone || ''),
        locationDepartmentState: String(body.locationDepartmentState || ''),
        locationCity: String(body.locationCity || ''),
        residenceAddress: String(body.residenceAddress || ''),
        residenceType: String(body.residenceType || ''),
        residenceStratum: String(body.residenceStratum || ''),
        familyMembersCount: Number(body.familyMembersCount) || 0,
        emergencyContactName: String(body.emergencyContactName || ''),
        emergencyContactPhone: String(body.emergencyContactPhone || ''),
        familyNotes: String(body.familyNotes || ''),
        bankName: String(body.bankName || ''),
        bankAccountType: String(body.bankAccountType || ''),
        bankAccountNumber: String(body.bankAccountNumber || ''),
        bankAccountHolder: String(body.bankAccountHolder || ''),
        createdAt: String(body.createdAt || new Date().toISOString()),
      });
      res.json(saved);
    } catch (error: unknown) {
      console.error('Failed to save user:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to save user',
      });
    }
  });

  app.delete('/api/users/:cedula', requireAuth, async (req: AuthRequest, res) => {
    try {
      const cedula = String(req.params.cedula || '').trim();
      if (cedula === SINGLE_ADMIN_CEDULA) {
        return res.status(403).json({ error: 'El Administrador Único no puede ser eliminado.' });
      }
      await deleteSqlAppUser(cedula);
      res.json({ deleted: true });
    } catch (error: unknown) {
      console.error('Failed to delete user:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to delete user',
      });
    }
  });

  app.get('/api/tasks', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const list = await getSqlTasks();
      res.json(list);
    } catch (error: unknown) {
      console.error('Failed to fetch tasks:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to fetch tasks',
      });
    }
  });

  app.post('/api/tasks', requireAuth, async (req: AuthRequest, res) => {
    try {
      const b = req.body;
      const saved = await upsertSqlTask({
        id: String(b.id || `chk_${Date.now()}`),
        title: String(b.title || 'Sin título'),
        description: String(b.description || ''),
        priority: String(b.priority || 'media'),
        status: String(b.status || 'pendiente'),
        progress: Number(b.progress) || 0,
        tags: String(b.tags || ''),
        assignedToCedula: String(b.assignedToCedula || ''),
        assignedToName: String(b.assignedToName || ''),
        createdByCedula: String(b.createdByCedula || ''),
        createdByName: String(b.createdByName || ''),
        createdAt: String(b.createdAt || new Date().toISOString()),
        dueDate: String(b.dueDate || new Date().toISOString()),
        completedAt: String(b.completedAt || ''),
        notes: String(b.notes || ''),
        accessEmail: String(b.accessEmail || ''),
        accessPassword: String(b.accessPassword || ''),
        directLink: String(b.directLink || ''),
        category: String(b.category || 'Chequeo'),
      });
      res.json(saved);
    } catch (error: unknown) {
      console.error('Failed to save task:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to save task',
      });
    }
  });

  app.delete('/api/tasks/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      await deleteSqlTask(String(req.params.id));
      res.json({ deleted: true });
    } catch (error: unknown) {
      console.error('Failed to delete task:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to delete task',
      });
    }
  });

  app.get('/api/audit-logs', requireAuth, async (_req: AuthRequest, res) => {
    try {
      const logs = await getSqlAuditLogs();
      res.json(logs);
    } catch (error: unknown) {
      console.error('Failed to fetch audit logs:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to fetch audit logs',
      });
    }
  });

  app.post('/api/audit-logs', requireAuth, async (req: AuthRequest, res) => {
    try {
      const b = req.body;
      const saved = await insertSqlAuditLog({
        id: String(b.id || `log_${Date.now()}`),
        actorCedula: String(b.actorCedula || '0000'),
        actorName: String(b.actorName || 'Sistema'),
        actorRole: String(b.actorRole || 'user'),
        actionType: String(b.actionType || 'ACCION'),
        module: String(b.module || 'SISTEMA'),
        description: String(b.description || ''),
        targetId: String(b.targetId || ''),
        timestamp: String(b.timestamp || new Date().toISOString()),
        severity: String(b.severity || 'info'),
      });
      res.json(saved);
    } catch (error: unknown) {
      console.error('Failed to record audit log:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to record audit log',
      });
    }
  });

  app.post('/api/calendar-events', requireAuth, async (req: AuthRequest, res) => {
    try {
      const b = req.body;
      const saved = await upsertSqlCalendarEvent({
        id: String(b.id || `ev_${Date.now()}`),
        title: String(b.title || 'Evento'),
        date: String(b.date || ''),
        time: String(b.time || '09:00'),
        type: String(b.type || 'actividad'),
        description: String(b.description || ''),
        createdByCedula: String(b.createdByCedula || ''),
        createdByName: String(b.createdByName || ''),
        linkedTaskId: String(b.linkedTaskId || ''),
      });
      res.json(saved);
    } catch (error: unknown) {
      console.error('Failed to save calendar event:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to save calendar event',
      });
    }
  });

  app.delete('/api/calendar-events/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      await deleteSqlCalendarEvent(String(req.params.id));
      res.json({ deleted: true });
    } catch (error: unknown) {
      console.error('Failed to delete calendar event:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to delete calendar event',
      });
    }
  });

  app.post('/api/chat-messages', requireAuth, async (req: AuthRequest, res) => {
    try {
      const b = req.body;
      const saved = await upsertSqlChatMessage({
        id: String(b.id || `msg_${Date.now()}`),
        senderCedula: String(b.senderCedula || ''),
        senderName: String(b.senderName || ''),
        senderRole: String(b.senderRole || 'user'),
        text: String(b.text || ''),
        channel: String(b.channel || 'general'),
        relatedTaskId: String(b.relatedTaskId || ''),
        timestamp: String(b.timestamp || new Date().toISOString()),
      });
      res.json(saved);
    } catch (error: unknown) {
      console.error('Failed to save chat message:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to save chat message',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
