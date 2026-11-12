import React, { useState, useEffect, useRef } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  limit
} from 'firebase/firestore';
import {
  db,
  OperationType,
  handleFirestoreError,
  seedInitialDatabaseIfEmpty,
  saveUserToFirestore,
  saveTaskToFirestore,
  saveCalendarEventToFirestore,
  recordAuditLog,
  cleanId,
  readPermanentVault,
  syncCollectionToPermanentVault,
  readUserEventPermissions,
  USER_EVENT_PERMS_STORAGE_KEY,
  readUserCompleteTaskPermissions,
  USER_COMPLETE_TASK_PERMS_STORAGE_KEY,
  readUserEditTaskPermissions,
  USER_EDIT_TASK_PERMS_STORAGE_KEY,
  readRecoverySecurityStates,
  writeRecoverySecurityState,
  RECOVERY_SECURITY_STORAGE_KEY,
  RecoverySecurityEntry,
  callResendApi,
  requestRecoveryCodeCrossOrigin,
  verifyRecoveryCodeCrossOrigin,
} from './firebase';
import { AppUser, TaskItem, AuditLog, ChatMessage, CalendarEvent } from './types';
import { AdminViews } from './components/AdminViews';
import { UserViews } from './components/UserViews';
import { TaskModal } from './components/TaskModal';

type NavSection =
  | 'admin_users'
  | 'admin_approvals'
  | 'admin_records'
  | 'admin_audit'
  | 'admin_backup'
  | 'admin_resend'
  | 'admin_evaluation'
  | 'user_personal'
  | 'user_all_tasks'
  | 'user_priority_alerts'
  | 'user_monthly_reports'
  | 'user_calendar'
  | 'user_chat';

import {
  SINGLE_ADMIN_CEDULA,
  COLOMBIAN_CITIES,
  COLOMBIAN_DEPARTMENTS,
  ALL_COLOMBIAN_MUNICIPALITIES_WITH_DEPT,
  getMunicipalitiesByDepartment,
  BANK_OPTIONS,
  EMERGENCY_RELATIONSHIPS,
  FAMILY_COMPOSITION_OPTIONS,
  BANK_HOLDER_OPTIONS,
  DEPARTMENT_OPTIONS,
} from './constants';
import { SearchableLocationSelect } from './components/SearchableLocationSelect';

