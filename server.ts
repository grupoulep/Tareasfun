import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { initializeApp as initClientFirebaseApp, getApps as getClientFirebaseApps } from 'firebase/app';
import {
  getFirestore as getClientFirestore,
  doc as firestoreDoc,
  onSnapshot as firestoreOnSnapshot,
  setDoc as firestoreSetDoc,
  getDoc as firestoreGetDoc,
} from 'firebase/firestore';
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

let recoveryEmailRecipient = RESEND_EXCLUSIVE_RECIPIENT;

interface RecoveryCodeEntry {
  code: string;
  cedula: string;
  userName: string;
  email: string;
  createdAt: string;
  expiresAt: number;
}

const activeRecoveryCodes = new Map<string, RecoveryCodeEntry>();

interface UserRecoverySecurityState {
  cedula: string;
  sendAttempts: number;
  verifyAttempts: number;
  locked: boolean;
  lockedAt?: string;
}

const userRecoverySecurityMap = new Map<string, UserRecoverySecurityState>();

function getOrInitSecurityState(cedula: string): UserRecoverySecurityState {
  const cleanCed = String(cedula || '').trim();
  if (cleanCed === SINGLE_ADMIN_CEDULA) {
    const adminState: UserRecoverySecurityState = {
      cedula: cleanCed,
      sendAttempts: 0,
      verifyAttempts: 0,
      locked: false,
    };
    userRecoverySecurityMap.set(cleanCed, adminState);
    return adminState;
  }
  const existing = userRecoverySecurityMap.get(cleanCed);
  if (existing) return existing;
  const fresh: UserRecoverySecurityState = {
    cedula: cleanCed,
    sendAttempts: 0,
    verifyAttempts: 0,
    locked: false,
  };
  userRecoverySecurityMap.set(cleanCed, fresh);
  return fresh;
}

function isUserLockedForEmailsAndAccount(cedula?: string): boolean {
  if (!cedula) return false;
  const cleanCed = String(cedula).trim();
  if (cleanCed === SINGLE_ADMIN_CEDULA) return false;
  return Boolean(userRecoverySecurityMap.get(cleanCed)?.locked);
}

function maskEmailStartOnly(email: string): string {
  const clean = (email || RESEND_EXCLUSIVE_RECIPIENT).trim();
  const localPart = clean.split('@')[0] || clean;
  const visibleLen = Math.min(5, Math.max(3, Math.floor(localPart.length / 2)));
  return `${localPart.slice(0, visibleLen)}....`;
}

