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

// Destinatario único y exclusivo autorizado para las alertas de tareas a 24h, 12h, 6h y 2h de vencer
const RESEND_EXCLUSIVE_RECIPIENT = 'fundacionulep@gmail.com';
export type AlertMilestoneHours = 24 | 12 | 6 | 2;
const ALERT_MILESTONES: AlertMilestoneHours[] = [24, 12, 6, 2];

interface SentEmailRecord {
  recordKey: string;
  taskId: string;
  taskTitle: string;
  assignedToName: string;
  dueDate: string;
  milestoneHours: AlertMilestoneHours;
  recipient: string;
  messageText: string;
  sentAt: string;
  resendId?: string;
  status: 'sent' | 'missing_api_key' | 'error';
  errorDetail?: string;
}

const sentNotificationsMap = new Map<string, SentEmailRecord>();
const cachedTasksMap = new Map<
  string,
  {
    id: string;
    title: string;
    assignedToName?: string;
    assignedToCedula?: string;
    dueDate: string;
    priority?: string;
    status?: string;
  }
>();

function formatDateReadable(isoDate: string): string {
  if (!isoDate) return 'Sin fecha';
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleString('es-CO', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// Determina qué escalón de alerta automática corresponde según el tiempo restante (24h, 12h, 6h o 2h)
function getActiveMilestoneForTask(dueDateStr: string, status: string): AlertMilestoneHours | null {
  if (status === 'completada' || !dueDateStr) return null;
  const dueMs = new Date(dueDateStr).getTime();
  if (Number.isNaN(dueMs)) return null;
  const diffMs = dueMs - Date.now();
  if (diffMs <= 0) return null;
  const diffHours = diffMs / (1000 * 60 * 60);
  if (diffHours <= 2) return 2;
  if (diffHours <= 6) return 6;
  if (diffHours <= 12) return 12;
  if (diffHours <= 24) return 24;
  return null;
}

async function dispatchResendEmailForTask(
  task: {
    id: string;
    title: string;
    assignedToName?: string;
    assignedToCedula?: string;
    dueDate: string;
    priority?: string;
    status?: string;
  },
  milestoneHours: AlertMilestoneHours
): Promise<SentEmailRecord> {
  const recordKey = `${task.id}_${milestoneHours}h`;
  const responsable =
    task.assignedToCedula === 'ABIERTA'
      ? 'Abierta (Cualquiera puede realizarla)'
      : task.assignedToName || task.assignedToCedula || 'Sin responsable asignado';
  const fechaTexto = formatDateReadable(task.dueDate);
  const tareaNombre = task.title || 'Sin título';

  // Mensaje exacto con el umbral correspondiente (24 horas, 12 horas, 6 horas o 2 horas)
  const notificationSentence = `La tarea del responsable ${responsable} de la fecha ${fechaTexto} con la tarea "${tareaNombre}" está a ${milestoneHours} horas de vencer.`;

  const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
  const fromEmail = (process.env.RESEND_FROM_EMAIL || 'Fundacion ULEP <onboarding@resend.dev>').trim();

  if (!resendApiKey) {
    const record: SentEmailRecord = {
      recordKey,
      taskId: task.id,
      taskTitle: tareaNombre,
      assignedToName: responsable,
      dueDate: task.dueDate,
      milestoneHours,
      recipient: RESEND_EXCLUSIVE_RECIPIENT,
      messageText: notificationSentence,
      sentAt: new Date().toISOString(),
      status: 'missing_api_key',
      errorDetail: 'Falta configurar RESEND_API_KEY en las variables de entorno del servidor.',
    };
    sentNotificationsMap.set(recordKey, record);
    return record;
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [RESEND_EXCLUSIVE_RECIPIENT],
        subject: `⚠️ Alerta ${milestoneHours}h ULEP: Tarea "${tareaNombre}" de ${responsable} a ${milestoneHours} horas de vencer`,
        text: notificationSentence,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #B3D9FF; border-radius: 12px; overflow: hidden; background-color: #FFFFFF;">
            <div style="background-color: #0B2559; color: #FFFFFF; padding: 18px 24px;">
              <h2 style="margin: 0; font-size: 16px;">Notificación Automática de Vencimiento (Faltan ${milestoneHours} Horas) — Fundación ULEP</h2>
            </div>
            <div style="padding: 24px; color: #0B2559; background-color: #F4F9FF;">
              <p style="font-size: 15px; line-height: 1.6; font-weight: bold; background-color: #FFFFFF; padding: 16px; border-radius: 8px; border: 1px solid #B3D9FF; margin-top: 0;">
                ${notificationSentence}
              </p>
              <table style="width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; background: #FFFFFF; border-radius: 8px; overflow: hidden;">
                <tr>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #EAF3FF; color: #3B82F6; font-weight: bold;">Umbral de Alerta Automática:</td>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #EAF3FF; font-weight: bold; color: #0B2559;">Faltando ${milestoneHours} horas</td>
                </tr>
                <tr>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #EAF3FF; color: #3B82F6; font-weight: bold;">Responsable:</td>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #EAF3FF; font-weight: bold; color: #0B2559;">${responsable}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #EAF3FF; color: #3B82F6; font-weight: bold;">Fecha de vencimiento:</td>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #EAF3FF; font-weight: bold; color: #0B2559;">${fechaTexto}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #EAF3FF; color: #3B82F6; font-weight: bold;">Tarea:</td>
                  <td style="padding: 10px 14px; border-bottom: 1px solid #EAF3FF; font-weight: bold; color: #0B2559;">${tareaNombre}</td>
                </tr>
                <tr>
                  <td style="padding: 10px 14px; color: #3B82F6; font-weight: bold;">Destino exclusivo:</td>
                  <td style="padding: 10px 14px; font-weight: bold; color: #0B2559;">${RESEND_EXCLUSIVE_RECIPIENT}</td>
                </tr>
              </table>
            </div>
          </div>
        `,
      }),
    });

    const data = (await response.json().catch(() => ({}))) as { id?: string; message?: string };

    if (!response.ok) {
      const errRecord: SentEmailRecord = {
        recordKey,
        taskId: task.id,
        taskTitle: tareaNombre,
        assignedToName: responsable,
        dueDate: task.dueDate,
        milestoneHours,
        recipient: RESEND_EXCLUSIVE_RECIPIENT,
        messageText: notificationSentence,
        sentAt: new Date().toISOString(),
        status: 'error',
        errorDetail: data.message || `Error HTTP ${response.status} desde Resend API`,
      };
      sentNotificationsMap.set(recordKey, errRecord);
      return errRecord;
    }

    const okRecord: SentEmailRecord = {
      recordKey,
      taskId: task.id,
      taskTitle: tareaNombre,
      assignedToName: responsable,
      dueDate: task.dueDate,
      milestoneHours,
      recipient: RESEND_EXCLUSIVE_RECIPIENT,
      messageText: notificationSentence,
      sentAt: new Date().toISOString(),
      resendId: data.id,
      status: 'sent',
    };
    sentNotificationsMap.set(recordKey, okRecord);

    try {
      await insertSqlAuditLog({
        id: `log_resend_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        actorCedula: SINGLE_ADMIN_CEDULA,
        actorName: 'Sistema Resend Automático',
        actorRole: 'admin',
        actionType: `CORREO_RESEND_${milestoneHours}H`,
        module: 'RESEND_ALERTAS_AUTOMATICAS',
        description: `Envió correo automático (${milestoneHours}h) a ${RESEND_EXCLUSIVE_RECIPIENT}: "${notificationSentence}"`,
        targetId: task.id,
        timestamp: new Date().toISOString(),
        severity: milestoneHours <= 6 ? 'warning' : 'info',
      });
    } catch {
      // Continuar aunque la base SQL no esté activa en este instante
    }

    return okRecord;
  } catch (err: unknown) {
    const failRecord: SentEmailRecord = {
      recordKey,
      taskId: task.id,
      taskTitle: tareaNombre,
      assignedToName: responsable,
      dueDate: task.dueDate,
      milestoneHours,
      recipient: RESEND_EXCLUSIVE_RECIPIENT,
      messageText: notificationSentence,
      sentAt: new Date().toISOString(),
      status: 'error',
      errorDetail: err instanceof Error ? err.message : 'Error de red conectando con Resend',
    };
    sentNotificationsMap.set(recordKey, failRecord);
    return failRecord;
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // ============================================================================
  // RUTAS DE CONEXIÓN CON LA API DE RESEND (24h, 12h, 6h y 2h — EXCLUSIVO ADMIN)
  // ============================================================================
  app.get('/api/resend/status', (_req, res) => {
    const apiKeyConfigured = Boolean((process.env.RESEND_API_KEY || '').trim());
    res.json({
      connected: apiKeyConfigured,
      exclusiveRecipient: RESEND_EXCLUSIVE_RECIPIENT,
      milestonesHours: ALERT_MILESTONES,
      fromEmail: (process.env.RESEND_FROM_EMAIL || 'Fundacion ULEP <onboarding@resend.dev>').trim(),
      sentHistory: Array.from(sentNotificationsMap.values()).sort(
        (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
      ),
    });
  });

  app.post('/api/resend/check-and-notify', async (req, res) => {
    try {
      const incomingTasks = Array.isArray(req.body?.tasks) ? req.body.tasks : [];
      const forceTaskId = req.body?.forceTaskId ? String(req.body.forceTaskId) : null;
      const forceMilestoneRaw = Number(req.body?.forceMilestoneHours);
      const forcedMilestone: AlertMilestoneHours | null =
        forceMilestoneRaw === 24 ||
        forceMilestoneRaw === 12 ||
        forceMilestoneRaw === 6 ||
        forceMilestoneRaw === 2
          ? (forceMilestoneRaw as AlertMilestoneHours)
          : null;

      for (const item of incomingTasks) {
        if (item && item.id) {
          cachedTasksMap.set(String(item.id), {
            id: String(item.id),
            title: String(item.title || 'Sin título'),
            assignedToName: String(item.assignedToName || ''),
            assignedToCedula: String(item.assignedToCedula || ''),
            dueDate: String(item.dueDate || ''),
            priority: String(item.priority || 'media'),
            status: String(item.status || 'pendiente'),
          });
        }
      }

      let tasksToEvaluate = incomingTasks;
      if (tasksToEvaluate.length === 0) {
        try {
          tasksToEvaluate = await getSqlTasks();
        } catch {
          tasksToEvaluate = Array.from(cachedTasksMap.values());
        }
      }

      const dispatched: SentEmailRecord[] = [];

      for (const t of tasksToEvaluate) {
        if (!t || !t.id) continue;
        const isForced = Boolean(forceTaskId && String(t.id) === forceTaskId);
        const activeMilestone = isForced
          ? forcedMilestone || getActiveMilestoneForTask(String(t.dueDate || ''), String(t.status || '')) || 24
          : getActiveMilestoneForTask(String(t.dueDate || ''), String(t.status || ''));

        if (!activeMilestone) continue;

        const recordKey = `${t.id}_${activeMilestone}h`;
        const existingRecord = sentNotificationsMap.get(recordKey);
        if (!isForced && existingRecord && existingRecord.status === 'sent') {
          continue;
        }

        const result = await dispatchResendEmailForTask(
          {
            id: String(t.id),
            title: String(t.title || 'Sin título'),
            assignedToName: String(t.assignedToName || ''),
            assignedToCedula: String(t.assignedToCedula || ''),
            dueDate: String(t.dueDate || ''),
            priority: String(t.priority || 'media'),
            status: String(t.status || 'pendiente'),
          },
          activeMilestone
        );
        dispatched.push(result);
      }

      res.json({
        connected: Boolean((process.env.RESEND_API_KEY || '').trim()),
        exclusiveRecipient: RESEND_EXCLUSIVE_RECIPIENT,
        milestonesHours: ALERT_MILESTONES,
        dispatched,
        sentHistory: Array.from(sentNotificationsMap.values()).sort(
          (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
        ),
      });
    } catch (error: unknown) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Error al procesar notificaciones Resend',
      });
    }
  });

  // Verificación automática continua en el servidor cada 60 segundos para los umbrales de 24h, 12h, 6h y 2h
  setInterval(async () => {
    try {
      const combined = new Map(cachedTasksMap);
      try {
        const sqlTasks = await getSqlTasks();
        for (const st of sqlTasks) {
          combined.set(st.id, st);
        }
      } catch {
        // Usar tareas en caché si Cloud SQL no responde
      }

      for (const t of combined.values()) {
        const milestone = getActiveMilestoneForTask(t.dueDate, t.status || 'pendiente');
        if (milestone) {
          const key = `${t.id}_${milestone}h`;
          const prev = sentNotificationsMap.get(key);
          if (!prev || prev.status !== 'sent') {
            await dispatchResendEmailForTask(t, milestone);
          }
        }
      }
    } catch {
      // Silencioso en background
    }
  }, 60 * 1000);

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

      cachedTasksMap.set(saved.id, saved);

      // Si la tarea guardada está dentro de los umbrales de 24h, 12h, 6h o 2h, dispara automáticamente el correo Resend a fundacionulep@gmail.com
      const milestone = getActiveMilestoneForTask(saved.dueDate, saved.status);
      if (milestone) {
        const key = `${saved.id}_${milestone}h`;
        const existing = sentNotificationsMap.get(key);
        if (!existing || existing.status !== 'sent') {
          void dispatchResendEmailForTask(saved, milestone);
        }
      }

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
