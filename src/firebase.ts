import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  limit,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { AppUser, TaskItem, AuditLog, ChatMessage, CalendarEvent } from './types';
import { SINGLE_ADMIN_CEDULA } from './constants';
import { refreshInMemoryIdToken } from './lib/firebase';

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleAuthProvider = new GoogleAuthProvider();

export const PERMANENT_VAULT_STORAGE_KEY = 'ulep_permanent_vault_v1';

export interface PermanentDataVault {
  users: Record<string, AppUser>;
  tasks: Record<string, TaskItem>;
  calendarEvents: Record<string, CalendarEvent>;
  chatMessages: Record<string, ChatMessage>;
  auditLogs: Record<string, AuditLog>;
  deletedUserCedulas: string[];
  deletedTaskIds: string[];
  deletedEventIds: string[];
  updatedAt: string;
}

export function readPermanentVault(): PermanentDataVault {
  if (typeof window === 'undefined') {
    return {
      users: {},
      tasks: {},
      calendarEvents: {},
      chatMessages: {},
      auditLogs: {},
      deletedUserCedulas: [],
      deletedTaskIds: [],
      deletedEventIds: [],
      updatedAt: new Date().toISOString(),
    };
  }
  try {
    const raw = window.localStorage.getItem(PERMANENT_VAULT_STORAGE_KEY);
    if (!raw) {
      return {
        users: {},
        tasks: {},
        calendarEvents: {},
        chatMessages: {},
        auditLogs: {},
        deletedUserCedulas: [],
        deletedTaskIds: [],
        deletedEventIds: [],
        updatedAt: new Date().toISOString(),
      };
    }
    const parsed = JSON.parse(raw) as Partial<PermanentDataVault>;
    return {
      users: parsed.users || {},
      tasks: parsed.tasks || {},
      calendarEvents: parsed.calendarEvents || {},
      chatMessages: parsed.chatMessages || {},
      auditLogs: parsed.auditLogs || {},
      deletedUserCedulas: Array.isArray(parsed.deletedUserCedulas) ? parsed.deletedUserCedulas : [],
      deletedTaskIds: Array.isArray(parsed.deletedTaskIds) ? parsed.deletedTaskIds : [],
      deletedEventIds: Array.isArray(parsed.deletedEventIds) ? parsed.deletedEventIds : [],
      updatedAt: parsed.updatedAt || new Date().toISOString(),
    };
  } catch {
    return {
      users: {},
      tasks: {},
      calendarEvents: {},
      chatMessages: {},
      auditLogs: {},
      deletedUserCedulas: [],
      deletedTaskIds: [],
      deletedEventIds: [],
      updatedAt: new Date().toISOString(),
    };
  }
}

export function writePermanentVault(vault: PermanentDataVault) {
  if (typeof window === 'undefined') return;
  try {
    vault.updatedAt = new Date().toISOString();
    window.localStorage.setItem(PERMANENT_VAULT_STORAGE_KEY, JSON.stringify(vault));
  } catch (err) {
    console.warn('No se pudo actualizar el espejo local de persistencia:', err);
  }
}

export function syncCollectionToPermanentVault<T>(
  collectionType: 'users' | 'tasks' | 'calendarEvents' | 'chatMessages' | 'auditLogs',
  items: T[],
  getKey: (item: T) => string
) {
  const vault = readPermanentVault();
  const targetMap = { ...(vault[collectionType] as Record<string, T>) };
  for (const item of items) {
    const key = getKey(item);
    if (key) {
      targetMap[key] = item;
    }
  }
  (vault[collectionType] as Record<string, T>) = targetMap;
  writePermanentVault(vault);
}