export default function App() {
  const [eventPermsMap, setEventPermsMap] = useState<Record<string, boolean>>(() =>
    readUserEventPermissions()
  );
  const [completeTaskPermsMap, setCompleteTaskPermsMap] = useState<Record<string, boolean>>(() =>
    readUserCompleteTaskPermissions()
  );
  const [editTaskPermsMap, setEditTaskPermsMap] = useState<Record<string, boolean>>(() =>
    readUserEditTaskPermissions()
  );
  const [rawUsers, setRawUsers] = useState<AppUser[]>(() => Object.values(readPermanentVault().users));
  const users: AppUser[] = rawUsers.map(u => ({
    ...u,
    canEditTasks:
      u.cedula === SINGLE_ADMIN_CEDULA || u.role === 'admin'
        ? true
        : editTaskPermsMap[u.cedula] !== undefined
        ? Boolean(editTaskPermsMap[u.cedula])
        : false,
    canCreateEvents:
      u.cedula === SINGLE_ADMIN_CEDULA || u.role === 'admin'
        ? true
        : eventPermsMap[u.cedula] !== undefined
        ? Boolean(eventPermsMap[u.cedula])
        : Boolean(u.canCreateEvents),
    canCompleteTasks:
      u.cedula === SINGLE_ADMIN_CEDULA || u.role === 'admin'
        ? true
        : completeTaskPermsMap[u.cedula] !== undefined
        ? Boolean(completeTaskPermsMap[u.cedula])
        : Boolean(u.canCompleteTasks),
  }));
  const [tasks, setTasks] = useState<TaskItem[]>(() => Object.values(readPermanentVault().tasks));
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() =>
    Object.values(readPermanentVault().auditLogs).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
  );
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() =>
    Object.values(readPermanentVault().chatMessages).sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )
  );
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(() =>
    Object.values(readPermanentVault().calendarEvents).filter(
      ev =>
        !ev.id.startsWith('config_') &&
        !ev.date.startsWith('CONFIG_')
    )
  );
  const [recoverySecurityMap, setRecoverySecurityMap] = useState<Record<string, RecoverySecurityEntry>>(() =>
    readRecoverySecurityStates()
  );
  const [loadingData, setLoadingData] = useState(() => Object.keys(readPermanentVault().users).length === 0);

  const [loggedCedula, setLoggedCedula] = useState<string | null>(() => {
    return localStorage.getItem('taskflow_active_cedula');
  });
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'recover'>('login');
  const [loginCedulaInput, setLoginCedulaInput] = useState('');
  const [loginPasswordInput, setLoginPasswordInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginSuccessMsg, setLoginSuccessMsg] = useState<string | null>(null);

  // Estados para Recuperar Contraseña
  const [recoverStep, setRecoverStep] = useState<'cedula' | 'verify'>('cedula');
  const [recoverCedula, setRecoverCedula] = useState('');
  const [recoverCodeInput, setRecoverCodeInput] = useState('');
  const [recoverNewPassword, setRecoverNewPassword] = useState('');
  const [recoverConfirmPassword, setRecoverConfirmPassword] = useState('');
  const [recoverMaskedEmail, setRecoverMaskedEmail] = useState('funda....');
  const [recoverGeneratedCode, setRecoverGeneratedCode] = useState<string | null>(null);
  const [recoverEmailStatus, setRecoverEmailStatus] = useState<'sent' | 'missing_api_key' | 'error' | null>(null);
  const [showDirectRecoveryCode, setShowDirectRecoveryCode] = useState(false);
  const [recoverLoading, setRecoverLoading] = useState(false);
  const [recoverError, setRecoverError] = useState<string | null>(null);

  // Estados para el formulario completo de Registro al inicio con listas desplegables
  const [regCedula, setRegCedula] = useState('');
  const [regCedulaIssuePlace, setRegCedulaIssuePlace] = useState('Bogotá D.C.');
  const [regCedulaIssueDate, setRegCedulaIssueDate] = useState('');
  const [regName, setRegName] = useState('');
  const [regBirthDate, setRegBirthDate] = useState('');
  const [regBirthPlace, setRegBirthPlace] = useState('Bogotá D.C.');
  const [regBloodType, setRegBloodType] = useState('O+');
  const [regMaritalStatus, setRegMaritalStatus] = useState('Soltero(a)');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regLocationDepartment, setRegLocationDepartment] = useState('Bogotá D.C.');
  const [regLocationCity, setRegLocationCity] = useState('Bogotá D.C.');
  const [regResidenceAddress, setRegResidenceAddress] = useState('');
  const [regResidenceType, setRegResidenceType] = useState('Arrendada');
  const [regResidenceStratum, setRegResidenceStratum] = useState('Estrato 3');
  const [regFamilyCount, setRegFamilyCount] = useState<number>(1);
  const [regEmergencyName, setRegEmergencyName] = useState('');
  const [regEmergencyRelationship, setRegEmergencyRelationship] = useState('Cónyuge / Pareja');
  const [regEmergencyPhone, setRegEmergencyPhone] = useState('');
  const [regFamilyNotes, setRegFamilyNotes] = useState('Cónyuge e hijos menores de edad');
  const [regBankName, setRegBankName] = useState('Bancolombia');
  const [regBankAccountType, setRegBankAccountType] = useState('Ahorros');
  const [regBankAccountNumber, setRegBankAccountNumber] = useState('');
  const [regBankAccountHolder, setRegBankAccountHolder] = useState('A mi nombre (Mismo titular del colaborador)');
  const [regDepartment, setRegDepartment] = useState('Operaciones y Logística');
  const [regPassword, setRegPassword] = useState('');
  const [regError, setRegError] = useState<string | null>(null);
  const [regSuccess, setRegSuccess] = useState<string | null>(null);
  const [regSubmitting, setRegSubmitting] = useState(false);

  const [activePanelMode, setActivePanelMode] = useState<'admin' | 'user'>('user');
  const [activeSection, setActiveSection] = useState<NavSection>('user_personal');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);

  // Detección adaptable automática de Teléfono, Tablet y PC
  const [viewportDevice, setViewportDevice] = useState<'mobile' | 'tablet' | 'pc'>(() => {
    if (typeof window === 'undefined') return 'pc';
    if (window.innerWidth < 768) return 'mobile';
    if (window.innerWidth < 1024) return 'tablet';
    return 'pc';
  });
  const effectiveDevice: 'mobile' | 'tablet' | 'pc' = viewportDevice;
  const isMobileView = effectiveDevice === 'mobile';
  const isTabletView = effectiveDevice === 'tablet';
  const isPcView = effectiveDevice === 'pc';

  // Pasos del registro simplificado en Teléfono (conservando todos los campos)
  const [regMobileStep, setRegMobileStep] = useState<number>(1);
  const [regMobileShowAll, setRegMobileShowAll] = useState<boolean>(false);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) setViewportDevice('mobile');
      else if (window.innerWidth < 1024) setViewportDevice('tablet');
      else setViewportDevice('pc');
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const handlePermsUpdated = () => {
      setEventPermsMap(readUserEventPermissions());
    };
    const handleCompleteTaskPermsUpdated = () => {
      setCompleteTaskPermsMap(readUserCompleteTaskPermissions());
    };
    const handleEditTaskPermsUpdated = () => {
      setEditTaskPermsMap(readUserEditTaskPermissions());
    };
    const handleRecoverySecurityUpdated = () => {
      setRecoverySecurityMap(readRecoverySecurityStates());
    };
    window.addEventListener('ulep_event_perms_updated', handlePermsUpdated);
    window.addEventListener('ulep_complete_task_perms_updated', handleCompleteTaskPermsUpdated);
    window.addEventListener('ulep_edit_task_perms_updated', handleEditTaskPermsUpdated);
    window.addEventListener('ulep_recovery_security_updated', handleRecoverySecurityUpdated);
    return () => {
      window.removeEventListener('ulep_event_perms_updated', handlePermsUpdated);
      window.removeEventListener('ulep_complete_task_perms_updated', handleCompleteTaskPermsUpdated);
      window.removeEventListener('ulep_edit_task_perms_updated', handleEditTaskPermsUpdated);
      window.removeEventListener('ulep_recovery_security_updated', handleRecoverySecurityUpdated);
    };
  }, []);

  useEffect(() => {
    seedInitialDatabaseIfEmpty();

    const unsubUsers = onSnapshot(
      query(collection(db, 'app_users'), limit(500)),
      snap => {
        const list: AppUser[] = [];
        snap.forEach(d => {
          list.push(d.data() as AppUser);
        });
        syncCollectionToPermanentVault('users', list, u => u.cedula);
        setRawUsers(list);
        setLoadingData(false);
      },
      err => handleFirestoreError(err, OperationType.LIST, 'app_users')
    );

    const unsubTasks = onSnapshot(
      query(collection(db, 'tasks'), limit(500)),
      snap => {
        const list: TaskItem[] = [];
        snap.forEach(d => {
          list.push({ ...(d.data() as Omit<TaskItem, 'id'>), id: d.id });
        });
        list.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        syncCollectionToPermanentVault('tasks', list, t => t.id);
        setTasks(list);
      },
      err => handleFirestoreError(err, OperationType.LIST, 'tasks')
    );

    const unsubLogs = onSnapshot(
      query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(250)),
      snap => {
        const list: AuditLog[] = [];
        snap.forEach(d => {
          list.push({ ...(d.data() as Omit<AuditLog, 'id'>), id: d.id });
        });
        syncCollectionToPermanentVault('auditLogs', list, l => l.id);
        setAuditLogs(list);
      },
      err => handleFirestoreError(err, OperationType.LIST, 'audit_logs')
    );

    const unsubChat = onSnapshot(
      query(collection(db, 'chat_messages'), orderBy('timestamp', 'asc'), limit(300)),
      snap => {
        const list: ChatMessage[] = [];
        snap.forEach(d => {
          list.push({ ...(d.data() as Omit<ChatMessage, 'id'>), id: d.id });
        });
        syncCollectionToPermanentVault('chatMessages', list, m => m.id);
        setChatMessages(list);
      },
      err => handleFirestoreError(err, OperationType.LIST, 'chat_messages')
    );

    const unsubCal = onSnapshot(
      query(collection(db, 'calendar_events'), limit(500)),
      snap => {
        const list: CalendarEvent[] = [];
        snap.forEach(d => {
          const docData = d.data() as Omit<CalendarEvent, 'id'>;
          if (d.id === 'config_event_permissions' || docData.date === 'CONFIG_PERMS') {
            try {
              const parsed = JSON.parse(docData.description || '{}');
              if (parsed && typeof parsed === 'object') {
                window.localStorage.setItem(USER_EVENT_PERMS_STORAGE_KEY, JSON.stringify(parsed));
                setEventPermsMap(parsed);
              }
            } catch {
              // ignore
            }
            return;
          }
          if (
            d.id === 'config_complete_task_permissions' ||
            docData.date === 'CONFIG_COMPLETE_TASK_PERMS'
          ) {
            try {
              const parsed = JSON.parse(docData.description || '{}');
              if (parsed && typeof parsed === 'object') {
                window.localStorage.setItem(
                  USER_COMPLETE_TASK_PERMS_STORAGE_KEY,
                  JSON.stringify(parsed)
                );
                setCompleteTaskPermsMap(parsed);
              }
            } catch {
              // ignore
            }
            return;
          }
          if (
            d.id === 'config_edit_task_permissions' ||
            docData.date === 'CONFIG_EDIT_TASK_PERMS'
          ) {
            try {
              const parsed = JSON.parse(docData.description || '{}');
              if (parsed && typeof parsed === 'object') {
                window.localStorage.setItem(
                  USER_EDIT_TASK_PERMS_STORAGE_KEY,
                  JSON.stringify(parsed)
                );
                setEditTaskPermsMap(parsed);
              }
            } catch {
              // ignore
            }
            return;
          }
          if (
            d.id === 'config_recovery_security' ||
            docData.date === 'CONFIG_RECOVERY_SECURITY'
          ) {
            try {
              const parsed = JSON.parse(docData.description || '{}');
              if (parsed && typeof parsed === 'object') {
                window.localStorage.setItem(
                  RECOVERY_SECURITY_STORAGE_KEY,
                  JSON.stringify(parsed)
                );
                setRecoverySecurityMap(parsed);
              }
            } catch {
              // ignore
            }
            return;
          }
          if (
            d.id.startsWith('config_') ||
            (docData.date && docData.date.startsWith('CONFIG_'))
          ) {
            return;
          }
          list.push({ ...docData, id: d.id });
        });
        syncCollectionToPermanentVault('calendarEvents', list, ev => ev.id);
        setCalendarEvents(list);
      },
      err => handleFirestoreError(err, OperationType.LIST, 'calendar_events')
    );

    return () => {
      unsubUsers();
      unsubTasks();
      unsubLogs();
      unsubChat();
      unsubCal();
    };
  }, []);

  const currentUser =
    users.find(
      u => u.cedula === loggedCedula && (!u.approvalStatus || u.approvalStatus === 'aprobado')
    ) || null;

  useEffect(() => {
    if (currentUser) {
      if (currentUser.role === 'admin') {
        setActivePanelMode('admin');
        setActiveSection(prev => (prev.startsWith('admin_') ? prev : 'admin_users'));
      } else {
        setActivePanelMode('user');
        setActiveSection(prev => (prev.startsWith('user_') ? prev : 'user_personal'));
      }
    }
  }, [currentUser?.cedula, currentUser?.role]);

  // Sin temporizador de inactividad ni recargas automáticas de presencia para evitar que se borre información al llenar formularios

  // Envío 100% automático en segundo plano vía Resend API (exclusivo a fundacionulep@gmail.com)
  // cuando a una tarea le falten 24 horas, 12 horas, 6 horas o 2 horas para vencer
  const tasksRef = useRef<TaskItem[]>(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  const isUserLockedLocally = (cedula?: string): boolean => {
    if (!cedula) return false;
    const cleanCed = String(cedula).trim();
    if (cleanCed === SINGLE_ADMIN_CEDULA) return false;
    const map = recoverySecurityMap;
    return Boolean(map[cleanCed]?.locked);
  };

  const evaluateAndSendMilestoneAlerts = (taskList: TaskItem[]) => {
    if (!taskList || taskList.length === 0) return;
    const nowMs = Date.now();

    const getTaskMilestone = (t: TaskItem): 24 | 12 | 6 | 2 | null => {
      if (t.status === 'completada' || !t.dueDate) return null;
      const dueMs = new Date(t.dueDate).getTime();
      if (Number.isNaN(dueMs)) return null;
      const diffMs = dueMs - nowMs;
      if (diffMs <= 0) return null;
      const diffHours = diffMs / (1000 * 60 * 60);
      if (diffHours <= 2) return 2;
      if (diffHours <= 6) return 6;
      if (diffHours <= 12) return 12;
      if (diffHours <= 24) return 24;
      return null;
    };

    let notifiedMap: Record<string, string> = {};
    try {
      const raw = localStorage.getItem('ulep_resend_milestones_notified_v1');
      if (raw) notifiedMap = JSON.parse(raw);
    } catch {
      notifiedMap = {};
    }

    const tasksNeedingAlert = taskList.filter(t => {
      if (isUserLockedLocally(t.assignedToCedula)) return false;
      const milestone = getTaskMilestone(t);
      if (!milestone) return false;
      const key = `${t.id}_${milestone}h`;
      return !notifiedMap[key];
    });

    if (tasksNeedingAlert.length === 0) return;

    callResendApi('/api/resend/check-and-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks: tasksNeedingAlert }),
    })
      .then(({ data }) => {
        if (Array.isArray(data?.dispatched)) {
          const updated = { ...notifiedMap };
          for (const d of data.dispatched) {
            const rKey = d?.recordKey || (d?.taskId && d?.milestoneHours ? `${d.taskId}_${d.milestoneHours}h` : null);
            if (rKey && d?.status === 'sent') {
              updated[rKey] = d.sentAt || new Date().toISOString();
            }
          }
          try {
            localStorage.setItem('ulep_resend_milestones_notified_v1', JSON.stringify(updated));
          } catch {
            // Ignorar errores de almacenamiento
          }
        }
      })
      .catch(() => {
        // Silencioso en segundo plano
      });
  };

  useEffect(() => {
    evaluateAndSendMilestoneAlerts(tasks);
  }, [tasks]);

  useEffect(() => {
    const timer = setInterval(() => {
      evaluateAndSendMilestoneAlerts(tasksRef.current);
    }, 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    const cleanCed = loginCedulaInput.trim();

    if (cleanCed !== SINGLE_ADMIN_CEDULA && isUserLockedLocally(cleanCed)) {
      setLoginError('Tu cuenta se encuentra bloqueada. Solo el Administrador puede desbloquearla.');
      return;
    }

    const found = users.find(u => u.cedula === cleanCed && u.password === loginPasswordInput);

    if (!found) {
      setLoginError('Cédula o contraseña incorrecta.');
      return;
    }

    if (found.approvalStatus === 'pendiente') {
      setLoginError(
        'Tu cuenta está pendiente de autorización por el Administrador en el Panel de Autorización de Registros.'
      );
      return;
    }

    if (found.approvalStatus === 'rechazado') {
      setLoginError(
        'Tu cuenta se encuentra bloqueada o restringida. Contacta al Administrador.'
      );
      return;
    }

    localStorage.setItem('taskflow_active_cedula', found.cedula);
    setLoggedCedula(found.cedula);

    await saveUserToFirestore({
      ...found,
      isOnline: true,
      lastSeen: new Date().toISOString(),
    });

    await recordAuditLog({
      actorCedula: found.cedula,
      actorName: found.name,
      actorRole: found.role,
      actionType: 'INICIO_SESION',
      module: 'AUTENTICACION_CEDULA',
      description: `Inició sesión en el sistema con Cédula ${found.cedula} (Panel ${found.role.toUpperCase()}).`,
      severity: 'info',
    });

    if (found.role === 'admin') {
      setActivePanelMode('admin');
      setActiveSection('admin_users');
    } else {
      setActivePanelMode('user');
      setActiveSection('user_personal');
    }
  };

  const resolveTargetRecoveryUser = async (rawInput: string): Promise<AppUser | null> => {
    const trimmed = rawInput.trim();
    const cleanCed = trimmed.replace(/[^a-zA-Z0-9_\-]/g, '');
    const foundLocal = users.find(
      u =>
        u.cedula === cleanCed ||
        u.cedula === trimmed ||
        (u.email && u.email.toLowerCase() === trimmed.toLowerCase())
    );
    if (foundLocal) return foundLocal;

    const vaultUsers = Object.values(readPermanentVault().users);
    const foundVault = vaultUsers.find(
      u =>
        u.cedula === cleanCed ||
        u.cedula === trimmed ||
        (u.email && u.email.toLowerCase() === trimmed.toLowerCase())
    );
    if (foundVault) return foundVault;

    if (cleanCed === SINGLE_ADMIN_CEDULA || trimmed.toLowerCase() === 'grupoulep@gmail.com') {
      return {
        cedula: SINGLE_ADMIN_CEDULA,
        name: 'Administrador Principal ULEP',
        password: SINGLE_ADMIN_CEDULA,
        role: 'admin',
        email: 'grupoulep@gmail.com',
        department: 'Dirección General / Ejecutiva',
        approvalStatus: 'aprobado',
        isOnline: false,
        lastSeen: new Date().toISOString(),
        canCreateTasks: true,
        canEditTasks: true,
        canDeleteTasks: true,
        canSendChat: true,
        canViewVault: true,
        canExportReports: true,
        createdAt: new Date().toISOString(),
      };
    }

    if (cleanCed) {
      try {
        const snap = await getDoc(doc(db, 'app_users', cleanCed));
        if (snap.exists()) {
          return snap.data() as AppUser;
        }
      } catch {
        // ignore
      }
    }

    try {
      const allUsersSnap = await getDocs(query(collection(db, 'app_users'), limit(500)));
      for (const d of allUsersSnap.docs) {
        const u = d.data() as AppUser;
        if (
          d.id === cleanCed ||
          u.cedula === cleanCed ||
          u.cedula === trimmed ||
          (u.email && u.email.toLowerCase() === trimmed.toLowerCase())
        ) {
          return u;
        }
      }
    } catch {
      // ignore
    }

    return null;
  };

  const handleRequestRecoveryCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoverError(null);
    setShowDirectRecoveryCode(false);
    setRecoverLoading(true);

    try {
      const targetUser = await resolveTargetRecoveryUser(recoverCedula);

      if (!targetUser) {
        setRecoverError('No se encontró ningún usuario registrado con ese número de cédula.');
        return;
      }

      const isSingleAdmin = targetUser.cedula === SINGLE_ADMIN_CEDULA;

      if (!isSingleAdmin && isUserLockedLocally(targetUser.cedula)) {
        setRecoverError('Cuenta y envío de correos bloqueados. Solo el Administrador puede desbloquearla.');
        return;
      }

      const rawUserEmail = (targetUser.email || '').trim().toLowerCase();
      const effectiveEmail =
        rawUserEmail &&
        rawUserEmail.includes('@') &&
        !rawUserEmail.endsWith('@fundacionulep.org')
          ? rawUserEmail
          : isSingleAdmin
          ? 'grupoulep@gmail.com'
          : 'fundacionulep@gmail.com';

      const { ok: responseOk, data } = await requestRecoveryCodeCrossOrigin({
        cedula: targetUser.cedula,
        userName: targetUser.name,
        userEmail: effectiveEmail,
        isCurrentlyLocked: !isSingleAdmin && isUserLockedLocally(targetUser.cedula),
      });

      if (data?.securityState) {
        void writeRecoverySecurityState(targetUser.cedula, data.securityState);
      }

      if (!isSingleAdmin && data?.locked) {
        await saveUserToFirestore({
          ...targetUser,
          approvalStatus: 'rechazado',
        });
        await recordAuditLog({
          actorCedula: targetUser.cedula,
          actorName: targetUser.name,
          actorRole: targetUser.role,
          actionType: 'BLOQUEO_RECUPERACION_CUENTA_Y_CORREO',
          module: 'SEGURIDAD_USUARIOS',
          description: `Se bloqueó la cuenta y el envío de correos de ${targetUser.name} (C.C. ${targetUser.cedula}) al alcanzar el 3er intento de recuperación.`,
          targetId: targetUser.cedula,
          severity: 'critical',
        });
        setRecoverError(
          data.error || 'Cuenta y envío de correos bloqueados. Solo el Administrador puede desbloquearla.'
        );
        return;
      }

      const localPart = effectiveEmail.split('@')[0] || effectiveEmail;
      const fallbackMask = `${localPart.slice(0, Math.min(5, Math.max(3, Math.floor(localPart.length / 2))))}....`;
      const finalCode = data?.code
        ? String(data.code)
        : String(Math.floor(100000 + Math.random() * 900000));

      setRecoverCedula(targetUser.cedula);
      setRecoverMaskedEmail(data?.maskedEmail || fallbackMask);
      setRecoverGeneratedCode(finalCode);
      setRecoverEmailStatus(responseOk && data?.status === 'sent' ? 'sent' : 'missing_api_key');
      setRecoverCodeInput('');
      setRecoverNewPassword('');
      setRecoverConfirmPassword('');
      setRecoverStep('verify');
    } catch {
      setRecoverError('Verifica tu número de cédula e inténtalo nuevamente.');
    } finally {
      setRecoverLoading(false);
    }
  };

  const handleVerifyAndResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoverError(null);

    const targetUser = await resolveTargetRecoveryUser(recoverCedula);
    if (!targetUser) {
      setRecoverError('Usuario no encontrado.');
      return;
    }

    const isSingleAdmin = targetUser.cedula === SINGLE_ADMIN_CEDULA;

    if (!isSingleAdmin && isUserLockedLocally(targetUser.cedula)) {
      setRecoverError('Cuenta y envío de correos bloqueados. Solo el Administrador puede desbloquearla.');
      return;
    }

    if (!recoverCodeInput.trim()) {
      setRecoverError('Ingresa el código enviado al correo.');
      return;
    }

    if (recoverNewPassword.trim().length < 4) {
      setRecoverError('La nueva contraseña debe tener al menos 4 caracteres.');
      return;
    }

    if (recoverNewPassword.trim() !== recoverConfirmPassword.trim()) {
      setRecoverError('Las contraseñas no coinciden.');
      return;
    }

    setRecoverLoading(true);
    try {
      const { ok: responseOk, data } = await verifyRecoveryCodeCrossOrigin({
        cedula: targetUser.cedula,
        code: recoverCodeInput.trim(),
        expectedCode: recoverGeneratedCode,
      });

      if (data?.securityState) {
        void writeRecoverySecurityState(targetUser.cedula, data.securityState);
      }

      if (!isSingleAdmin && data?.locked) {
        await saveUserToFirestore({
          ...targetUser,
          approvalStatus: 'rechazado',
        });
        await recordAuditLog({
          actorCedula: targetUser.cedula,
          actorName: targetUser.name,
          actorRole: targetUser.role,
          actionType: 'BLOQUEO_RECUPERACION_CUENTA_Y_CORREO',
          module: 'SEGURIDAD_USUARIOS',
          description: `Se bloqueó la cuenta y el envío de correos de ${targetUser.name} (C.C. ${targetUser.cedula}) al alcanzar el 3er intento fallido de código de recuperación.`,
          targetId: targetUser.cedula,
          severity: 'critical',
        });
        setRecoverError(
          data.error || 'Cuenta y envío de correos bloqueados. Solo el Administrador puede desbloquearla.'
        );
        return;
      }

      if (!responseOk || !data?.valid) {
        setRecoverError(data?.error || 'El código ingresado es incorrecto.');
        return;
      }

      const newPwd = recoverNewPassword.trim();
      if (isSingleAdmin) {
        try {
          localStorage.setItem('taskflow_single_admin_pwd', newPwd);
        } catch {
          // ignore
        }
      }

      await saveUserToFirestore({
        ...targetUser,
        password: newPwd,
        approvalStatus: 'aprobado',
      });

      await recordAuditLog({
        actorCedula: targetUser.cedula,
        actorName: targetUser.name,
        actorRole: targetUser.role,
        actionType: 'RECUPERACION_CONTRASENA',
        module: 'AUTENTICACION_CEDULA',
        description: `Actualizó su contraseña mediante código de recuperación validado.`,
        targetId: targetUser.cedula,
        severity: 'warning',
      });

      setLoginCedulaInput(targetUser.cedula);
      setLoginPasswordInput('');
      setLoginError(null);
      setRecoverGeneratedCode(null);
      setRecoverEmailStatus(null);
      setLoginSuccessMsg('Contraseña actualizada correctamente. Ya puedes iniciar sesión.');
      setAuthMode('login');
      setRecoverStep('cedula');
    } catch {
      setRecoverError('No se pudo validar el código en este momento.');
    } finally {
      setRecoverLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError(null);
    setRegSuccess(null);

    const cleanCed = regCedula.trim().replace(/[^a-zA-Z0-9_\-]/g, '');
    if (cleanCed.length < 4) {
      setRegError('La cédula debe tener al menos 4 caracteres.');
      return;
    }
    if (regName.trim().length < 2) {
      setRegError('Ingresa tu nombre y apellidos completos.');
      return;
    }
    if (regPassword.trim().length < 4) {
      setRegError('La contraseña debe tener al menos 4 caracteres.');
      return;
    }

    const existing = users.find(u => u.cedula === cleanCed);
    if (existing) {
      if (existing.approvalStatus === 'pendiente') {
        setRegError('Esta cédula ya tiene una solicitud de registro pendiente de autorización.');
      } else {
        setRegError('Esta cédula ya se encuentra registrada en el sistema.');
      }
      return;
    }

    setRegSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      const newPendingUser: AppUser = {
        cedula: cleanCed,
        name: regName.trim(),
        password: regPassword.trim(),
        role: 'user',
        email: regEmail.trim() || `${cleanCed}@fundacionulep.org`,
        department: regDepartment.trim() || 'Operaciones',
        isOnline: false,
        lastSeen: nowIso,
        canCreateTasks: true,
        canEditTasks: false,
        canDeleteTasks: false,
        canSendChat: true,
        canViewVault: false,
        canExportReports: true,
        approvalStatus: 'pendiente',
        cedulaIssuePlace: regCedulaIssuePlace.trim(),
        cedulaIssueDate: regCedulaIssueDate.trim(),
        birthDate: regBirthDate.trim(),
        birthPlace: regBirthPlace.trim(),
        bloodType: regBloodType.trim(),
        maritalStatus: regMaritalStatus.trim(),
        phone: regPhone.trim(),
        locationDepartmentState: regLocationDepartment.trim(),
        locationCity: regLocationCity.trim(),
        residenceAddress: regResidenceAddress.trim(),
        residenceType: regResidenceType.trim(),
        residenceStratum: regResidenceStratum.trim(),
        familyMembersCount: Number(regFamilyCount) || 0,
        emergencyContactName: regEmergencyName.trim()
          ? `${regEmergencyName.trim()} (${regEmergencyRelationship})`
          : regEmergencyRelationship,
        emergencyContactPhone: regEmergencyPhone.trim(),
        familyNotes: regFamilyNotes.trim(),
        bankName: regBankName.trim() || 'No aplica',
        bankAccountType: regBankAccountType.trim() || 'No aplica',
        bankAccountNumber: regBankAccountNumber.trim() || 'No aplica',
        bankAccountHolder: regBankAccountHolder.startsWith('A mi nombre')
          ? regName.trim()
          : regBankAccountHolder,
        createdAt: nowIso,
      };

      await saveUserToFirestore(newPendingUser);
      await recordAuditLog({
        actorCedula: cleanCed,
        actorName: newPendingUser.name,
        actorRole: 'user',
        actionType: 'SOLICITUD_REGISTRO_COMPLETO',
        module: 'AUTORIZACION_REGISTROS',
        description: `Nuevo registro con ficha personal, residencia, familiares (${newPendingUser.familyMembersCount}) y datos bancarios (${newPendingUser.bankName}) enviado por ${newPendingUser.name} (C.C. ${cleanCed}).`,
        targetId: cleanCed,
        severity: 'warning',
      });

      setRegSuccess(
        '¡Solicitud enviada! Tus datos personales, de residencia, familiares y bancarios fueron recibidos de forma confidencial para revisión del Administrador.'
      );
      setRegCedula('');
      setRegCedulaIssuePlace('');
      setRegCedulaIssueDate('');
      setRegName('');
      setRegBirthDate('');
      setRegBirthPlace('');
      setRegPhone('');
      setRegEmail('');
      setRegLocationDepartment('');
      setRegLocationCity('');
      setRegResidenceAddress('');
      setRegFamilyCount(1);
      setRegEmergencyName('');
      setRegEmergencyPhone('');
      setRegFamilyNotes('');
      setRegBankName('');
      setRegBankAccountNumber('');
      setRegBankAccountHolder('');
      setRegDepartment('Operaciones');
      setRegPassword('');
    } finally {
      setRegSubmitting(false);
    }
  };

  const handleLogout = async () => {
    if (currentUser) {
      await saveUserToFirestore({
        ...currentUser,
        isOnline: false,
        lastSeen: new Date().toISOString(),
      });
      await recordAuditLog({
        actorCedula: currentUser.cedula,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        actionType: 'CIERRE_SESION',
        module: 'AUTENTICACION_CEDULA',
        description: `Cerró sesión y pasó a estado Desconectado.`,
        severity: 'info',
      });
    }
    localStorage.removeItem('taskflow_active_cedula');
    setLoggedCedula(null);
    setLoginCedulaInput('');
    setLoginPasswordInput('');
  };

  const handleSaveTaskModal = async (task: TaskItem) => {
    if (!currentUser) return;
    const isEditing = Boolean(editingTask);
    const canEditActivity =
      currentUser.role === 'admin' ||
      currentUser.cedula === SINGLE_ADMIN_CEDULA ||
      Boolean(currentUser.canEditTasks);
    if (isEditing && !canEditActivity) {
      return;
    }
    await saveTaskToFirestore(task);

    const dueDay = task.dueDate.split('T')[0];
    const dueTime = new Date(task.dueDate).toTimeString().slice(0, 5);
    await saveCalendarEventToFirestore({
      id: cleanId(`ev_sync_${task.id}`),
      title: `Entrega: ${task.title}`,
      date: dueDay,
      time: dueTime,
      type: 'entrega',
      description: `Responsable: ${task.assignedToName} (${task.assignedToCedula}) · Prioridad ${task.priority.toUpperCase()}`,
      createdByCedula: currentUser.cedula,
      createdByName: currentUser.name,
      linkedTaskId: task.id,
    });

    await recordAuditLog({
      actorCedula: currentUser.cedula,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionType: isEditing ? 'EDITAR_TAREA' : 'CREAR_TAREA',
      module: 'GESTION_TAREAS',
      description: `${isEditing ? 'Actualizó' : 'Creó'} la tarea "${task.title}" (Prioridad: ${task.priority.toUpperCase()}, Responsable: ${task.assignedToName}, Avance: ${task.progress}%).`,
      targetId: task.id,
      severity: task.priority === 'critica' ? 'warning' : 'info',
    });
  };

  const renderBlueRibbonsBackground = (blurred = false) => (
    <div className="crediulep-ribbons-bg" aria-hidden="true">
      <svg
        className={`crediulep-ribbons-svg ${blurred ? 'crediulep-ribbons-svg-blurred' : ''}`}
        viewBox="0 0 1600 900"
        fill="none"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="crispRibbon1" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1e3a8a" />
            <stop offset="30%" stopColor="#2563eb" />
            <stop offset="70%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#1d4ed8" />
          </linearGradient>

          <linearGradient id="crispRibbon2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#0B2559" />
            <stop offset="35%" stopColor="#1d4ed8" />
            <stop offset="70%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#1e40af" />
          </linearGradient>

          <linearGradient id="crispRibbon3" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1d4ed8" />
            <stop offset="35%" stopColor="#60a5fa" />
            <stop offset="70%" stopColor="#93c5fd" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
        </defs>

        <path
          d="M -200 220 C 180 80, 480 370, 850 200 C 1220 30, 1500 340, 1880 180"
          stroke="url(#crispRibbon1)"
          strokeWidth="38"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-ribbon1"
          opacity="0.95"
        />

        <path
          d="M -220 690 C 180 490, 520 830, 920 640 C 1300 450, 1560 760, 1900 580"
          stroke="url(#crispRibbon2)"
          strokeWidth="46"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-ribbon2"
          opacity="0.9"
        />

        <path
          d="M -200 810 C 180 750, 450 360, 840 450 C 1220 530, 1440 220, 1880 120"
          stroke="url(#crispRibbon3)"
          strokeWidth="32"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-ribbon3"
          opacity="0.92"
        />
      </svg>
    </div>
  );

  // PANTALLA DE INICIO DE SESIÓN Y REGISTRO CON EL LOGO Y PALETA ULEP (#B3D9FF, #FFFFFF y #0B2559)
  if (!currentUser) {
    const showStepByStepReg = isMobileView && !regMobileShowAll;

    return (
      <div className="relative min-h-screen bg-[#f4f9ff] flex flex-col justify-center py-4 sm:py-8 px-3 sm:px-6 overflow-hidden">
        {renderBlueRibbonsBackground()}
        <div
          className={`relative z-10 ${
            authMode === 'register'
              ? isMobileView
                ? 'max-w-md'
                : isTabletView
                ? 'max-w-2xl'
                : 'max-w-3xl'
              : 'max-w-md'
          } w-full mx-auto bg-white border border-[#B3D9FF] rounded-2xl overflow-hidden shadow-sm transition-all`}
        >
          <div className="p-5 sm:p-8">
            {/* Solo el logo encima del inicio de sesión */}
            <div className="flex justify-center mb-5">
              <img
                src={`${import.meta.env.BASE_URL}assets/aistudio/FUN_AZUL_8fb1ebfe`}
                alt="Fundación ULEP"
                className="h-20 sm:h-28 w-auto object-contain"
                referrerPolicy="no-referrer"
              />
            </div>

            {authMode === 'login' ? (
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-[#0B2559] mb-1.5">
                    Número de Cédula
                  </label>
                  <div className="relative">
                    <i className="fi fi-rr-id-card-clip-alt text-sm text-[#3B82F6] absolute left-3.5 top-3" />
                    <input
                      type="text"
                      required
                      value={loginCedulaInput}
                      onChange={e => setLoginCedulaInput(e.target.value)}
                      placeholder="Ingresa tu número de cédula"
                      className="w-full min-h-[44px] pl-10 pr-4 py-2.5 text-sm font-mono text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl focus:bg-white focus:outline-none focus:border-[#0B2559] transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0B2559] mb-1.5">
                    Contraseña
                  </label>
                  <div className="relative">
                    <i className="fi fi-rr-lock text-sm text-[#3B82F6] absolute left-3.5 top-3" />
                    <input
                      type="password"
                      required
                      value={loginPasswordInput}
                      onChange={e => setLoginPasswordInput(e.target.value)}
                      placeholder="••••••••"
                      className="w-full min-h-[44px] pl-10 pr-4 py-2.5 text-sm font-mono text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl focus:bg-white focus:outline-none focus:border-[#0B2559] transition-colors"
                    />
                  </div>
                  <div className="mt-1.5 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('recover');
                        setRecoverStep('cedula');
                        setRecoverCedula(loginCedulaInput);
                        setRecoverError(null);
                        setLoginError(null);
                        setLoginSuccessMsg(null);
                      }}
                      className="text-xs font-semibold text-[#3B82F6] hover:text-[#0B2559] hover:underline transition-colors text-right"
                    >
                      Recuperar contraseña
                    </button>
                  </div>
                </div>

                {loginError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium flex items-center gap-2">
                    <i className="fi fi-rr-exclamation text-sm text-rose-600 shrink-0" />
                    <span>{loginError}</span>
                  </div>
                )}

                {loginSuccessMsg && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-bold flex items-center gap-2">
                    <i className="fi fi-rr-check-circle text-sm text-emerald-600 shrink-0" />
                    <span>{loginSuccessMsg}</span>
                  </div>
                )}

                <div className="space-y-2.5">
                  <button
                    type="submit"
                    className="w-full min-h-[44px] py-3 px-4 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-xl hover:bg-[#99CCFF] transition-colors flex items-center justify-center gap-2 shadow-2xs"
                  >
                    <i className="fi fi-rr-key text-xs" /> Iniciar Sesión
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('register');
                      setRegMobileStep(1);
                      setLoginError(null);
                      setLoginSuccessMsg(null);
                    }}
                    className="w-full min-h-[44px] py-2.5 px-4 text-xs font-bold text-[#0B2559] bg-white border border-[#B3D9FF] rounded-xl hover:bg-[#F4F9FF] transition-colors flex items-center justify-center gap-2"
                  >
                    <i className="fi fi-rr-user-add text-xs text-[#3B82F6]" /> Registrar Nueva Cuenta
                  </button>
                </div>
              </form>
            ) : authMode === 'recover' ? (
              recoverStep === 'cedula' ? (
                <form onSubmit={handleRequestRecoveryCode} className="space-y-4">
                  <div className="p-3 rounded-xl bg-[#F4F9FF] border border-[#B3D9FF] text-xs font-bold text-[#0B2559] flex items-center gap-2">
                    <i className="fi fi-rr-key text-sm text-[#3B82F6]" />
                    <span>Recuperar Contraseña</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#0B2559] mb-1.5">
                      Número de Cédula
                    </label>
                    <div className="relative">
                      <i className="fi fi-rr-id-card-clip-alt text-sm text-[#3B82F6] absolute left-3.5 top-3" />
                      <input
                        type="text"
                        required
                        value={recoverCedula}
                        onChange={e => setRecoverCedula(e.target.value)}
                        placeholder="Ingresa tu número de cédula"
                        className="w-full min-h-[44px] pl-10 pr-4 py-2.5 text-sm font-mono text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl focus:bg-white focus:outline-none focus:border-[#0B2559]"
                      />
                    </div>
                  </div>

                  {recoverError && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium flex items-center gap-2">
                      <i className="fi fi-rr-exclamation text-sm text-rose-600 shrink-0" />
                      <span>{recoverError}</span>
                    </div>
                  )}

                  <div className="space-y-2.5">
                    <button
                      type="submit"
                      disabled={recoverLoading}
                      className="w-full min-h-[44px] py-3 px-4 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-xl hover:bg-[#99CCFF] transition-colors flex items-center justify-center gap-2 shadow-2xs disabled:opacity-50"
                    >
                      <i className="fi fi-rr-envelope text-xs" />
                      <span>{recoverLoading ? 'Enviando código...' : 'Enviar Código'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setAuthMode('login');
                        setRecoverError(null);
                      }}
                      className="w-full min-h-[44px] py-2.5 px-4 text-xs font-bold text-[#0B2559] bg-white border border-[#B3D9FF] rounded-xl hover:bg-[#F4F9FF] transition-colors flex items-center justify-center gap-2"
                    >
                      ← Volver a Iniciar Sesión
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleVerifyAndResetPassword} className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-[#F4F9FF] border border-[#B3D9FF] text-xs font-bold text-[#0B2559] text-center space-y-2">
                    <div>
                      Digite el código enviado al correo <span className="font-mono text-[#3B82F6]">{recoverMaskedEmail}</span>
                    </div>
                    {recoverEmailStatus === 'sent' && !showDirectRecoveryCode && (
                      <div className="space-y-1.5">
                        <div className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1">
                          ✓ Código enviado desde No-reply@fundacionulep.fun (revisa también Spam)
                        </div>
                        {recoverGeneratedCode && (
                          <button
                            type="button"
                            onClick={() => setShowDirectRecoveryCode(true)}
                            className="text-[11px] font-bold text-[#3B82F6] hover:text-[#0B2559] underline"
                          >
                            ¿No recibiste el correo en tu bandeja? Ver código de verificación aquí
                          </button>
                        )}
                      </div>
                    )}
                    {recoverGeneratedCode && (recoverEmailStatus !== 'sent' || showDirectRecoveryCode) && (
                      <div className="p-2.5 rounded-lg bg-white border border-[#B3D9FF] text-[11px] text-[#0B2559] flex flex-col items-center gap-1.5">
                        <span className="text-[#3B82F6] font-semibold">
                          Notificación de Recuperación Directa (Código Generado):
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="px-3 py-1 rounded-lg bg-[#EAF3FF] border border-[#7CC0FF] font-mono text-sm font-extrabold tracking-widest text-[#0B2559]">
                            {recoverGeneratedCode}
                          </span>
                          <button
                            type="button"
                            onClick={() => setRecoverCodeInput(recoverGeneratedCode)}
                            className="px-2.5 py-1 rounded-lg bg-[#0B2559] text-white text-[10px] font-bold hover:bg-[#163A82] transition-colors"
                          >
                            Usar Código
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#0B2559] mb-1.5">
                      Código de Verificación
                    </label>
                    <input
                      type="text"
                      required
                      value={recoverCodeInput}
                      onChange={e => setRecoverCodeInput(e.target.value)}
                      placeholder="000000"
                      className="w-full min-h-[44px] px-4 py-2.5 text-center text-base font-mono font-bold tracking-widest text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl focus:bg-white focus:outline-none focus:border-[#0B2559]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#0B2559] mb-1.5">
                      Nueva Contraseña
                    </label>
                    <input
                      type="password"
                      required
                      value={recoverNewPassword}
                      onChange={e => setRecoverNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full min-h-[44px] px-4 py-2.5 text-sm font-mono text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl focus:bg-white focus:outline-none focus:border-[#0B2559]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#0B2559] mb-1.5">
                      Confirmar Nueva Contraseña
                    </label>
                    <input
                      type="password"
                      required
                      value={recoverConfirmPassword}
                      onChange={e => setRecoverConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full min-h-[44px] px-4 py-2.5 text-sm font-mono text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl focus:bg-white focus:outline-none focus:border-[#0B2559]"
                    />
                  </div>

                  {recoverError && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium flex items-center gap-2">
                      <i className="fi fi-rr-exclamation text-sm text-rose-600 shrink-0" />
                      <span>{recoverError}</span>
                    </div>
                  )}

                  <div className="space-y-2.5">
                    <button
                      type="submit"
                      disabled={recoverLoading}
                      className="w-full min-h-[44px] py-3 px-4 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-xl hover:bg-[#99CCFF] transition-colors flex items-center justify-center gap-2 shadow-2xs disabled:opacity-50"
                    >
                      <i className="fi fi-rr-check text-xs" />
                      <span>{recoverLoading ? 'Validando...' : 'Guardar Nueva Contraseña'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setRecoverStep('cedula');
                        setRecoverError(null);
                      }}
                      className="w-full min-h-[44px] py-2.5 px-4 text-xs font-bold text-[#0B2559] bg-white border border-[#B3D9FF] rounded-xl hover:bg-[#F4F9FF] transition-colors flex items-center justify-center gap-2"
                    >
                      ← Cambiar Cédula / Reenviar Código
                    </button>
                  </div>
                </form>
              )
            ) : (
              <form onSubmit={handleRegisterSubmit} className="space-y-4 max-h-[74vh] overflow-y-auto pr-1">
                <div className="p-3 rounded-xl bg-[#EAF3FF] border border-[#B3D9FF] text-[11px] text-[#0B2559] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <i className="fi fi-rr-shield-check text-sm text-[#3B82F6] shrink-0" />
                    <span>
                      <strong>Confidencialidad Garantizada:</strong> Tus datos solo serán visibles por el Administrador.
                    </span>
                  </div>
                  {isMobileView && (
                    <button
                      type="button"
                      onClick={() => setRegMobileShowAll(!regMobileShowAll)}
                      className="px-2.5 py-1 rounded-lg bg-white border border-[#B3D9FF] text-[10px] font-bold text-[#0B2559] shrink-0"
                    >
                      {regMobileShowAll ? 'Ver por Pasos' : 'Ver Todo'}
                    </button>
                  )}
                </div>

                {/* En Teléfono: Barra de pasos 1 a 5 para que sea más sencillo sin perder ninguna opción */}
                {showStepByStepReg && (
                  <div className="bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl p-2.5 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-[#0B2559]">
                      <span>Paso {regMobileStep} de 5</span>
                      <span className="text-[#3B82F6]">
                        {regMobileStep === 1 && 'Identificación'}
                        {regMobileStep === 2 && 'Ubicación y Residencia'}
                        {regMobileStep === 3 && 'Núcleo Familiar'}
                        {regMobileStep === 4 && 'Datos Bancarios'}
                        {regMobileStep === 5 && 'Credenciales y Área'}
                      </span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {[1, 2, 3, 4, 5].map(step => (
                        <button
                          key={step}
                          type="button"
                          onClick={() => setRegMobileStep(step)}
                          className={`py-1.5 rounded-lg text-xs font-bold transition-colors ${
                            regMobileStep === step
                              ? 'bg-[#0B2559] text-white'
                              : regMobileStep > step
                              ? 'bg-[#B3D9FF] text-[#0B2559]'
                              : 'bg-white text-[#0B2559]/60 border border-[#D6EAFF]'
                          }`}
                        >
                          {step}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bloque 1: Datos de Cédula e Identificación Personal */}
                {(!showStepByStepReg || regMobileStep === 1) && (
                  <div className="p-4 rounded-xl bg-[#F4F9FF] border border-[#B3D9FF] space-y-3">
                    <h3 className="text-xs font-bold text-[#0B2559] uppercase tracking-wider flex items-center gap-1.5">
                      <i className="fi fi-rr-id-card-clip-alt text-xs text-[#3B82F6]" />
                      1. Datos de la Cédula e Identificación Personal
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-[#0B2559] mb-1">
                          Número de Cédula *
                        </label>
                        <input
                          type="text"
                          required
                          value={regCedula}
                          onChange={e => setRegCedula(e.target.value)}
                          placeholder="Ej. 40506070"
                          className="w-full min-h-[42px] sm:min-h-0 px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                        />
                      </div>

                      <SearchableLocationSelect
                        label="Lugar Expedición Cédula"
                        required
                        value={regCedulaIssuePlace}
                        onChange={setRegCedulaIssuePlace}
                        options={COLOMBIAN_CITIES}
                        searchPlaceholder="Buscar municipio de expedición..."
                      />

                      <div>
                        <label className="block text-xs font-bold text-[#0B2559] mb-1">
                          Fecha Expedición Cédula
                        </label>
                        <input
                          type="date"
                          value={regCedulaIssueDate}
                          onChange={e => setRegCedulaIssueDate(e.target.value)}
                          className="w-full min-h-[42px] sm:min-h-0 px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-[#0B2559] mb-1">
                          Nombres y Apellidos Completos *
                        </label>
                        <input
                          type="text"
                          required
                          value={regName}
                          onChange={e => setRegName(e.target.value)}
                          placeholder="Ej. Carolina Méndez Gómez"
                          className="w-full min-h-[42px] sm:min-h-0 px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#0B2559] mb-1">
                          Teléfono / Celular *
                        </label>
                        <input
                          type="tel"
                          required
                          value={regPhone}
                          onChange={e => setRegPhone(e.target.value)}
                          placeholder="Ej. 3001234567"
                          className="w-full min-h-[42px] sm:min-h-0 px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-[#0B2559] mb-1">
                          Fecha de Nacimiento
                        </label>
                        <input
                          type="date"
                          value={regBirthDate}
                          onChange={e => setRegBirthDate(e.target.value)}
                          className="w-full min-h-[42px] sm:min-h-0 px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                        />
                      </div>

                      <SearchableLocationSelect
                        label="Lugar de Nacimiento"
                        value={regBirthPlace}
                        onChange={setRegBirthPlace}
                        options={COLOMBIAN_CITIES}
                        searchPlaceholder="Buscar municipio de nacimiento..."
                      />

                      <div>
                        <label className="block text-xs font-bold text-[#0B2559] mb-1">
                          Grupo Sanguíneo / RH
                        </label>
                        <select
                          value={regBloodType}
                          onChange={e => setRegBloodType(e.target.value)}
                          className="w-full min-h-[42px] sm:min-h-0 px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                        >
                          {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map(rh => (
                            <option key={rh} value={rh}>
                              {rh}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#0B2559] mb-1">
                          Estado Civil
                        </label>
                        <select
                          value={regMaritalStatus}
                          onChange={e => setRegMaritalStatus(e.target.value)}
                          className="w-full min-h-[42px] sm:min-h-0 px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                        >
                          <option value="Soltero(a)">Soltero(a)</option>
                          <option value="Casado(a)">Casado(a)</option>
                          <option value="Unión Libre">Unión Libre</option>
                          <option value="Divorciado(a)">Divorciado(a)</option>
                          <option value="Viudo(a)">Viudo(a)</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Bloque 2: Ubicación y Residencia */}
                {(!showStepByStepReg || regMobileStep === 2) && (
                  <div className="p-4 rounded-xl bg-[#F4F9FF] border border-[#B3D9FF] space-y-3">
                    <h3 className="text-xs font-bold text-[#0B2559] uppercase tracking-wider flex items-center gap-1.5">
                      <i className="fi fi-rr-marker text-xs text-[#3B82F6]" />
                      2. Ubicación Geográfica y Datos de Residencia
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <SearchableLocationSelect
                        label="Departamento / Estado de Ubicación"
                        required
                        value={regLocationDepartment}
                        onChange={newDept => {
                          setRegLocationDepartment(newDept);
                          const deptCities = getMunicipalitiesByDepartment(newDept);
                          if (deptCities.length > 0) {
                            setRegLocationCity(deptCities[0]);
                          }
                        }}
                        options={COLOMBIAN_DEPARTMENTS}
                        searchPlaceholder="Buscar departamento..."
                      />

                      <SearchableLocationSelect
                        label="Ciudad / Municipio"
                        required
                        value={regLocationCity}
                        onChange={setRegLocationCity}
                        options={getMunicipalitiesByDepartment(regLocationDepartment)}
                        secondaryOptions={ALL_COLOMBIAN_MUNICIPALITIES_WITH_DEPT.map(m => ({
                          label: m.label,
                          value: m.municipality,
                          department: m.department,
                        }))}
                        onSelectSecondaryDepartment={dept => setRegLocationDepartment(dept)}
                        searchPlaceholder="Buscar municipio en Colombia..."
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-bold text-[#0B2559] mb-1">
                          Dirección Exacta de Residencia y Barrio *
                        </label>
                        <input
                          type="text"
                          required
                          value={regResidenceAddress}
                          onChange={e => setRegResidenceAddress(e.target.value)}
                          placeholder="Ej. Calle 100 # 15-20 Apto 301, Barrio Chicó"
                          className="w-full min-h-[42px] sm:min-h-0 px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#0B2559] mb-1">
                          Tipo de Vivienda
                        </label>
                        <select
                          value={regResidenceType}
                          onChange={e => setRegResidenceType(e.target.value)}
                          className="w-full min-h-[42px] sm:min-h-0 px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                        >
                          <option value="Propia">Propia</option>
                          <option value="Arrendada">Arrendada</option>
                          <option value="Familiar">Familiar</option>
                          <option value="Otra">Otra</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#0B2559] mb-1">
                          Estrato / Zona
                        </label>
                        <select
                          value={regResidenceStratum}
                          onChange={e => setRegResidenceStratum(e.target.value)}
                          className="w-full min-h-[42px] sm:min-h-0 px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                        >
                          {['Estrato 1', 'Estrato 2', 'Estrato 3', 'Estrato 4', 'Estrato 5', 'Estrato 6', 'Zona Rural'].map(s => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Bloque 3: Núcleo Familiar y Contacto de Emergencia */}
                {(!showStepByStepReg || regMobileStep === 3) && (
                  <div className="p-4 rounded-xl bg-[#F4F9FF] border border-[#B3D9FF] space-y-3">
                    <h3 className="text-xs font-bold text-[#0B2559] uppercase tracking-wider flex items-center gap-1.5">
                      <i className="fi fi-rr-users-alt text-xs text-[#3B82F6]" />
                      3. Núcleo Familiar y Contacto de Emergencia
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-[#0B2559] mb-1">
                          Número de Familiares *
                        </label>
                        <select
                          value={regFamilyCount}
                          onChange={e => setRegFamilyCount(Number(e.target.value))}
                          className="w-full min-h-[42px] sm:min-h-0 px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                        >
                          <option value={0}>0 (Vive solo)</option>
                          <option value={1}>1 familiar a cargo</option>
                          <option value={2}>2 familiares</option>
                          <option value={3}>3 familiares</option>
                          <option value={4}>4 familiares</option>
                          <option value={5}>5 familiares</option>
                          <option value={6}>6 o más familiares</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#0B2559] mb-1">
                          Contacto de Emergencia
                        </label>
                        <input
                          type="text"
                          value={regEmergencyName}
                          onChange={e => setRegEmergencyName(e.target.value)}
                          placeholder="Nombre completo"
                          className="w-full min-h-[42px] sm:min-h-0 px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#0B2559] mb-1">
                          Parentesco Familiar
                        </label>
                        <select
                          value={regEmergencyRelationship}
                          onChange={e => setRegEmergencyRelationship(e.target.value)}
                          className="w-full min-h-[42px] sm:min-h-0 px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                        >
                          {EMERGENCY_RELATIONSHIPS.map(rel => (
                            <option key={rel} value={rel}>
                              {rel}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#0B2559] mb-1">
                          Teléfono del Familiar
                        </label>
                        <input
                          type="tel"
                          value={regEmergencyPhone}
                          onChange={e => setRegEmergencyPhone(e.target.value)}
                          placeholder="Ej. 3109876543"
                          className="w-full min-h-[42px] sm:min-h-0 px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#0B2559] mb-1">
                        Composición Familiar Predeterminada
                      </label>
                      <select
                        value={regFamilyNotes}
                        onChange={e => setRegFamilyNotes(e.target.value)}
                        className="w-full min-h-[42px] sm:min-h-0 px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                      >
                        {FAMILY_COMPOSITION_OPTIONS.map(opt => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {/* Bloque 4: Datos Bancarios para Pagos (si hay) */}
                {(!showStepByStepReg || regMobileStep === 4) && (
                  <div className="p-4 rounded-xl bg-[#F4F9FF] border border-[#B3D9FF] space-y-3">
                    <h3 className="text-xs font-bold text-[#0B2559] uppercase tracking-wider flex items-center gap-1.5">
                      <i className="fi fi-rr-bank text-xs text-[#3B82F6]" />
                      4. Datos Bancarios para Pagos (Si Aplica)
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-[#0B2559] mb-1">
                          Banco / Billetera
                        </label>
                        <select
                          value={regBankName}
                          onChange={e => setRegBankName(e.target.value)}
                          className="w-full min-h-[42px] sm:min-h-0 px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                        >
                          {BANK_OPTIONS.map(b => (
                            <option key={b} value={b}>
                              {b}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#0B2559] mb-1">
                          Tipo de Cuenta
                        </label>
                        <select
                          value={regBankAccountType}
                          onChange={e => setRegBankAccountType(e.target.value)}
                          className="w-full min-h-[42px] sm:min-h-0 px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                        >
                          <option value="Ahorros">Cuenta de Ahorros</option>
                          <option value="Corriente">Cuenta Corriente</option>
                          <option value="Billetera Digital">Billetera Digital (Nequi/DaviPlata)</option>
                          <option value="No aplica">No aplica</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#0B2559] mb-1">
                          Número de Cuenta / Llave
                        </label>
                        <input
                          type="text"
                          value={regBankAccountNumber}
                          onChange={e => setRegBankAccountNumber(e.target.value)}
                          placeholder="N° de cuenta o celular"
                          className="w-full min-h-[42px] sm:min-h-0 px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#0B2559] mb-1">
                          Titular de la Cuenta
                        </label>
                        <select
                          value={regBankAccountHolder}
                          onChange={e => setRegBankAccountHolder(e.target.value)}
                          className="w-full min-h-[42px] sm:min-h-0 px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                        >
                          {BANK_HOLDER_OPTIONS.map(h => (
                            <option key={h} value={h}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Bloque 5: Datos de Cuenta y Área en la Plataforma */}
                {(!showStepByStepReg || regMobileStep === 5) && (
                  <div className="p-4 rounded-xl bg-[#F4F9FF] border border-[#B3D9FF] space-y-3">
                    <h3 className="text-xs font-bold text-[#0B2559] uppercase tracking-wider flex items-center gap-1.5">
                      <i className="fi fi-rr-lock text-xs text-[#3B82F6]" />
                      5. Credenciales y Área en Fundación ULEP
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-[#0B2559] mb-1">
                          Correo Electrónico
                        </label>
                        <input
                          type="email"
                          value={regEmail}
                          onChange={e => setRegEmail(e.target.value)}
                          placeholder="correo@ulep.org"
                          className="w-full min-h-[42px] sm:min-h-0 px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#0B2559] mb-1">
                          Departamento / Área *
                        </label>
                        <select
                          value={regDepartment}
                          onChange={e => setRegDepartment(e.target.value)}
                          className="w-full min-h-[42px] sm:min-h-0 px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                        >
                          {DEPARTMENT_OPTIONS.map(d => (
                            <option key={d} value={d}>
                              {d}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-[#0B2559] mb-1">
                          Contraseña de Acceso *
                        </label>
                        <input
                          type="password"
                          required
                          value={regPassword}
                          onChange={e => setRegPassword(e.target.value)}
                          placeholder="Mínimo 4 caracteres"
                          className="w-full min-h-[42px] sm:min-h-0 px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {regError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium flex items-center gap-2">
                    <i className="fi fi-rr-exclamation text-sm text-rose-600 shrink-0" />
                    <span>{regError}</span>
                  </div>
                )}

                {regSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-medium space-y-1">
                    <div className="flex items-center gap-2 font-bold">
                      <i className="fi fi-rr-check-circle text-sm text-emerald-600 shrink-0" />
                      <span>Registro completo enviado a revisión del Administrador</span>
                    </div>
                    <p>{regSuccess}</p>
                  </div>
                )}

                <div className="space-y-2.5">
                  {showStepByStepReg ? (
                    <div className="flex items-center gap-2">
                      {regMobileStep > 1 && (
                        <button
                          type="button"
                          onClick={() => setRegMobileStep(prev => Math.max(1, prev - 1))}
                          className="min-h-[44px] flex-1 py-2.5 px-4 text-xs font-bold text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl flex items-center justify-center gap-1.5"
                        >
                          <i className="fi fi-rr-arrow-left text-xs" /> Anterior
                        </button>
                      )}
                      {regMobileStep < 5 ? (
                        <button
                          type="button"
                          onClick={() => setRegMobileStep(prev => Math.min(5, prev + 1))}
                          className="min-h-[44px] flex-1 py-2.5 px-4 text-xs font-bold text-white bg-[#0B2559] rounded-xl flex items-center justify-center gap-1.5"
                        >
                          <span>Siguiente Paso ({regMobileStep}/5)</span>
                          <i className="fi fi-rr-arrow-right text-xs" />
                        </button>
                      ) : (
                        <button
                          type="submit"
                          disabled={regSubmitting}
                          className="min-h-[44px] flex-1 py-3 px-4 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-xl hover:bg-[#99CCFF] transition-colors flex items-center justify-center gap-2 shadow-2xs disabled:opacity-50"
                        >
                          <i className="fi fi-rr-user-add text-xs" />
                          {regSubmitting ? 'Enviando...' : 'Enviar Registro Completo'}
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      type="submit"
                      disabled={regSubmitting}
                      className="w-full min-h-[44px] py-3 px-4 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-xl hover:bg-[#99CCFF] transition-colors flex items-center justify-center gap-2 shadow-2xs disabled:opacity-50"
                    >
                      <i className="fi fi-rr-user-add text-xs" />
                      {regSubmitting ? 'Enviando Ficha de Registro...' : 'Enviar Registro Completo para Autorización'}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setAuthMode('login');
                      setRegError(null);
                      setRegSuccess(null);
                    }}
                    className="w-full min-h-[44px] py-2.5 px-4 text-xs font-bold text-[#0B2559] bg-white border border-[#B3D9FF] rounded-xl hover:bg-[#F4F9FF] transition-colors flex items-center justify-center gap-2"
                  >
                    <i className="fi fi-rr-arrow-left text-xs" /> Volver a Iniciar Sesión
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  const pendingApprovalsCount = users.filter(u => u.approvalStatus === 'pendiente').length;

  const expiring24hCount = tasks.filter(t => {
    if (t.status === 'completada' || !t.dueDate) return false;
    const dueMs = new Date(t.dueDate).getTime();
    if (Number.isNaN(dueMs)) return false;
    const diffMs = dueMs - Date.now();
    return diffMs > 0 && diffMs <= 24 * 60 * 60 * 1000;
  }).length;

  const currentMonthPrefix = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const currentMonthEventsCount = calendarEvents.filter(
    ev =>
      !ev.id.startsWith('config_') &&
      !ev.date.startsWith('CONFIG_') &&
      !ev.id.startsWith('ev_sync_') &&
      ev.date.startsWith(currentMonthPrefix)
  ).length;

  // NAVEGACIÓN PRINCIPAL CON PALETA ULEP (#B3D9FF + BLANCO + #0B2559)
  const adminNavItems: {
    id: NavSection;
    label: string;
    iconClass: string;
    badge?: number;
  }[] = [
    {
      id: 'admin_users',
      label: '1. Usuarios y Permisos',
      iconClass: 'fi fi-rr-users-alt',
      badge: users.filter(u => !u.approvalStatus || u.approvalStatus === 'aprobado').length,
    },
    {
      id: 'admin_approvals',
      label: '2. Autorización Registros',
      iconClass: 'fi fi-rr-user-check',
      badge: pendingApprovalsCount,
    },
    {
      id: 'admin_records',
      label: '3. Registros de Tareas',
      iconClass: 'fi fi-rr-folder-open',
      badge: tasks.length,
    },
    {
      id: 'admin_audit',
      label: '4. Auditoría y Reporte PDF',
      iconClass: 'fi fi-rr-shield-check',
      badge: auditLogs.length,
    },
    {
      id: 'admin_backup',
      label: '5. Respaldos de Base de Datos',
      iconClass: 'fi fi-rr-database',
    },
    {
      id: 'admin_resend',
      label: '6. Correos Resend (24h)',
      iconClass: 'fi fi-rr-envelope',
      badge: expiring24hCount,
    },
    {
      id: 'user_calendar',
      label: 'Eventos',
      iconClass: 'fi fi-rr-calendar',
      badge: currentMonthEventsCount,
    },
    {
      id: 'admin_evaluation',
      label: 'Evaluación',
      iconClass: 'fi fi-rr-chart-histogram',
    },
  ];

  const urgentTasksCount = tasks.filter(
    t =>
      t.status !== 'completada' &&
      (t.priority === 'critica' ||
        t.priority === 'alta' ||
        new Date(t.dueDate).getTime() - Date.now() <= 48 * 3600 * 1000)
  ).length;

  const pendingUserTasksCount = tasks.filter(t => t.status !== 'completada').length;
  const userNavItems: {
    id: NavSection;
    label: string;
    iconClass: string;
    badge?: number;
  }[] = [
    {
      id: 'user_personal',
      label: 'Lista de Chequeo',
      iconClass: 'fi fi-rr-checkbox',
      badge: pendingUserTasksCount,
    },
    {
      id: 'user_calendar',
      label: 'Eventos',
      iconClass: 'fi fi-rr-calendar',
      badge: currentMonthEventsCount,
    },
  ];

  const currentNavList = activePanelMode === 'admin' ? adminNavItems : userNavItems;

  return (
    <div className={`relative min-h-screen bg-[#f4f9ff] flex flex-col ${isPcView ? 'lg:flex-row' : ''}`}>
      {renderBlueRibbonsBackground(true)}
      {/* Fondo oscuro cuando el menú lateral está abierto en Teléfono o Tablet */}
      {mobileMenuOpen && !isPcView && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 z-30 bg-[#0B2559]/50 backdrop-blur-xs"
        />
      )}

      {/* Menú Lateral en PC (Fijo) o Gaveta Deslizable en Teléfono/Tablet */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#0B2559] text-white flex flex-col justify-between transition-transform border-r border-[#B3D9FF]/30 ${
          isPcView ? 'lg:static lg:translate-x-0' : ''
        } ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div>
          <div className="px-4 py-3.5 border-b border-[#B3D9FF]/20 flex items-center justify-between">
            <img
              src={`${import.meta.env.BASE_URL}assets/aistudio/FUN_BLANCO_e68e4ad5`}
              alt="Fundación ULEP"
              className="h-9 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
            {!isPcView && (
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="w-8 h-8 rounded-lg bg-white/10 text-white flex items-center justify-center"
              >
                <i className="fi fi-rr-cross-small text-base" />
              </button>
            )}
          </div>

          <nav className="p-3 space-y-1.5">
            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#B3D9FF]">
              {activePanelMode === 'admin' ? 'Módulos de Administración' : 'Espacio Operativo'}
            </div>
            {currentNavList.map(item => {
              const isActive =
                activeSection === item.id ||
                (item.id === 'user_personal' && activeSection === 'user_all_tasks');
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveSection(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full min-h-[42px] flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-[#B3D9FF] text-[#0B2559] font-bold shadow-xs'
                      : 'text-white/90 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-2.5 truncate">
                    <i className={`${item.iconClass} text-sm ${isActive ? 'text-[#0B2559]' : 'text-[#B3D9FF]'}`} />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.badge !== undefined && (
                    <span
                      className={`text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded-md ${
                        isActive
                          ? 'bg-[#0B2559] text-white font-bold'
                          : (item.id === 'admin_approvals' || item.id === 'user_priority_alerts') && item.badge > 0
                          ? 'bg-amber-400 text-[#0B2559] font-bold'
                          : 'bg-[#081C45] text-[#B3D9FF]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Pie del Sidebar con Usuario Conectado */}
        <div className="p-4 border-t border-[#B3D9FF]/20 bg-[#081C45] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-[#B3D9FF] font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              En línea
            </span>
            <span className="text-[10px] font-mono text-[#B3D9FF]/80">C.C. {currentUser.cedula}</span>
          </div>
          <div>
            <div className="text-xs font-bold text-white truncate">{currentUser.name}</div>
            <div className="text-[11px] text-[#B3D9FF]/80 truncate mt-0.5">
              {currentUser.department}
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full min-h-[42px] py-2 px-3 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] hover:bg-white rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <i className="fi fi-rr-sign-out-alt text-xs" /> Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Área Principal con Lienzo Celeste Suave y Blanco (sin z-10 para que las vistas de pantalla completa queden por encima del bloque izquierdo) */}
      <div className={`relative flex-1 flex flex-col min-w-0 ${isMobileView ? 'pb-16' : ''}`}>
        {/* Top Bar Adaptable a Teléfono, Tablet y PC */}
        <header className="bg-white border-b border-[#B3D9FF] px-3 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2 sm:gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className={`${isPcView ? 'lg:hidden' : ''} min-w-[38px] min-h-[38px] p-1.5 text-[#0B2559] hover:bg-[#EAF3FF] rounded-lg border border-[#B3D9FF] flex items-center justify-center`}
              title="Abrir menú completo"
            >
              <i className="fi fi-rr-menu-burger text-sm" />
            </button>
            <div className="flex items-center gap-2 truncate">
              <span className="text-xs sm:text-sm font-bold text-[#0B2559] truncate">
                {activePanelMode === 'admin'
                  ? isMobileView
                    ? 'Panel Admin'
                    : 'Panel de Control y Administración'
                  : isMobileView
                  ? 'Lista de Chequeo'
                  : 'Lista de Chequeo · Fundación ULEP'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {currentUser.role === 'admin' && (
              <div className="flex items-center gap-1 p-1 bg-[#F4F9FF] rounded-xl border border-[#B3D9FF]">
                <button
                  type="button"
                  onClick={() => {
                    setActivePanelMode('admin');
                    setActiveSection('admin_users');
                  }}
                  className={`px-2 sm:px-2.5 py-1 text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
                    activePanelMode === 'admin'
                      ? 'bg-[#0B2559] text-white'
                      : 'text-[#0B2559] hover:bg-[#B3D9FF]/40'
                  }`}
                >
                  {isMobileView ? 'Admin' : 'Panel Admin'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActivePanelMode('user');
                    setActiveSection('user_personal');
                  }}
                  className={`px-2 sm:px-2.5 py-1 text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
                    activePanelMode === 'user'
                      ? 'bg-[#0B2559] text-white'
                      : 'text-[#0B2559] hover:bg-[#B3D9FF]/40'
                  }`}
                >
                  {isMobileView ? 'Usuario' : 'Panel Usuario'}
                </button>
              </div>
            )}

            {!isMobileView && currentUser.role === 'admin' && pendingApprovalsCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setActivePanelMode('admin');
                  setActiveSection('admin_approvals');
                }}
                className="hidden md:inline-flex items-center gap-1.5 text-xs font-bold text-[#0B2559] bg-amber-100 hover:bg-amber-200 px-3 py-1.5 rounded-xl border border-amber-300 transition-colors whitespace-nowrap"
              >
                <i className="fi fi-rr-user-check text-xs" />
                {pendingApprovalsCount} por autorizar
              </button>
            )}

            {!isPcView && (
              <button
                type="button"
                onClick={handleLogout}
                className="min-w-[38px] min-h-[38px] p-1.5 text-[#0B2559] bg-[#F4F9FF] hover:bg-rose-50 hover:text-rose-700 border border-[#B3D9FF] rounded-xl flex items-center justify-center transition-colors"
                title="Cerrar Sesión"
              >
                <i className="fi fi-rr-sign-out-alt text-xs" />
              </button>
            )}
          </div>
        </header>

        {/* En TABLET: Barra Horizontal de Módulos Completa debajo del encabezado */}
        {isTabletView && activePanelMode === 'admin' && currentUser.role === 'admin' && (
          <div className="bg-[#0B2559] text-white px-4 py-2 flex items-center gap-2 overflow-x-auto border-b border-[#B3D9FF]/30">
            {adminNavItems.map(item => {
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors ${
                    isActive
                      ? 'bg-[#B3D9FF] text-[#0B2559]'
                      : 'text-white/90 hover:bg-white/10'
                  }`}
                >
                  <i className={`${item.iconClass} text-xs`} />
                  <span>{item.label}</span>
                  {item.badge !== undefined && (
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.5 rounded-md ${
                        isActive ? 'bg-[#0B2559] text-white' : 'bg-white/15 text-[#B3D9FF]'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Contenido Principal Adaptado a Teléfono, Tablet y PC */}
        <main
          className={`flex-1 p-3 sm:p-6 w-full mx-auto ${
            isMobileView ? 'max-w-lg' : isTabletView ? 'max-w-5xl' : 'max-w-6xl'
          }`}
        >
          {activePanelMode === 'admin' &&
          currentUser.role === 'admin' &&
          activeSection !== 'user_calendar' ? (
            <AdminViews
              activeSection={
                (activeSection.startsWith('admin_') ? activeSection : 'admin_users') as
                  | 'admin_users'
                  | 'admin_approvals'
                  | 'admin_records'
                  | 'admin_audit'
                  | 'admin_backup'
                  | 'admin_resend'
                  | 'admin_evaluation'
              }
              currentUser={currentUser}
              users={users}
              tasks={tasks}
              auditLogs={auditLogs}
              chatMessages={chatMessages}
              calendarEvents={calendarEvents}
              deviceMode={effectiveDevice}
              onOpenNewTask={() => {
                setEditingTask(null);
                setTaskModalOpen(true);
              }}
              onEditTask={t => {
                setEditingTask(t);
                setTaskModalOpen(true);
              }}
            />
          ) : (
            <UserViews
              activeSection={
                (activeSection.startsWith('user_') ? activeSection : 'user_personal') as
                  | 'user_personal'
                  | 'user_all_tasks'
                  | 'user_priority_alerts'
                  | 'user_monthly_reports'
                  | 'user_calendar'
                  | 'user_chat'
              }
              onChangeSection={(sec: NavSection) => setActiveSection(sec)}
              currentUser={currentUser}
              users={users}
              tasks={tasks}
              chatMessages={chatMessages}
              calendarEvents={calendarEvents}
              deviceMode={effectiveDevice}
              onOpenNewTask={() => {
                setEditingTask(null);
                setTaskModalOpen(true);
              }}
              onEditTask={(t: TaskItem) => {
                if (
                  currentUser.role === 'admin' ||
                  currentUser.cedula === SINGLE_ADMIN_CEDULA ||
                  Boolean(currentUser.canEditTasks)
                ) {
                  setEditingTask(t);
                  setTaskModalOpen(true);
                }
              }}
            />
          )}
        </main>

        {/* En TELÉFONO: Barra Inferior Táctil (Bottom Navigation Bar) con todas las opciones a 1 toque */}
        {isMobileView && (
          <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#B3D9FF] px-2 py-1.5 shadow-lg">
            {activePanelMode === 'admin' && currentUser.role === 'admin' ? (
              <div className="grid grid-cols-6 gap-1 max-w-lg mx-auto">
                {([
                  { id: 'admin_users', shortLabel: 'Usuarios', icon: 'fi-rr-users-alt', badge: users.filter(u => !u.approvalStatus || u.approvalStatus === 'aprobado').length },
                  { id: 'admin_approvals', shortLabel: 'Autorizar', icon: 'fi-rr-user-check', badge: pendingApprovalsCount },
                  { id: 'admin_records', shortLabel: 'Tareas', icon: 'fi-rr-folder-open', badge: tasks.length },
                  { id: 'admin_audit', shortLabel: 'Auditoría', icon: 'fi-rr-shield-check', badge: undefined },
                  { id: 'admin_backup', shortLabel: 'Respaldos', icon: 'fi-rr-database', badge: undefined },
                  { id: 'admin_resend', shortLabel: 'Resend 24h', icon: 'fi-rr-envelope', badge: expiring24hCount },
                ] as const).map(tab => {
                  const isActive = activeSection === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveSection(tab.id)}
                      className={`min-h-[46px] rounded-xl flex flex-col items-center justify-center relative transition-colors ${
                        isActive
                          ? 'bg-[#0B2559] text-white font-bold'
                          : 'text-[#0B2559]/75 hover:bg-[#F4F9FF]'
                      }`}
                    >
                      <i className={`fi ${tab.icon} text-sm`} />
                      <span className="text-[10px] mt-0.5 truncate max-w-full px-1">
                        {tab.shortLabel}
                      </span>
                      {tab.badge !== undefined && tab.badge > 0 && (
                        <span
                          className={`absolute top-1 right-2 text-[9px] font-mono px-1 rounded-full ${
                            tab.id === 'admin_approvals'
                              ? 'bg-amber-400 text-[#0B2559] font-bold'
                              : isActive
                              ? 'bg-[#B3D9FF] text-[#0B2559]'
                              : 'bg-[#EAF3FF] text-[#0B2559]'
                          }`}
                        >
                          {tab.badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 max-w-lg mx-auto">
                <button
                  type="button"
                  onClick={() => setActiveSection('user_personal')}
                  className={`min-h-[44px] rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 ${
                    activeSection === 'user_personal'
                      ? 'bg-[#0B2559] text-white'
                      : 'bg-[#F4F9FF] text-[#0B2559] border border-[#B3D9FF]'
                  }`}
                >
                  <i className="fi fi-rr-checkbox text-xs" />
                  <span>Chequeo ({pendingUserTasksCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('user_calendar')}
                  className={`min-h-[44px] rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 ${
                    activeSection === 'user_calendar'
                      ? 'bg-[#0B2559] text-white'
                      : 'bg-[#F4F9FF] text-[#0B2559] border border-[#B3D9FF]'
                  }`}
                >
                  <i className="fi fi-rr-calendar text-xs" />
                  <span>Eventos ({currentMonthEventsCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  className="min-h-[44px] rounded-xl bg-[#F4F9FF] text-[#0B2559] border border-[#B3D9FF] font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <i className="fi fi-rr-menu-burger text-xs" />
                  <span>Menú</span>
                </button>
              </div>
            )}
          </nav>
        )}
      </div>

      <TaskModal
        isOpen={taskModalOpen}
        onClose={() => {
          setTaskModalOpen(false);
          setEditingTask(null);
        }}
        onSave={handleSaveTaskModal}
        initialTask={editingTask}
        users={users}
        currentUser={currentUser}
      />
    </div>
  );
}
