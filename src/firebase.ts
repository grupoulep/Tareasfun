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
import { AppUser, TaskItem, AuditLog, ChatMessage, CalendarEvent, AdBannerItem } from './types';
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

const realtimeBroadcastChannel =
  typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel('ulep_realtime_sync_channel_v1')
    : null;

if (realtimeBroadcastChannel && typeof window !== 'undefined') {
  realtimeBroadcastChannel.onmessage = () => {
    window.dispatchEvent(new CustomEvent('ulep_vault_updated'));
    window.dispatchEvent(new Event('ulep_publicidad_updated'));
  };
}

export function writePermanentVault(vault: PermanentDataVault, notifyListeners = true) {
  if (typeof window === 'undefined') return;
  try {
    vault.updatedAt = new Date().toISOString();
    window.localStorage.setItem(PERMANENT_VAULT_STORAGE_KEY, JSON.stringify(vault));
    if (notifyListeners) {
      window.dispatchEvent(new CustomEvent('ulep_vault_updated'));
      try {
        realtimeBroadcastChannel?.postMessage({ updatedAt: vault.updatedAt });
      } catch {
        // ignore broadcast errors
      }
    }
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
  const deletedTasks = new Set(vault.deletedTaskIds);
  const deletedUsers = new Set(vault.deletedUserCedulas);
  const deletedEvents = new Set(vault.deletedEventIds);

  const targetMap: Record<string, T> = {};
  for (const item of items) {
    const key = getKey(item);
    if (!key) continue;
    if (collectionType === 'tasks' && deletedTasks.has(key)) continue;
    if (collectionType === 'users' && deletedUsers.has(key)) continue;
    if (collectionType === 'calendarEvents' && deletedEvents.has(key)) continue;
    targetMap[key] = item;
  }
  (vault[collectionType] as Record<string, T>) = targetMap;
  writePermanentVault(vault, false);
}

export async function syncDeletedIdsToFirestore() {
  try {
    const vault = readPermanentVault();
    const compactPayload = {
      t: vault.deletedTaskIds.slice(-25),
      u: vault.deletedUserCedulas.slice(-20),
      e: vault.deletedEventIds.slice(-25),
    };
    await setDoc(
      doc(db, 'calendar_events', 'config_deleted_ids'),
      {
        title: 'Sincronizacion Eliminados Tiempo Real',
        date: 'CONFIG_DELETED_IDS',
        time: new Date().toISOString().slice(11, 16),
        type: 'actividad',
        description: JSON.stringify(compactPayload).slice(0, 500),
        createdByCedula: SINGLE_ADMIN_CEDULA,
        createdByName: 'Sistema Tiempo Real',
        linkedTaskId: 'CONFIG_DELETED_IDS',
      },
      { merge: true }
    );
  } catch {
    // ignore transient error
  }
}

export function applyRemoteDeletedIdsToVault(rawDescription?: string): boolean {
  if (!rawDescription) return false;
  try {
    const parsed = JSON.parse(rawDescription);
    if (!parsed || typeof parsed !== 'object') return false;
    const vault = readPermanentVault();
    let changed = false;

    const remoteTasks: string[] = Array.isArray(parsed.t) ? parsed.t : [];
    for (const tId of remoteTasks) {
      if (tId && !vault.deletedTaskIds.includes(tId)) {
        vault.deletedTaskIds.push(tId);
        changed = true;
      }
      if (tId && vault.tasks[tId]) {
        delete vault.tasks[tId];
        changed = true;
      }
    }

    const remoteUsers: string[] = Array.isArray(parsed.u) ? parsed.u : [];
    for (const ced of remoteUsers) {
      if (ced && ced !== SINGLE_ADMIN_CEDULA && !vault.deletedUserCedulas.includes(ced)) {
        vault.deletedUserCedulas.push(ced);
        changed = true;
      }
      if (ced && ced !== SINGLE_ADMIN_CEDULA && vault.users[ced]) {
        delete vault.users[ced];
        changed = true;
      }
    }

    const remoteEvents: string[] = Array.isArray(parsed.e) ? parsed.e : [];
    for (const evId of remoteEvents) {
      if (evId && !vault.deletedEventIds.includes(evId)) {
        vault.deletedEventIds.push(evId);
        changed = true;
      }
      if (evId && vault.calendarEvents[evId]) {
        delete vault.calendarEvents[evId];
        changed = true;
      }
    }

    if (changed) {
      writePermanentVault(vault, true);
    }
    return changed;
  } catch {
    return false;
  }
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

export const USER_EVENT_PERMS_STORAGE_KEY = 'ulep_user_event_permissions_v1';

export function readUserEventPermissions(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(USER_EVENT_PERMS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function writeUserEventPermission(cedula: string, allowed: boolean) {
  const cleanCed = String(cedula || '').trim();
  if (!cleanCed) return;
  const currentMap = readUserEventPermissions();
  const nextMap: Record<string, boolean> = {
    ...currentMap,
    [cleanCed]: cleanCed === SINGLE_ADMIN_CEDULA ? true : Boolean(allowed),
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(USER_EVENT_PERMS_STORAGE_KEY, JSON.stringify(nextMap));
      window.dispatchEvent(new Event('ulep_event_perms_updated'));
    } catch {
      // ignore
    }
  }
  const vault = readPermanentVault();
  if (vault.users[cleanCed]) {
    vault.users[cleanCed] = {
      ...vault.users[cleanCed],
      canCreateEvents: nextMap[cleanCed],
    };
    writePermanentVault(vault);
  }
  try {
    await setDoc(
      doc(db, 'calendar_events', 'config_event_permissions'),
      {
        title: 'Configuracion Permisos Eventos',
        date: 'CONFIG_PERMS',
        time: '00:00',
        type: 'actividad',
        description: JSON.stringify(nextMap).slice(0, 500),
        createdByCedula: SINGLE_ADMIN_CEDULA,
        createdByName: 'Administrador',
        linkedTaskId: 'CONFIG_PERMS',
      },
      { merge: true }
    );
  } catch {
    // ignore if offline
  }
}

export const PUBLICIDAD_BANNERS_STORAGE_KEY = 'ulep_publicidad_banners_v1';

export function readAdBanners(): AdBannerItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(PUBLICIDAD_BANNERS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(item => item && Boolean(item.imageUrl)) : [];
  } catch {
    return [];
  }
}

export function writeAdBannersLocal(banners: AdBannerItem[], notify = true) {
  if (typeof window === 'undefined') return;
  try {
    const cleanList = banners.filter(item => item && Boolean(item.imageUrl));
    window.localStorage.setItem(PUBLICIDAD_BANNERS_STORAGE_KEY, JSON.stringify(cleanList));
    if (notify) {
      window.dispatchEvent(new Event('ulep_publicidad_updated'));
      try {
        realtimeBroadcastChannel?.postMessage({ updatedAt: new Date().toISOString() });
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
}

export async function saveAdBannerToFirestore(ad: AdBannerItem) {
  const cleanAdId = cleanId(ad.id || `ad_${Date.now()}`);
  const normalizedAd: AdBannerItem = {
    id: cleanAdId,
    title: String(ad.title || '').trim().slice(0, 120),
    imageUrl: String(ad.imageUrl || '').trim(),
    linkUrl: String(ad.linkUrl || '').trim().slice(0, 500),
    active: ad.active !== false,
    createdAt: ad.createdAt || new Date().toISOString(),
  };
  if (!normalizedAd.imageUrl) return;

  const existing = readAdBanners().filter(item => item.id !== cleanAdId);
  const nextList = [normalizedAd, ...existing];
  writeAdBannersLocal(nextList, true);

  const docId = cleanId(`config_ad_${cleanAdId}`);
  const safeTitle =
    normalizedAd.title && normalizedAd.title.length >= 2
      ? normalizedAd.title.slice(0, 140)
      : 'Publicidad ULEP';

  try {
    await setDoc(
      doc(db, 'calendar_events', docId),
      {
        title: safeTitle,
        date: 'CONFIG_PUBLICIDAD',
        time: '00:00',
        type: 'actividad',
        description: JSON.stringify(normalizedAd),
        createdByCedula: SINGLE_ADMIN_CEDULA,
        createdByName: 'Administrador',
        linkedTaskId: cleanAdId,
      },
      { merge: true }
    );
  } catch (err) {
    console.warn('Error guardando publicidad en Firestore:', err);
  }
}

export async function deleteAdBannerFromFirestore(adId: string) {
  const cleanAdId = cleanId(adId);
  const nextList = readAdBanners().filter(item => item.id !== adId && item.id !== cleanAdId);
  writeAdBannersLocal(nextList, true);

  const docId = cleanId(`config_ad_${cleanAdId}`);
  const rawDocId = cleanId(`config_ad_${adId}`);
  try {
    await deleteDoc(doc(db, 'calendar_events', docId)).catch(() => {});
    if (rawDocId !== docId) {
      await deleteDoc(doc(db, 'calendar_events', rawDocId)).catch(() => {});
    }
  } catch {
    // ignore
  }
}

export const USER_COMPLETE_TASK_PERMS_STORAGE_KEY = 'ulep_user_complete_task_permissions_v1';

export function readUserCompleteTaskPermissions(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(USER_COMPLETE_TASK_PERMS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function writeUserCompleteTaskPermission(cedula: string, allowed: boolean) {
  const cleanCed = String(cedula || '').trim();
  if (!cleanCed) return;
  const currentMap = readUserCompleteTaskPermissions();
  const nextMap: Record<string, boolean> = {
    ...currentMap,
    [cleanCed]: cleanCed === SINGLE_ADMIN_CEDULA ? true : Boolean(allowed),
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(USER_COMPLETE_TASK_PERMS_STORAGE_KEY, JSON.stringify(nextMap));
      window.dispatchEvent(new Event('ulep_complete_task_perms_updated'));
    } catch {
      // ignore
    }
  }
  const vault = readPermanentVault();
  if (vault.users[cleanCed]) {
    vault.users[cleanCed] = {
      ...vault.users[cleanCed],
      canCompleteTasks: nextMap[cleanCed],
    };
    writePermanentVault(vault);
  }
  try {
    await setDoc(
      doc(db, 'calendar_events', 'config_complete_task_permissions'),
      {
        title: 'Configuracion Permisos Tareas Hechas',
        date: 'CONFIG_COMPLETE_TASK_PERMS',
        time: '00:00',
        type: 'actividad',
        description: JSON.stringify(nextMap).slice(0, 500),
        createdByCedula: SINGLE_ADMIN_CEDULA,
        createdByName: 'Administrador',
        linkedTaskId: 'CONFIG_COMPLETE_TASK_PERMS',
      },
      { merge: true }
    );
  } catch {
    // ignore if offline
  }
}

export const USER_EDIT_TASK_PERMS_STORAGE_KEY = 'ulep_user_edit_task_permissions_v1';

export function readUserEditTaskPermissions(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(USER_EDIT_TASK_PERMS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export async function writeUserEditTaskPermission(cedula: string, allowed: boolean) {
  const cleanCed = String(cedula || '').trim();
  if (!cleanCed) return;
  const currentMap = readUserEditTaskPermissions();
  const nextMap: Record<string, boolean> = {
    ...currentMap,
    [cleanCed]: cleanCed === SINGLE_ADMIN_CEDULA ? true : Boolean(allowed),
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(USER_EDIT_TASK_PERMS_STORAGE_KEY, JSON.stringify(nextMap));
      window.dispatchEvent(new Event('ulep_edit_task_perms_updated'));
    } catch {
      // ignore
    }
  }
  const vault = readPermanentVault();
  if (vault.users[cleanCed]) {
    vault.users[cleanCed] = {
      ...vault.users[cleanCed],
      canEditTasks: nextMap[cleanCed],
    };
    writePermanentVault(vault);
  }
  try {
    await setDoc(
      doc(db, 'calendar_events', 'config_edit_task_permissions'),
      {
        title: 'Configuracion Permisos Editar Actividades',
        date: 'CONFIG_EDIT_TASK_PERMS',
        time: '00:00',
        type: 'actividad',
        description: JSON.stringify(nextMap).slice(0, 500),
        createdByCedula: SINGLE_ADMIN_CEDULA,
        createdByName: 'Administrador',
        linkedTaskId: 'CONFIG_EDIT_TASK_PERMS',
      },
      { merge: true }
    );
  } catch {
    // ignore if offline
  }
}

export const RECOVERY_SECURITY_STORAGE_KEY = 'ulep_recovery_security_state_v3';

export interface RecoverySecurityEntry {
  cedula: string;
  sendAttempts: number;
  verifyAttempts: number;
  locked: boolean;
  lockedAt?: string;
}

export function readRecoverySecurityStates(): Record<string, RecoverySecurityEntry> {
  if (typeof window === 'undefined') return {};
  try {
    // Limpiar bloqueos antiguos de pruebas previas en v1 y v2
    window.localStorage.removeItem('ulep_recovery_security_state_v1');
    window.localStorage.removeItem('ulep_recovery_security_state_v2');
    const raw = window.localStorage.getItem(RECOVERY_SECURITY_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    if (parsed[SINGLE_ADMIN_CEDULA]) {
      parsed[SINGLE_ADMIN_CEDULA] = {
        cedula: SINGLE_ADMIN_CEDULA,
        sendAttempts: 0,
        verifyAttempts: 0,
        locked: false,
      };
    }
    return parsed;
  } catch {
    return {};
  }
}

export async function writeRecoverySecurityState(
  cedula: string,
  state: RecoverySecurityEntry
) {
  const cleanCed = String(cedula || '').trim();
  if (!cleanCed) return;
  const currentMap = readRecoverySecurityStates();
  const safeState: RecoverySecurityEntry =
    cleanCed === SINGLE_ADMIN_CEDULA
      ? { cedula: cleanCed, sendAttempts: 0, verifyAttempts: 0, locked: false }
      : state;
  const nextMap: Record<string, RecoverySecurityEntry> = {
    ...currentMap,
    [cleanCed]: safeState,
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(RECOVERY_SECURITY_STORAGE_KEY, JSON.stringify(nextMap));
      window.dispatchEvent(new Event('ulep_recovery_security_updated'));
    } catch {
      // ignore
    }
  }
  try {
    await setDoc(
      doc(db, 'calendar_events', 'config_recovery_security'),
      {
        title: 'Configuracion Seguridad Recuperacion',
        date: 'CONFIG_RECOVERY_SECURITY',
        time: '00:00',
        type: 'actividad',
        description: JSON.stringify(nextMap).slice(0, 500),
        createdByCedula: SINGLE_ADMIN_CEDULA,
        createdByName: 'Administrador',
        linkedTaskId: 'CONFIG_RECOVERY_SECURITY',
      },
      { merge: true }
    );
  } catch {
    // ignore if offline
  }
}

// URLs de respaldo del backend Cloud Run para cuando la app está publicada en GitHub (tareas.fundacionulep.fun)
const CLOUD_RUN_BACKEND_ORIGINS = [
  'https://ais-pre-pl3bhbnnbnpeoovko5nwou-582520961682.us-east1.run.app',
  'https://ais-dev-pl3bhbnnbnpeoovko5nwou-582520961682.us-east1.run.app',
];

export function isStaticGithubDeployment(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname.toLowerCase();
  return (
    host === 'tareas.fundacionulep.fun' ||
    host.endsWith('.fundacionulep.fun') ||
    host.endsWith('.github.io')
  );
}

/**
 * Llama a los endpoints /api/resend/* funcionando tanto en el servidor propio como
 * después de publicar en GitHub con el dominio tareas.fundacionulep.fun.
 */
export async function callResendApi(
  endpoint: string,
  options?: RequestInit
): Promise<{ ok: boolean; status: number; data: Record<string, any> }> {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const candidateUrls: string[] = isStaticGithubDeployment()
    ? [
        ...CLOUD_RUN_BACKEND_ORIGINS.map(origin => `${origin}${cleanEndpoint}`),
      ]
    : [
        cleanEndpoint,
        ...CLOUD_RUN_BACKEND_ORIGINS.map(origin => `${origin}${cleanEndpoint}`),
      ];

  let lastErrorData: Record<string, any> = {};
  let lastStatus = 500;

  for (const url of candidateUrls) {
    try {
      const response = await fetch(url, {
        ...options,
        mode: url.startsWith('http') ? 'cors' : undefined,
      });
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        continue;
      }
      const data = (await response.json().catch(() => ({}))) as Record<string, any>;
      if (response.ok) {
        return { ok: true, status: response.status, data };
      }
      // Solo retornar error de negocio si el payload JSON proviene explícitamente de nuestra ruta Express
      if (
        data &&
        (data.locked === true ||
          data.valid === false ||
          typeof data.error === 'string')
      ) {
        return { ok: false, status: response.status, data };
      }
      lastErrorData = data;
      lastStatus = response.status;
    } catch {
      // Continuar con el siguiente endpoint candidato
    }
  }

  return { ok: false, status: lastStatus, data: lastErrorData };
}

const RECOVERY_CODES_STORAGE_KEY = 'ulep_active_recovery_codes_v1';

interface StoredRecoveryCodeItem {
  code: string;
  cedula: string;
  email: string;
  expiresAt: number;
}

function readLocalRecoveryCodes(): Record<string, StoredRecoveryCodeItem> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(RECOVERY_CODES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function saveRecoveryCodeEverywhere(item: StoredRecoveryCodeItem) {
  const map = readLocalRecoveryCodes();
  map[item.cedula] = item;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(RECOVERY_CODES_STORAGE_KEY, JSON.stringify(map));
    } catch {
      // ignore
    }
  }
  try {
    await setDoc(
      doc(db, 'calendar_events', 'config_recovery_codes'),
      {
        title: 'Codigos Activos Recuperacion',
        date: 'CONFIG_RECOVERY_CODES',
        time: '00:00',
        type: 'actividad',
        description: JSON.stringify(map).slice(0, 500),
        createdByCedula: SINGLE_ADMIN_CEDULA,
        createdByName: 'Administrador',
        linkedTaskId: 'CONFIG_RECOVERY_CODES',
      },
      { merge: true }
    );
  } catch {
    // ignore if offline
  }
}

async function readRecoveryCodeEverywhere(cedula: string): Promise<StoredRecoveryCodeItem | null> {
  const localMap = readLocalRecoveryCodes();
  if (localMap[cedula]) return localMap[cedula];
  try {
    const snap = await getDoc(doc(db, 'calendar_events', 'config_recovery_codes'));
    if (snap.exists()) {
      const desc = snap.data()?.description;
      if (desc && typeof desc === 'string') {
        const parsed = JSON.parse(desc) as Record<string, StoredRecoveryCodeItem>;
        if (parsed && parsed[cedula]) {
          return parsed[cedula];
        }
      }
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Envía la solicitud de correo al puente en tiempo real en Firestore (calendar_events/config_resend_queue)
 * para que el servidor Resend envíe el correo desde No-reply@fundacionulep.fun incluso cuando el usuario
 * entra desde https://tareas.fundacionulep.fun (GitHub Pages).
 */
async function dispatchEmailThroughFirestoreBridge(params: {
  cedula: string;
  userName: string;
  userEmail: string;
  code: string;
}): Promise<{ delivered: boolean; deliveredTo: string }> {
  const reqId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const queueDocRef = doc(db, 'calendar_events', 'config_resend_queue');
  try {
    await setDoc(
      queueDocRef,
      {
        title: 'Cola Envio Correo Recuperacion ULEP',
        date: 'CONFIG_RESEND_QUEUE',
        time: 'PENDIENTE',
        type: 'actividad',
        description: JSON.stringify({
          reqId,
          cedula: params.cedula,
          userName: params.userName,
          email: params.userEmail.toLowerCase().trim(),
          code: params.code,
          ts: Date.now(),
        }).slice(0, 500),
        createdByCedula: String(params.cedula || SINGLE_ADMIN_CEDULA).slice(0, 20),
        createdByName: String(params.userName || 'Usuario').slice(0, 100),
        linkedTaskId: reqId,
      },
      { merge: true }
    );

    // Esperar hasta ~2.7 segundos a que el puente en tiempo real del servidor marque time === 'ENVIADO'
    for (let i = 0; i < 6; i++) {
      await new Promise(resolve => setTimeout(resolve, 450));
      const snap = await getDoc(queueDocRef);
      if (snap.exists()) {
        const d = snap.data();
        if (d?.linkedTaskId === reqId && (d?.time === 'ENVIADO' || d?.time === 'PROCESADO')) {
          let parsedDesc: { status?: string; deliveredTo?: string } = {};
          try {
            parsedDesc = JSON.parse(String(d.description || '{}'));
          } catch {
            // ignore
          }
          return {
            delivered: d.time === 'ENVIADO' || parsedDesc.status === 'sent',
            deliveredTo: parsedDesc.deliveredTo || params.userEmail,
          };
        }
      }
    }
  } catch {
    // Continuar con código directo si hay restricción de red
  }
  return { delivered: false, deliveredTo: params.userEmail };
}

export async function requestRecoveryCodeCrossOrigin(params: {
  cedula: string;
  userName: string;
  userEmail: string;
  isCurrentlyLocked: boolean;
}): Promise<{ ok: boolean; status: number; data: Record<string, any> }> {
  const cleanCed = String(params.cedula || '').trim();
  const isSingleAdmin = cleanCed === SINGLE_ADMIN_CEDULA;
  const localSecMap = readRecoverySecurityStates();
  const currentSec: RecoverySecurityEntry = localSecMap[cleanCed] || {
    cedula: cleanCed,
    sendAttempts: 0,
    verifyAttempts: 0,
    locked: false,
  };

  if (!isSingleAdmin && (currentSec.locked || params.isCurrentlyLocked)) {
    const lockedState: RecoverySecurityEntry = {
      ...currentSec,
      locked: true,
      lockedAt: currentSec.lockedAt || new Date().toISOString(),
    };
    await writeRecoverySecurityState(cleanCed, lockedState);
    return {
      ok: false,
      status: 403,
      data: {
        locked: true,
        error: 'Cuenta y envío de correos bloqueados. Solo el Administrador puede desbloquearla.',
        securityState: lockedState,
      },
    };
  }

  const generatedCode = String(Math.floor(100000 + Math.random() * 900000));
  await saveRecoveryCodeEverywhere({
    code: generatedCode,
    cedula: cleanCed,
    email: params.userEmail.toLowerCase().trim(),
    expiresAt: Date.now() + 15 * 60 * 1000,
  });

  // 1. Si no estamos en GitHub Pages estático, intentar primero la ruta local /api/resend/send-recovery-code
  if (!isStaticGithubDeployment()) {
    const apiResult = await callResendApi('/api/resend/send-recovery-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...params,
        preferredCode: generatedCode,
      }),
    });

    if (apiResult.ok && apiResult.data?.code) {
      await saveRecoveryCodeEverywhere({
        code: String(apiResult.data.code),
        cedula: cleanCed,
        email: params.userEmail.toLowerCase().trim(),
        expiresAt: Date.now() + 15 * 60 * 1000,
      });
      return apiResult;
    }

    if (!isSingleAdmin && apiResult.data?.locked === true) {
      return apiResult;
    }
  }

  // 2. Control de intentos en Firestore/local (2 intentos permitidos; al 3er intento bloquea excepto Admin Único)
  if (!isSingleAdmin) {
    currentSec.sendAttempts += 1;
    if (currentSec.sendAttempts >= 3) {
      currentSec.locked = true;
      currentSec.lockedAt = new Date().toISOString();
      await writeRecoverySecurityState(cleanCed, currentSec);
      return {
        ok: false,
        status: 403,
        data: {
          locked: true,
          error: 'Cuenta y envío de correos bloqueados. Solo el Administrador puede desbloquearla.',
          securityState: currentSec,
        },
      };
    }
    await writeRecoverySecurityState(cleanCed, currentSec);
  }

  // 3. Despachar el correo real a través del Puente Firestore -> Resend (funciona desde https://tareas.fundacionulep.fun)
  const bridgeResult = await dispatchEmailThroughFirestoreBridge({
    cedula: cleanCed,
    userName: params.userName,
    userEmail: params.userEmail,
    code: generatedCode,
  });

  const cleanTargetEmail = (bridgeResult.deliveredTo || params.userEmail || 'fundacionulep@gmail.com')
    .toLowerCase()
    .trim();
  const localPart = cleanTargetEmail.split('@')[0] || 'funda';
  const visibleLen = Math.min(5, Math.max(3, Math.floor(localPart.length / 2)));
  const maskedEmail = `${localPart.slice(0, visibleLen)}....`;

  return {
    ok: true,
    status: 200,
    data: {
      ok: true,
      status: bridgeResult.delivered ? 'sent' : 'missing_api_key',
      code: generatedCode,
      deliveredTo: cleanTargetEmail,
      maskedEmail,
      securityState: currentSec,
    },
  };
}

export async function verifyRecoveryCodeCrossOrigin(params: {
  cedula: string;
  code: string;
  expectedCode?: string | null;
}): Promise<{ ok: boolean; status: number; data: Record<string, any> }> {
  const cleanCed = String(params.cedula || '').trim();
  const cleanCode = String(params.code || '').trim();
  const cleanExpected = params.expectedCode ? String(params.expectedCode).trim() : '';
  const isSingleAdmin = cleanCed === SINGLE_ADMIN_CEDULA;

  // 1. Verificar contra el código activo en memoria o sincronizado en Firestore / localStorage
  const storedCode = await readRecoveryCodeEverywhere(cleanCed);
  const matchesExpected = Boolean(cleanExpected && cleanExpected === cleanCode);
  const matchesStored = Boolean(
    storedCode && Date.now() <= storedCode.expiresAt && storedCode.code === cleanCode
  );

  if (matchesExpected || matchesStored) {
    const unlockedState: RecoverySecurityEntry = {
      cedula: cleanCed,
      sendAttempts: 0,
      verifyAttempts: 0,
      locked: false,
    };
    await writeRecoverySecurityState(cleanCed, unlockedState);
    if (!isStaticGithubDeployment()) {
      void callResendApi('/api/resend/unlock-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cedula: cleanCed }),
      });
    }
    return {
      ok: true,
      status: 200,
      data: {
        ok: true,
        valid: true,
        securityState: unlockedState,
      },
    };
  }

  // 2. Si no estamos en GitHub Pages estático, consultar también el backend local
  if (!isStaticGithubDeployment()) {
    const apiResult = await callResendApi('/api/resend/verify-recovery-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cedula: cleanCed, code: cleanCode }),
    });

    if (apiResult.ok || apiResult.data?.locked === true || apiResult.data?.valid === false) {
      return apiResult;
    }
  }

  // 3. Conteo autónomo de intentos en tareas.fundacionulep.fun
  const localSecMap = readRecoverySecurityStates();
  const currentSec: RecoverySecurityEntry = localSecMap[cleanCed] || {
    cedula: cleanCed,
    sendAttempts: 0,
    verifyAttempts: 0,
    locked: false,
  };

  if (!isSingleAdmin) {
    currentSec.verifyAttempts += 1;
    if (currentSec.verifyAttempts >= 3) {
      currentSec.locked = true;
      currentSec.lockedAt = new Date().toISOString();
      await writeRecoverySecurityState(cleanCed, currentSec);
      return {
        ok: false,
        status: 403,
        data: {
          valid: false,
          locked: true,
          error: 'Cuenta y envío de correos bloqueados tras 3 intentos fallidos. Solo el Administrador puede desbloquearla.',
          securityState: currentSec,
        },
      };
    }
    await writeRecoverySecurityState(cleanCed, currentSec);
  }

  return {
    ok: false,
    status: 400,
    data: {
      valid: false,
      error: isSingleAdmin
        ? 'El código ingresado es incorrecto.'
        : `Código incorrecto. Intento ${currentSec.verifyAttempts} de 2 permitidos antes del bloqueo.`,
      securityState: currentSec,
    },
  };
}

export function hydrateCalendarEvent(raw: CalendarEvent): CalendarEvent {
  let startTime = raw.startTime || '';
  let endTime = raw.endTime || '';
  if (!startTime && raw.time) {
    if (raw.time.includes(' - ')) {
      const parts = raw.time.split(' - ');
      startTime = (parts[0] || '08:00').trim();
      endTime = (parts[1] || '09:00').trim();
    } else {
      startTime = raw.time.trim();
      endTime = '';
    }
  }
  const emoji = (raw.emoji || (raw.description && raw.description.length <= 16 ? raw.description : '📅') || '📅').trim();
  return {
    ...raw,
    startTime: startTime || '08:00',
    endTime: endTime || '09:00',
    emoji,
  };
}

export async function saveUserToFirestore(user: AppUser) {
  const cedulaId = cleanId(user.cedula);
  const path = `app_users/${cedulaId}`;
  const isSingleAdmin = cedulaId === SINGLE_ADMIN_CEDULA;

  const editTaskPerms = readUserEditTaskPermissions();
  const canEditTasksVal = isSingleAdmin
    ? true
    : user.canEditTasks !== undefined
    ? Boolean(user.canEditTasks)
    : Boolean(editTaskPerms[cedulaId]);

  const payload = sanitizeUserPayload({
    ...user,
    cedula: cedulaId,
    canEditTasks: canEditTasksVal,
  });

  const eventPerms = readUserEventPermissions();
  const canCreateEventsVal = isSingleAdmin
    ? true
    : user.canCreateEvents !== undefined
    ? Boolean(user.canCreateEvents)
    : Boolean(eventPerms[cedulaId]);

  const completeTaskPerms = readUserCompleteTaskPermissions();
  const canCompleteTasksVal = isSingleAdmin
    ? true
    : user.canCompleteTasks !== undefined
    ? Boolean(user.canCompleteTasks)
    : Boolean(completeTaskPerms[cedulaId]);

  const vault = readPermanentVault();
  vault.users[cedulaId] = {
    ...payload,
    canEditTasks: canEditTasksVal,
    canCreateEvents: canCreateEventsVal,
    canCompleteTasks: canCompleteTasksVal,
  };
  vault.deletedUserCedulas = vault.deletedUserCedulas.filter(c => c !== cedulaId);
  writePermanentVault(vault);

  if (user.canEditTasks !== undefined || isSingleAdmin) {
    void writeUserEditTaskPermission(cedulaId, canEditTasksVal);
  }

  if (user.canCreateEvents !== undefined || isSingleAdmin) {
    void writeUserEventPermission(cedulaId, canCreateEventsVal);
  }

  if (user.canCompleteTasks !== undefined || isSingleAdmin) {
    void writeUserCompleteTaskPermission(cedulaId, canCompleteTasksVal);
  }

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
  writePermanentVault(vault, true);

  const path = `app_users/${cleanCed}`;
  try {
    await deleteDoc(doc(db, 'app_users', cleanCed));
    void syncDeletedIdsToFirestore();
    void syncWithCloudSqlApi(`/api/users/${encodeURIComponent(cleanCed)}`, 'DELETE');
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveTaskToFirestore(task: TaskItem) {
  const rawTaskId = String(task.id || '').trim();
  const taskId = cleanId(rawTaskId);
  const path = `tasks/${taskId}`;
  const payload = sanitizeTaskPayload(task);

  const vault = readPermanentVault();
  if (rawTaskId && rawTaskId !== taskId) {
    delete vault.tasks[rawTaskId];
  }
  vault.tasks[taskId] = { id: taskId, ...payload };
  vault.deletedTaskIds = vault.deletedTaskIds.filter(id => id !== taskId && id !== rawTaskId);
  writePermanentVault(vault, true);

  try {
    await setDoc(doc(db, 'tasks', taskId), payload, { merge: true });
    void syncDeletedIdsToFirestore();
    void syncWithCloudSqlApi('/api/tasks', 'POST', { id: taskId, ...payload });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteTaskFromFirestore(taskId: string) {
  const rawId = String(taskId || '').trim();
  const normalizedId = cleanId(rawId);
  const syncedCalId = cleanId(`ev_sync_${rawId}`);
  const syncedCalIdNorm = cleanId(`ev_sync_${normalizedId}`);

  const vault = readPermanentVault();
  delete vault.tasks[rawId];
  delete vault.tasks[normalizedId];
  if (rawId && !vault.deletedTaskIds.includes(rawId)) {
    vault.deletedTaskIds.push(rawId);
  }
  if (normalizedId && !vault.deletedTaskIds.includes(normalizedId)) {
    vault.deletedTaskIds.push(normalizedId);
  }

  // Eliminar también cualquier evento de calendario vinculado a esta tarea
  const calIdsToDelete = new Set<string>([syncedCalId, syncedCalIdNorm]);
  for (const [evKey, evVal] of Object.entries(vault.calendarEvents)) {
    if (evVal.linkedTaskId === rawId || evVal.linkedTaskId === normalizedId) {
      calIdsToDelete.add(evKey);
    }
  }
  for (const evId of calIdsToDelete) {
    if (evId && vault.calendarEvents[evId]) {
      delete vault.calendarEvents[evId];
      if (!vault.deletedEventIds.includes(evId)) {
        vault.deletedEventIds.push(evId);
      }
    }
  }

  writePermanentVault(vault, true);

  const path = `tasks/${rawId || normalizedId}`;
  try {
    const deletePromises: Promise<unknown>[] = [];
    if (rawId) {
      deletePromises.push(deleteDoc(doc(db, 'tasks', rawId)).catch(() => {}));
    }
    if (normalizedId && normalizedId !== rawId) {
      deletePromises.push(deleteDoc(doc(db, 'tasks', normalizedId)).catch(() => {}));
    }
    for (const evId of calIdsToDelete) {
      if (evId) {
        deletePromises.push(deleteDoc(doc(db, 'calendar_events', evId)).catch(() => {}));
      }
    }
    await Promise.all(deletePromises);
    void syncDeletedIdsToFirestore();
    void syncWithCloudSqlApi(`/api/tasks/${encodeURIComponent(rawId || normalizedId)}`, 'DELETE');
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
  const startTime = String(
    ev.startTime || (ev.time && ev.time.includes(' - ') ? ev.time.split(' - ')[0] : ev.time) || '08:00'
  )
    .trim()
    .slice(0, 8);
  const endTime = String(
    ev.endTime || (ev.time && ev.time.includes(' - ') ? ev.time.split(' - ')[1] : '') || '09:00'
  )
    .trim()
    .slice(0, 8);
  const combinedTime = endTime ? `${startTime} - ${endTime}`.slice(0, 20) : startTime.slice(0, 20);
  const emojiStr = String(ev.emoji || (ev.description && ev.description.length <= 16 ? ev.description : '📅') || '📅')
    .trim()
    .slice(0, 16);
  const rawTitle = String(ev.title || 'Evento').trim();
  const safeTitle = (rawTitle.length < 2 ? `${rawTitle} ` : rawTitle).slice(0, 150);

  const payload = {
    title: safeTitle,
    date: String(ev.date || '').slice(0, 50),
    time: combinedTime,
    type: (['entrega', 'reunion', 'auditoria', 'hito', 'actividad'].includes(ev.type) ? ev.type : 'actividad') as CalendarEvent['type'],
    description: String(ev.emoji ? emojiStr : ev.description || emojiStr).slice(0, 500),
    createdByCedula: String(ev.createdByCedula || '').slice(0, 20),
    createdByName: String(ev.createdByName || '').slice(0, 100),
    linkedTaskId: String(ev.linkedTaskId || '').slice(0, 128),
  };

  const vault = readPermanentVault();
  vault.calendarEvents[evId] = {
    id: evId,
    ...payload,
    startTime,
    endTime,
    emoji: emojiStr,
  };
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
  writePermanentVault(vault, true);

  const path = `calendar_events/${eventId}`;
  try {
    await deleteDoc(doc(db, 'calendar_events', eventId));
    void syncDeletedIdsToFirestore();
    void syncWithCloudSqlApi(`/api/calendar-events/${encodeURIComponent(eventId)}`, 'DELETE');
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function clearAllAuditLogsFromFirestore(logsToDelete: AuditLog[]) {
  const vault = readPermanentVault();
  vault.auditLogs = {};
  writePermanentVault(vault, true);

  const snap = await getDocs(query(collection(db, 'audit_logs'), limit(500)));
  const idsToDelete = new Set<string>(logsToDelete.map(l => l.id).filter(Boolean));
  snap.docs.forEach(d => {
    if (d.id) idsToDelete.add(d.id);
  });

  await Promise.all(
    Array.from(idsToDelete).map(async id => {
      const path = `audit_logs/${id}`;
      try {
        await deleteDoc(doc(db, 'audit_logs', id));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    })
  );
}

/**
 * Inicializa y reconcilia la base de datos de producción respetando todas las eliminaciones en tiempo real.
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

    // 0. Aplicar registro global de eliminados en tiempo real antes de cualquier reconciliación
    const deletedConfigDoc = eventsSnap.docs.find(
      d => d.id === 'config_deleted_ids' || d.data()?.date === 'CONFIG_DELETED_IDS'
    );
    if (deletedConfigDoc) {
      applyRemoteDeletedIdsToVault(deletedConfigDoc.data()?.description);
    }

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

    // 2. Solo restaurar desde bóveda local si la colección remota está completamente vacía y el registro no fue eliminado
    const vault = readPermanentVault();
    const deletedUsers = new Set(vault.deletedUserCedulas);
    const deletedTasks = new Set(vault.deletedTaskIds);
    const deletedEvents = new Set(vault.deletedEventIds);

    if (usersSnap.empty) {
      for (const [ced, localUser] of Object.entries(vault.users)) {
        if (ced && !deletedUsers.has(ced)) {
          await setDoc(doc(db, 'app_users', ced), sanitizeUserPayload(localUser), { merge: true });
        }
      }
    }

    if (tasksSnap.empty) {
      for (const [tId, localTask] of Object.entries(vault.tasks)) {
        if (tId && !deletedTasks.has(tId)) {
          await setDoc(doc(db, 'tasks', tId), sanitizeTaskPayload(localTask), { merge: true });
        }
      }
    }

    if (eventsSnap.empty) {
      for (const [evId, localEv] of Object.entries(vault.calendarEvents)) {
        if (evId && !deletedEvents.has(evId)) {
          const { id: _ignore, startTime: _st, endTime: _et, emoji: _em, ...evPayload } = localEv;
          await setDoc(doc(db, 'calendar_events', evId), evPayload, { merge: true });
        }
      }
    }

    if (chatSnap.empty) {
      for (const [msgId, localMsg] of Object.entries(vault.chatMessages)) {
        if (msgId) {
          const { id: _ignore, ...msgPayload } = localMsg;
          await setDoc(doc(db, 'chat_messages', msgId), msgPayload, { merge: true });
        }
      }
    }
  } catch (err) {
    console.error('Error verifying persistent database:', err);
  }
}


