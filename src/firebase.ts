import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  limit,
  writeBatch
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { AppUser, TaskItem, AuditLog, ChatMessage, CalendarEvent } from './types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export function cleanId(raw?: string): string {
  if (raw && /^[a-zA-Z0-9_\-]+$/.test(raw) && raw.length <= 128) {
    return raw;
  }
  return `id_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function sanitizeUserPayload(user: AppUser) {
  return {
    cedula: String(user.cedula || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 20),
    name: String(user.name || 'Usuario').trim().slice(0, 100),
    password: String(user.password || '1234').slice(0, 100),
    role: user.role === 'admin' ? 'admin' : 'user',
    email: String(user.email || '').slice(0, 120),
    department: String(user.department || 'General').slice(0, 80),
    isOnline: Boolean(user.isOnline),
    lastSeen: String(user.lastSeen || new Date().toISOString()).slice(0, 50),
    canCreateTasks: Boolean(user.canCreateTasks),
    canEditTasks: Boolean(user.canEditTasks),
    canDeleteTasks: Boolean(user.canDeleteTasks),
    canSendChat: Boolean(user.canSendChat),
    canViewVault: Boolean(user.canViewVault),
    canExportReports: Boolean(user.canExportReports),
    createdAt: String(user.createdAt || new Date().toISOString()).slice(0, 50),
  };
}

export function sanitizeTaskPayload(task: Omit<TaskItem, 'id'>) {
  return {
    title: String(task.title || 'Sin título').trim().slice(0, 180),
    description: String(task.description || '').slice(0, 2000),
    priority: ['baja', 'media', 'alta', 'critica'].includes(task.priority) ? task.priority : 'media',
    status: ['pendiente', 'en_progreso', 'completada'].includes(task.status) ? task.status : 'pendiente',
    progress: Math.min(100, Math.max(0, Number(task.progress) || 0)),
    tags: String(task.tags || '').slice(0, 300),
    assignedToCedula: String(task.assignedToCedula || '').slice(0, 20),
    assignedToName: String(task.assignedToName || '').slice(0, 100),
    createdByCedula: String(task.createdByCedula || '').slice(0, 20),
    createdByName: String(task.createdByName || '').slice(0, 100),
    createdAt: String(task.createdAt || new Date().toISOString()).slice(0, 50),
    dueDate: String(task.dueDate || new Date().toISOString()).slice(0, 50),
    completedAt: String(task.completedAt || '').slice(0, 50),
    notes: String(task.notes || '').slice(0, 2000),
    accessEmail: String(task.accessEmail || '').slice(0, 150),
    accessPassword: String(task.accessPassword || '').slice(0, 150),
    directLink: String(task.directLink || '').slice(0, 500),
    category: String(task.category || 'Operaciones').slice(0, 80),
  };
}

export async function recordAuditLog(params: {
  actorCedula: string;
  actorName: string;
  actorRole: 'admin' | 'user';
  actionType: string;
  module: string;
  description: string;
  targetId?: string;
  severity?: 'info' | 'warning' | 'critical';
}) {
  const logId = cleanId(`log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
  const path = `audit_logs/${logId}`;
  const payload = {
    actorCedula: String(params.actorCedula || '0000').slice(0, 20),
    actorName: String(params.actorName || 'Sistema').slice(0, 100),
    actorRole: params.actorRole === 'admin' ? 'admin' : 'user',
    actionType: String(params.actionType || 'ACCION').slice(0, 60),
    module: String(params.module || 'SISTEMA').slice(0, 60),
    description: String(params.description || '').slice(0, 500),
    targetId: String(params.targetId || '').slice(0, 128),
    timestamp: new Date().toISOString().slice(0, 50),
    severity: params.severity || 'info',
  };
  try {
    await setDoc(doc(db, 'audit_logs', logId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function saveUserToFirestore(user: AppUser) {
  const cedulaId = cleanId(user.cedula);
  const path = `app_users/${cedulaId}`;
  const payload = sanitizeUserPayload({ ...user, cedula: cedulaId });
  try {
    await setDoc(doc(db, 'app_users', cedulaId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteUserFromFirestore(cedula: string) {
  const path = `app_users/${cedula}`;
  try {
    await deleteDoc(doc(db, 'app_users', cedula));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveTaskToFirestore(task: TaskItem) {
  const taskId = cleanId(task.id);
  const path = `tasks/${taskId}`;
  const payload = sanitizeTaskPayload(task);
  try {
    await setDoc(doc(db, 'tasks', taskId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteTaskFromFirestore(taskId: string) {
  const path = `tasks/${taskId}`;
  try {
    await deleteDoc(doc(db, 'tasks', taskId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveChatMessageToFirestore(msg: Omit<ChatMessage, 'id'>, customId?: string) {
  const msgId = cleanId(customId || `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`);
  const path = `chat_messages/${msgId}`;
  const payload = {
    senderCedula: String(msg.senderCedula).slice(0, 20),
    senderName: String(msg.senderName).slice(0, 100),
    senderRole: msg.senderRole === 'admin' ? 'admin' : 'user',
    text: String(msg.text).trim().slice(0, 1000),
    channel: String(msg.channel || 'general').slice(0, 50),
    relatedTaskId: String(msg.relatedTaskId || '').slice(0, 128),
    timestamp: String(msg.timestamp || new Date().toISOString()).slice(0, 50),
  };
  try {
    await setDoc(doc(db, 'chat_messages', msgId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function saveCalendarEventToFirestore(ev: CalendarEvent) {
  const evId = cleanId(ev.id);
  const path = `calendar_events/${evId}`;
  const payload = {
    title: String(ev.title || 'Evento').trim().slice(0, 150),
    date: String(ev.date || '').slice(0, 50),
    time: String(ev.time || '09:00').slice(0, 20),
    type: ['entrega', 'reunion', 'auditoria', 'hito', 'actividad'].includes(ev.type) ? ev.type : 'actividad',
    description: String(ev.description || '').slice(0, 500),
    createdByCedula: String(ev.createdByCedula || '').slice(0, 20),
    createdByName: String(ev.createdByName || '').slice(0, 100),
    linkedTaskId: String(ev.linkedTaskId || '').slice(0, 128),
  };
  try {
    await setDoc(doc(db, 'calendar_events', evId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCalendarEventFromFirestore(eventId: string) {
  const path = `calendar_events/${eventId}`;
  try {
    await deleteDoc(doc(db, 'calendar_events', eventId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function seedInitialDatabaseIfEmpty() {
  try {
    const [usersSnap, tasksSnap] = await Promise.all([
      getDocs(query(collection(db, 'app_users'), limit(10))),
      getDocs(query(collection(db, 'tasks'), limit(10)))
    ]);
    if (usersSnap.size >= 4 && !tasksSnap.empty) return;

    const now = new Date();
    const isoNow = now.toISOString();
    const inTwoHours = new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
    const inEightHours = new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString();
    const yesterday = new Date(now.getTime() - 18 * 60 * 60 * 1000).toISOString();
    const inThreeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
    const inFiveDays = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();

    const defaultUsers: AppUser[] = [
      {
        cedula: '10000001',
        name: 'Carlos Mendoza (Director Admin)',
        password: 'admin123',
        role: 'admin',
        email: 'grupoulep@gmail.com',
        department: 'Dirección General & TI',
        isOnline: false,
        lastSeen: isoNow,
        canCreateTasks: true,
        canEditTasks: true,
        canDeleteTasks: true,
        canSendChat: true,
        canViewVault: true,
        canExportReports: true,
        createdAt: isoNow,
      },
      {
        cedula: '10203040',
        name: 'Valeria Gómez',
        password: 'user123',
        role: 'user',
        email: 'valeria.gomez@empresa.com',
        department: 'Operaciones & Finanzas',
        isOnline: false,
        lastSeen: isoNow,
        canCreateTasks: true,
        canEditTasks: true,
        canDeleteTasks: false,
        canSendChat: true,
        canViewVault: true,
        canExportReports: true,
        createdAt: isoNow,
      },
      {
        cedula: '20304050',
        name: 'Andrés Herrera',
        password: 'user123',
        role: 'user',
        email: 'andres.herrera@empresa.com',
        department: 'Infraestructura Cloud',
        isOnline: false,
        lastSeen: isoNow,
        canCreateTasks: true,
        canEditTasks: true,
        canDeleteTasks: false,
        canSendChat: true,
        canViewVault: true,
        canExportReports: true,
        createdAt: isoNow,
      },
      {
        cedula: '30405060',
        name: 'Laura Ríos',
        password: 'user123',
        role: 'user',
        email: 'laura.rios@empresa.com',
        department: 'Auditoría & Cumplimiento',
        isOnline: false,
        lastSeen: isoNow,
        canCreateTasks: true,
        canEditTasks: true,
        canDeleteTasks: false,
        canSendChat: true,
        canViewVault: false,
        canExportReports: true,
        createdAt: isoNow,
      }
    ];

    for (const u of defaultUsers) {
      await saveUserToFirestore(u);
    }

    const defaultTasks: TaskItem[] = [
      {
        id: 'task_cierre_fiscal_01',
        title: 'Conciliación y Cierre de Pasarela de Pagos Mensual',
        description: 'Validar transacciones pendientes en el portal bancario, verificar rechazos y emitir certificado de cierre antes de la hora límite.',
        priority: 'critica',
        status: 'en_progreso',
        progress: 65,
        tags: 'Finanzas, Cierre-Mensual, Urgente',
        assignedToCedula: '10203040',
        assignedToName: 'Valeria Gómez',
        createdByCedula: '10000001',
        createdByName: 'Carlos Mendoza (Director Admin)',
        createdAt: isoNow,
        dueDate: inTwoHours,
        completedAt: '',
        notes: 'Importante: Descargar extracto consolidado en formato XML antes de las 18:00 y validar código token.',
        accessEmail: 'tesoreria.pagos@corporativo.com',
        accessPassword: 'Finanzas#2026!Secure',
        directLink: 'https://dashboard.stripe.com/login',
        category: 'Finanzas'
      },
      {
        id: 'task_migracion_ssl_02',
        title: 'Renovación de Certificados SSL y Firewall Perimetral',
        description: 'Actualizar certificados de seguridad en el balanceador de carga principal y comprobar estado de réplicas de producción.',
        priority: 'critica',
        status: 'pendiente',
        progress: 20,
        tags: 'Seguridad, Servidores, Cloud',
        assignedToCedula: '20304050',
        assignedToName: 'Andrés Herrera',
        createdByCedula: '10000001',
        createdByName: 'Carlos Mendoza (Director Admin)',
        createdAt: yesterday,
        dueDate: yesterday,
        completedAt: '',
        notes: 'Acceder mediante consola SSH o panel Cloudflare corporativo. Reiniciar nginx tras validar llaves.',
        accessEmail: 'infra.ops@corporativo.com',
        accessPassword: 'CloudOps$9981_Admin',
        directLink: 'https://dash.cloudflare.com',
        category: 'Infraestructura'
      },
      {
        id: 'task_auditoria_iso_03',
        title: 'Revisión de Controles de Acceso ISO-27001 Trimestral',
        description: 'Inspeccionar matriz de permisos de usuarios activos y generar acta de conformidad de accesos privilegiados.',
        priority: 'alta',
        status: 'en_progreso',
        progress: 45,
        tags: 'Auditoría, ISO27001, Permisos',
        assignedToCedula: '10203040',
        assignedToName: 'Valeria Gómez',
        createdByCedula: '10000001',
        createdByName: 'Carlos Mendoza (Director Admin)',
        createdAt: isoNow,
        dueDate: inEightHours,
        completedAt: '',
        notes: 'Verificar que ningún usuario externo mantenga permisos de eliminación de registros.',
        accessEmail: 'auditoria.interna@corporativo.com',
        accessPassword: 'Audit2026*Compliance',
        directLink: 'https://console.cloud.google.com',
        category: 'Auditoría'
      },
      {
        id: 'task_backup_mensual_04',
        title: 'Verificación de Integridad de Respaldos en Frío',
        description: 'Comprobar que las instantáneas mensuales de la base de datos se restauran sin pérdida de registros.',
        priority: 'media',
        status: 'completada',
        progress: 100,
        tags: 'Base-de-Datos, Backup, Mensual',
        assignedToCedula: '10203040',
        assignedToName: 'Valeria Gómez',
        createdByCedula: '10000001',
        createdByName: 'Carlos Mendoza (Director Admin)',
        createdAt: yesterday,
        dueDate: inThreeDays,
        completedAt: isoNow,
        notes: 'Validación completada con 100% de integridad verificada en entorno staging.',
        accessEmail: 'backups@corporativo.com',
        accessPassword: 'Bk_Restore_2026!',
        directLink: 'https://console.firebase.google.com',
        category: 'Sistemas'
      },
      {
        id: 'task_reporte_kpi_05',
        title: 'Consolidado de Indicadores Operativos del Mes',
        description: 'Cruzar métricas de entregas completadas vs pendientes para presentación de comité ejecutivo.',
        priority: 'alta',
        status: 'completada',
        progress: 100,
        tags: 'Reportes, KPI, Mensual',
        assignedToCedula: '30405060',
        assignedToName: 'Laura Ríos',
        createdByCedula: '10000001',
        createdByName: 'Carlos Mendoza (Director Admin)',
        createdAt: yesterday,
        dueDate: inFiveDays,
        completedAt: isoNow,
        notes: 'Reporte adjunto en carpeta compartida del comité.',
        accessEmail: 'kpi.comite@corporativo.com',
        accessPassword: 'KpiExec#2026',
        directLink: 'https://docs.google.com',
        category: 'Operaciones'
      }
    ];

    for (const t of defaultTasks) {
      await saveTaskToFirestore(t);
    }

    const defaultEvents: CalendarEvent[] = [
      {
        id: 'ev_cierre_01',
        title: 'Cierre de Pasarela y Reporte Financiero',
        date: now.toISOString().split('T')[0],
        time: '17:00',
        type: 'entrega',
        description: 'Entrega límite de conciliación mensual con credenciales verificadas.',
        createdByCedula: '10000001',
        createdByName: 'Carlos Mendoza (Director Admin)',
        linkedTaskId: 'task_cierre_fiscal_01'
      },
      {
        id: 'ev_comite_02',
        title: 'Comité de Auditoría y Seguridad en Tiempo Real',
        date: inThreeDays.split('T')[0],
        time: '10:30',
        type: 'auditoria',
        description: 'Revisión de logs detallados de acciones de usuarios y permisos.',
        createdByCedula: '10000001',
        createdByName: 'Carlos Mendoza (Director Admin)',
        linkedTaskId: 'task_auditoria_iso_03'
      }
    ];

    for (const ev of defaultEvents) {
      await saveCalendarEventToFirestore(ev);
    }

    await saveChatMessageToFirestore({
      senderCedula: '10000001',
      senderName: 'Carlos Mendoza (Director Admin)',
      senderRole: 'admin',
      text: 'Bienvenidos al sistema central. Recuerden revisar la sección de Alertas de Prioridad y Cierre para las entregas de hoy.',
      channel: 'general',
      relatedTaskId: 'task_cierre_fiscal_01',
      timestamp: isoNow
    }, 'msg_welcome_01');

    await saveChatMessageToFirestore({
      senderCedula: '10203040',
      senderName: 'Valeria Gómez',
      senderRole: 'user',
      text: 'Enterado Carlos, ya estoy al 65% con la conciliación de pasarela usando las credenciales adjuntas en la tarea.',
      channel: 'general',
      relatedTaskId: 'task_cierre_fiscal_01',
      timestamp: isoNow
    }, 'msg_welcome_02');

    await recordAuditLog({
      actorCedula: '10000001',
      actorName: 'Carlos Mendoza (Director Admin)',
      actorRole: 'admin',
      actionType: 'INICIALIZAR_SISTEMA',
      module: 'BASE_DE_DATOS',
      description: 'Base de datos inicializada con usuarios, permisos, tareas críticas y calendario sincronizado.',
      severity: 'info'
    });
  } catch (err) {
    console.error('Error seeding initial data:', err);
  }
}