async function syncWithCloudSqlApi(endpoint: string, method: 'POST' | 'DELETE', body?: unknown) {
  try {
    const token = await refreshInMemoryIdToken();
    if (!token) return;
    await fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    console.error('Cloud SQL API sync warning:', err);
  }
}

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
    role: isSingleAdmin ? 'admin' as const : 'user' as const,
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
    approvalStatus: (isSingleAdmin
      ? 'aprobado'
      : user.approvalStatus && ['aprobado', 'pendiente', 'rechazado'].includes(user.approvalStatus)
      ? user.approvalStatus
      : 'aprobado') as 'aprobado' | 'pendiente' | 'rechazado',
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
    priority: (['baja', 'media', 'alta', 'critica'].includes(task.priority) ? task.priority : 'media') as TaskItem['priority'],
    status: (['pendiente', 'en_progreso', 'completada'].includes(task.status) ? task.status : 'pendiente') as TaskItem['status'],
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
    actorRole: (params.actorRole === 'admin' ? 'admin' : 'user') as 'admin' | 'user',
    actionType: String(params.actionType || 'ACCION').slice(0, 60),
    module: String(params.module || 'SISTEMA').slice(0, 60),
    description: String(params.description || '').slice(0, 500),
    targetId: String(params.targetId || '').slice(0, 128),
    timestamp: new Date().toISOString().slice(0, 50),
    severity: (params.severity || 'info') as 'info' | 'warning' | 'critical',
  };

  const vault = readPermanentVault();
  vault.auditLogs[logId] = { id: logId, ...payload };
  writePermanentVault(vault);

  try {
    await setDoc(doc(db, 'audit_logs', logId), payload, { merge: true });
    void syncWithCloudSqlApi('/api/audit-logs', 'POST', { id: logId, ...payload });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function saveUserToFirestore(user: AppUser) {
  const cedulaId = cleanId(user.cedula);
  const path = `app_users/${cedulaId}`;
  const payload = sanitizeUserPayload({ ...user, cedula: cedulaId });

  const vault = readPermanentVault();
  vault.users[cedulaId] = payload;
  vault.deletedUserCedulas = vault.deletedUserCedulas.filter(c => c !== cedulaId);
  writePermanentVault(vault);

  try {
    await setDoc(doc(db, 'app_users', cedulaId), payload, { merge: true });
    void syncWithCloudSqlApi('/api/users', 'POST', payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteUserFromFirestore(cedula: string) {
  const cleanCed = String(cedula || '').trim();
  if (cleanCed === SINGLE_ADMIN_CEDULA) {
    return;
  }
  const vault = readPermanentVault();
  delete vault.users[cleanCed];
  if (!vault.deletedUserCedulas.includes(cleanCed)) {
    vault.deletedUserCedulas.push(cleanCed);
  }
  writePermanentVault(vault);

  const path = `app_users/${cleanCed}`;
  try {
    await deleteDoc(doc(db, 'app_users', cleanCed));
    void syncWithCloudSqlApi(`/api/users/${encodeURIComponent(cleanCed)}`, 'DELETE');
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveTaskToFirestore(task: TaskItem) {
  const taskId = cleanId(task.id);
  const path = `tasks/${taskId}`;
  const payload = sanitizeTaskPayload(task);

  const vault = readPermanentVault();
  vault.tasks[taskId] = { id: taskId, ...payload };
  vault.deletedTaskIds = vault.deletedTaskIds.filter(id => id !== taskId);
  writePermanentVault(vault);

  try {
    await setDoc(doc(db, 'tasks', taskId), payload, { merge: true });
    void syncWithCloudSqlApi('/api/tasks', 'POST', { id: taskId, ...payload });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteTaskFromFirestore(taskId: string) {
  const vault = readPermanentVault();
  delete vault.tasks[taskId];
  if (!vault.deletedTaskIds.includes(taskId)) {
    vault.deletedTaskIds.push(taskId);
  }
  writePermanentVault(vault);

  const path = `tasks/${taskId}`;
  try {
    await deleteDoc(doc(db, 'tasks', taskId));
    void syncWithCloudSqlApi(`/api/tasks/${encodeURIComponent(taskId)}`, 'DELETE');
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
    senderRole: (msg.senderRole === 'admin' ? 'admin' : 'user') as 'admin' | 'user',
    text: String(msg.text).trim().slice(0, 1000),
    channel: String(msg.channel || 'general').slice(0, 50),
    relatedTaskId: String(msg.relatedTaskId || '').slice(0, 128),
    timestamp: String(msg.timestamp || new Date().toISOString()).slice(0, 50),
  };

  const vault = readPermanentVault();
  vault.chatMessages[msgId] = { id: msgId, ...payload };
  writePermanentVault(vault);

  try {
    await setDoc(doc(db, 'chat_messages', msgId), payload, { merge: true });
    void syncWithCloudSqlApi('/api/chat-messages', 'POST', { id: msgId, ...payload });
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
    type: (['entrega', 'reunion', 'auditoria', 'hito', 'actividad'].includes(ev.type) ? ev.type : 'actividad') as CalendarEvent['type'],
    description: String(ev.description || '').slice(0, 500),
    createdByCedula: String(ev.createdByCedula || '').slice(0, 20),
    createdByName: String(ev.createdByName || '').slice(0, 100),
    linkedTaskId: String(ev.linkedTaskId || '').slice(0, 128),
  };

  const vault = readPermanentVault();
  vault.calendarEvents[evId] = { id: evId, ...payload };
  vault.deletedEventIds = vault.deletedEventIds.filter(id => id !== evId);
  writePermanentVault(vault);

  try {
    await setDoc(doc(db, 'calendar_events', evId), payload, { merge: true });
    void syncWithCloudSqlApi('/api/calendar-events', 'POST', { id: evId, ...payload });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteCalendarEventFromFirestore(eventId: string) {
  const vault = readPermanentVault();
  delete vault.calendarEvents[eventId];
  if (!vault.deletedEventIds.includes(eventId)) {
    vault.deletedEventIds.push(eventId);
  }
  writePermanentVault(vault);

  const path = `calendar_events/${eventId}`;
  try {
    await deleteDoc(doc(db, 'calendar_events', eventId));
    void syncWithCloudSqlApi(`/api/calendar-events/${encodeURIComponent(eventId)}`, 'DELETE');
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Inicializa y reconcilia la base de datos de producción sin borrar NINGÚN dato existente.
 * Garantiza que al actualizar o desplegar de Google AI Studio a GitHub todos los registros
 * permanezcan intactos en Firestore, Cloud SQL y la bóveda persistente.
 */
export async function seedInitialDatabaseIfEmpty() {
  try {
    const isoNow = new Date().toISOString();

    const [adminDocSnap, usersSnap, tasksSnap, eventsSnap, chatSnap] = await Promise.all([
      getDoc(doc(db, 'app_users', SINGLE_ADMIN_CEDULA)),
      getDocs(query(collection(db, 'app_users'), limit(500))),
      getDocs(query(collection(db, 'tasks'), limit(500))),
      getDocs(query(collection(db, 'calendar_events'), limit(500))),
      getDocs(query(collection(db, 'chat_messages'), limit(500))),
    ]);

    // 1. Asegurar que el Administrador Único (902050377) exista sin sobreescribir su contraseña ni sus datos si ya fue creado
    if (!adminDocSnap.exists()) {
      const vault = readPermanentVault();
      const cachedAdmin = vault.users[SINGLE_ADMIN_CEDULA];
      const primaryAdmin: AppUser = cachedAdmin || {
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
      await saveUserToFirestore({
        ...primaryAdmin,
        cedula: SINGLE_ADMIN_CEDULA,
        role: 'admin',
        approvalStatus: 'aprobado',
      });
    } else {
      const adminData = adminDocSnap.data() as AppUser;
      if (adminData.role !== 'admin' || adminData.approvalStatus !== 'aprobado') {
        await setDoc(
          doc(db, 'app_users', SINGLE_ADMIN_CEDULA),
          {
            role: 'admin',
            approvalStatus: 'aprobado',
            canCreateTasks: true,
            canEditTasks: true,
            canDeleteTasks: true,
            canSendChat: true,
            canViewVault: true,
            canExportReports: true,
          },
          { merge: true }
        );
      }
    }

    // 2. Reconciliación automática: si hay datos guardados en la bóveda local que no estén aún en Firestore, restaurarlos sin borrar nada
    const vault = readPermanentVault();
    const deletedUsers = new Set(vault.deletedUserCedulas);
    const deletedTasks = new Set(vault.deletedTaskIds);
    const deletedEvents = new Set(vault.deletedEventIds);

    const remoteUserIds = new Set(usersSnap.docs.map(d => d.id));
    for (const [ced, localUser] of Object.entries(vault.users)) {
      if (ced && !remoteUserIds.has(ced) && !deletedUsers.has(ced)) {
        await setDoc(doc(db, 'app_users', ced), sanitizeUserPayload(localUser), { merge: true });
      }
    }

    const remoteTaskIds = new Set(tasksSnap.docs.map(d => d.id));
    for (const [tId, localTask] of Object.entries(vault.tasks)) {
      if (tId && !remoteTaskIds.has(tId) && !deletedTasks.has(tId)) {
        await setDoc(doc(db, 'tasks', tId), sanitizeTaskPayload(localTask), { merge: true });
      }
    }

    const remoteEventIds = new Set(eventsSnap.docs.map(d => d.id));
    for (const [evId, localEv] of Object.entries(vault.calendarEvents)) {
      if (evId && !remoteEventIds.has(evId) && !deletedEvents.has(evId)) {
        const { id: _ignore, ...evPayload } = localEv;
        await setDoc(doc(db, 'calendar_events', evId), evPayload, { merge: true });
      }
    }

    const remoteChatIds = new Set(chatSnap.docs.map(d => d.id));
    for (const [msgId, localMsg] of Object.entries(vault.chatMessages)) {
      if (msgId && !remoteChatIds.has(msgId)) {
        const { id: _ignore, ...msgPayload } = localMsg;
        await setDoc(doc(db, 'chat_messages', msgId), msgPayload, { merge: true });
      }
    }
  } catch (err) {
    console.error('Error verifying persistent database:', err);
  }
}