async function sendRecoveryEmailViaResend(params: {
  cedula: string;
  userName: string;
  targetEmail: string;
  code: string;
}): Promise<{
  emailStatus: 'sent' | 'missing_api_key' | 'error';
  deliveredTo: string;
  resendErrorDetail: string;
}> {
  const { cedula, userName, targetEmail, code } = params;
  const nowIso = new Date().toISOString();

  activeRecoveryCodes.set(cedula, {
    code,
    cedula,
    userName,
    email: targetEmail,
    createdAt: nowIso,
    expiresAt: Date.now() + 15 * 60 * 1000,
  });

  const resendApiKey = (
    process.env.RESEND_API_KEY ||
    process.env.VITE_RESEND_API_KEY ||
    ''
  ).trim();
  const fromEmail = (
    process.env.RESEND_FROM_EMAIL || 'Fundacion ULEP <onboarding@resend.dev>'
  ).trim();

  let emailStatus: 'sent' | 'missing_api_key' | 'error' = 'missing_api_key';
  let deliveredTo = targetEmail.toLowerCase();
  let resendErrorDetail = '';

  const emailHtml = `
    <div style="font-family: Roboto, Arial, sans-serif; max-width: 560px; margin: 0 auto; border: 1px solid #B3D9FF; border-radius: 12px; overflow: hidden; background-color: #FFFFFF;">
      <div style="background-color: #0B2559; color: #FFFFFF; padding: 18px 24px;">
        <h2 style="margin: 0; font-size: 16px;">Recuperación de Contraseña — Fundación ULEP</h2>
      </div>
      <div style="padding: 24px; color: #0B2559; background-color: #F4F9FF; text-align: center;">
        <p style="font-size: 14px; margin-top: 0;">Solicitud de recuperación para <strong>${userName}</strong> (C.C. ${cedula})</p>
        <p style="font-size: 12px; color: #3B82F6; margin: 4px 0;">Correo asociado: <strong>${targetEmail.toLowerCase()}</strong></p>
        <div style="margin: 20px auto; padding: 16px 24px; background-color: #FFFFFF; border: 2px solid #0B2559; border-radius: 12px; display: inline-block; font-family: monospace; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #0B2559;">
          ${code}
        </div>
        <p style="font-size: 12px; color: #3B82F6; margin-bottom: 0;">Este código es válido por 15 minutos en tareas.fundacionulep.fun.</p>
      </div>
    </div>
  `;

  if (resendApiKey) {
    const candidateRecipients = Array.from(
      new Set(
        [
          targetEmail.toLowerCase().trim(),
          recoveryEmailRecipient.toLowerCase().trim(),
          RESEND_EXCLUSIVE_RECIPIENT,
          'grupoulep@gmail.com',
        ].filter(e => e && e.includes('@'))
      )
    );

    for (const recipientCandidate of candidateRecipients) {
      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [recipientCandidate],
            subject: `Código de Recuperación de Contraseña: ${code} — Fundación ULEP`,
            text: `Código de recuperación de contraseña para ${userName} (C.C. ${cedula}): ${code}`,
            html: emailHtml,
          }),
        });

        if (response.ok) {
          emailStatus = 'sent';
          deliveredTo = recipientCandidate;
          resendErrorDetail = '';
          break;
        } else {
          const errData = (await response.json().catch(() => ({}))) as { message?: string };
          resendErrorDetail = errData.message || `HTTP ${response.status}`;
          emailStatus = 'error';
        }
      } catch (fetchErr) {
        resendErrorDetail = fetchErr instanceof Error ? fetchErr.message : 'Error de red con Resend';
        emailStatus = 'error';
      }
    }
  }

  const historyKey = `recovery_${cedula}_${Date.now()}`;
  sentNotificationsMap.set(historyKey, {
    recordKey: historyKey,
    taskId: `recovery_${cedula}`,
    taskTitle: `Recuperación de Contraseña (${userName})`,
    assignedToName: `${userName} (C.C. ${cedula})`,
    dueDate: nowIso,
    milestoneHours: 24,
    recipient: deliveredTo,
    messageText: `Código de recuperación generado para ${userName} (C.C. ${cedula}) enviado a ${deliveredTo}: ${code}`,
    sentAt: nowIso,
    status: emailStatus === 'sent' ? 'sent' : 'missing_api_key',
    errorDetail: resendErrorDetail || undefined,
  });

  return { emailStatus, deliveredTo, resendErrorDetail };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Habilitar CORS para que tareas.fundacionulep.fun (GitHub Pages) pueda enviar correos de recuperación y alertas a través del servidor Resend
  app.use((req, res, next) => {
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  });

  app.use(express.json());

  // ============================================================================
  // RUTAS DE CONEXIÓN CON LA API DE RESEND (24h, 12h, 6h y 2h — EXCLUSIVO ADMIN)
  // ============================================================================
  app.get('/api/resend/status', (_req, res) => {
    const apiKeyConfigured = Boolean((process.env.RESEND_API_KEY || '').trim());
    res.json({
      connected: apiKeyConfigured,
      exclusiveRecipient: RESEND_EXCLUSIVE_RECIPIENT,
      recoveryEmail: recoveryEmailRecipient,
      maskedRecoveryEmail: maskEmailStartOnly(recoveryEmailRecipient),
      milestonesHours: ALERT_MILESTONES,
      fromEmail: (process.env.RESEND_FROM_EMAIL || 'Fundacion ULEP <onboarding@resend.dev>').trim(),
      sentHistory: Array.from(sentNotificationsMap.values()).sort(
        (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
      ),
      securityStates: Object.fromEntries(userRecoverySecurityMap.entries()),
    });
  });

  app.get('/api/resend/recovery-config', (_req, res) => {
    res.json({
      recoveryEmail: recoveryEmailRecipient,
      maskedEmail: maskEmailStartOnly(recoveryEmailRecipient),
      securityStates: Object.fromEntries(userRecoverySecurityMap.entries()),
    });
  });

  app.post('/api/resend/recovery-config', (req, res) => {
    const nextEmail = String(req.body?.recoveryEmail || '').trim();
    if (nextEmail && nextEmail.includes('@')) {
      recoveryEmailRecipient = nextEmail;
    }
    res.json({
      ok: true,
      recoveryEmail: recoveryEmailRecipient,
      maskedEmail: maskEmailStartOnly(recoveryEmailRecipient),
      securityStates: Object.fromEntries(userRecoverySecurityMap.entries()),
    });
  });

  app.post('/api/resend/unlock-user', (req, res) => {
    const cedula = String(req.body?.cedula || '').trim();
    if (!cedula) {
      return res.status(400).json({ error: 'Cédula requerida.' });
    }
    userRecoverySecurityMap.set(cedula, {
      cedula,
      sendAttempts: 0,
      verifyAttempts: 0,
      locked: false,
    });
    activeRecoveryCodes.delete(cedula);
    return res.json({
      ok: true,
      securityStates: Object.fromEntries(userRecoverySecurityMap.entries()),
    });
  });

  app.post('/api/resend/send-recovery-code', async (req, res) => {
    try {
      const cedula = String(req.body?.cedula || '')
        .trim()
        .replace(/[^a-zA-Z0-9_\-]/g, '');
      const userName = String(req.body?.userName || 'Usuario').trim();
      const rawUserEmail = String(req.body?.userEmail || req.body?.recoveryEmailOverride || '').trim();
      const clientLocked = Boolean(req.body?.isCurrentlyLocked);
      const isSingleAdmin = cedula === SINGLE_ADMIN_CEDULA;

      if (!cedula) {
        return res.status(400).json({ error: 'Debes ingresar el número de cédula.' });
      }

      const secState = getOrInitSecurityState(cedula);
      if (!isSingleAdmin && clientLocked && !secState.locked) {
        secState.locked = true;
        secState.lockedAt = new Date().toISOString();
      }

      if (!isSingleAdmin && secState.locked) {
        return res.status(403).json({
          locked: true,
          error: 'Cuenta y envío de correos bloqueados. Solo el Administrador puede desbloquearla.',
          securityState: secState,
        });
      }

      // Si el correo en ficha está vacío o es el dominio interno por defecto (@fundacionulep.org), usar el correo institucional de recuperación
      const targetEmail =
        rawUserEmail &&
        rawUserEmail.includes('@') &&
        !rawUserEmail.toLowerCase().endsWith('@fundacionulep.org')
          ? rawUserEmail
          : isSingleAdmin
          ? 'grupoulep@gmail.com'
          : recoveryEmailRecipient || RESEND_EXCLUSIVE_RECIPIENT;

      // Tiene 2 intentos; al 3er intento se bloquea la cuenta y el envío de correos de ese usuario (excepto el Admin Único)
      if (!isSingleAdmin) {
        secState.sendAttempts += 1;
        if (secState.sendAttempts >= 3) {
          secState.locked = true;
          secState.lockedAt = new Date().toISOString();
          activeRecoveryCodes.delete(cedula);
          return res.status(403).json({
            locked: true,
            error: 'Cuenta y envío de correos bloqueados. Solo el Administrador puede desbloquearla.',
            securityState: secState,
          });
        }
      }

      const preferredCode = String(req.body?.preferredCode || '').trim();
      const code =
        /^\d{6}$/.test(preferredCode)
          ? preferredCode
          : String(Math.floor(100000 + Math.random() * 900000));

      const { emailStatus, deliveredTo } = await sendRecoveryEmailViaResend({
        cedula,
        userName,
        targetEmail,
        code,
      });

      return res.json({
        ok: true,
        status: emailStatus,
        code,
        deliveredTo,
        maskedEmail: maskEmailStartOnly(deliveredTo),
        securityState: secState,
      });
    } catch (error: unknown) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'No se pudo enviar el código de recuperación.',
      });
    }
  });

  app.post('/api/resend/verify-recovery-code', (req, res) => {
    const cedula = String(req.body?.cedula || '')
      .trim()
      .replace(/[^a-zA-Z0-9_\-]/g, '');
    const code = String(req.body?.code || '').trim();
    const isSingleAdmin = cedula === SINGLE_ADMIN_CEDULA;

    const secState = getOrInitSecurityState(cedula);
    if (!isSingleAdmin && secState.locked) {
      return res.status(403).json({
        valid: false,
        locked: true,
        error: 'Cuenta y envío de correos bloqueados. Solo el Administrador puede desbloquearla.',
        securityState: secState,
      });
    }

    const entry = activeRecoveryCodes.get(cedula);
    if (!entry || Date.now() > entry.expiresAt || entry.code !== code) {
      if (!isSingleAdmin) {
        secState.verifyAttempts += 1;
        if (secState.verifyAttempts >= 3) {
          secState.locked = true;
          secState.lockedAt = new Date().toISOString();
          activeRecoveryCodes.delete(cedula);
          return res.status(403).json({
            valid: false,
            locked: true,
            error: 'Cuenta y envío de correos bloqueados. Solo el Administrador puede desbloquearla.',
            securityState: secState,
          });
        }
      }
      return res.status(400).json({
        valid: false,
        locked: false,
        error: 'El código ingresado es incorrecto.',
        securityState: secState,
      });
    }

    activeRecoveryCodes.delete(cedula);
    userRecoverySecurityMap.set(cedula, {
      cedula,
      sendAttempts: 0,
      verifyAttempts: 0,
      locked: false,
    });
    return res.json({
      valid: true,
      locked: false,
      securityState: userRecoverySecurityMap.get(cedula),
    });
  });

  // Verificación de doble correo para eliminación total del registro de auditoría
  let auditDeleteVerificationState: {
    code1: string;
    code2: string;
    step1Verified: boolean;
    step2Verified: boolean;
    expiresAt: number;
  } | null = null;

  app.post('/api/resend/audit-delete/send-code-1', async (_req, res) => {
    try {
      const code1 = String(Math.floor(100000 + Math.random() * 900000));
      const targetEmail1 = 'fundacionulep@gmail.com';

      auditDeleteVerificationState = {
        code1,
        code2: '',
        step1Verified: false,
        step2Verified: false,
        expiresAt: Date.now() + 15 * 60 * 1000,
      };

      const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
      const fromEmail = (process.env.RESEND_FROM_EMAIL || 'Fundacion ULEP <onboarding@resend.dev>').trim();
      let emailStatus: 'sent' | 'missing_api_key' | 'error' = 'missing_api_key';

      if (resendApiKey) {
        const emailHtml = `
          <div style="font-family: Roboto, Arial, sans-serif; max-width: 560px; margin: 0 auto; border: 1px solid #B3D9FF; border-radius: 12px; overflow: hidden; background-color: #FFFFFF;">
            <div style="background-color: #0B2559; color: #FFFFFF; padding: 18px 24px;">
              <h2 style="margin: 0; font-size: 16px;">Autorización de Eliminación de Auditoría (Paso 1/2) — Fundación ULEP</h2>
            </div>
            <div style="padding: 24px; color: #0B2559; background-color: #F4F9FF; text-align: center;">
              <p style="font-size: 14px; margin-top: 0;">Código de verificación enviado a <strong>${targetEmail1}</strong> para autorizar la eliminación del registro de auditoría:</p>
              <div style="margin: 20px auto; padding: 16px 24px; background-color: #FFFFFF; border: 2px solid #0B2559; border-radius: 12px; display: inline-block; font-family: monospace; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #0B2559;">
                ${code1}
              </div>
              <p style="font-size: 12px; color: #3B82F6; margin-bottom: 0;">Este código es válido por 15 minutos.</p>
            </div>
          </div>
        `;

        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [targetEmail1],
            subject: `Código de Autorización (Paso 1/2) Eliminación de Auditoría: ${code1}`,
            text: `Código de autorización (Paso 1/2) para eliminar el registro de auditoría (${targetEmail1}): ${code1}`,
            html: emailHtml,
          }),
        });

        emailStatus = response.ok ? 'sent' : 'error';
      }

      return res.json({
        ok: true,
        status: emailStatus,
        recipient: targetEmail1,
      });
    } catch (error: unknown) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'No se pudo enviar el primer código de verificación.',
      });
    }
  });

  app.post('/api/resend/audit-delete/verify-code-1', async (req, res) => {
    try {
      const code = String(req.body?.code || '').trim();
      if (
        !auditDeleteVerificationState ||
        Date.now() > auditDeleteVerificationState.expiresAt ||
        auditDeleteVerificationState.code1 !== code
      ) {
        return res.status(400).json({
          valid: false,
          error: 'El código ingresado para fundacionulep@gmail.com no coincide o ha expirado.',
        });
      }

      const code2 = String(Math.floor(100000 + Math.random() * 900000));
      const targetEmail2 = 'jslopezren@gmail.com';

      auditDeleteVerificationState.step1Verified = true;
      auditDeleteVerificationState.code2 = code2;
      auditDeleteVerificationState.expiresAt = Date.now() + 15 * 60 * 1000;

      const resendApiKey = (process.env.RESEND_API_KEY || '').trim();
      const fromEmail = (process.env.RESEND_FROM_EMAIL || 'Fundacion ULEP <onboarding@resend.dev>').trim();
      let emailStatus: 'sent' | 'missing_api_key' | 'error' = 'missing_api_key';

      if (resendApiKey) {
        const emailHtml = `
          <div style="font-family: Roboto, Arial, sans-serif; max-width: 560px; margin: 0 auto; border: 1px solid #B3D9FF; border-radius: 12px; overflow: hidden; background-color: #FFFFFF;">
            <div style="background-color: #0B2559; color: #FFFFFF; padding: 18px 24px;">
              <h2 style="margin: 0; font-size: 16px;">Autorización de Eliminación de Auditoría (Paso 2/2) — Fundación ULEP</h2>
            </div>
            <div style="padding: 24px; color: #0B2559; background-color: #F4F9FF; text-align: center;">
              <p style="font-size: 14px; margin-top: 0;">Segundo código de verificación enviado a <strong>${targetEmail2}</strong> para autorizar la eliminación del registro de auditoría:</p>
              <div style="margin: 20px auto; padding: 16px 24px; background-color: #FFFFFF; border: 2px solid #0B2559; border-radius: 12px; display: inline-block; font-family: monospace; font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #0B2559;">
                ${code2}
              </div>
              <p style="font-size: 12px; color: #3B82F6; margin-bottom: 0;">Este código es válido por 15 minutos.</p>
            </div>
          </div>
        `;

        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [targetEmail2],
            subject: `Código de Autorización (Paso 2/2) Eliminación de Auditoría: ${code2}`,
            text: `Código de autorización (Paso 2/2) para eliminar el registro de auditoría (${targetEmail2}): ${code2}`,
            html: emailHtml,
          }),
        });

        emailStatus = response.ok ? 'sent' : 'error';
      }

      return res.json({
        ok: true,
        valid: true,
        status: emailStatus,
        nextRecipient: targetEmail2,
      });
    } catch (error: unknown) {
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Error al verificar el primer código y enviar el segundo.',
      });
    }
  });

  app.post('/api/resend/audit-delete/verify-code-2', (req, res) => {
    const code = String(req.body?.code || '').trim();
    if (
      !auditDeleteVerificationState ||
      !auditDeleteVerificationState.step1Verified ||
      Date.now() > auditDeleteVerificationState.expiresAt ||
      auditDeleteVerificationState.code2 !== code
    ) {
      return res.status(400).json({
        valid: false,
        error: 'El código ingresado para jslopezren@gmail.com no coincide exactamente o ha expirado.',
      });
    }

    auditDeleteVerificationState.step2Verified = true;
    return res.json({
      ok: true,
      valid: true,
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
        if (isUserLockedForEmailsAndAccount(String(t.assignedToCedula || ''))) {
          continue;
        }
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
        if (isUserLockedForEmailsAndAccount(String(t.assignedToCedula || ''))) {
          continue;
        }
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

  // ============================================================================
  // PUENTE EN TIEMPO REAL FIRESTORE -> RESEND PARA DOMINIO GITHUB (tareas.fundacionulep.fun)
  // Escucha solicitudes de código de recuperación desde https://tareas.fundacionulep.fun
  // y despacha el correo real vía Resend (No-reply@fundacionulep.fun) al instante.
  // ============================================================================
  try {
    const fbConfigPath = path.join(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(fbConfigPath)) {
      const fbConfig = JSON.parse(fs.readFileSync(fbConfigPath, 'utf8'));
      const serverFbApp = getClientFirebaseApps().find(a => a.name === 'server-resend-bridge')
        || initClientFirebaseApp(fbConfig, 'server-resend-bridge');
      const serverFirestoreDb = getClientFirestore(serverFbApp, fbConfig.firestoreDatabaseId);
      const processedQueueReqIds = new Set<string>();

      const processQueueDoc = async (docData: Record<string, any> | undefined) => {
        if (!docData || docData.time !== 'PENDIENTE') return;
        let payload: {
          reqId?: string;
          cedula?: string;
          userName?: string;
          email?: string;
          code?: string;
        } = {};
        try {
          payload = JSON.parse(String(docData.description || '{}'));
        } catch {
          return;
        }
        const reqId = String(payload.reqId || docData.linkedTaskId || '').trim();
        if (!reqId || processedQueueReqIds.has(reqId)) return;
        processedQueueReqIds.add(reqId);

        const cedula = String(payload.cedula || docData.createdByCedula || '').trim();
        const userName = String(payload.userName || docData.createdByName || 'Usuario').trim();
        const rawEmail = String(payload.email || '').trim();
        const code = String(payload.code || '').trim();
        if (!cedula || !code) return;

        const isSingleAdmin = cedula === SINGLE_ADMIN_CEDULA;
        const targetEmail =
          rawEmail && rawEmail.includes('@') && !rawEmail.toLowerCase().endsWith('@fundacionulep.org')
            ? rawEmail
            : isSingleAdmin
            ? 'grupoulep@gmail.com'
            : recoveryEmailRecipient || RESEND_EXCLUSIVE_RECIPIENT;

        const { emailStatus, deliveredTo } = await sendRecoveryEmailViaResend({
          cedula,
          userName,
          targetEmail,
          code,
        });

        try {
          await firestoreSetDoc(
            firestoreDoc(serverFirestoreDb, 'calendar_events', 'config_resend_queue'),
            {
              title: 'Cola Envio Correo Recuperacion ULEP',
              date: 'CONFIG_RESEND_QUEUE',
              time: emailStatus === 'sent' ? 'ENVIADO' : 'PROCESADO',
              type: 'actividad',
              description: JSON.stringify({
                reqId,
                status: emailStatus,
                deliveredTo,
                maskedEmail: maskEmailStartOnly(deliveredTo),
                code,
                ts: Date.now(),
              }).slice(0, 500),
              createdByCedula: cedula.slice(0, 20),
              createdByName: userName.slice(0, 100),
              linkedTaskId: reqId.slice(0, 128),
            },
            { merge: true }
          );
        } catch {
          // ignore
        }
      };

      const queueRef = firestoreDoc(serverFirestoreDb, 'calendar_events', 'config_resend_queue');
      firestoreOnSnapshot(
        queueRef,
        snap => {
          if (snap.exists()) {
            void processQueueDoc(snap.data());
          }
        },
        () => {
          // Silencioso en caso de reconexión
        }
      );

      setInterval(async () => {
        try {
          const snap = await firestoreGetDoc(queueRef);
          if (snap.exists()) {
            await processQueueDoc(snap.data());
          }
        } catch {
          // ignore
        }
      }, 2500);
    }
  } catch (err) {
    console.warn('Firestore Resend bridge init warning:', err);
  }

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
