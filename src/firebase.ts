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
import { SINGLE_ADMIN_CEDULA } from './constants';

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

export function cleanId(raw?: string): string {
  if (raw && /^[a-zA-Z0-9_\-]+$/.test(raw) && raw.length <= 128) {
    return raw;
  }
  return `id_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export function sanitizeUserPayload(user: AppUser) {
  const cleanCedula = String(user.cedula || '').trim().replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 20);
  const isSingleAdmin = cleanCedula === SINGLE_ADMIN_CEDULA;
  return {
    cedula: cleanCedula,
    name: String(user.name || (isSingleAdmin ? 'Administrador Principal ULEP' : 'Usuario')).trim().slice(0, 100),
    password: String(user.password || (isSingleAdmin ? SINGLE_ADMIN_CEDULA : '1234')).slice(0, 100),
    role: isSingleAdmin ? 'admin' : 'user',
    email: String(user.email || '').slice(0, 120),
    department: String(user.department || 'General').slice(0, 80),
    isOnline: Boolean(user.isOnline),
    lastSeen: String(user.lastSeen || new Date().toISOString()).slice(0, 50),
    canCreateTasks: isSingleAdmin ? true : Boolean(user.canCreateTasks),
    canEditTasks: isSingleAdmin ? true : Boolean(user.canEditTasks),
    canDeleteTasks: isSingleAdmin ? true : Boolean(user.canDeleteTasks),
    canSendChat: isSingleAdmin ? true : Boolean(user.canSendChat),
    canViewVault: isSingleAdmin ? true : Boolean(user.canViewVault),
    canExportReports: isSingleAdmin ? true : Boolean(user.canExportReports),
    approvalStatus: isSingleAdmin
      ? 'aprobado'
      : user.approvalStatus && ['aprobado', 'pendiente', 'rechazado'].includes(user.approvalStatus)
      ? user.approvalStatus
      : 'aprobado',
    cedulaIssuePlace: String(user.cedulaIssuePlace || '').trim().slice(0, 100),
    cedulaIssueDate: String(user.cedulaIssueDate || '').trim().slice(0, 30),
    birthDate: String(user.birthDate || '').trim().slice(0, 30),
    birthPlace: String(user.birthPlace || '').trim().slice(0, 100),
    bloodType: String(user.bloodType || '').trim().slice(0, 15),
    maritalStatus: String(user.maritalStatus || '').trim().slice(0, 40),
    phone: String(user.phone || '').trim().slice(0, 40),
    locationDepartmentState: String(user.locationDepartmentState || '').trim().slice(0, 80),
    locationCity: String(user.locationCity || '').trim().slice(0, 80),
    residenceAddress: String(user.residenceAddress || '').trim().slice(0, 200),
    residenceType: String(user.residenceType || '').trim().slice(0, 50),
    residenceStratum: String(user.residenceStratum || '').trim().slice(0, 30),
    familyMembersCount: Math.max(0, Math.min(50, Number(user.familyMembersCount) || 0)),
    emergencyContactName: String(user.emergencyContactName || '').trim().slice(0, 100),
    emergencyContactPhone: String(user.emergencyContactPhone || '').trim().slice(0, 40),
    familyNotes: String(user.familyNotes || '').trim().slice(0, 300),
    bankName: String(user.bankName || '').trim().slice(0, 80),
    bankAccountType: String(user.bankAccountType || '').trim().slice(0, 50),
    bankAccountNumber: String(user.bankAccountNumber || '').trim().slice(0, 60),
    bankAccountHolder: String(user.bankAccountHolder || '').trim().slice(0, 120),
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
  const cleanCed = String(cedula || '').trim();
  if (cleanCed === SINGLE_ADMIN_CEDULA) {
    return;
  }
  const path = `app_users/${cleanCed}`;
  try {
    await deleteDoc(doc(db, 'app_users', cleanCed));
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

const DEMO_USER_CEDULAS = new Set([
  '10000001',
  '10203040',
  '20304050',
  '30405060',
  '99001122',
]);

const DEMO_TASK_IDS = new Set([
  'task_cierre_fiscal_01',
  'task_migracion_ssl_02',
  'task_auditoria_iso_03',
  'task_backup_mensual_04',
  'task_reporte_kpi_05',
  'task_ejemplo_plantilla_01',
]);

const DEMO_EVENT_IDS = new Set([
  'ev_cierre_01',
  'ev_comite_02',
  'ev_ejemplo_plantilla_01',
  'ev_sync_task_cierre_fiscal_01',
  'ev_sync_task_migracion_ssl_02',
  'ev_sync_task_auditoria_iso_03',
  'ev_sync_task_backup_mensual_04',
  'ev_sync_task_reporte_kpi_05',
]);

const DEMO_CHAT_IDS = new Set(['msg_welcome_01', 'msg_welcome_02']);

export async function seedInitialDatabaseIfEmpty() {
  try {
    const isoNow = new Date().toISOString();

    const [usersSnap, tasksSnap, eventsSnap, chatSnap, logsSnap] = await Promise.all([
      getDocs(query(collection(db, 'app_users'), limit(200))),
      getDocs(query(collection(db, 'tasks'), limit(200))),
      getDocs(query(collection(db, 'calendar_events'), limit(200))),
      getDocs(query(collection(db, 'chat_messages'), limit(200))),
      getDocs(query(collection(db, 'audit_logs'), limit(200))),
    ]);

    let singleAdminExists = false;

    // 1. Limpiar usuarios de prueba y asegurar que solo exista el Administrador Único (902050377) como admin
    for (const userDoc of usersSnap.docs) {
      const data = userDoc.data() as AppUser;
      const docCedula = data.cedula || userDoc.id;

      if (DEMO_USER_CEDULAS.has(docCedula) || DEMO_USER_CEDULAS.has(userDoc.id)) {
        await deleteDoc(doc(db, 'app_users', userDoc.id));
        continue;
      }

      if (docCedula === SINGLE_ADMIN_CEDULA) {
        singleAdminExists = true;
        if (data.role !== 'admin' || data.approvalStatus !== 'aprobado') {
          await saveUserToFirestore({
            ...data,
            cedula: SINGLE_ADMIN_CEDULA,
            role: 'admin',
            approvalStatus: 'aprobado',
            password: data.password || SINGLE_ADMIN_CEDULA,
          });
        }
      } else if (data.role === 'admin') {
        await saveUserToFirestore({
          ...data,
          cedula: docCedula,
          role: 'user',
        });
      }
    }

    // 2. Eliminar tareas de demostración/prueba
    for (const taskDoc of tasksSnap.docs) {
      const tData = taskDoc.data() as Partial<TaskItem>;
      if (
        DEMO_TASK_IDS.has(taskDoc.id) ||
        (tData.createdByCedula && DEMO_USER_CEDULAS.has(tData.createdByCedula)) ||
        (tData.assignedToCedula && DEMO_USER_CEDULAS.has(tData.assignedToCedula))
      ) {
        await deleteDoc(doc(db, 'tasks', taskDoc.id));
      }
    }

    // 3. Eliminar eventos de calendario de demostración/prueba
    for (const evDoc of eventsSnap.docs) {
      const evData = evDoc.data() as Partial<CalendarEvent>;
      if (
        DEMO_EVENT_IDS.has(evDoc.id) ||
        (evData.createdByCedula && DEMO_USER_CEDULAS.has(evData.createdByCedula)) ||
        (evData.linkedTaskId && DEMO_TASK_IDS.has(evData.linkedTaskId))
      ) {
        await deleteDoc(doc(db, 'calendar_events', evDoc.id));
      }
    }

    // 4. Eliminar mensajes de chat de demostración/prueba
    for (const msgDoc of chatSnap.docs) {
      const msgData = msgDoc.data() as Partial<ChatMessage>;
      if (
        DEMO_CHAT_IDS.has(msgDoc.id) ||
        (msgData.senderCedula && DEMO_USER_CEDULAS.has(msgData.senderCedula))
      ) {
        await deleteDoc(doc(db, 'chat_messages', msgDoc.id));
      }
    }

    // 5. Eliminar registros de auditoría generados por cuentas de prueba
    for (const logDoc of logsSnap.docs) {
      const logData = logDoc.data() as Partial<AuditLog>;
      if (
        (logData.actorCedula && DEMO_USER_CEDULAS.has(logData.actorCedula)) ||
        (logData.targetId && (DEMO_USER_CEDULAS.has(logData.targetId) || DEMO_TASK_IDS.has(logData.targetId)))
      ) {
        await deleteDoc(doc(db, 'audit_logs', logDoc.id));
      }
    }

    // 6. Crear el único Administrador Principal (902050377) si aún no existe
    if (!singleAdminExists) {
      const primaryAdmin: AppUser = {
        cedula: SINGLE_ADMIN_CEDULA,
        name: 'Administrador Principal ULEP',
        password: SINGLE_ADMIN_CEDULA,
        role: 'admin',
        email: 'grupoulep@gmail.com',
        department: 'Dirección General / Ejecutiva',
        approvalStatus: 'aprobado',
        isOnline: false,
        lastSeen: isoNow,
        canCreateTasks: true,
        canEditTasks: true,
        canDeleteTasks: true,
        canSendChat: true,
        canViewVault: true,
        canExportReports: true,
        createdAt: isoNow,
      };
      await saveUserToFirestore(primaryAdmin);
    }
  } catch (err) {
    console.error('Error initializing production database:', err);
  }
}

