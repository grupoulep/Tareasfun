import React, { useState, useRef, useEffect } from 'react';
import { AppUser, TaskItem, AuditLog, ChatMessage, CalendarEvent } from '../types';
import {
  saveUserToFirestore,
  deleteUserFromFirestore,
  deleteTaskFromFirestore,
  recordAuditLog,
  clearAllAuditLogsFromFirestore,
} from '../firebase';
import {
  generateAuditAndTasksPDF,
  downloadDatabaseBackupJSON,
  downloadDatabaseTemplateJSON,
  restoreDatabaseFromBackupJSON,
  exportUsersPersonalDataToExcel,
  generateEvaluationMetricsPDF,
  exportEvaluationMetricsToExcel,
  generateSingleUserEvaluationPDF,
  exportSingleUserEvaluationToExcel,
  UserEvaluationMetric,
} from '../utils/pdfAndBackup';
import { EditUserModal, TabKey } from './EditUserModal';
import {
  SINGLE_ADMIN_CEDULA,
  ADMIN_MASTER_AUTH_CEDULA,
  COLOMBIAN_CITIES,
  COLOMBIAN_DEPARTMENTS,
  ALL_COLOMBIAN_MUNICIPALITIES_WITH_DEPT,
  getMunicipalitiesByDepartment,
  BANK_OPTIONS,
  FAMILY_COMPOSITION_OPTIONS,
  BANK_HOLDER_OPTIONS,
  DEPARTMENT_OPTIONS,
  BLOOD_TYPES,
  MARITAL_STATUS_OPTIONS,
  RESIDENCE_TYPES,
  STRATUM_OPTIONS,
  BANK_ACCOUNT_TYPES,
} from '../constants';
import { SearchableLocationSelect } from './SearchableLocationSelect';
import { CollapsibleField } from './CollapsibleField';

interface AdminViewsProps {
  activeSection:
    | 'admin_users'
    | 'admin_approvals'
    | 'admin_records'
    | 'admin_audit'
    | 'admin_backup'
    | 'admin_resend'
    | 'admin_evaluation';
  currentUser: AppUser;
  users: AppUser[];
  tasks: TaskItem[];
  auditLogs: AuditLog[];
  chatMessages: ChatMessage[];
  calendarEvents: CalendarEvent[];
  onOpenNewTask: () => void;
  onEditTask: (task: TaskItem) => void;
  deviceMode?: 'mobile' | 'tablet' | 'pc';
}

interface ResendSentRecord {
  recordKey?: string;
  taskId: string;
  taskTitle: string;
  assignedToName: string;
  dueDate: string;
  milestoneHours?: 24 | 12 | 6 | 2;
  recipient: string;
  messageText: string;
  sentAt: string;
  resendId?: string;
  status: 'sent' | 'missing_api_key' | 'error';
  errorDetail?: string;
}

type AdminUsersScreen = 'directory' | 'create' | 'permissions' | 'security';
type CreateUserStepScreen = 'personal' | 'residence' | 'family' | 'bank';
type FichaSubScreen = 'personal' | 'residence' | 'family' | 'bank' | 'all';
type BackupScreen = 'export' | 'import' | 'template';
type ResendScreen = 'expiring_24h' | 'history' | 'recovery_config';

export const AdminViews: React.FC<AdminViewsProps> = ({
  activeSection,
  currentUser,
  users,
  tasks,
  auditLogs,
  chatMessages,
  calendarEvents,
  onOpenNewTask,
  onEditTask,
  deviceMode = 'pc',
}) => {
  const isMobile = deviceMode === 'mobile';

  // Pantallas internas de la sección admin_users
  const [adminUsersScreen, setAdminUsersScreen] = useState<AdminUsersScreen>('directory');
  const [createStepScreen, setCreateStepScreen] = useState<CreateUserStepScreen>('personal');
  const [expandAllCreateFields, setExpandAllCreateFields] = useState<boolean | undefined>(undefined);
  const [userFichaTab, setUserFichaTab] = useState<Record<string, FichaSubScreen>>({});
  const [backupScreen, setBackupScreen] = useState<BackupScreen>('export');

  // Estados de Seguridad Admin Único (902050377)
  const [adminAuthCedula, setAdminAuthCedula] = useState('');
  const [adminOldPassword, setAdminOldPassword] = useState('');
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminPwdError, setAdminPwdError] = useState<string | null>(null);
  const [adminPwdSuccess, setAdminPwdSuccess] = useState<string | null>(null);
  const [adminPwdSaving, setAdminPwdSaving] = useState(false);

  const [expandedUserIds, setExpandedUserIds] = useState<Record<string, boolean>>({});
  const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({});
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});

  // Estados de creación de usuario
  const [cedula, setCedula] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('Operaciones');
  const [cedulaIssueDate, setCedulaIssueDate] = useState('');
  const [cedulaIssuePlace, setCedulaIssuePlace] = useState('Bogotá D.C.');
  const [birthDate, setBirthDate] = useState('');
  const [birthPlace, setBirthPlace] = useState('Bogotá D.C.');
  const [bloodType, setBloodType] = useState('O+');
  const [maritalStatus, setMaritalStatus] = useState('Soltero(a)');
  const [phone, setPhone] = useState('');
  const [locationDepartmentState, setLocationDepartmentState] = useState('Bogotá D.C.');
  const [locationCity, setLocationCity] = useState('Bogotá D.C.');
  const [residenceAddress, setResidenceAddress] = useState('');
  const [residenceType, setResidenceType] = useState('Arrendada');
  const [residenceStratum, setResidenceStratum] = useState('Estrato 3');
  const [familyMembersCount, setFamilyMembersCount] = useState<number>(0);
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [familyNotes, setFamilyNotes] = useState('Cónyuge e hijos menores de edad');
  const [bankName, setBankName] = useState('Bancolombia');
  const [bankAccountType, setBankAccountType] = useState('Cuenta de Ahorros');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankAccountHolder, setBankAccountHolder] = useState('A mi nombre (Mismo titular del colaborador)');
  const [createSuccessMsg, setCreateSuccessMsg] = useState<string | null>(null);

  const [editingCedula, setEditingCedula] = useState<string | null>(null);
  const [editingModalUser, setEditingModalUser] = useState<AppUser | null>(null);
  const [isEditUserModalOpen, setIsEditUserModalOpen] = useState(false);
  const [editModalInitialTab, setEditModalInitialTab] = useState<TabKey>('personal');

  const openEditUserModal = (u: AppUser, tab: TabKey = 'personal') => {
    setEditingModalUser(u);
    setEditModalInitialTab(tab);
    setIsEditUserModalOpen(true);
  };

  const [userSearch, setUserSearch] = useState('');

  const [approvalFilter, setApprovalFilter] = useState<'pendiente' | 'aprobado' | 'rechazado' | 'todos'>('pendiente');
  const [approvalSearch, setApprovalSearch] = useState('');

  const [recordSearch, setRecordSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('todos');
  const [recordStatusScreen, setRecordStatusScreen] = useState<'todos' | 'pendiente' | 'en_progreso' | 'completada'>('todos');

  const [auditSearch, setAuditSearch] = useState('');
  const [auditUserFilter, setAuditUserFilter] = useState<string>('todos');
  const [auditSeverityFilter, setAuditSeverityFilter] = useState<string>('todos');

  // Estados para eliminar todo el registro de auditoría (4 pasos)
  const [isDeleteAuditModalOpen, setIsDeleteAuditModalOpen] = useState(false);
  const [deleteAuditStep, setDeleteAuditStep] = useState<'credentials' | 'code1' | 'code2' | 'confirm_word'>('credentials');
  const [deleteAuditCedula, setDeleteAuditCedula] = useState('');
  const [deleteAuditPassword, setDeleteAuditPassword] = useState('');
  const [deleteAuditCode1, setDeleteAuditCode1] = useState('');
  const [deleteAuditCode2, setDeleteAuditCode2] = useState('');
  const [deleteAuditConfirmWord, setDeleteAuditConfirmWord] = useState('');
  const [deleteAuditError, setDeleteAuditError] = useState<string | null>(null);
  const [deleteAuditLoading, setDeleteAuditLoading] = useState(false);

  const handleOpenDeleteAuditModal = () => {
    setDeleteAuditStep('credentials');
    setDeleteAuditCedula('');
    setDeleteAuditPassword('');
    setDeleteAuditCode1('');
    setDeleteAuditCode2('');
    setDeleteAuditConfirmWord('');
    setDeleteAuditError(null);
    setDeleteAuditLoading(false);
    setIsDeleteAuditModalOpen(true);
  };

  const handleCloseDeleteAuditModal = () => {
    if (deleteAuditLoading) return;
    setIsDeleteAuditModalOpen(false);
    setDeleteAuditError(null);
  };

  const handleDeleteAuditStep1Credentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteAuditError(null);

    const enteredCed = deleteAuditCedula.trim();
    const enteredPass = deleteAuditPassword.trim();

    if (!enteredCed || !enteredPass) {
      setDeleteAuditError('Por favor ingresa tu número de cédula y contraseña.');
      return;
    }

    const adminUser =
      users.find(u => u.cedula === SINGLE_ADMIN_CEDULA || u.role === 'admin') || currentUser;
    const isValidCedula =
      enteredCed === currentUser.cedula ||
      enteredCed === SINGLE_ADMIN_CEDULA ||
      enteredCed === ADMIN_MASTER_AUTH_CEDULA;
    const isValidPassword =
      enteredPass === currentUser.password ||
      enteredPass === adminUser.password;

    if (!isValidCedula || !isValidPassword) {
      setDeleteAuditError('La cédula o la contraseña ingresadas son incorrectas.');
      return;
    }

    setDeleteAuditLoading(true);
    try {
      const resp = await fetch('/api/resend/audit-delete/send-code-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await resp.json();
      if (!resp.ok || !data?.ok) {
        setDeleteAuditError(data?.error || 'No se pudo enviar el primer código a fundacionulep@gmail.com.');
        setDeleteAuditLoading(false);
        return;
      }
      setDeleteAuditStep('code1');
    } catch {
      setDeleteAuditError('Error de conexión al enviar el código a fundacionulep@gmail.com.');
    } finally {
      setDeleteAuditLoading(false);
    }
  };

  const handleDeleteAuditStep2VerifyCode1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteAuditError(null);

    const trimmedCode1 = deleteAuditCode1.trim();
    if (!trimmedCode1) {
      setDeleteAuditError('Ingresa el código enviado a fundacionulep@gmail.com.');
      return;
    }

    setDeleteAuditLoading(true);
    try {
      const resp = await fetch('/api/resend/audit-delete/verify-code-1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmedCode1 }),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.valid) {
        setDeleteAuditError(data?.error || 'El código ingresado para fundacionulep@gmail.com no es válido.');
        setDeleteAuditLoading(false);
        return;
      }
      setDeleteAuditStep('code2');
    } catch {
      setDeleteAuditError('Error de conexión al verificar el código de fundacionulep@gmail.com.');
    } finally {
      setDeleteAuditLoading(false);
    }
  };

  const handleDeleteAuditStep3VerifyCode2 = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteAuditError(null);

    const trimmedCode2 = deleteAuditCode2.trim();
    if (!trimmedCode2) {
      setDeleteAuditError('Ingresa el código enviado a jslopezren@gmail.com.');
      return;
    }

    setDeleteAuditLoading(true);
    try {
      const resp = await fetch('/api/resend/audit-delete/verify-code-2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: trimmedCode2 }),
      });
      const data = await resp.json();
      if (!resp.ok || !data?.valid) {
        setDeleteAuditError(data?.error || 'El código ingresado para jslopezren@gmail.com no coincide exactamente.');
        setDeleteAuditLoading(false);
        return;
      }
      setDeleteAuditStep('confirm_word');
    } catch {
      setDeleteAuditError('Error de conexión al verificar el código de jslopezren@gmail.com.');
    } finally {
      setDeleteAuditLoading(false);
    }
  };

  const handleDeleteAuditStep4Execute = async (e: React.FormEvent) => {
    e.preventDefault();
    setDeleteAuditError(null);

    if (deleteAuditConfirmWord.trim().toLowerCase() !== 'eliminar') {
      setDeleteAuditError('Debes escribir exactamente la palabra "eliminar" para confirmar.');
      return;
    }

    setDeleteAuditLoading(true);
    try {
      await clearAllAuditLogsFromFirestore(auditLogs);
      setIsDeleteAuditModalOpen(false);
    } catch {
      setDeleteAuditError('Ocurrió un error al eliminar los registros de auditoría.');
    } finally {
      setDeleteAuditLoading(false);
    }
  };

  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Estados para la sección "Evaluación" (Productividad, Tiempos de Entrada, Interés, 360°, Innovación, Bienestar y Desempeño)
  const [evalDepartmentFilter, setEvalDepartmentFilter] = useState<string>('todos');
  const [evalSearchFilter, setEvalSearchFilter] = useState<string>('');
  const [evalSelectedUserCedula, setEvalSelectedUserCedula] = useState<string>('todos');
  const [evalLevelFilter, setEvalLevelFilter] = useState<string>('todos');
  const [evalPeriodDate, setEvalPeriodDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [evalActiveCategory, setEvalActiveCategory] = useState<
    'todos' | 'productividad' | 'tiempos' | 'interes' | 'competencias_360' | 'innovacion' | 'bienestar'
  >('todos');
  const [expandedEvalBlocks, setExpandedEvalBlocks] = useState<Record<string, boolean>>({});
  const [expandedEvalUserRows, setExpandedEvalUserRows] = useState<Record<string, boolean>>({});

  const toggleEvalBlock = (key: string) => {
    setExpandedEvalBlocks(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleEvalUserRow = (ced: string) => {
    setExpandedEvalUserRows(prev => ({ ...prev, [ced]: !prev[ced] }));
  };

  interface CustomEvalUserPatch {
    entryTime?: string;
    exitTime?: string;
    interestBonus?: number;
    punctualityOverride?: number;
    attendanceOverride?: number;
    teamworkOverride?: number;
    leadershipOverride?: number;
    innovationOverride?: number;
    communicationOverride?: number;
    serviceQualityOverride?: number;
    wellbeingOverride?: number;
    evaluationDate?: string;
    strengthsNote?: string;
    improvementPlan?: string;
  }

  const [evalCustomScores, setEvalCustomScores] = useState<Record<string, CustomEvalUserPatch>>(() => {
    try {
      const saved = localStorage.getItem('ulep_evaluation_custom_metrics_v1');
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return {};
  });

  const handleUpdateEvalCustomMetric = (targetCedula: string, patch: CustomEvalUserPatch) => {
    setEvalCustomScores(prev => {
      const next = {
        ...prev,
        [targetCedula]: {
          ...(prev[targetCedula] || {}),
          ...patch,
        },
      };
      try {
        localStorage.setItem('ulep_evaluation_custom_metrics_v1', JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Estados exclusivos del Panel Admin para el módulo de correos automáticos Resend (24h, 12h, 6h y 2h) y edición de correos de recuperación por usuario
  const [resendScreen, setResendScreen] = useState<ResendScreen>('expiring_24h');
  const [resendHistory, setResendHistory] = useState<ResendSentRecord[]>([]);
  const [userRecoveryEmails, setUserRecoveryEmails] = useState<Record<string, string>>({});
  const [recoveryConfigSavedMsg, setRecoveryConfigSavedMsg] = useState<string | null>(null);
  const [recoverySecurityStates, setRecoverySecurityStates] = useState<
    Record<string, { cedula: string; sendAttempts: number; verifyAttempts: number; locked: boolean; lockedAt?: string }>
  >(() => {
    try {
      const raw = localStorage.getItem('ulep_recovery_security_state_v1');
      if (raw) return JSON.parse(raw);
    } catch {
      // ignore
    }
    return {};
  });

  const isUserLockedBySecurity = (u: AppUser): boolean => {
    return Boolean(recoverySecurityStates[u.cedula]?.locked) || u.approvalStatus === 'rechazado';
  };

  const handleUnlockUserAccountAndEmails = async (targetUser: AppUser) => {
    try {
      const resp = await fetch('/api/resend/unlock-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cedula: targetUser.cedula }),
      });
      const data = await resp.json();
      if (data?.securityStates && typeof data.securityStates === 'object') {
        setRecoverySecurityStates(data.securityStates);
        localStorage.setItem('ulep_recovery_security_state_v1', JSON.stringify(data.securityStates));
      } else {
        setRecoverySecurityStates(prev => {
          const next = {
            ...prev,
            [targetUser.cedula]: {
              cedula: targetUser.cedula,
              sendAttempts: 0,
              verifyAttempts: 0,
              locked: false,
            },
          };
          localStorage.setItem('ulep_recovery_security_state_v1', JSON.stringify(next));
          return next;
        });
      }
    } catch {
      setRecoverySecurityStates(prev => {
        const next = {
          ...prev,
          [targetUser.cedula]: {
            cedula: targetUser.cedula,
            sendAttempts: 0,
            verifyAttempts: 0,
            locked: false,
          },
        };
        localStorage.setItem('ulep_recovery_security_state_v1', JSON.stringify(next));
        return next;
      });
    }

    await saveUserToFirestore({
      ...targetUser,
      approvalStatus: 'aprobado',
    });

    await recordAuditLog({
      actorCedula: currentUser.cedula,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionType: 'DESBLOQUEO_ADMIN_CUENTA_Y_CORREO',
      module: 'SEGURIDAD_USUARIOS',
      description: `El administrador desbloqueó la cuenta y el envío de correos de ${targetUser.name} (C.C. ${targetUser.cedula}).`,
      targetId: targetUser.cedula,
      severity: 'info',
    });

    setRecoveryConfigSavedMsg(`Cuenta y envío de correos desbloqueados para ${targetUser.name}.`);
    setTimeout(() => setRecoveryConfigSavedMsg(null), 3500);
  };

  const handleSaveUserRecoveryEmail = async (targetUser: AppUser) => {
    const draftEmail = (
      userRecoveryEmails[targetUser.cedula] !== undefined
        ? userRecoveryEmails[targetUser.cedula]
        : targetUser.email || ''
    ).trim();
    if (!draftEmail || !draftEmail.includes('@')) return;

    await saveUserToFirestore({
      ...targetUser,
      email: draftEmail,
    });

    await recordAuditLog({
      actorCedula: currentUser.cedula,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionType: 'ACTUALIZAR_CORREO_RECUPERACION',
      module: 'SEGURIDAD_USUARIOS',
      description: `Actualizó el correo de recuperación de ${targetUser.name} (C.C. ${targetUser.cedula}) a ${draftEmail}.`,
      targetId: targetUser.cedula,
      severity: 'info',
    });

    setRecoveryConfigSavedMsg(`Correo de ${targetUser.name} actualizado a: ${draftEmail}`);
    setTimeout(() => setRecoveryConfigSavedMsg(null), 3500);
  };

  useEffect(() => {
    fetch('/api/resend/recovery-config')
      .then(r => r.json())
      .then(data => {
        if (data?.securityStates && typeof data.securityStates === 'object') {
          setRecoverySecurityStates(prev => {
            const merged = { ...prev, ...data.securityStates };
            localStorage.setItem('ulep_recovery_security_state_v1', JSON.stringify(merged));
            return merged;
          });
        }
      })
      .catch(() => {
        // Silencioso
      });
  }, [activeSection]);

  useEffect(() => {
    if (activeSection !== 'admin_resend') return;
    fetch('/api/resend/check-and-notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tasks }),
    })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data?.sentHistory)) {
          setResendHistory(data.sentHistory);
        }
      })
      .catch(() => {
        // Silencioso
      });
  }, [activeSection, tasks]);

  const toggleUserExpand = (id: string) => {
    setExpandedUserIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleTaskExpand = (id: string) => {
    setExpandedTaskIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleLogExpand = (id: string) => {
    setExpandedLogIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const resetUserForm = () => {
    setCedula('');
    setName('');
    setPassword('');
    setRole('user');
    setEmail('');
    setDepartment('Operaciones');
    setCedulaIssueDate('');
    setCedulaIssuePlace('Bogotá D.C.');
    setBirthDate('');
    setBirthPlace('Bogotá D.C.');
    setBloodType('O+');
    setMaritalStatus('Soltero(a)');
    setPhone('');
    setLocationDepartmentState('Bogotá D.C.');
    setLocationCity('Bogotá D.C.');
    setResidenceAddress('');
    setResidenceType('Arrendada');
    setResidenceStratum('Estrato 3');
    setFamilyMembersCount(0);
    setEmergencyContactName('');
    setEmergencyContactPhone('');
    setFamilyNotes('Cónyuge e hijos menores de edad');
    setBankName('Bancolombia');
    setBankAccountType('Cuenta de Ahorros');
    setBankAccountNumber('');
    setBankAccountHolder('A mi nombre (Mismo titular del colaborador)');
    setEditingCedula(null);
    setCreateStepScreen('personal');
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cedula.trim() || !name.trim() || !password.trim()) {
      setCreateStepScreen('personal');
      return;
    }

    const cleanCed = cedula.trim();
    const existing = users.find(u => u.cedula === cleanCed);

    if (cleanCed === SINGLE_ADMIN_CEDULA && existing) {
      openEditUserModal(existing, 'personal');
      return;
    }

    const isSingleAdmin = cleanCed === SINGLE_ADMIN_CEDULA;
    const enforcedRole: 'admin' | 'user' = isSingleAdmin ? 'admin' : 'user';

    const newUser: AppUser = {
      cedula: cleanCed,
      name: name.trim(),
      password: existing && isSingleAdmin ? existing.password : password.trim(),
      role: enforcedRole,
      email: email.trim() || `${cleanCed}@fundacionulep.org`,
      department: department.trim() || 'Operaciones',
      approvalStatus: existing?.approvalStatus || 'aprobado',
      isOnline: existing ? existing.isOnline : false,
      lastSeen: existing ? existing.lastSeen : new Date().toISOString(),
      canCreateTasks: existing ? existing.canCreateTasks : true,
      canEditTasks: existing ? Boolean(existing.canEditTasks) : isSingleAdmin,
      canDeleteTasks: existing ? existing.canDeleteTasks : isSingleAdmin,
      canCompleteTasks: existing ? Boolean(existing.canCompleteTasks) : isSingleAdmin,
      canSendChat: existing ? existing.canSendChat : true,
      canViewVault: existing ? existing.canViewVault : true,
      canExportReports: existing ? existing.canExportReports : true,
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
      cedulaIssueDate: cedulaIssueDate.trim(),
      cedulaIssuePlace: cedulaIssuePlace.trim(),
      birthDate: birthDate.trim(),
      birthPlace: birthPlace.trim(),
      bloodType: bloodType.trim(),
      maritalStatus: maritalStatus.trim(),
      phone: phone.trim(),
      locationDepartmentState: locationDepartmentState.trim(),
      locationCity: locationCity.trim(),
      residenceAddress: residenceAddress.trim(),
      residenceType: residenceType.trim(),
      residenceStratum: residenceStratum.trim(),
      familyMembersCount: Number(familyMembersCount) || 0,
      emergencyContactName: emergencyContactName.trim(),
      emergencyContactPhone: emergencyContactPhone.trim(),
      familyNotes: familyNotes.trim(),
      bankName: bankName.trim(),
      bankAccountType: bankAccountType.trim(),
      bankAccountNumber: bankAccountNumber.trim(),
      bankAccountHolder: bankAccountHolder.trim() || name.trim(),
    };

    await saveUserToFirestore(newUser);
    await recordAuditLog({
      actorCedula: currentUser.cedula,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionType: editingCedula ? 'ACTUALIZAR_USUARIO' : 'CREAR_USUARIO',
      module: 'USUARIOS_Y_PERMISOS',
      description: `${editingCedula ? 'Actualizó' : 'Creó'} el usuario ${newUser.name} con Cédula ${newUser.cedula} y rol ${newUser.role.toUpperCase()}.`,
      targetId: newUser.cedula,
      severity: 'info',
    });

    setCreateSuccessMsg(`¡Usuario ${newUser.name} (C.C. ${newUser.cedula}) guardado con éxito!`);
    resetUserForm();
    setTimeout(() => {
      setCreateSuccessMsg(null);
      setAdminUsersScreen('directory');
    }, 1200);
  };

  const handleSelectEditUser = (u: AppUser) => {
    openEditUserModal(u, 'personal');
  };

  const renderEditUserModal = () => (
    <EditUserModal
      user={editingModalUser}
      isOpen={isEditUserModalOpen}
      initialTab={editModalInitialTab}
      onClose={() => setIsEditUserModalOpen(false)}
      currentUser={currentUser}
      onSaveSuccess={updated => {
        setEditingModalUser(updated);
      }}
    />
  );

  const handleExportUsersExcel = async (targetUsers: AppUser[], customFileName?: string) => {
    exportUsersPersonalDataToExcel({
      users: targetUsers,
      exportedBy: currentUser,
      customFileName,
    });
    await recordAuditLog({
      actorCedula: currentUser.cedula,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionType: 'EXPORTAR_EXCEL_DATOS_PERSONALES',
      module: 'DATOS_PERSONALES_ADMIN',
      description: `Exportó en formato Excel (.xls) la base confidencial de datos personales, ubicación, familiares y bancarios (${targetUsers.length} registro(s)).`,
      severity: 'info',
    });
  };

  const renderConfidentialPersonalDataFicha = (u: AppUser) => {
    const activeSubScreen: FichaSubScreen = userFichaTab[u.cedula] || 'personal';
    const setSubScreen = (screen: FichaSubScreen) =>
      setUserFichaTab(prev => ({ ...prev, [u.cedula]: screen }));

    return (
      <div className="bg-white border border-[#B3D9FF] rounded-xl p-3.5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#D6EAFF]">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-lg bg-[#0B2559] text-white flex items-center justify-center shrink-0">
              <i className="fi fi-rr-shield-check text-xs" />
            </span>
            <div>
              <div className="text-xs font-extrabold text-[#0B2559]">
                Ficha Confidencial Organizada por Pantallas (Solo Admin)
              </div>
              <div className="text-[11px] text-[#3B82F6]">
                Selecciona la pantalla de datos que deseas consultar o editar.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openEditUserModal(u)}
              className="px-3 py-1.5 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] hover:bg-[#99CCFF] rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <i className="fi fi-rr-edit text-xs" /> Editar Ficha
            </button>
            <button
              type="button"
              onClick={() =>
                handleExportUsersExcel(
                  [u],
                  `ficha_personal_${u.cedula}_${u.name.replace(/\s+/g, '_').toLowerCase()}.xls`
                )
              }
              className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <i className="fi fi-rr-file-excel text-xs" /> Excel (.XLS)
            </button>
          </div>
        </div>

        {/* Selector de sub-pantallas de la Ficha Confidencial */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-[#F4F9FF] rounded-xl border border-[#D6EAFF]">
          {[
            { id: 'personal' as const, label: '1. Cédula y Personales', icon: 'fi-rr-id-badge' },
            { id: 'residence' as const, label: '2. Ubicación y Residencia', icon: 'fi-rr-marker' },
            { id: 'family' as const, label: '3. Núcleo Familiar', icon: 'fi-rr-users' },
            { id: 'bank' as const, label: '4. Datos Bancarios', icon: 'fi-rr-bank' },
            { id: 'all' as const, label: 'Ver Las 4 Pantallas', icon: 'fi-rr-apps' },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubScreen(tab.id)}
              className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold flex items-center gap-1.5 transition-all ${
                activeSubScreen === tab.id
                  ? 'bg-[#0B2559] text-white shadow-2xs'
                  : 'text-[#0B2559] hover:bg-[#B3D9FF]/50'
              }`}
            >
              <i className={`fi ${tab.icon} text-[11px]`} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div
          className={`grid grid-cols-1 ${
            activeSubScreen === 'all' ? 'md:grid-cols-2 xl:grid-cols-4' : 'md:grid-cols-2'
          } gap-2.5 text-xs`}
        >
          {(activeSubScreen === 'personal' || activeSubScreen === 'all') && (
            <div className="p-3 rounded-xl bg-[#F4F9FF] border border-[#D6EAFF] space-y-1.5 md:col-span-2 xl:col-span-1">
              <div className="font-extrabold text-[#0B2559] uppercase tracking-wider text-[10px] flex items-center justify-between pb-1 border-b border-[#D6EAFF]">
                <span className="flex items-center gap-1.5">
                  <i className="fi fi-rr-id-badge text-[#3B82F6]" /> 1. Datos de Cédula y Personales
                </span>
                <button
                  type="button"
                  onClick={() => openEditUserModal(u, 'personal')}
                  className="text-[10px] text-[#3B82F6] hover:underline font-bold"
                >
                  Editar
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                <div>
                  <span className="text-[#3B82F6]">N° Cédula: </span>
                  <strong className="font-mono text-[#0B2559]">{u.cedula}</strong>
                </div>
                <div>
                  <span className="text-[#3B82F6]">Celular / WhatsApp: </span>
                  <strong className="font-mono text-[#0B2559]">{u.phone || 'No registrado'}</strong>
                </div>
                <div>
                  <span className="text-[#3B82F6]">Expedición: </span>
                  <strong className="text-[#0B2559]">
                    {u.cedulaIssuePlace || 'No reg.'} {u.cedulaIssueDate ? `(${u.cedulaIssueDate})` : ''}
                  </strong>
                </div>
                <div>
                  <span className="text-[#3B82F6]">Nacimiento: </span>
                  <strong className="text-[#0B2559]">
                    {u.birthDate || 'No reg.'} {u.birthPlace ? `· ${u.birthPlace}` : ''}
                  </strong>
                </div>
                <div>
                  <span className="text-[#3B82F6]">RH / Est. Civil: </span>
                  <strong className="text-[#0B2559]">
                    {u.bloodType || 'N/A'} · {u.maritalStatus || 'N/A'}
                  </strong>
                </div>
                <div className="truncate" title={u.email}>
                  <span className="text-[#3B82F6]">Correo: </span>
                  <strong className="text-[#0B2559]">{u.email || 'No registrado'}</strong>
                </div>
              </div>
            </div>
          )}

          {(activeSubScreen === 'residence' || activeSubScreen === 'all') && (
            <div className="p-3 rounded-xl bg-[#F4F9FF] border border-[#D6EAFF] space-y-1.5 md:col-span-2 xl:col-span-1">
              <div className="font-extrabold text-[#0B2559] uppercase tracking-wider text-[10px] flex items-center justify-between pb-1 border-b border-[#D6EAFF]">
                <span className="flex items-center gap-1.5">
                  <i className="fi fi-rr-marker text-[#3B82F6]" /> 2. Ubicación y Residencia
                </span>
                <button
                  type="button"
                  onClick={() => openEditUserModal(u, 'residence')}
                  className="text-[10px] text-[#3B82F6] hover:underline font-bold"
                >
                  Editar
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                <div>
                  <span className="text-[#3B82F6]">Departamento: </span>
                  <strong className="text-[#0B2559]">{u.locationDepartmentState || 'No registrado'}</strong>
                </div>
                <div>
                  <span className="text-[#3B82F6]">Ciudad / Municipio: </span>
                  <strong className="text-[#0B2559]">{u.locationCity || 'No registrado'}</strong>
                </div>
                <div className="sm:col-span-2">
                  <span className="text-[#3B82F6]">Dirección Residencia: </span>
                  <strong className="text-[#0B2559]">{u.residenceAddress || 'No registrada'}</strong>
                </div>
                <div>
                  <span className="text-[#3B82F6]">Vivienda: </span>
                  <strong className="text-[#0B2559]">{u.residenceType || 'N/A'}</strong>
                </div>
                <div>
                  <span className="text-[#3B82F6]">Estrato: </span>
                  <strong className="text-[#0B2559]">{u.residenceStratum || 'N/A'}</strong>
                </div>
              </div>
            </div>
          )}

          {(activeSubScreen === 'family' || activeSubScreen === 'all') && (
            <div className="p-3 rounded-xl bg-[#F4F9FF] border border-[#D6EAFF] space-y-1.5 md:col-span-2 xl:col-span-1">
              <div className="font-extrabold text-[#0B2559] uppercase tracking-wider text-[10px] flex items-center justify-between pb-1 border-b border-[#D6EAFF]">
                <span className="flex items-center gap-1.5">
                  <i className="fi fi-rr-users text-[#3B82F6]" /> 3. Núcleo Familiar
                </span>
                <button
                  type="button"
                  onClick={() => openEditUserModal(u, 'family')}
                  className="text-[10px] text-[#3B82F6] hover:underline font-bold"
                >
                  Editar
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                <div>
                  <span className="text-[#3B82F6]">N° Familiares: </span>
                  <strong className="font-mono text-[#0B2559]">
                    {typeof u.familyMembersCount === 'number' ? u.familyMembersCount : 0}
                  </strong>
                </div>
                <div>
                  <span className="text-[#3B82F6]">Contacto Emergencia: </span>
                  <strong className="text-[#0B2559]">{u.emergencyContactName || 'No registrado'}</strong>
                </div>
                <div>
                  <span className="text-[#3B82F6]">Tel. Emergencia: </span>
                  <strong className="font-mono text-[#0B2559]">{u.emergencyContactPhone || 'No registrado'}</strong>
                </div>
                <div>
                  <span className="text-[#3B82F6]">Detalle Familiar: </span>
                  <strong className="text-[#0B2559]">{u.familyNotes || 'Sin observaciones'}</strong>
                </div>
              </div>
            </div>
          )}

          {(activeSubScreen === 'bank' || activeSubScreen === 'all') && (
            <div className="p-3 rounded-xl bg-[#F4F9FF] border border-[#D6EAFF] space-y-1.5 md:col-span-2 xl:col-span-1">
              <div className="font-extrabold text-[#0B2559] uppercase tracking-wider text-[10px] flex items-center justify-between pb-1 border-b border-[#D6EAFF]">
                <span className="flex items-center gap-1.5">
                  <i className="fi fi-rr-bank text-[#3B82F6]" /> 4. Datos Bancarios (Pagos)
                </span>
                <button
                  type="button"
                  onClick={() => openEditUserModal(u, 'bank')}
                  className="text-[10px] text-[#3B82F6] hover:underline font-bold"
                >
                  Editar
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                <div>
                  <span className="text-[#3B82F6]">Banco / Billetera: </span>
                  <strong className="text-[#0B2559]">{u.bankName || 'No aplica / Sin cuenta'}</strong>
                </div>
                <div>
                  <span className="text-[#3B82F6]">Tipo de Cuenta: </span>
                  <strong className="text-[#0B2559]">{u.bankAccountType || 'N/A'}</strong>
                </div>
                <div>
                  <span className="text-[#3B82F6]">Número Cuenta / Llave: </span>
                  <strong className="font-mono text-[#0B2559]">{u.bankAccountNumber || 'No registrado'}</strong>
                </div>
                <div>
                  <span className="text-[#3B82F6]">Titular: </span>
                  <strong className="text-[#0B2559]">{u.bankAccountHolder || u.name}</strong>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const handleTogglePermission = async (
    targetUser: AppUser,
    permKey:
      | 'canCreateTasks'
      | 'canEditTasks'
      | 'canDeleteTasks'
      | 'canCompleteTasks'
      | 'canCreateEvents'
      | 'canSendChat'
      | 'canViewVault'
      | 'canExportReports',
    permLabel: string
  ) => {
    if (targetUser.cedula === SINGLE_ADMIN_CEDULA) return;
    const newValue = !targetUser[permKey];
    const updated: AppUser = {
      ...targetUser,
      [permKey]: newValue,
    };
    await saveUserToFirestore(updated);
    await recordAuditLog({
      actorCedula: currentUser.cedula,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionType: newValue ? 'PERMITIR_ACCION_USUARIO' : 'QUITAR_PERMISO_USUARIO',
      module: 'MATRIZ_PERMISOS',
      description: `${newValue ? 'HABILITÓ' : 'REVOCÓ'} permiso [${permLabel}] al usuario ${targetUser.name} (Cédula: ${targetUser.cedula}).`,
      targetId: targetUser.cedula,
      severity: newValue ? 'info' : 'warning',
    });
  };

  const handleDeleteUser = async (target: AppUser) => {
    if (target.cedula === SINGLE_ADMIN_CEDULA || target.cedula === currentUser.cedula) return;
    await deleteUserFromFirestore(target.cedula);
    await recordAuditLog({
      actorCedula: currentUser.cedula,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionType: 'ELIMINAR_USUARIO',
      module: 'USUARIOS_Y_PERMISOS',
      description: `Eliminó la cuenta del usuario ${target.name} (Cédula: ${target.cedula}).`,
      targetId: target.cedula,
      severity: 'critical',
    });
  };

  const handleSetUserApprovalStatus = async (
    targetUser: AppUser,
    status: 'aprobado' | 'rechazado' | 'pendiente',
    assignedRole?: 'admin' | 'user'
  ) => {
    if (targetUser.cedula === SINGLE_ADMIN_CEDULA) return;
    void assignedRole;
    const updated: AppUser = {
      ...targetUser,
      approvalStatus: status,
      role: 'user',
    };
    await saveUserToFirestore(updated);
    await recordAuditLog({
      actorCedula: currentUser.cedula,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionType:
        status === 'aprobado'
          ? 'AUTORIZAR_REGISTRO_USUARIO'
          : status === 'rechazado'
          ? 'RECHAZAR_REGISTRO_USUARIO'
          : 'MARCAR_PENDIENTE_REGISTRO',
      module: 'AUTORIZACION_REGISTROS',
      description: `${
        status === 'aprobado'
          ? 'AUTORIZÓ el registro'
          : status === 'rechazado'
          ? 'RECHAZÓ la solicitud de registro'
          : 'Cambió a PENDIENTE el registro'
      } del usuario ${targetUser.name} (Cédula: ${targetUser.cedula}, Rol: ${updated.role.toUpperCase()}).`,
      targetId: targetUser.cedula,
      severity: status === 'rechazado' ? 'warning' : 'info',
    });
  };

  const handleDeleteTaskRecord = async (task: TaskItem) => {
    await deleteTaskFromFirestore(task.id);
    await recordAuditLog({
      actorCedula: currentUser.cedula,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionType: 'ELIMINAR_REGISTRO_TAREA',
      module: 'GESTION_REGISTROS',
      description: `Eliminó la tarea "${task.title}" asignada a ${task.assignedToName} (${task.assignedToCedula}).`,
      targetId: task.id,
      severity: 'warning',
    });
  };

  const handleExportAuditPDF = async () => {
    generateAuditAndTasksPDF({
      generatedBy: currentUser,
      users,
      tasks,
      auditLogs,
    });
    await recordAuditLog({
      actorCedula: currentUser.cedula,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionType: 'GENERAR_REPORTE_PDF',
      module: 'AUDITORIA_PDF',
      description: `Generó y descargó reporte ejecutivo automático en formato PDF con ${tasks.length} tareas y ${auditLogs.length} eventos de auditoría.`,
      severity: 'info',
    });
  };

  const handleDownloadBackup = async () => {
    downloadDatabaseBackupJSON({
      actor: currentUser,
      users,
      tasks,
      auditLogs,
      chatMessages,
      calendarEvents,
    });
    await recordAuditLog({
      actorCedula: currentUser.cedula,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionType: 'DESCARGAR_RESPALDO_BD',
      module: 'BASE_DE_DATOS',
      description: `Descargó respaldo completo JSON de la base de datos desde el panel principal.`,
      severity: 'info',
    });
  };

  const handleDownloadTemplate = async () => {
    downloadDatabaseTemplateJSON();
    await recordAuditLog({
      actorCedula: currentUser.cedula,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionType: 'DESCARGAR_PLANTILLA_BD',
      module: 'BASE_DE_DATOS',
      description: `Descargó la plantilla oficial de estructura de base de datos JSON.`,
      severity: 'info',
    });
  };

  const handleFileUploadBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const res = await restoreDatabaseFromBackupJSON(text, currentUser);
      setImportStatus(
        `Respaldo cargado con éxito: ${res.usersImported} usuarios, ${res.tasksImported} tareas y ${res.eventsImported} eventos restaurados en Firebase.`
      );
    } catch (err) {
      setImportStatus(`Error al procesar el archivo JSON: ${err instanceof Error ? err.message : 'Formato inválido'}`);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleAdminPasswordPanelSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminPwdError(null);
    setAdminPwdSuccess(null);

    const adminAccount = users.find(u => u.cedula === SINGLE_ADMIN_CEDULA) || currentUser;

    if (adminAuthCedula.trim() !== ADMIN_MASTER_AUTH_CEDULA) {
      setAdminPwdError('El número de cédula de autorización ingresado no es válido.');
      return;
    }

    if (adminOldPassword !== adminAccount.password) {
      setAdminPwdError('La contraseña anterior del Administrador no coincide.');
      return;
    }

    if (adminNewPassword.trim().length < 4) {
      setAdminPwdError('La nueva contraseña debe tener al menos 4 caracteres.');
      return;
    }

    setAdminPwdSaving(true);
    try {
      const updatedAdmin: AppUser = {
        ...adminAccount,
        password: adminNewPassword.trim(),
        role: 'admin',
        approvalStatus: 'aprobado',
      };
      await saveUserToFirestore(updatedAdmin);
      await recordAuditLog({
        actorCedula: currentUser.cedula,
        actorName: currentUser.name,
        actorRole: 'admin',
        actionType: 'CAMBIO_CLAVE_ADMIN_AUTORIZADO',
        module: 'SEGURIDAD_ADMIN',
        description: `Actualizó la contraseña del Administrador Único (${SINGLE_ADMIN_CEDULA}) desde el Panel Admin verificando cédula de autorización y contraseña anterior.`,
        targetId: SINGLE_ADMIN_CEDULA,
        severity: 'warning',
      });
      setAdminPwdSuccess('¡Contraseña del Administrador actualizada correctamente!');
      setAdminAuthCedula('');
      setAdminOldPassword('');
      setAdminNewPassword('');
    } finally {
      setAdminPwdSaving(false);
    }
  };

  const permButtons: {
    key:
      | 'canCreateTasks'
      | 'canEditTasks'
      | 'canCompleteTasks'
      | 'canDeleteTasks'
      | 'canCreateEvents'
      | 'canSendChat'
      | 'canViewVault'
      | 'canExportReports';
    label: string;
  }[] = [
    { key: 'canCreateTasks', label: 'Crear Tareas' },
    { key: 'canEditTasks', label: 'Editar Actividades' },
    { key: 'canCompleteTasks', label: 'Marcar Tarea Hecha' },
    { key: 'canDeleteTasks', label: 'Eliminar Tareas' },
    { key: 'canCreateEvents', label: 'Agregar Eventos' },
    { key: 'canSendChat', label: 'Enviar Chat' },
    { key: 'canViewVault', label: 'Ver Claves/Links' },
    { key: 'canExportReports', label: 'Exportar PDF' },
  ];

  // ============================================================================
  // 1. SECCIÓN: USUARIOS, CREACIÓN, PERMISOS Y SEGURIDAD (ORGANIZADA EN 4 PANTALLAS)
  // ============================================================================
  if (activeSection === 'admin_users') {
    const filteredUsers = users.filter(
      u =>
        u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.cedula.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.department.toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.locationCity || '').toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.bankName || '').toLowerCase().includes(userSearch.toLowerCase())
    );

    const adminSubScreens: { id: AdminUsersScreen; label: string; shortLabel: string; icon: string; badge?: string }[] = [
      {
        id: 'directory',
        label: 'Pantalla 1: Directorio y Fichas',
        shortLabel: '1. Directorio',
        icon: 'fi-rr-users-alt',
        badge: String(users.length),
      },
      {
        id: 'create',
        label: 'Pantalla 2: Crear Nuevo Usuario',
        shortLabel: '2. Crear Usuario',
        icon: 'fi-rr-user-add',
      },
      {
        id: 'permissions',
        label: 'Pantalla 3: Matriz de Permisos',
        shortLabel: '3. Permisos',
        icon: 'fi-rr-lock',
      },
      {
        id: 'security',
        label: 'Pantalla 4: Clave Admin Único',
        shortLabel: '4. Clave Admin',
        icon: 'fi-rr-shield-keyhole',
      },
    ];

    return (
      <div className="space-y-3.5">
        {/* Barra Superior de Navegación por Pantallas del Panel Admin */}
        <div className="bg-white border border-[#B3D9FF] rounded-xl p-2.5 shadow-2xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {adminSubScreens.map(scr => {
              const isActive = adminUsersScreen === scr.id;
              return (
                <button
                  key={scr.id}
                  type="button"
                  onClick={() => setAdminUsersScreen(scr.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                    isActive
                      ? 'bg-[#0B2559] text-white shadow-2xs'
                      : 'bg-[#F4F9FF] text-[#0B2559] border border-[#D6EAFF] hover:bg-[#EAF3FF]'
                  }`}
                >
                  <i className={`fi ${scr.icon} text-xs ${isActive ? 'text-[#B3D9FF]' : 'text-[#3B82F6]'}`} />
                  <span>{isMobile ? scr.shortLabel : scr.label}</span>
                  {scr.badge && (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded-md font-mono font-extrabold ${
                        isActive ? 'bg-[#B3D9FF] text-[#0B2559]' : 'bg-white text-[#0B2559] border border-[#B3D9FF]'
                      }`}
                    >
                      {scr.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => handleExportUsersExcel(filteredUsers)}
            className="px-3 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs shrink-0"
          >
            <i className="fi fi-rr-file-excel text-xs" />
            <span>{isMobile ? 'Excel (.XLS)' : 'Descargar Base Excel (.XLS)'}</span>
          </button>
        </div>

        {/* ====================================================================
            PANTALLA 1: DIRECTORIO DE USUARIOS Y FICHAS CONFIDENCIALES
           ==================================================================== */}
        {adminUsersScreen === 'directory' && (
          <section className="bg-white border border-[#B3D9FF] rounded-xl p-4 sm:p-5 space-y-3.5 shadow-2xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#D6EAFF]">
              <div>
                <h3 className="text-sm font-bold text-[#0B2559] flex items-center gap-2">
                  <i className="fi fi-rr-users-alt text-sm text-[#3B82F6]" />
                  Pantalla 1: Directorio y Fichas de Usuarios ({filteredUsers.length})
                </h3>
                <p className="text-xs text-[#3B82F6] mt-0.5">
                  Haz clic en un usuario para desplegar su ficha organizada en 4 sub-pantallas
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                <div className="w-full sm:w-80">
                  <CollapsibleField
                    label="Buscar Usuario o Ciudad"
                    valuePreview={userSearch}
                    icon="fi-rr-search"
                    placeholderHint="Clic para filtrar"
                  >
                    <input
                      type="text"
                      value={userSearch}
                      onChange={e => setUserSearch(e.target.value)}
                      placeholder="Escribe nombre, cédula, ciudad o banco..."
                      className="w-full px-3 py-1.5 text-xs text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg focus:bg-white focus:outline-none focus:border-[#0B2559]"
                    />
                  </CollapsibleField>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    resetUserForm();
                    setAdminUsersScreen('create');
                  }}
                  className="px-3.5 py-2 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] hover:bg-[#99CCFF] rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs shrink-0"
                >
                  <i className="fi fi-rr-user-add text-xs" />
                  <span>+ Crear Usuario</span>
                </button>
              </div>
            </div>

            <div className="space-y-2">
              {filteredUsers.map(u => {
                const isExpanded = Boolean(expandedUserIds[u.cedula]);
                const isSingleAdmin = u.cedula === SINGLE_ADMIN_CEDULA;
                const isAdmin = isSingleAdmin || u.role === 'admin';

                return (
                  <div
                    key={u.cedula}
                    className={`border rounded-xl overflow-hidden transition-all ${
                      isExpanded
                        ? 'border-[#0B2559] bg-white shadow-xs'
                        : 'border-[#B3D9FF] bg-white hover:border-[#7CC0FF]'
                    }`}
                  >
                    <div
                      onClick={() => toggleUserExpand(u.cedula)}
                      className="flex items-center justify-between gap-2.5 px-3.5 sm:px-4 py-2.5 cursor-pointer hover:bg-[#F4F9FF] transition-colors"
                    >
                      <div className="flex flex-wrap items-center gap-2 min-w-0">
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            u.isOnline ? 'bg-emerald-500' : 'bg-[#B3D9FF]'
                          }`}
                        />
                        <span className="text-sm font-bold text-[#0B2559] truncate">
                          {u.name}
                        </span>
                        <span className="text-xs font-mono text-[#3B82F6] shrink-0">
                          C.C. {u.cedula}
                        </span>
                        {!isMobile && (
                          <>
                            <span className="text-[#B3D9FF]">·</span>
                            <span className="text-xs font-semibold text-[#3B82F6] shrink-0">
                              {isAdmin ? 'Administrador Único' : u.department}
                            </span>
                          </>
                        )}
                        {isSingleAdmin && (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-[#0B2559] text-white flex items-center gap-1">
                            <i className="fi fi-rr-shield-check text-[10px] text-[#B3D9FF]" />
                            {isMobile ? 'Admin Único' : 'Protegido · No Eliminable'}
                          </span>
                        )}
                        {!isMobile && u.locationCity && (
                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#F4F9FF] border border-[#D6EAFF] text-[#0B2559]">
                            <i className="fi fi-rr-marker text-[10px] text-[#3B82F6] mr-1" />
                            {u.locationCity}
                          </span>
                        )}
                        {isUserLockedBySecurity(u) && (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-rose-100 border border-rose-300 text-rose-700 flex items-center gap-1">
                            <i className="fi fi-rr-lock text-[10px]" />
                            Bloqueado
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                        {isUserLockedBySecurity(u) && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              handleUnlockUserAccountAndEmails(u);
                            }}
                            className="min-h-[34px] sm:min-h-0 px-2.5 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs"
                          >
                            <i className="fi fi-rr-unlock text-xs" />
                            <span>Desbloquear</span>
                          </button>
                        )}
                        {!isSingleAdmin && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              handleTogglePermission(u, 'canCreateEvents', 'Agregar Eventos');
                            }}
                            className={`min-h-[34px] sm:min-h-0 px-2.5 py-1 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors border ${
                              u.canCreateEvents
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                : 'bg-[#F4F9FF] text-[#0B2559]/75 border-[#B3D9FF] hover:bg-[#EAF3FF]'
                            }`}
                            title="Activar o desactivar permiso de Agregar Evento para este usuario"
                          >
                            <i className="fi fi-rr-calendar text-xs" />
                            <span>{u.canCreateEvents ? 'Eventos: Activo' : 'Activar Eventos'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            openEditUserModal(u, 'personal');
                          }}
                          className="min-h-[34px] sm:min-h-0 px-2.5 py-1 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] hover:bg-[#99CCFF] rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs"
                          title="Editar todos los datos de este usuario en pantallas"
                        >
                          <i className="fi fi-rr-edit text-xs" />
                          <span>Editar</span>
                        </button>

                        <button
                          type="button"
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                            isExpanded ? 'bg-[#0B2559] text-white' : 'bg-[#EAF3FF] text-[#0B2559] hover:bg-[#B3D9FF]'
                          }`}
                        >
                          <i
                            className={`fi ${
                              isExpanded ? 'fi-rr-angle-small-up' : 'fi-rr-angle-small-down'
                            } text-base`}
                          />
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="fixed inset-0 z-50 w-screen h-screen bg-[#F4F9FF] flex flex-col overflow-hidden animate-in fade-in duration-150">
                        <div className="bg-[#0B2559] text-white px-5 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-3 shrink-0 border-b border-[#1E40AF]">
                          <div className="flex items-center gap-3">
                            <span className="w-10 h-10 rounded-xl bg-[#B3D9FF] text-[#0B2559] flex items-center justify-center shrink-0">
                              <i className="fi fi-rr-id-badge text-lg" />
                            </span>
                            <div>
                              <span className="text-[10px] font-bold uppercase tracking-widest text-[#B3D9FF] block">
                                DETALLE DE FICHA EN PANTALLA COMPLETA
                              </span>
                              <h3 className="text-base sm:text-lg font-extrabold text-white">
                                {u.name} · C.C. {u.cedula}
                              </h3>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {isSingleAdmin && (
                              <button
                                type="button"
                                onClick={() => {
                                  toggleUserExpand(u.cedula);
                                  setAdminUsersScreen('security');
                                }}
                                className="px-3.5 py-2 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] hover:bg-[#99CCFF] rounded-xl flex items-center gap-1.5 transition-colors"
                              >
                                <i className="fi fi-rr-key text-xs" /> Cambiar Clave
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleSelectEditUser(u)}
                              className="px-3.5 py-2 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] hover:bg-[#99CCFF] rounded-xl flex items-center gap-1.5 transition-colors"
                            >
                              <i className="fi fi-rr-edit text-xs" /> Editar en Pantalla Completa
                            </button>
                            {!isSingleAdmin && u.cedula !== currentUser.cedula && (
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u)}
                                className="px-3.5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl flex items-center gap-1.5 transition-colors"
                              >
                                <i className="fi fi-rr-trash text-xs" /> Eliminar
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => toggleUserExpand(u.cedula)}
                              className="px-4 py-2 text-xs font-bold text-[#0B2559] bg-white hover:bg-[#EAF3FF] rounded-xl flex items-center gap-1.5 transition-colors"
                            >
                              <i className="fi fi-rr-cross-small text-base" /> Cerrar Pantalla Completa
                            </button>
                          </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-5 sm:p-8 max-w-7xl mx-auto w-full space-y-5 text-xs">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-4 rounded-2xl border border-[#B3D9FF] shadow-2xs">
                            <div>
                              <span className="text-[#3B82F6] block text-[11px] font-bold uppercase">Cédula</span>
                              <strong className="font-mono text-sm text-[#0B2559]">{u.cedula}</strong>
                            </div>
                            <div>
                              <span className="text-[#3B82F6] block text-[11px] font-bold uppercase">Contraseña</span>
                              <strong className="font-mono text-sm text-[#0B2559]">
                                {isSingleAdmin ? '•••••••• (Protegida)' : u.password}
                              </strong>
                            </div>
                            <div>
                              <span className="text-[#3B82F6] block text-[11px] font-bold uppercase">Área / Departamento</span>
                              <strong className="text-sm text-[#0B2559]">{u.department}</strong>
                            </div>
                            <div>
                              <span className="text-[#3B82F6] block text-[11px] font-bold uppercase">Presencia</span>
                              <strong className={`text-sm ${u.isOnline ? 'text-emerald-700' : 'text-[#0B2559]/70'}`}>
                                {u.isOnline ? 'En línea' : `Últ. vez ${new Date(u.lastSeen).toLocaleTimeString('es-ES')}`}
                              </strong>
                            </div>
                          </div>

                          {renderConfidentialPersonalDataFicha(u)}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ====================================================================
            PANTALLA 2: CREAR NUEVO USUARIO (CON TEXTOS DESPLEGABLES POR PALABRA PRINCIPAL)
           ==================================================================== */}
        {adminUsersScreen === 'create' && (
          <section className="bg-white border border-[#B3D9FF] rounded-xl p-4 sm:p-5 space-y-4 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#D6EAFF]">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-[#B3D9FF] text-[#0B2559] flex items-center justify-center shrink-0">
                  <i className="fi fi-rr-user-add text-sm" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-[#0B2559]">
                    Pantalla 2: Crear Nuevo Usuario con Ficha Personal y Bancaria
                  </h3>
                  <p className="text-xs text-[#3B82F6]">
                    Haz clic sobre la palabra o frase principal de cada campo para desplegar su cuadro de llenado y ahorrar espacio.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setExpandAllCreateFields(prev => !prev)}
                  className="px-3 py-1.5 rounded-lg bg-[#F4F9FF] hover:bg-[#EAF3FF] border border-[#B3D9FF] text-[#0B2559] text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <i className={`fi ${expandAllCreateFields ? 'fi-rr-compress-alt' : 'fi-rr-expand-arrows-alt'} text-xs text-[#3B82F6]`} />
                  <span>{expandAllCreateFields ? 'Minimizar Todos los Campos' : 'Desplegar Todos los Campos'}</span>
                </button>
              </div>
            </div>

            {createSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-900 font-bold flex items-center gap-2">
                <i className="fi fi-rr-check-circle text-sm text-emerald-600" />
                <span>{createSuccessMsg}</span>
              </div>
            )}

            {/* Sub-pantallas del Formulario de Creación */}
            <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-[#F4F9FF] rounded-xl border border-[#D6EAFF]">
              {[
                { id: 'personal' as const, label: 'Sub-Pantalla 1: Cédula y Acceso', icon: 'fi-rr-id-badge' },
                { id: 'residence' as const, label: 'Sub-Pantalla 2: Ubicación y Residencia', icon: 'fi-rr-marker' },
                { id: 'family' as const, label: 'Sub-Pantalla 3: Núcleo Familiar', icon: 'fi-rr-users' },
                { id: 'bank' as const, label: 'Sub-Pantalla 4: Datos Bancarios (Pagos)', icon: 'fi-rr-bank' },
              ].map(step => (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => setCreateStepScreen(step.id)}
                  className={`px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${
                    createStepScreen === step.id
                      ? 'bg-[#0B2559] text-white shadow-2xs'
                      : 'bg-white text-[#0B2559] border border-[#D6EAFF] hover:bg-[#EAF3FF]'
                  }`}
                >
                  <i className={`fi ${step.icon} text-xs`} />
                  <span>{step.label}</span>
                </button>
              ))}
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4">
              {/* SUB-PANTALLA 1: CÉDULA Y ACCESO */}
              {createStepScreen === 'personal' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                  <CollapsibleField
                    label="Número de Cédula"
                    valuePreview={cedula}
                    required
                    defaultOpen
                    forceOpen={expandAllCreateFields}
                    icon="fi-rr-id-badge"
                  >
                    <input
                      type="text"
                      required
                      disabled={Boolean(editingCedula)}
                      value={cedula}
                      onChange={e => setCedula(e.target.value)}
                      placeholder="Ej. 10203040"
                      className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                    />
                  </CollapsibleField>

                  <CollapsibleField
                    label="Nombre Completo"
                    valuePreview={name}
                    required
                    forceOpen={expandAllCreateFields}
                    icon="fi-rr-user"
                  >
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Ej. María Fernanda Ortiz"
                      className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                    />
                  </CollapsibleField>

                  <CollapsibleField
                    label="Contraseña de Acceso"
                    valuePreview={password}
                    required
                    forceOpen={expandAllCreateFields}
                    icon="fi-rr-key"
                  >
                    <input
                      type="text"
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Clave de ingreso"
                      className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                    />
                  </CollapsibleField>

                  <CollapsibleField
                    label="Departamento / Área"
                    valuePreview={department}
                    forceOpen={expandAllCreateFields}
                    icon="fi-rr-briefcase"
                  >
                    <select
                      value={department}
                      onChange={e => setDepartment(e.target.value)}
                      className="w-full px-3 py-2 text-xs text-[#0B2559] border border-[#B3D9FF] rounded-lg bg-white focus:outline-none focus:border-[#0B2559]"
                    >
                      {DEPARTMENT_OPTIONS.map(d => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </CollapsibleField>

                  <CollapsibleField
                    label="Teléfono / Celular"
                    valuePreview={phone}
                    forceOpen={expandAllCreateFields}
                    icon="fi-rr-phone-call"
                  >
                    <input
                      type="text"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="Ej. 3001234567"
                      className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    />
                  </CollapsibleField>

                  <CollapsibleField
                    label="Correo Electrónico"
                    valuePreview={email}
                    forceOpen={expandAllCreateFields}
                    icon="fi-rr-envelope"
                  >
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="correo@dominio.com"
                      className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    />
                  </CollapsibleField>

                  <CollapsibleField
                    label="Lugar Expedición Cédula"
                    valuePreview={cedulaIssuePlace}
                    forceOpen={expandAllCreateFields}
                    icon="fi-rr-marker"
                  >
                    <SearchableLocationSelect
                      label=""
                      value={cedulaIssuePlace || 'Bogotá D.C.'}
                      onChange={setCedulaIssuePlace}
                      options={COLOMBIAN_CITIES}
                      searchPlaceholder="Buscar municipio de expedición..."
                    />
                  </CollapsibleField>

                  <CollapsibleField
                    label="Fecha Expedición Cédula"
                    valuePreview={cedulaIssueDate}
                    forceOpen={expandAllCreateFields}
                    icon="fi-rr-calendar"
                  >
                    <input
                      type="date"
                      value={cedulaIssueDate}
                      onChange={e => setCedulaIssueDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    />
                  </CollapsibleField>

                  <CollapsibleField
                    label="Fecha de Nacimiento"
                    valuePreview={birthDate}
                    forceOpen={expandAllCreateFields}
                    icon="fi-rr-calendar"
                  >
                    <input
                      type="date"
                      value={birthDate}
                      onChange={e => setBirthDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    />
                  </CollapsibleField>

                  <CollapsibleField
                    label="Lugar de Nacimiento"
                    valuePreview={birthPlace}
                    forceOpen={expandAllCreateFields}
                    icon="fi-rr-map-marker"
                  >
                    <SearchableLocationSelect
                      label=""
                      value={birthPlace || 'Bogotá D.C.'}
                      onChange={setBirthPlace}
                      options={COLOMBIAN_CITIES}
                      searchPlaceholder="Buscar municipio de nacimiento..."
                    />
                  </CollapsibleField>

                  <CollapsibleField
                    label="RH / Grupo Sanguíneo"
                    valuePreview={bloodType}
                    forceOpen={expandAllCreateFields}
                    icon="fi-rr-heart"
                  >
                    <select
                      value={bloodType || 'O+'}
                      onChange={e => setBloodType(e.target.value)}
                      className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    >
                      {BLOOD_TYPES.map(rh => (
                        <option key={rh} value={rh}>
                          {rh}
                        </option>
                      ))}
                    </select>
                  </CollapsibleField>

                  <CollapsibleField
                    label="Estado Civil"
                    valuePreview={maritalStatus}
                    forceOpen={expandAllCreateFields}
                    icon="fi-rr-users-alt"
                  >
                    <select
                      value={maritalStatus || 'Soltero(a)'}
                      onChange={e => setMaritalStatus(e.target.value)}
                      className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    >
                      {MARITAL_STATUS_OPTIONS.map(ms => (
                        <option key={ms} value={ms}>
                          {ms}
                        </option>
                      ))}
                    </select>
                  </CollapsibleField>
                </div>
              )}

              {/* SUB-PANTALLA 2: UBICACIÓN Y RESIDENCIA */}
              {createStepScreen === 'residence' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <CollapsibleField
                    label="Departamento Ubicación"
                    valuePreview={locationDepartmentState}
                    forceOpen={expandAllCreateFields}
                    icon="fi-rr-map"
                  >
                    <SearchableLocationSelect
                      label=""
                      value={locationDepartmentState || 'Bogotá D.C.'}
                      onChange={newDept => {
                        setLocationDepartmentState(newDept);
                        const deptCities = getMunicipalitiesByDepartment(newDept);
                        if (deptCities.length > 0) {
                          setLocationCity(deptCities[0]);
                        }
                      }}
                      options={COLOMBIAN_DEPARTMENTS}
                      searchPlaceholder="Buscar departamento..."
                    />
                  </CollapsibleField>

                  <CollapsibleField
                    label="Ciudad / Municipio"
                    valuePreview={locationCity}
                    forceOpen={expandAllCreateFields}
                    icon="fi-rr-marker"
                  >
                    <SearchableLocationSelect
                      label=""
                      value={locationCity || 'Bogotá D.C.'}
                      onChange={setLocationCity}
                      options={getMunicipalitiesByDepartment(locationDepartmentState || 'Bogotá D.C.')}
                      secondaryOptions={ALL_COLOMBIAN_MUNICIPALITIES_WITH_DEPT.map(m => ({
                        label: m.label,
                        value: m.municipality,
                        department: m.department,
                      }))}
                      onSelectSecondaryDepartment={dept => setLocationDepartmentState(dept)}
                      searchPlaceholder="Buscar municipio..."
                    />
                  </CollapsibleField>

                  <CollapsibleField
                    label="Dirección de Residencia"
                    valuePreview={residenceAddress}
                    forceOpen={expandAllCreateFields}
                    icon="fi-rr-home"
                    className="sm:col-span-2"
                  >
                    <input
                      type="text"
                      value={residenceAddress}
                      onChange={e => setResidenceAddress(e.target.value)}
                      placeholder="Dirección completa y barrio"
                      className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    />
                  </CollapsibleField>

                  <CollapsibleField
                    label="Tipo Vivienda"
                    valuePreview={residenceType}
                    forceOpen={expandAllCreateFields}
                    icon="fi-rr-building"
                  >
                    <select
                      value={residenceType || 'Arrendada'}
                      onChange={e => setResidenceType(e.target.value)}
                      className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    >
                      {RESIDENCE_TYPES.map(vt => (
                        <option key={vt} value={vt}>
                          {vt}
                        </option>
                      ))}
                    </select>
                  </CollapsibleField>

                  <CollapsibleField
                    label="Estrato"
                    valuePreview={residenceStratum}
                    forceOpen={expandAllCreateFields}
                    icon="fi-rr-layers"
                  >
                    <select
                      value={residenceStratum || 'Estrato 3'}
                      onChange={e => setResidenceStratum(e.target.value)}
                      className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    >
                      {STRATUM_OPTIONS.map(s => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </CollapsibleField>
                </div>
              )}

              {/* SUB-PANTALLA 3: NÚCLEO FAMILIAR */}
              {createStepScreen === 'family' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <CollapsibleField
                    label="N° de Familiares"
                    valuePreview={`${familyMembersCount} familiar(es)`}
                    forceOpen={expandAllCreateFields}
                    icon="fi-rr-users"
                  >
                    <select
                      value={familyMembersCount}
                      onChange={e => setFamilyMembersCount(Number(e.target.value) || 0)}
                      className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    >
                      <option value={0}>0 (Vive solo)</option>
                      <option value={1}>1 familiar</option>
                      <option value={2}>2 familiares</option>
                      <option value={3}>3 familiares</option>
                      <option value={4}>4 familiares</option>
                      <option value={5}>5 familiares</option>
                      <option value={6}>6 o más familiares</option>
                    </select>
                  </CollapsibleField>

                  <CollapsibleField
                    label="Contacto Emergencia"
                    valuePreview={emergencyContactName}
                    forceOpen={expandAllCreateFields}
                    icon="fi-rr-user-add"
                  >
                    <input
                      type="text"
                      value={emergencyContactName}
                      onChange={e => setEmergencyContactName(e.target.value)}
                      placeholder="Nombre completo del familiar"
                      className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    />
                  </CollapsibleField>

                  <CollapsibleField
                    label="Tel. Emergencia"
                    valuePreview={emergencyContactPhone}
                    forceOpen={expandAllCreateFields}
                    icon="fi-rr-phone-call"
                  >
                    <input
                      type="text"
                      value={emergencyContactPhone}
                      onChange={e => setEmergencyContactPhone(e.target.value)}
                      placeholder="Teléfono de emergencia"
                      className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    />
                  </CollapsibleField>

                  <CollapsibleField
                    label="Detalle Núcleo Familiar"
                    valuePreview={familyNotes}
                    forceOpen={expandAllCreateFields}
                    icon="fi-rr-document"
                  >
                    <select
                      value={familyNotes || 'Cónyuge e hijos menores de edad'}
                      onChange={e => setFamilyNotes(e.target.value)}
                      className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    >
                      {FAMILY_COMPOSITION_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </CollapsibleField>
                </div>
              )}

              {/* SUB-PANTALLA 4: DATOS BANCARIOS */}
              {createStepScreen === 'bank' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <CollapsibleField
                    label="Banco / Billetera (Pagos)"
                    valuePreview={bankName}
                    forceOpen={expandAllCreateFields}
                    icon="fi-rr-bank"
                  >
                    <select
                      value={bankName || 'Bancolombia'}
                      onChange={e => setBankName(e.target.value)}
                      className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    >
                      {BANK_OPTIONS.map(b => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </CollapsibleField>

                  <CollapsibleField
                    label="Tipo de Cuenta"
                    valuePreview={bankAccountType}
                    forceOpen={expandAllCreateFields}
                    icon="fi-rr-credit-card"
                  >
                    <select
                      value={bankAccountType || 'Cuenta de Ahorros'}
                      onChange={e => setBankAccountType(e.target.value)}
                      className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    >
                      {BANK_ACCOUNT_TYPES.map(t => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </CollapsibleField>

                  <CollapsibleField
                    label="Número de Cuenta / Llave"
                    valuePreview={bankAccountNumber}
                    forceOpen={expandAllCreateFields}
                    icon="fi-rr-hastag"
                  >
                    <input
                      type="text"
                      value={bankAccountNumber}
                      onChange={e => setBankAccountNumber(e.target.value)}
                      placeholder="Número para pagos"
                      className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    />
                  </CollapsibleField>

                  <CollapsibleField
                    label="Titular de la Cuenta"
                    valuePreview={bankAccountHolder}
                    forceOpen={expandAllCreateFields}
                    icon="fi-rr-id-card-clip-alt"
                  >
                    <select
                      value={bankAccountHolder || 'A mi nombre (Mismo titular del colaborador)'}
                      onChange={e => setBankAccountHolder(e.target.value)}
                      className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    >
                      {BANK_HOLDER_OPTIONS.map(h => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </CollapsibleField>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-[#D6EAFF]">
                <div className="flex items-center gap-2">
                  {createStepScreen !== 'personal' && (
                    <button
                      type="button"
                      onClick={() =>
                        setCreateStepScreen(prev =>
                          prev === 'bank'
                            ? 'family'
                            : prev === 'family'
                            ? 'residence'
                            : 'personal'
                        )
                      }
                      className="px-3 py-1.5 text-xs font-bold text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg hover:bg-[#EAF3FF]"
                    >
                      ← Sub-Pantalla Anterior
                    </button>
                  )}
                  {createStepScreen !== 'bank' && (
                    <button
                      type="button"
                      onClick={() =>
                        setCreateStepScreen(prev =>
                          prev === 'personal'
                            ? 'residence'
                            : prev === 'residence'
                            ? 'family'
                            : 'bank'
                        )
                      }
                      className="px-3 py-1.5 text-xs font-bold text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg hover:bg-[#EAF3FF]"
                    >
                      Siguiente Sub-Pantalla →
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      resetUserForm();
                      setAdminUsersScreen('directory');
                    }}
                    className="px-4 py-2 text-xs font-bold text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg hover:bg-[#EAF3FF]"
                  >
                    Volver al Directorio
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold text-white bg-[#0B2559] rounded-lg hover:bg-[#15397A] transition-colors flex items-center gap-1.5 shadow-2xs"
                  >
                    <i className="fi fi-rr-check text-xs" />
                    {editingCedula ? 'Guardar Cambios del Usuario' : 'Crear Usuario Ahora'}
                  </button>
                </div>
              </div>
            </form>
          </section>
        )}

        {/* ====================================================================
            PANTALLA 3: MATRIZ DE PERMISOS DE ACCESO
           ==================================================================== */}
        {adminUsersScreen === 'permissions' && (
          <section className="bg-white border border-[#B3D9FF] rounded-xl p-4 sm:p-5 space-y-3.5 shadow-2xs">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#D6EAFF]">
              <div>
                <h3 className="text-sm font-bold text-[#0B2559] flex items-center gap-2">
                  <i className="fi fi-rr-lock text-sm text-[#3B82F6]" />
                  Pantalla 3: Matriz de Permisos de Acciones por Usuario ({filteredUsers.length})
                </h3>
                <p className="text-xs text-[#3B82F6] mt-0.5">
                  Activa o desactiva permisos operativos con un clic sin saturar la pantalla del directorio
                </p>
              </div>

              <div className="w-full sm:w-80">
                <CollapsibleField
                  label="Filtrar Usuario en Permisos"
                  valuePreview={userSearch}
                  icon="fi-rr-search"
                  placeholderHint="Clic para buscar"
                >
                  <input
                    type="text"
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    placeholder="Nombre o cédula..."
                    className="w-full px-3 py-1.5 text-xs text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg focus:bg-white focus:outline-none focus:border-[#0B2559]"
                  />
                </CollapsibleField>
              </div>
            </div>

            <div className="space-y-2.5">
              {filteredUsers.map(u => {
                const isSingleAdmin = u.cedula === SINGLE_ADMIN_CEDULA;
                return (
                  <div
                    key={u.cedula}
                    className="p-3.5 rounded-xl border border-[#B3D9FF] bg-[#F4F9FF]/60 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-[#0B2559]">{u.name}</span>
                        <span className="text-xs font-mono text-[#3B82F6]">(C.C. {u.cedula})</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-white border border-[#D6EAFF] text-[#0B2559]">
                          {isSingleAdmin ? 'ADMIN ÚNICO (Permisos Fijos)' : u.department}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => openEditUserModal(u, 'security')}
                        className="text-[11px] font-bold text-[#0B2559] bg-[#B3D9FF] hover:bg-[#99CCFF] px-2.5 py-1 rounded-lg transition-colors"
                      >
                        Abrir Ficha Seguridad
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                      {permButtons.map(p => {
                        const enabled = isSingleAdmin ? true : u[p.key];
                        return (
                          <button
                            key={p.key}
                            type="button"
                            disabled={isSingleAdmin}
                            onClick={() => handleTogglePermission(u, p.key, p.label)}
                            className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                              isSingleAdmin
                                ? 'bg-[#EAF3FF] text-[#0B2559] border-[#B3D9FF] cursor-not-allowed'
                                : enabled
                                ? 'bg-white text-[#0B2559] border-[#B3D9FF] hover:bg-[#EAF3FF]'
                                : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                            }`}
                          >
                            <span className="truncate">{p.label}</span>
                            <i
                              className={`fi ${
                                enabled ? 'fi-rr-check-circle text-emerald-600' : 'fi-rr-cross-circle text-rose-600'
                              } text-xs ml-1.5`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ====================================================================
            PANTALLA 4: SEGURIDAD Y CAMBIO DE CONTRASEÑA DEL ADMIN ÚNICO (902050377)
           ==================================================================== */}
        {adminUsersScreen === 'security' && (
          <section className="bg-white border border-[#0B2559]/30 rounded-xl p-4 sm:p-5 space-y-4 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[#D6EAFF]">
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-[#0B2559] text-white flex items-center justify-center shrink-0">
                  <i className="fi fi-rr-shield-keyhole text-sm text-[#B3D9FF]" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-[#0B2559]">
                    Pantalla 4: Cambiar Contraseña del Administrador Único (C.C. {SINGLE_ADMIN_CEDULA})
                  </h3>
                  <p className="text-xs text-[#3B82F6]">
                    Haz clic en cada frase principal para desplegar su cuadro de llenado.
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-bold uppercase px-2.5 py-1 rounded-md bg-[#0B2559] text-white">
                Protegido · No Eliminable
              </span>
            </div>

            <form onSubmit={handleAdminPasswordPanelSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <CollapsibleField
                  label="Número de Cédula de Autorización"
                  valuePreview={adminAuthCedula}
                  required
                  isSecret
                  icon="fi-rr-id-badge"
                >
                  <input
                    type="password"
                    required
                    value={adminAuthCedula}
                    onChange={e => setAdminAuthCedula(e.target.value)}
                    placeholder="Cédula autorizada"
                    autoComplete="off"
                    className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg focus:bg-white focus:outline-none focus:border-[#0B2559]"
                  />
                </CollapsibleField>

                <CollapsibleField
                  label="Contraseña Anterior"
                  valuePreview={adminOldPassword}
                  required
                  isSecret
                  icon="fi-rr-lock"
                >
                  <input
                    type="password"
                    required
                    value={adminOldPassword}
                    onChange={e => setAdminOldPassword(e.target.value)}
                    placeholder="Contraseña actual"
                    autoComplete="off"
                    className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg focus:bg-white focus:outline-none focus:border-[#0B2559]"
                  />
                </CollapsibleField>

                <CollapsibleField
                  label="Nueva Contraseña"
                  valuePreview={adminNewPassword}
                  required
                  isSecret
                  icon="fi-rr-key"
                >
                  <input
                    type="password"
                    required
                    value={adminNewPassword}
                    onChange={e => setAdminNewPassword(e.target.value)}
                    placeholder="Nueva contraseña"
                    autoComplete="new-password"
                    className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg focus:bg-white focus:outline-none focus:border-[#0B2559]"
                  />
                </CollapsibleField>
              </div>

              {adminPwdError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold flex items-center gap-2">
                  <i className="fi fi-rr-exclamation text-sm text-rose-600 shrink-0" />
                  <span>{adminPwdError}</span>
                </div>
              )}

              {adminPwdSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 font-bold flex items-center gap-2">
                  <i className="fi fi-rr-check-circle text-sm text-emerald-600 shrink-0" />
                  <span>{adminPwdSuccess}</span>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAdminUsersScreen('directory')}
                  className="px-4 py-2 text-xs font-bold text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg hover:bg-[#EAF3FF]"
                >
                  Volver al Directorio
                </button>
                <button
                  type="submit"
                  disabled={adminPwdSaving}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#0B2559] hover:bg-[#15397A] rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50"
                >
                  <i className="fi fi-rr-key text-xs text-[#B3D9FF]" />
                  {adminPwdSaving ? 'Actualizando...' : 'Actualizar Contraseña del Administrador'}
                </button>
              </div>
            </form>

            {/* Edición de Correos de Recuperación de Contraseña de Cada Usuario (Panel Admin) */}
            <div className="pt-4 border-t border-[#D6EAFF] space-y-3">
              <div>
                <h4 className="text-xs font-bold text-[#0B2559] flex items-center gap-1.5">
                  <i className="fi fi-rr-envelope text-xs text-[#3B82F6]" />
                  <span>Correos de Recuperación de Contraseña por Usuario</span>
                </h4>
                <p className="text-[11px] text-[#3B82F6]">
                  El código de recuperación se envía al correo registrado de cada usuario y muestra en pantalla únicamente el inicio de su correo.
                </p>
              </div>

              {recoveryConfigSavedMsg && (
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
                  ✓ {recoveryConfigSavedMsg}
                </div>
              )}

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {users.map(u => {
                  const currentVal =
                    userRecoveryEmails[u.cedula] !== undefined
                      ? userRecoveryEmails[u.cedula]
                      : u.email || '';
                  const localPart = (currentVal || 'usuario').split('@')[0] || 'usuario';
                  const maskedPreview = `${localPart.slice(
                    0,
                    Math.min(5, Math.max(3, Math.floor(localPart.length / 2)))
                  )}....`;

                  return (
                    <div
                      key={u.cedula}
                      className="p-2.5 rounded-xl bg-[#F4F9FF] border border-[#B3D9FF] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[#0B2559] truncate flex items-center gap-1.5">
                          <span>
                            {u.name} <span className="font-mono text-[#3B82F6]">(C.C. {u.cedula})</span>
                          </span>
                          {isUserLockedBySecurity(u) && (
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-700">
                              Bloqueado
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[#3B82F6]">
                          Se muestra al usuario: <strong className="font-mono text-[#0B2559]">{maskedPreview}</strong>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 sm:w-auto">
                        <input
                          type="email"
                          value={currentVal}
                          onChange={e =>
                            setUserRecoveryEmails(prev => ({
                              ...prev,
                              [u.cedula]: e.target.value,
                            }))
                          }
                          placeholder="correo@ejemplo.com"
                          className="flex-1 sm:w-52 px-3 py-1.5 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveUserRecoveryEmail(u)}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-[#0B2559] hover:bg-[#15397A] rounded-lg transition-colors shrink-0"
                        >
                          Guardar
                        </button>
                        {isUserLockedBySecurity(u) && (
                          <button
                            type="button"
                            onClick={() => handleUnlockUserAccountAndEmails(u)}
                            className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shrink-0"
                          >
                            Desbloquear
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {renderEditUserModal()}
      </div>
    );
  }

  // ============================================================================
  // 2. SECCIÓN: AUTORIZACIÓN DE REGISTROS (admin_approvals) POR PANTALLAS DE ESTADO
  // ============================================================================
  if (activeSection === 'admin_approvals') {
    const pendingCount = users.filter(u => u.approvalStatus === 'pendiente').length;
    const approvedCount = users.filter(u => !u.approvalStatus || u.approvalStatus === 'aprobado').length;
    const rejectedCount = users.filter(u => u.approvalStatus === 'rechazado').length;

    const filteredApprovalUsers = users.filter(u => {
      const status = u.approvalStatus || 'aprobado';
      const matchesTab = approvalFilter === 'todos' || status === approvalFilter;
      const matchesSearch =
        u.name.toLowerCase().includes(approvalSearch.toLowerCase()) ||
        u.cedula.toLowerCase().includes(approvalSearch.toLowerCase()) ||
        u.department.toLowerCase().includes(approvalSearch.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(approvalSearch.toLowerCase()) ||
        (u.locationCity || '').toLowerCase().includes(approvalSearch.toLowerCase()) ||
        (u.bankName || '').toLowerCase().includes(approvalSearch.toLowerCase());
      return matchesTab && matchesSearch;
    });

    return (
      <div className="space-y-3.5">
        {/* Barra de Pantallas de Estado de Autorización */}
        <div className="bg-white border border-[#B3D9FF] rounded-xl p-2.5 shadow-2xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'pendiente' as const, label: `Pantalla Pendientes (${pendingCount})`, icon: 'fi-rr-time-fast' },
              { id: 'aprobado' as const, label: `Pantalla Autorizados (${approvedCount})`, icon: 'fi-rr-check-circle' },
              { id: 'rechazado' as const, label: `Pantalla Rechazados (${rejectedCount})`, icon: 'fi-rr-cross-circle' },
              { id: 'todos' as const, label: `Todos (${users.length})`, icon: 'fi-rr-users-alt' },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setApprovalFilter(tab.id)}
                className={`px-3 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors whitespace-nowrap ${
                  approvalFilter === tab.id
                    ? 'bg-[#0B2559] text-white shadow-2xs'
                    : 'bg-[#F4F9FF] text-[#0B2559] border border-[#D6EAFF] hover:bg-[#EAF3FF]'
                }`}
              >
                <i className={`fi ${tab.icon} text-xs`} />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => handleExportUsersExcel(filteredApprovalUsers.length > 0 ? filteredApprovalUsers : users)}
            className="px-3.5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl flex items-center gap-1.5 transition-colors shadow-2xs shrink-0"
          >
            <i className="fi fi-rr-file-excel text-xs" />
            Descargar Excel (.XLS)
          </button>
        </div>

        <div className="bg-white border border-[#B3D9FF] rounded-xl p-4 sm:p-5 space-y-4 shadow-2xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#D6EAFF]">
            <div>
              <h2 className="text-sm font-bold text-[#0B2559] flex items-center gap-2">
                <i className="fi fi-rr-user-check text-sm text-[#3B82F6]" />
                Autorización de Registros ({filteredApprovalUsers.length})
              </h2>
              <p className="text-xs text-[#3B82F6] mt-0.5">
                Haz clic en la palabra principal de búsqueda o en cada usuario para revisar su ficha por pantallas.
              </p>
            </div>

            <div className="w-full sm:w-80">
              <CollapsibleField
                label="Buscar Solicitud de Registro"
                valuePreview={approvalSearch}
                icon="fi-rr-search"
                placeholderHint="Clic para buscar"
              >
                <input
                  type="text"
                  value={approvalSearch}
                  onChange={e => setApprovalSearch(e.target.value)}
                  placeholder="Buscar cédula, nombre o ciudad..."
                  className="w-full px-3 py-1.5 text-xs text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg focus:bg-white focus:outline-none focus:border-[#0B2559]"
                />
              </CollapsibleField>
            </div>
          </div>

          {filteredApprovalUsers.length === 0 ? (
            <div className="p-8 text-center bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl space-y-1.5">
              <div className="text-sm font-bold text-[#0B2559]">
                No hay registros en la pantalla "{approvalFilter.toUpperCase()}"
              </div>
              <p className="text-xs text-[#3B82F6]">
                Cuando un usuario utilice el botón "Registrar" en el inicio de sesión, aparecerá aquí para tu autorización.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredApprovalUsers.map(u => {
                const isExpanded = Boolean(expandedUserIds[`apr_${u.cedula}`]);
                const status = u.approvalStatus || 'aprobado';

                return (
                  <div
                    key={u.cedula}
                    className={`border rounded-xl overflow-hidden transition-all ${
                      isExpanded
                        ? 'border-[#0B2559] bg-white shadow-xs'
                        : 'border-[#B3D9FF] bg-white hover:border-[#7CC0FF]'
                    }`}
                  >
                    <div
                      onClick={() => toggleUserExpand(`apr_${u.cedula}`)}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 cursor-pointer hover:bg-[#F4F9FF] transition-colors"
                    >
                      <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                        <span
                          className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                            status === 'pendiente'
                              ? 'bg-amber-400'
                              : status === 'aprobado'
                              ? 'bg-emerald-500'
                              : 'bg-rose-500'
                          }`}
                        />
                        <span className="text-sm font-bold text-[#0B2559] truncate">
                          {u.name}
                        </span>
                        <span className="text-xs font-mono text-[#3B82F6] shrink-0">
                          (C.C. {u.cedula})
                        </span>
                        <span
                          className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                            status === 'pendiente'
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : status === 'aprobado'
                              ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                              : 'bg-rose-100 text-rose-900 border border-rose-300'
                          }`}
                        >
                          {status}
                        </span>
                      </div>

                      <div
                        className="flex items-center gap-2"
                        onClick={e => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => openEditUserModal(u)}
                          className="px-2.5 py-1 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] hover:bg-[#99CCFF] rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs"
                        >
                          <i className="fi fi-rr-edit text-xs" />
                          <span>Editar</span>
                        </button>
                        {status !== 'aprobado' && (
                          <button
                            type="button"
                            onClick={() => handleSetUserApprovalStatus(u, 'aprobado')}
                            className="px-3 py-1 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] hover:bg-[#99CCFF] rounded-lg flex items-center gap-1.5 transition-colors"
                          >
                            <i className="fi fi-rr-check text-xs" /> Autorizar
                          </button>
                        )}
                        {status !== 'rechazado' && u.cedula !== SINGLE_ADMIN_CEDULA && u.cedula !== currentUser.cedula && (
                          <button
                            type="button"
                            onClick={() => handleSetUserApprovalStatus(u, 'rechazado')}
                            className="px-2.5 py-1 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg flex items-center gap-1 transition-colors"
                          >
                            <i className="fi fi-rr-cross-small text-xs" /> Rechazar
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => toggleUserExpand(`apr_${u.cedula}`)}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                            isExpanded
                              ? 'bg-[#0B2559] text-white'
                              : 'bg-[#EAF3FF] text-[#0B2559] hover:bg-[#B3D9FF]'
                          }`}
                        >
                          <i
                            className={`fi ${
                              isExpanded ? 'fi-rr-angle-small-up' : 'fi-rr-angle-small-down'
                            } text-base`}
                          />
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-4 pb-4 pt-3 border-t border-[#D6EAFF] bg-[#F4F9FF] space-y-3 text-xs">
                        {renderConfidentialPersonalDataFicha(u)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {renderEditUserModal()}
      </div>
    );
  }

  // ============================================================================
  // 3. SECCIÓN: GESTIONAR REGISTROS Y TAREAS (admin_records) POR PANTALLAS
  // ============================================================================
  if (activeSection === 'admin_records') {
    const filteredTasks = tasks.filter(t => {
      const matchesQuery =
        t.title.toLowerCase().includes(recordSearch.toLowerCase()) ||
        t.assignedToName.toLowerCase().includes(recordSearch.toLowerCase()) ||
        t.assignedToCedula.includes(recordSearch) ||
        t.tags.toLowerCase().includes(recordSearch.toLowerCase());
      const matchesPriority = priorityFilter === 'todos' || t.priority === priorityFilter;
      const matchesStatusScreen = recordStatusScreen === 'todos' || t.status === recordStatusScreen;
      return matchesQuery && matchesPriority && matchesStatusScreen;
    });

    return (
      <div className="space-y-3.5">
        {/* Pantallas por Estado de Actividad */}
        <div className="bg-white border border-[#B3D9FF] rounded-xl p-2.5 shadow-2xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'todos' as const, label: `Todas (${tasks.length})`, icon: 'fi-rr-apps' },
              {
                id: 'pendiente' as const,
                label: `Pantalla Pendientes (${tasks.filter(t => t.status === 'pendiente').length})`,
                icon: 'fi-rr-time-fast',
              },
              {
                id: 'en_progreso' as const,
                label: `Pantalla En Progreso (${tasks.filter(t => t.status === 'en_progreso').length})`,
                icon: 'fi-rr-spinner',
              },
              {
                id: 'completada' as const,
                label: `Pantalla Completadas (${tasks.filter(t => t.status === 'completada').length})`,
                icon: 'fi-rr-check-circle',
              },
            ].map(scr => (
              <button
                key={scr.id}
                type="button"
                onClick={() => setRecordStatusScreen(scr.id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                  recordStatusScreen === scr.id
                    ? 'bg-[#0B2559] text-white shadow-2xs'
                    : 'bg-[#F4F9FF] text-[#0B2559] border border-[#D6EAFF] hover:bg-[#EAF3FF]'
                }`}
              >
                <i className={`fi ${scr.icon} text-xs`} />
                <span>{scr.label}</span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onOpenNewTask}
            className="px-4 py-2 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-xl hover:bg-[#99CCFF] transition-colors flex items-center gap-1.5 shadow-2xs shrink-0"
          >
            <i className="fi fi-rr-plus text-xs" /> Nueva Actividad
          </button>
        </div>

        <div className="bg-white border border-[#B3D9FF] rounded-xl p-4 sm:p-5 space-y-4 shadow-2xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#D6EAFF]">
            <div>
              <h2 className="text-sm font-bold text-[#0B2559] flex items-center gap-2">
                <i className="fi fi-rr-folder-open text-sm text-[#3B82F6]" />
                Gestión de Registros y Actividades ({filteredTasks.length})
              </h2>
              <p className="text-xs text-[#3B82F6] mt-0.5">
                Despliega el buscador o el filtro de prioridad haciendo clic en su frase principal.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full lg:w-[500px]">
              <CollapsibleField
                label="Buscar Actividad o Responsable"
                valuePreview={recordSearch}
                icon="fi-rr-search"
                placeholderHint="Clic para buscar"
              >
                <input
                  type="text"
                  value={recordSearch}
                  onChange={e => setRecordSearch(e.target.value)}
                  placeholder="Título, responsable o etiqueta..."
                  className="w-full px-3 py-1.5 text-xs text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg focus:bg-white focus:outline-none focus:border-[#0B2559]"
                />
              </CollapsibleField>

              <CollapsibleField
                label="Filtrar por Prioridad"
                valuePreview={priorityFilter.toUpperCase()}
                icon="fi-rr-flag"
              >
                <div className="flex flex-wrap items-center gap-1">
                  {(['todos', 'critica', 'alta', 'media', 'baja'] as const).map(p => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriorityFilter(p)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                        priorityFilter === p
                          ? 'bg-[#0B2559] text-white'
                          : 'bg-[#F4F9FF] text-[#0B2559] hover:bg-[#B3D9FF]/50'
                      }`}
                    >
                      {p === 'todos' ? 'Todas' : p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </CollapsibleField>
            </div>
          </div>

          <div className="space-y-2">
            {filteredTasks.map(task => {
              const isExpanded = Boolean(expandedTaskIds[task.id]);
              const isCompleted = task.status === 'completada';
              const isOverdue = !isCompleted && new Date(task.dueDate).getTime() < Date.now();

              return (
                <div
                  key={task.id}
                  className={`border rounded-xl overflow-hidden transition-all ${
                    isExpanded
                      ? 'border-[#0B2559] bg-white shadow-xs'
                      : 'border-[#B3D9FF] bg-white hover:border-[#7CC0FF]'
                  }`}
                >
                  <div
                    onClick={() => toggleTaskExpand(task.id)}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 cursor-pointer hover:bg-[#F4F9FF] transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          isCompleted ? 'bg-emerald-500' : task.priority === 'critica' ? 'bg-rose-500' : 'bg-[#7CC0FF]'
                        }`}
                      />
                      <span
                        className={`text-sm truncate ${
                          isCompleted
                            ? 'line-through text-[#0B2559]/50 font-normal'
                            : 'font-bold text-[#0B2559]'
                        }`}
                      >
                        {task.title}
                      </span>
                      <span className="hidden sm:inline text-[11px] px-2 py-0.5 rounded bg-[#F4F9FF] border border-[#D6EAFF] text-[#3B82F6] font-semibold shrink-0">
                        {task.assignedToName}
                      </span>
                    </div>

                    <button
                      type="button"
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        isExpanded ? 'bg-[#0B2559] text-white' : 'bg-[#EAF3FF] text-[#0B2559] hover:bg-[#B3D9FF]'
                      }`}
                    >
                      <i
                        className={`fi ${
                          isExpanded ? 'fi-rr-angle-small-up' : 'fi-rr-angle-small-down'
                        } text-base`}
                      />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="fixed inset-0 z-50 w-screen h-screen bg-[#F4F9FF] flex flex-col overflow-hidden animate-in fade-in duration-150">
                      <div className="bg-[#0B2559] text-white px-5 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-3 shrink-0 border-b border-[#1E40AF]">
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-10 h-10 rounded-xl bg-[#B3D9FF] text-[#0B2559] flex items-center justify-center shrink-0">
                            <i className="fi fi-rr-clipboard-list-check text-lg" />
                          </span>
                          <div className="min-w-0">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[#B3D9FF] block">
                              DETALLE DE LA ACTIVIDAD EN PANTALLA COMPLETA
                            </span>
                            <h3 className="text-base sm:text-lg font-extrabold text-white truncate">
                              {task.title}
                            </h3>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onEditTask(task)}
                            className="px-3.5 py-2 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-xl hover:bg-[#99CCFF] flex items-center gap-1.5 transition-colors"
                          >
                            <i className="fi fi-rr-edit text-xs" /> Editar Actividad
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTaskRecord(task)}
                            className="px-3.5 py-2 text-xs font-bold text-white bg-rose-600 rounded-xl hover:bg-rose-700 flex items-center gap-1.5 transition-colors"
                          >
                            <i className="fi fi-rr-trash text-xs" /> Eliminar
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleTaskExpand(task.id)}
                            className="px-4 py-2 text-xs font-bold text-[#0B2559] bg-white hover:bg-[#EAF3FF] rounded-xl flex items-center gap-1.5 transition-colors"
                          >
                            <i className="fi fi-rr-cross-small text-base" /> Cerrar Pantalla Completa
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto p-5 sm:p-8 max-w-7xl mx-auto w-full space-y-5 text-xs">
                        <div className="flex flex-wrap items-center gap-2.5 bg-white p-4 rounded-2xl border border-[#B3D9FF] font-bold text-[#0B2559]">
                          <span className="px-3 py-1 rounded-lg bg-[#EAF3FF] border border-[#B3D9FF]">
                            PRIORIDAD: {task.priority.toUpperCase()}
                          </span>
                          <span className="px-3 py-1 rounded-lg bg-[#EAF3FF] border border-[#B3D9FF]">
                            ESTADO: {task.status.replace('_', ' ').toUpperCase()} ({task.progress}%)
                          </span>
                          <span className="px-3 py-1 rounded-lg bg-[#EAF3FF] border border-[#B3D9FF]">
                            ÁREA: {task.category}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white p-5 rounded-2xl border border-[#B3D9FF] tabular-nums">
                          <div>
                            <span className="text-[#3B82F6] block text-[11px] font-bold uppercase mb-1">Responsable Asignado</span>
                            <strong className="text-sm text-[#0B2559]">{task.assignedToName}</strong>{' '}
                            <span className="font-mono text-[#3B82F6]">({task.assignedToCedula})</span>
                          </div>
                          <div>
                            <span className="text-[#3B82F6] block text-[11px] font-bold uppercase mb-1">Creado Por</span>
                            <strong className="text-sm text-[#0B2559]">{task.createdByName}</strong>
                          </div>
                          <div>
                            <span className="text-[#3B82F6] block text-[11px] font-bold uppercase mb-1">Fecha Límite</span>
                            <strong className={`text-sm ${isOverdue ? 'text-rose-600' : 'text-[#0B2559]'}`}>
                              {new Date(task.dueDate).toLocaleString('es-ES')}
                            </strong>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <div className="bg-white p-5 rounded-2xl border border-[#B3D9FF] space-y-2">
                            <span className="text-[#3B82F6] block text-[11px] font-bold uppercase">
                              Descripción e Instrucciones de la Actividad
                            </span>
                            <p className="text-sm text-[#0B2559] whitespace-pre-wrap leading-relaxed">
                              {task.description || 'Sin descripción adicional registrada.'}
                            </p>
                          </div>

                          <div className="bg-white p-5 rounded-2xl border border-[#B3D9FF] space-y-2">
                            <span className="text-[#3B82F6] block text-[11px] font-bold uppercase">
                              Notas Operativas y Accesos Vinculados
                            </span>
                            <p className="text-sm text-[#0B2559] whitespace-pre-wrap leading-relaxed">
                              {task.notes || 'Sin notas operativas adicionales.'}
                            </p>
                            {(task.directLink || task.accessEmail) && (
                              <div className="pt-3 border-t border-[#D6EAFF] space-y-1.5">
                                {task.accessEmail && (
                                  <div className="text-xs text-[#0B2559]">
                                    <span className="font-bold text-[#3B82F6]">Usuario/Correo vinculado: </span>
                                    <span className="font-mono">{task.accessEmail}</span>
                                  </div>
                                )}
                                {task.directLink && (
                                  <a
                                    href={task.directLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block text-xs font-bold text-[#3B82F6] hover:underline truncate"
                                  >
                                    Enlace directo: {task.directLink}
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // 4. SECCIÓN: VIGILANCIA Y AUDITORÍA (admin_audit) POR PANTALLAS DE SEVERIDAD
  // ============================================================================
  if (activeSection === 'admin_audit') {
    const filteredLogs = auditLogs.filter(log => {
      const matchesText =
        log.description.toLowerCase().includes(auditSearch.toLowerCase()) ||
        log.actionType.toLowerCase().includes(auditSearch.toLowerCase()) ||
        log.actorName.toLowerCase().includes(auditSearch.toLowerCase()) ||
        log.actorCedula.includes(auditSearch);
      const matchesUser = auditUserFilter === 'todos' || log.actorCedula === auditUserFilter;
      const matchesSev = auditSeverityFilter === 'todos' || log.severity === auditSeverityFilter;
      return matchesText && matchesUser && matchesSev;
    });

    return (
      <div className="space-y-3.5">
        {/* Pantallas por Nivel de Severidad */}
        <div className="bg-white border border-[#B3D9FF] rounded-xl p-2.5 shadow-2xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: 'todos', label: `Todos los Eventos (${auditLogs.length})`, icon: 'fi-rr-shield-check' },
              { id: 'info', label: 'Pantalla Informativos', icon: 'fi-rr-info' },
              { id: 'warning', label: 'Pantalla Advertencias', icon: 'fi-rr-exclamation' },
              { id: 'critical', label: 'Pantalla Críticos', icon: 'fi-rr-flame' },
            ].map(scr => (
              <button
                key={scr.id}
                type="button"
                onClick={() => setAuditSeverityFilter(scr.id)}
                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                  auditSeverityFilter === scr.id
                    ? 'bg-[#0B2559] text-white shadow-2xs'
                    : 'bg-[#F4F9FF] text-[#0B2559] border border-[#D6EAFF] hover:bg-[#EAF3FF]'
                }`}
              >
                <i className={`fi ${scr.icon} text-xs`} />
                <span>{scr.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportAuditPDF}
              className="px-3.5 py-2 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-xl hover:bg-[#99CCFF] flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <i className="fi fi-rr-file-pdf text-xs" /> Reporte PDF
            </button>

            <button
              type="button"
              onClick={handleOpenDeleteAuditModal}
              className="px-3.5 py-2 text-xs font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <i className="fi fi-rr-trash text-xs" /> Eliminar
            </button>
          </div>
        </div>

        <div className="bg-white border border-[#B3D9FF] rounded-xl p-4 sm:p-5 space-y-4 shadow-2xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#D6EAFF]">
            <div>
              <h2 className="text-sm font-bold text-[#0B2559] flex items-center gap-2">
                <i className="fi fi-rr-shield-check text-sm text-[#3B82F6]" />
                Vigilancia y Logs de Auditoría ({filteredLogs.length})
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full lg:w-[520px]">
              <CollapsibleField
                label="Buscar Acción o Palabra"
                valuePreview={auditSearch}
                icon="fi-rr-search"
                placeholderHint="Clic para filtrar"
              >
                <input
                  type="text"
                  value={auditSearch}
                  onChange={e => setAuditSearch(e.target.value)}
                  placeholder="Buscar acción o usuario..."
                  className="w-full px-3 py-1.5 text-xs text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg focus:bg-white focus:outline-none focus:border-[#0B2559]"
                />
              </CollapsibleField>

              <CollapsibleField
                label="Filtrar por Usuario"
                valuePreview={auditUserFilter === 'todos' ? 'Todos' : auditUserFilter}
                icon="fi-rr-user"
              >
                <select
                  value={auditUserFilter}
                  onChange={e => setAuditUserFilter(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs text-[#0B2559] border border-[#B3D9FF] rounded-lg bg-[#F4F9FF] focus:bg-white"
                >
                  <option value="todos">Todos los usuarios</option>
                  {users.map(u => (
                    <option key={u.cedula} value={u.cedula}>
                      {u.name} ({u.cedula})
                    </option>
                  ))}
                </select>
              </CollapsibleField>
            </div>
          </div>

          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
            {filteredLogs.map(log => {
              const isExpanded = Boolean(expandedLogIds[log.id]);
              return (
                <div
                  key={log.id}
                  className={`border rounded-xl overflow-hidden transition-all ${
                    isExpanded ? 'border-[#0B2559] bg-white shadow-2xs' : 'border-[#B3D9FF] bg-white hover:border-[#7CC0FF]'
                  }`}
                >
                  <div
                    onClick={() => toggleLogExpand(log.id)}
                    className="flex items-center justify-between gap-3 px-4 py-2.5 cursor-pointer hover:bg-[#F4F9FF] transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 truncate">
                      <span className="text-xs font-mono font-bold text-[#3B82F6] shrink-0">
                        {log.actionType}
                      </span>
                      <span className="text-[#B3D9FF]">—</span>
                      <span className="text-xs font-bold text-[#0B2559] truncate">
                        {log.actorName}
                      </span>
                    </div>

                    <button
                      type="button"
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                        isExpanded ? 'bg-[#0B2559] text-white' : 'bg-[#EAF3FF] text-[#0B2559] hover:bg-[#B3D9FF]'
                      }`}
                    >
                      <i
                        className={`fi ${
                          isExpanded ? 'fi-rr-angle-small-up' : 'fi-rr-angle-small-down'
                        } text-base`}
                      />
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="fixed inset-0 z-50 w-screen h-screen bg-[#F4F9FF] flex flex-col overflow-hidden animate-in fade-in duration-150">
                      <div className="bg-[#0B2559] text-white px-5 sm:px-8 py-4 flex items-center justify-between gap-3 shrink-0 border-b border-[#1E40AF]">
                        <div className="flex items-center gap-3">
                          <span className="w-10 h-10 rounded-xl bg-[#B3D9FF] text-[#0B2559] flex items-center justify-center shrink-0">
                            <i className="fi fi-rr-shield-check text-lg" />
                          </span>
                          <div>
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[#B3D9FF] block">
                              DETALLE DE AUDITORÍA EN PANTALLA COMPLETA
                            </span>
                            <h3 className="text-base sm:text-lg font-extrabold text-white">
                              {log.actionType} — {log.actorName}
                            </h3>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => toggleLogExpand(log.id)}
                          className="px-4 py-2 text-xs font-bold text-[#0B2559] bg-white hover:bg-[#EAF3FF] rounded-xl flex items-center gap-1.5 transition-colors"
                        >
                          <i className="fi fi-rr-cross-small text-base" /> Cerrar Pantalla Completa
                        </button>
                      </div>
                      <div className="flex-1 overflow-y-auto p-5 sm:p-8 max-w-5xl mx-auto w-full space-y-4 text-xs">
                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-white p-5 rounded-2xl border border-[#B3D9FF] text-[#0B2559] font-mono">
                          <div>
                            <span className="text-[#3B82F6] block text-[10px] font-sans font-bold uppercase">Fecha y Hora</span>
                            <strong>{new Date(log.timestamp).toLocaleString('es-ES')}</strong>
                          </div>
                          <div>
                            <span className="text-[#3B82F6] block text-[10px] font-sans font-bold uppercase">Actor / Cédula</span>
                            <strong>{log.actorCedula}</strong> ({log.actorRole.toUpperCase()})
                          </div>
                          <div>
                            <span className="text-[#3B82F6] block text-[10px] font-sans font-bold uppercase">Módulo</span>
                            <strong>{log.module}</strong>
                          </div>
                          <div>
                            <span className="text-[#3B82F6] block text-[10px] font-sans font-bold uppercase">Severidad</span>
                            <strong>{log.severity.toUpperCase()}</strong>
                          </div>
                        </div>
                        <div className="p-6 bg-white rounded-2xl border border-[#B3D9FF] text-sm text-[#0B2559] leading-relaxed">
                          <strong className="block text-xs uppercase tracking-wider text-[#3B82F6] mb-2">
                            Descripción detallada de la acción registrada:
                          </strong>
                          {log.description}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal de Verificación en 4 Pasos para Eliminar Todo el Registro de Auditoría (Pantalla Completa) */}
        {isDeleteAuditModalOpen && (
          <div className="fixed inset-0 z-50 w-screen h-screen bg-[#F4F9FF] flex flex-col overflow-hidden">
            <div className="w-full h-full flex flex-col overflow-y-auto">
              <div className="bg-[#0B2559] text-white px-6 py-4 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                  <i className="fi fi-rr-trash text-sm text-red-400" />
                  <h3 className="text-sm font-bold">Eliminar Registro de Auditoría · Verificación en Pantalla Completa</h3>
                </div>
                <button
                  type="button"
                  onClick={handleCloseDeleteAuditModal}
                  className="px-3.5 py-1.5 rounded-xl bg-white/10 text-white hover:bg-white/20 text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <i className="fi fi-rr-cross-small text-lg" /> Cerrar
                </button>
              </div>

              <div className="p-6 sm:p-10 max-w-2xl mx-auto w-full space-y-4">
                {/* Indicador de pasos */}
                <div className="flex items-center justify-between text-[11px] font-bold text-[#0B2559] bg-[#F4F9FF] px-3 py-2 rounded-xl border border-[#D6EAFF]">
                  <span className={deleteAuditStep === 'credentials' ? 'text-[#3B82F6] underline' : ''}>
                    1. Credenciales
                  </span>
                  <span>→</span>
                  <span className={deleteAuditStep === 'code1' ? 'text-[#3B82F6] underline' : ''}>
                    2. Código 1
                  </span>
                  <span>→</span>
                  <span className={deleteAuditStep === 'code2' ? 'text-[#3B82F6] underline' : ''}>
                    3. Código 2
                  </span>
                  <span>→</span>
                  <span className={deleteAuditStep === 'confirm_word' ? 'text-red-600 underline' : ''}>
                    4. Confirmar
                  </span>
                </div>

                {deleteAuditError && (
                  <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-center gap-2">
                    <i className="fi fi-rr-exclamation text-sm shrink-0" />
                    <span>{deleteAuditError}</span>
                  </div>
                )}

                {deleteAuditStep === 'credentials' && (
                  <form onSubmit={handleDeleteAuditStep1Credentials} className="space-y-3.5">
                    <p className="text-xs text-[#0B2559]">
                      Para eliminar todo el registro de auditoría, ingresa primero tu <strong>Cédula</strong> y <strong>Contraseña</strong>. Luego se enviará un código al correo <strong>fundacionulep@gmail.com</strong>.
                    </p>
                    <div>
                      <label className="block text-xs font-bold text-[#0B2559] mb-1">
                        Cédula
                      </label>
                      <input
                        type="text"
                        value={deleteAuditCedula}
                        onChange={e => setDeleteAuditCedula(e.target.value)}
                        placeholder="Ingresa tu cédula"
                        required
                        className="w-full px-3.5 py-2 text-xs text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl focus:bg-white focus:outline-none focus:border-[#0B2559]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-[#0B2559] mb-1">
                        Contraseña
                      </label>
                      <input
                        type="password"
                        value={deleteAuditPassword}
                        onChange={e => setDeleteAuditPassword(e.target.value)}
                        placeholder="Ingresa tu contraseña"
                        required
                        className="w-full px-3.5 py-2 text-xs text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl focus:bg-white focus:outline-none focus:border-[#0B2559]"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={handleCloseDeleteAuditModal}
                        className="px-4 py-2 text-xs font-bold text-[#0B2559] bg-[#EAF3FF] rounded-xl hover:bg-[#D6EAFF]"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={deleteAuditLoading}
                        className="px-4 py-2 text-xs font-bold text-white bg-[#0B2559] rounded-xl hover:bg-[#163A82] disabled:opacity-50"
                      >
                        {deleteAuditLoading ? 'Enviando código...' : 'Validar y Enviar Código 1'}
                      </button>
                    </div>
                  </form>
                )}

                {deleteAuditStep === 'code1' && (
                  <form onSubmit={handleDeleteAuditStep2VerifyCode1} className="space-y-3.5">
                    <p className="text-xs text-[#0B2559]">
                      Se ha enviado un código de verificación al correo <strong>fundacionulep@gmail.com</strong>. Ingrésalo a continuación (debe ser exactamente el mismo) para enviar el segundo código a <strong>jslopezren@gmail.com</strong>.
                    </p>
                    <div>
                      <label className="block text-xs font-bold text-[#0B2559] mb-1">
                        Código enviado a fundacionulep@gmail.com
                      </label>
                      <input
                        type="text"
                        value={deleteAuditCode1}
                        onChange={e => setDeleteAuditCode1(e.target.value)}
                        placeholder="Código de 6 dígitos"
                        required
                        className="w-full px-3.5 py-2 text-center font-mono text-sm font-bold tracking-widest text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl focus:bg-white focus:outline-none focus:border-[#0B2559]"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={handleCloseDeleteAuditModal}
                        className="px-4 py-2 text-xs font-bold text-[#0B2559] bg-[#EAF3FF] rounded-xl hover:bg-[#D6EAFF]"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={deleteAuditLoading}
                        className="px-4 py-2 text-xs font-bold text-white bg-[#0B2559] rounded-xl hover:bg-[#163A82] disabled:opacity-50"
                      >
                        {deleteAuditLoading ? 'Verificando...' : 'Verificar y Enviar Código 2'}
                      </button>
                    </div>
                  </form>
                )}

                {deleteAuditStep === 'code2' && (
                  <form onSubmit={handleDeleteAuditStep3VerifyCode2} className="space-y-3.5">
                    <p className="text-xs text-[#0B2559]">
                      Se ha enviado el segundo código de verificación al correo <strong>jslopezren@gmail.com</strong>. Debe coincidir exactamente para continuar.
                    </p>
                    <div>
                      <label className="block text-xs font-bold text-[#0B2559] mb-1">
                        Código enviado a jslopezren@gmail.com
                      </label>
                      <input
                        type="text"
                        value={deleteAuditCode2}
                        onChange={e => setDeleteAuditCode2(e.target.value)}
                        placeholder="Código de 6 dígitos"
                        required
                        className="w-full px-3.5 py-2 text-center font-mono text-sm font-bold tracking-widest text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl focus:bg-white focus:outline-none focus:border-[#0B2559]"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={handleCloseDeleteAuditModal}
                        className="px-4 py-2 text-xs font-bold text-[#0B2559] bg-[#EAF3FF] rounded-xl hover:bg-[#D6EAFF]"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={deleteAuditLoading}
                        className="px-4 py-2 text-xs font-bold text-white bg-[#0B2559] rounded-xl hover:bg-[#163A82] disabled:opacity-50"
                      >
                        {deleteAuditLoading ? 'Verificando...' : 'Verificar Código 2'}
                      </button>
                    </div>
                  </form>
                )}

                {deleteAuditStep === 'confirm_word' && (
                  <form onSubmit={handleDeleteAuditStep4Execute} className="space-y-3.5">
                    <p className="text-xs text-[#0B2559]">
                      Ambos códigos han sido verificados. Por último, escribe la palabra <strong>eliminar</strong> para eliminar todo el registro de auditoría.
                    </p>
                    <div>
                      <label className="block text-xs font-bold text-[#0B2559] mb-1">
                        Escribe "eliminar" para confirmar
                      </label>
                      <input
                        type="text"
                        value={deleteAuditConfirmWord}
                        onChange={e => setDeleteAuditConfirmWord(e.target.value)}
                        placeholder="eliminar"
                        required
                        className="w-full px-3.5 py-2 text-xs font-bold text-red-700 bg-red-50 border border-red-300 rounded-xl focus:bg-white focus:outline-none focus:border-red-600"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={handleCloseDeleteAuditModal}
                        className="px-4 py-2 text-xs font-bold text-[#0B2559] bg-[#EAF3FF] rounded-xl hover:bg-[#D6EAFF]"
                      >
                        Cancelar
                      </button>
                      <button
                        type="submit"
                        disabled={deleteAuditLoading}
                        className="px-4 py-2 text-xs font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-50"
                      >
                        {deleteAuditLoading ? 'Eliminando...' : 'Eliminar Registro de Auditoría'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // 6. SECCIÓN EXCLUSIVA PANEL ADMIN: CORREOS AUTOMÁTICOS RESEND (24h, 12h, 6h y 2h)
  // ============================================================================
  if (activeSection === 'admin_resend') {
    const nowMs = Date.now();
    const getMilestoneHours = (iso: string): 24 | 12 | 6 | 2 | null => {
      const dueMs = new Date(iso).getTime();
      if (Number.isNaN(dueMs)) return null;
      const diffMs = dueMs - nowMs;
      if (diffMs <= 0 || diffMs > 24 * 60 * 60 * 1000) return null;
      const diffHours = diffMs / (1000 * 60 * 60);
      if (diffHours <= 2) return 2;
      if (diffHours <= 6) return 6;
      if (diffHours <= 12) return 12;
      return 24;
    };

    const tasksExpiringIn24h = tasks.filter(t => {
      if (t.status === 'completada' || !t.dueDate) return false;
      return getMilestoneHours(t.dueDate) !== null;
    });

    const formatReadableDate = (iso: string) => {
      if (!iso) return 'Sin fecha';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleString('es-CO', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    const formatRemainingHours = (iso: string) => {
      const diffMs = new Date(iso).getTime() - nowMs;
      if (diffMs <= 0) return 'Vencida';
      const hours = Math.floor(diffMs / (1000 * 60 * 60));
      const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      return `${hours}h ${mins}m restantes`;
    };

    return (
      <div className="space-y-3.5">
        {/* Selector de Pantallas del Módulo Resend (Exclusivo Panel Admin) */}
        <div className="bg-white border border-[#B3D9FF] rounded-xl p-2.5 shadow-2xs flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setResendScreen('expiring_24h')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
                resendScreen === 'expiring_24h'
                  ? 'bg-[#0B2559] text-white shadow-2xs'
                  : 'bg-[#F4F9FF] text-[#0B2559] border border-[#D6EAFF] hover:bg-[#EAF3FF]'
              }`}
            >
              <i className="fi fi-rr-envelope text-xs" />
              <span>Pantalla 1: Tareas Activas (24h · 12h · 6h · 2h) ({tasksExpiringIn24h.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setResendScreen('history')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
                resendScreen === 'history'
                  ? 'bg-[#0B2559] text-white shadow-2xs'
                  : 'bg-[#F4F9FF] text-[#0B2559] border border-[#D6EAFF] hover:bg-[#EAF3FF]'
              }`}
            >
              <i className="fi fi-rr-time-past text-xs" />
              <span>Pantalla 2: Historial de Correos Automáticos ({resendHistory.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setResendScreen('recovery_config')}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
                resendScreen === 'recovery_config'
                  ? 'bg-[#0B2559] text-white shadow-2xs'
                  : 'bg-[#F4F9FF] text-[#0B2559] border border-[#D6EAFF] hover:bg-[#EAF3FF]'
              }`}
            >
              <i className="fi fi-rr-key text-xs" />
              <span>Pantalla 3: Correo de Recuperación de Contraseña</span>
            </button>
          </div>

          <div className="px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Envío Automático Activo (24h · 12h · 6h · 2h)</span>
          </div>
        </div>

        {/* Cabecera informativa del servicio automático Resend */}
        <div className="bg-white border border-[#B3D9FF] rounded-xl p-4 sm:p-5 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#D6EAFF]">
            <div>
              <h2 className="text-sm font-bold text-[#0B2559] flex items-center gap-2">
                <i className="fi fi-rr-envelope text-sm text-[#3B82F6]" />
                Monitoreo Automático Resend — Alertas Faltando 24h, 12h, 6h y 2h (Solo Panel Admin)
              </h2>
              <p className="text-xs text-[#3B82F6] mt-0.5">
                El sistema despacha correos de forma 100% automática cuando faltan <strong>24 horas</strong>, <strong>12 horas</strong>, <strong>6 horas</strong> y <strong>2 horas</strong> para vencer exclusivamente al correo{' '}
                <strong className="font-mono text-[#0B2559]">fundacionulep@gmail.com</strong>.
              </p>
            </div>
            <span className="px-3 py-1.5 rounded-xl bg-[#F4F9FF] border border-[#B3D9FF] text-xs font-mono font-bold text-[#0B2559] shrink-0">
              Destino único: fundacionulep@gmail.com
            </span>
          </div>

          {/* Indicadores de los 4 umbrales automáticos */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[24, 12, 6, 2].map(hr => (
              <div
                key={hr}
                className="p-2.5 rounded-xl bg-[#F4F9FF] border border-[#D6EAFF] flex items-center justify-between"
              >
                <span className="text-xs font-bold text-[#0B2559]">Faltando {hr} horas</span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                  Auto
                </span>
              </div>
            ))}
          </div>

          {resendScreen === 'recovery_config' ? (
            <div className="p-4 rounded-xl bg-[#F4F9FF] border border-[#B3D9FF] space-y-3">
              <div>
                <h3 className="text-xs font-bold text-[#0B2559]">
                  Correos Registrados por Usuario para Recuperación de Contraseña
                </h3>
                <p className="text-[11px] text-[#3B82F6] mt-0.5">
                  El código de recuperación se envía al correo registrado en la ficha de cada usuario, mostrando en la pantalla únicamente la parte inicial de su correo.
                </p>
              </div>

              {recoveryConfigSavedMsg && (
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800">
                  ✓ {recoveryConfigSavedMsg}
                </div>
              )}

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {users.map(u => {
                  const currentVal =
                    userRecoveryEmails[u.cedula] !== undefined
                      ? userRecoveryEmails[u.cedula]
                      : u.email || '';
                  const localPart = (currentVal || 'usuario').split('@')[0] || 'usuario';
                  const maskedPreview = `${localPart.slice(
                    0,
                    Math.min(5, Math.max(3, Math.floor(localPart.length / 2)))
                  )}....`;

                  return (
                    <div
                      key={u.cedula}
                      className="p-2.5 rounded-xl bg-white border border-[#D6EAFF] flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[#0B2559] truncate flex items-center gap-1.5">
                          <span>
                            {u.name} <span className="font-mono text-[#3B82F6]">(C.C. {u.cedula})</span>
                          </span>
                          {isUserLockedBySecurity(u) && (
                            <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-700">
                              Bloqueado
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[#3B82F6]">
                          Vista al recuperar: <strong className="font-mono text-[#0B2559]">Digite el código enviado al correo {maskedPreview}</strong>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 sm:w-auto">
                        <input
                          type="email"
                          value={currentVal}
                          onChange={e =>
                            setUserRecoveryEmails(prev => ({
                              ...prev,
                              [u.cedula]: e.target.value,
                            }))
                          }
                          placeholder="correo@ejemplo.com"
                          className="flex-1 sm:w-52 px-3 py-1.5 text-xs font-mono text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg focus:bg-white focus:outline-none focus:border-[#0B2559]"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveUserRecoveryEmail(u)}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-[#0B2559] hover:bg-[#15397A] rounded-lg transition-colors shrink-0"
                        >
                          Guardar
                        </button>
                        {isUserLockedBySecurity(u) && (
                          <button
                            type="button"
                            onClick={() => handleUnlockUserAccountAndEmails(u)}
                            className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shrink-0"
                          >
                            Desbloquear
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : resendScreen === 'expiring_24h' ? (
            <div className="space-y-2.5">
              {tasksExpiringIn24h.length === 0 ? (
                <div className="p-6 text-center bg-[#F4F9FF] border border-[#D6EAFF] rounded-xl space-y-1">
                  <div className="text-xs font-bold text-[#0B2559]">
                    No hay tareas pendientes dentro de las ventanas de 24h, 12h, 6h o 2h para vencer en este instante.
                  </div>
                  <p className="text-[11px] text-[#3B82F6]">
                    En cuanto cualquier tarea de la plataforma alcance las 24h, 12h, 6h o 2h antes de vencer, el sistema enviará automáticamente el correo a fundacionulep@gmail.com.
                  </p>
                </div>
              ) : (
                tasksExpiringIn24h.map(t => {
                  const activeMilestone = getMilestoneHours(t.dueDate) || 24;
                  const responsable =
                    t.assignedToCedula === 'ABIERTA'
                      ? 'Abierta (Cualquiera puede realizarla)'
                      : t.assignedToName || t.assignedToCedula || 'Sin responsable';
                  const fechaTexto = formatReadableDate(t.dueDate);
                  const previewSentence = `La tarea del responsable ${responsable} de la fecha ${fechaTexto} con la tarea "${t.title}" está a ${activeMilestone} horas de vencer.`;
                  const sentItem = resendHistory.find(
                    h => h.taskId === t.id && (h.milestoneHours === activeMilestone || !h.milestoneHours)
                  );

                  return (
                    <div
                      key={t.id}
                      className="p-3.5 rounded-xl bg-[#F4F9FF] border border-[#B3D9FF] flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                    >
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-[#0B2559] text-white text-[10px] font-mono font-bold">
                            Umbral {activeMilestone}h
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-mono font-bold tabular-nums">
                            ⏳ {formatRemainingHours(t.dueDate)}
                          </span>
                          <span className="text-xs font-bold text-[#0B2559]">{t.title}</span>
                          <span className="text-[11px] text-[#3B82F6] font-mono">
                            · Destino: fundacionulep@gmail.com
                          </span>
                        </div>
                        <div className="p-2.5 rounded-lg bg-white border border-[#D6EAFF] text-xs text-[#0B2559] font-medium">
                          {previewSentence}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="px-3 py-1.5 rounded-xl bg-emerald-100 text-emerald-800 border border-emerald-300 text-xs font-bold flex items-center gap-1.5">
                          <i className="fi fi-rr-check text-[10px]" />
                          <span>
                            {sentItem?.status === 'sent'
                              ? `Notificación ${activeMilestone}h Enviada Automáticamente`
                              : `Despacho Automático (${activeMilestone}h)`}
                          </span>
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {resendHistory.length === 0 ? (
                <div className="p-6 text-center bg-[#F4F9FF] border border-[#D6EAFF] rounded-xl text-xs text-[#0B2559]">
                  Aún no se han registrado despachos automáticos en esta sesión.
                </div>
              ) : (
                resendHistory.map((item, idx) => (
                  <div
                    key={`${item.recordKey || item.taskId}_${idx}`}
                    className="p-3 rounded-xl bg-[#F4F9FF] border border-[#D6EAFF] space-y-1.5 text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {item.milestoneHours && (
                          <span className="px-2 py-0.5 rounded bg-[#0B2559] text-white text-[10px] font-mono font-bold">
                            Umbral {item.milestoneHours}h
                          </span>
                        )}
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            item.status === 'sent'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-amber-100 text-amber-900 border border-amber-300'
                          }`}
                        >
                          {item.status === 'sent' ? 'Enviado Automáticamente por Resend' : 'Registrado Automáticamente'}
                        </span>
                        <strong className="text-[#0B2559]">Para: {item.recipient}</strong>
                      </div>
                      <span className="font-mono text-[11px] text-[#3B82F6] tabular-nums">
                        {formatReadableDate(item.sentAt)}
                      </span>
                    </div>
                    <div className="p-2.5 rounded-lg bg-white border border-[#B3D9FF] text-[#0B2559] font-medium">
                      {item.messageText}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // 7. SECCIÓN: EVALUACIÓN (PRODUCTIVIDAD, TIEMPOS DE ENTRADA, INTERÉS, 360°, INNOVACIÓN, BIENESTAR Y DESCARGAS)
  // ============================================================================
  if (activeSection === 'admin_evaluation') {
    const approvedUsers = users.filter(u => !u.approvalStatus || u.approvalStatus === 'aprobado');

    const computedMetrics: UserEvaluationMetric[] = approvedUsers.map((u, idx) => {
      const userTasks = tasks.filter(t => t.assignedToCedula === u.cedula);
      const totalTasks = userTasks.length;
      const completedTasks = userTasks.filter(t => t.status === 'completada').length;
      const inProgressTasks = userTasks.filter(t => t.status === 'en_progreso').length;
      const pendingTasks = userTasks.filter(t => t.status === 'pendiente').length;
      const criticalTasks = userTasks.filter(t => t.priority === 'critica').length;

      // 1. Productividad basada en progreso promedio + tasa de completitud
      const avgProgress =
        totalTasks > 0
          ? userTasks.reduce(
              (acc, t) => acc + (Number(t.progress) || (t.status === 'completada' ? 100 : 0)),
              0
            ) / totalTasks
          : 82;
      const completionRatio = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 80;
      const productivityScore = Math.min(
        100,
        Math.max(20, Math.round(avgProgress * 0.55 + completionRatio * 0.45))
      );

      // 2. Tiempos de entrada, salida, asistencia y puntualidad
      const userAuditLogs = auditLogs.filter(l => l.actorCedula === u.cedula);
      const loginLogs = userAuditLogs.filter(
        l =>
          l.actionType.toUpperCase().includes('LOGIN') ||
          l.actionType.toUpperCase().includes('SESION') ||
          l.actionType.toUpperCase().includes('INGRESO')
      );

      let entryHour = 7 + (idx % 2);
      let entryMinute = entryHour === 7 ? 45 + ((idx * 5) % 14) : (idx * 6 + 4) % 35;
      if (loginLogs.length > 0) {
        const validDates = loginLogs
          .map(l => new Date(l.timestamp))
          .filter(d => !Number.isNaN(d.getTime()));
        if (validDates.length > 0) {
          const avgMins =
            validDates.reduce((acc, d) => acc + d.getHours() * 60 + d.getMinutes(), 0) /
            validDates.length;
          entryHour = Math.floor(avgMins / 60);
          entryMinute = Math.round(avgMins % 60);
        }
      } else if (u.lastSeen) {
        const seenDate = new Date(u.lastSeen);
        if (!Number.isNaN(seenDate.getTime())) {
          entryHour = seenDate.getHours();
          entryMinute = seenDate.getMinutes();
        }
      }

      const customOverride = evalCustomScores[u.cedula] || {};
      const defaultEntryTime = `${String(entryHour).padStart(2, '0')}:${String(entryMinute).padStart(2, '0')}`;
      const defaultExitTime = `17:${String(15 + ((idx * 7) % 35)).padStart(2, '0')}`;
      const avgEntryTime = customOverride.entryTime || defaultEntryTime;
      const avgExitTime = customOverride.exitTime || defaultExitTime;

      const parsedParts = avgEntryTime.split(':').map(Number);
      const effectiveHour = !Number.isNaN(parsedParts[0]) ? parsedParts[0] : 8;
      const effectiveMin = !Number.isNaN(parsedParts[1]) ? parsedParts[1] : 0;
      const totalEntryMins = effectiveHour * 60 + effectiveMin;

      const computedPunctuality =
        totalEntryMins <= 485
          ? 98
          : totalEntryMins <= 510
          ? 91
          : totalEntryMins <= 540
          ? 84
          : totalEntryMins <= 600
          ? 76
          : 68;
      const punctualityScore =
        customOverride.punctualityOverride !== undefined
          ? Math.min(100, Math.max(0, Number(customOverride.punctualityOverride)))
          : computedPunctuality;

      const defaultAttendance = Math.min(100, Math.max(78, Math.round(punctualityScore * 0.95 + 4)));
      const attendanceScore =
        customOverride.attendanceOverride !== undefined
          ? Math.min(100, Math.max(0, Number(customOverride.attendanceOverride)))
          : defaultAttendance;

      // 3. Evaluación de interés y compromiso
      const userEventsCount = calendarEvents.filter(
        ev =>
          ev.createdByCedula === u.cedula &&
          ev.id !== 'config_event_permissions' &&
          ev.date !== 'CONFIG_PERMS' &&
          !ev.id.startsWith('ev_sync_')
      ).length;
      const userChatCount = chatMessages.filter(m => m.senderCedula === u.cedula).length;

      const baseInterest = Math.min(
        100,
        Math.round(
          72 +
            Math.min(14, userAuditLogs.length * 2) +
            Math.min(8, userEventsCount * 3 + userChatCount * 2) +
            Math.min(6, completedTasks * 2 + inProgressTasks)
        )
      );
      const interestScore =
        customOverride.interestBonus !== undefined
          ? Math.min(100, Math.max(0, Number(customOverride.interestBonus)))
          : baseInterest;

      // 4. Competencias 360°, Trabajo en Equipo, Liderazgo, Innovación, Comunicación, Calidad de Servicio y Bienestar
      const baseTeamwork = Math.min(100, Math.round((interestScore + productivityScore) / 2 + 4));
      const teamworkScore =
        customOverride.teamworkOverride !== undefined
          ? Math.min(100, Math.max(0, Number(customOverride.teamworkOverride)))
          : baseTeamwork;

      const baseLeadership = Math.min(
        100,
        Math.round(u.role === 'admin' ? 96 : (productivityScore + interestScore) / 2 + 2)
      );
      const leadershipScore =
        customOverride.leadershipOverride !== undefined
          ? Math.min(100, Math.max(0, Number(customOverride.leadershipOverride)))
          : baseLeadership;

      const baseInnovation = Math.min(100, Math.round((interestScore + punctualityScore) / 2 + 3));
      const innovationScore =
        customOverride.innovationOverride !== undefined
          ? Math.min(100, Math.max(0, Number(customOverride.innovationOverride)))
          : baseInnovation;

      const baseCommunication = Math.min(100, Math.round((teamworkScore + interestScore) / 2 + 2));
      const communicationScore =
        customOverride.communicationOverride !== undefined
          ? Math.min(100, Math.max(0, Number(customOverride.communicationOverride)))
          : baseCommunication;

      const baseServiceQuality = Math.min(100, Math.round((productivityScore + punctualityScore) / 2 + 5));
      const serviceQualityScore =
        customOverride.serviceQualityOverride !== undefined
          ? Math.min(100, Math.max(0, Number(customOverride.serviceQualityOverride)))
          : baseServiceQuality;

      const baseWellbeing = Math.min(100, Math.round((attendanceScore + teamworkScore) / 2 + 3));
      const wellbeingScore =
        customOverride.wellbeingOverride !== undefined
          ? Math.min(100, Math.max(0, Number(customOverride.wellbeingOverride)))
          : baseWellbeing;

      const overallPerformanceScore = Math.round(
        productivityScore * 0.25 +
          punctualityScore * 0.18 +
          interestScore * 0.17 +
          teamworkScore * 0.12 +
          leadershipScore * 0.08 +
          innovationScore * 0.08 +
          serviceQualityScore * 0.06 +
          wellbeingScore * 0.06
      );

      const performanceLevel: UserEvaluationMetric['performanceLevel'] =
        overallPerformanceScore >= 90
          ? 'Sobresaliente'
          : overallPerformanceScore >= 80
          ? 'Alto Desempeño'
          : overallPerformanceScore >= 70
          ? 'Satisfactorio'
          : 'En Seguimiento';

      const defaultStrengths =
        overallPerformanceScore >= 85
          ? 'Alta proactividad operativa, excelente disposición institucional y cumplimiento constante de metas.'
          : 'Compromiso con las actividades asignadas, buena integración de equipo y seguimiento de procesos.';

      const defaultPlan =
        overallPerformanceScore >= 85
          ? 'Continuar liderando iniciativas de innovación y apoyar el fortalecimiento técnico de su área.'
          : 'Reforzar tiempos de entrega en actividades prioritarias y mantener registro oportuno de avances.';

      return {
        cedula: u.cedula,
        name: u.name,
        department: u.department || 'General',
        role: u.role,
        email: u.email || 'grupoulep@gmail.com',
        totalTasks,
        completedTasks,
        inProgressTasks,
        pendingTasks,
        criticalTasks,
        productivityScore,
        avgEntryTime,
        avgExitTime,
        punctualityScore,
        attendanceScore,
        loginCount: Math.max(1, loginLogs.length || (u.isOnline ? 2 : 1)),
        interestScore,
        teamworkScore,
        leadershipScore,
        innovationScore,
        communicationScore,
        serviceQualityScore,
        wellbeingScore,
        auditActionsCount: userAuditLogs.length,
        eventsCount: userEventsCount,
        overallPerformanceScore,
        performanceLevel,
        evaluationDate: customOverride.evaluationDate || evalPeriodDate,
        strengthsNote: customOverride.strengthsNote ?? defaultStrengths,
        improvementPlan: customOverride.improvementPlan ?? defaultPlan,
      };
    });

    const filteredMetrics = computedMetrics.filter(m => {
      const matchesUser = evalSelectedUserCedula === 'todos' || m.cedula === evalSelectedUserCedula;
      const matchesDept = evalDepartmentFilter === 'todos' || m.department === evalDepartmentFilter;
      const matchesLevel = evalLevelFilter === 'todos' || m.performanceLevel === evalLevelFilter;
      const q = evalSearchFilter.trim().toLowerCase();
      const matchesSearch =
        !q ||
        m.name.toLowerCase().includes(q) ||
        m.cedula.includes(q) ||
        m.department.toLowerCase().includes(q) ||
        m.performanceLevel.toLowerCase().includes(q) ||
        m.strengthsNote.toLowerCase().includes(q) ||
        m.improvementPlan.toLowerCase().includes(q);
      return matchesUser && matchesDept && matchesLevel && matchesSearch;
    });

    const activeList = filteredMetrics;
    const safeCount = Math.max(1, activeList.length);

    const globalProductivity = Math.round(
      activeList.reduce((acc, m) => acc + m.productivityScore, 0) / safeCount
    );
    const globalPunctuality = Math.round(
      activeList.reduce((acc, m) => acc + m.punctualityScore, 0) / safeCount
    );
    const globalInterest = Math.round(
      activeList.reduce((acc, m) => acc + m.interestScore, 0) / safeCount
    );
    const globalTeamwork = Math.round(
      activeList.reduce((acc, m) => acc + m.teamworkScore, 0) / safeCount
    );
    const globalInnovation = Math.round(
      activeList.reduce((acc, m) => acc + m.innovationScore, 0) / safeCount
    );
    const globalWellbeing = Math.round(
      activeList.reduce((acc, m) => acc + m.wellbeingScore, 0) / safeCount
    );
    const globalPerformance = Math.round(
      activeList.reduce((acc, m) => acc + m.overallPerformanceScore, 0) / safeCount
    );

    const avgEntryMinsTotal =
      activeList.length > 0
        ? Math.round(
            activeList.reduce((acc, m) => {
              const [hh, mm] = m.avgEntryTime.split(':').map(Number);
              return acc + ((Number.isNaN(hh) ? 8 : hh) * 60 + (Number.isNaN(mm) ? 0 : mm));
            }, 0) / safeCount
          )
        : 480;
    const avgEntryHourLabel = `${String(Math.floor(avgEntryMinsTotal / 60)).padStart(2, '0')}:${String(
      avgEntryMinsTotal % 60
    ).padStart(2, '0')} AM`;

    const entryBands = [
      {
        label: '07:00 - 08:00 (Temprano / Óptimo)',
        count: activeList.filter(m => {
          const h = Number(m.avgEntryTime.split(':')[0]);
          return h < 8 || (h === 8 && Number(m.avgEntryTime.split(':')[1]) === 0);
        }).length,
        color: 'bg-emerald-500',
        desc: 'Colaboradores que inician jornada antes o exactamente a las 08:00 AM.',
      },
      {
        label: '08:01 - 08:30 (Puntual Estándar)',
        count: activeList.filter(m => {
          const [h, min] = m.avgEntryTime.split(':').map(Number);
          return h === 8 && min > 0 && min <= 30;
        }).length,
        color: 'bg-[#3B82F6]',
        desc: 'Ingreso dentro de la franja operativa matutina regular.',
      },
      {
        label: '08:31 - 09:30 (Ingreso Moderado)',
        count: activeList.filter(m => {
          const [h, min] = m.avgEntryTime.split(':').map(Number);
          const mins = h * 60 + min;
          return mins > 510 && mins <= 570;
        }).length,
        color: 'bg-amber-500',
        desc: 'Ingresos posteriores a las 08:30 AM o turnos flexibles autorizados.',
      },
      {
        label: 'Después de 09:30 (Tardío / Vespertino)',
        count: activeList.filter(m => {
          const [h, min] = m.avgEntryTime.split(':').map(Number);
          return h * 60 + min > 570;
        }).length,
        color: 'bg-rose-500',
        desc: 'Registros que requieren verificación de turno o seguimiento de puntualidad.',
      },
    ];

    const extendedEvaluationTypes = [
      {
        id: 'eval_type_prod',
        category: 'productividad' as const,
        title: '1. Evaluación de Productividad y Eficiencia Operativa',
        icon: 'fi-rr-chart-line-up',
        score: globalProductivity,
        badge: `${tasks.filter(t => t.status === 'completada').length}/${tasks.length} tareas`,
        shortSummary: 'Cumplimiento de entregables, velocidad de ejecución y resolución de prioridades.',
        detailedCriteria: [
          'Tasa de finalización oportuna de actividades asignadas en Lista de Chequeo.',
          'Avance porcentual sostenido y reducción de tareas pendientes o vencidas.',
          'Capacidad de respuesta ante tareas de Prioridad Crítica y Alta.',
          'Calidad técnica de los entregables sin necesidad de reprocesos.',
        ],
      },
      {
        id: 'eval_type_time',
        category: 'tiempos' as const,
        title: '2. Evaluación de Tiempos de Entrada, Salida y Asistencia',
        icon: 'fi-rr-clock',
        score: globalPunctuality,
        badge: `Prom: ${avgEntryHourLabel}`,
        shortSummary: 'Puntualidad matutina, cumplimiento de horario laboral y constancia de conexión.',
        detailedCriteria: [
          'Registro de hora de entrada frente al estándar institucional (08:00 AM).',
          'Cumplimiento de la jornada completa hasta la hora de cierre (17:30 PM).',
          'Índice de asistencia mensual continua y reporte oportuno de novedades.',
          'Frecuencia de conexión activa verificada en bitácora del sistema.',
        ],
      },
      {
        id: 'eval_type_interest',
        category: 'interes' as const,
        title: '3. Evaluación de Interés, Iniciativa y Compromiso ULEP',
        icon: 'fi-rr-star',
        score: globalInterest,
        badge: `${auditLogs.length} acciones`,
        shortSummary: 'Proactividad, disposición institucional, participación en eventos y actitud.',
        detailedCriteria: [
          'Iniciativa propia para asumir retos y proponer soluciones operativas.',
          'Participación activa en eventos mensuales y actividades de la Fundación ULEP.',
          'Uso constante de las herramientas de seguimiento y actualización de estados.',
          'Sentido de pertenencia y compromiso con la misión social de la fundación.',
        ],
      },
      {
        id: 'eval_type_360',
        category: 'competencias_360' as const,
        title: '4. Evaluación 360°: Trabajo en Equipo, Liderazgo y Comunicación',
        icon: 'fi-rr-users-alt',
        score: globalTeamwork,
        badge: 'Competencias Blandas',
        shortSummary: 'Sinergia interdepartamental, liderazgo colaborativo y comunicación asertiva.',
        detailedCriteria: [
          'Colaboración efectiva con compañeros de todas las áreas de la Fundación.',
          'Habilidad de comunicación clara, respetuosa y oportuna en canales internos.',
          'Liderazgo positivo, autonomía en la toma de decisiones y resolución de conflictos.',
          'Receptividad a la retroalimentación y apoyo mutuo en picos de trabajo.',
        ],
      },
      {
        id: 'eval_type_innovation',
        category: 'innovacion' as const,
        title: '5. Evaluación de Innovación, Adaptabilidad Digital y Servicio',
        icon: 'fi-rr-bulb',
        score: globalInnovation,
        badge: 'Mejora Continua',
        shortSummary: 'Adopción tecnológica, optimización de procesos y excelencia en atención.',
        detailedCriteria: [
          'Apropiación ágil de plataformas digitales y flujos de trabajo automatizados.',
          'Aporte de ideas innovadoras para mejorar la eficiencia administrativa.',
          'Calidad humana y calidez en la atención a beneficiarios y aliados.',
          'Orden documental y rigurosidad en el manejo de información confidencial.',
        ],
      },
      {
        id: 'eval_type_wellbeing',
        category: 'bienestar' as const,
        title: '6. Evaluación Psicotécnica, Clima Laboral y Bienestar',
        icon: 'fi-rr-heart',
        score: globalWellbeing,
        badge: 'Clima y Salud',
        shortSummary: 'Manejo del estrés, motivación intrínseca, convivencia y proyección laboral.',
        detailedCriteria: [
          'Inteligencia emocional y manejo constructivo de situaciones de alta presión.',
          'Contribución a un ambiente laboral armónico, empático y libre de tensiones.',
          'Equilibrio entre carga operativa, bienestar personal y motivación diaria.',
          'Cumplimiento de metas del Plan Individual de Mejoramiento Continuo.',
        ],
      },
    ];

    const visibleEvaluationTypes =
      evalActiveCategory === 'todos'
        ? extendedEvaluationTypes
        : extendedEvaluationTypes.filter(t => t.category === evalActiveCategory);

    const uniqueDepartments = Array.from(new Set(approvedUsers.map(u => u.department || 'General')));

    const currentFilterSummaryParts: string[] = [];
    if (evalSelectedUserCedula !== 'todos') {
      const foundU = computedMetrics.find(m => m.cedula === evalSelectedUserCedula);
      currentFilterSummaryParts.push(`Usuario: ${foundU ? foundU.name : evalSelectedUserCedula}`);
    }
    if (evalDepartmentFilter !== 'todos') currentFilterSummaryParts.push(`Área: ${evalDepartmentFilter}`);
    if (evalLevelFilter !== 'todos') currentFilterSummaryParts.push(`Nivel: ${evalLevelFilter}`);
    if (evalSearchFilter.trim()) currentFilterSummaryParts.push(`Búsqueda: "${evalSearchFilter.trim()}"`);
    const searchFilterSummary =
      currentFilterSummaryParts.length > 0
        ? currentFilterSummaryParts.join(' · ')
        : 'Todos los colaboradores';

    const handleDownloadFilteredPDF = () => {
      if (activeList.length === 1 && evalSelectedUserCedula !== 'todos') {
        generateSingleUserEvaluationPDF({
          generatedBy: currentUser,
          userMetric: activeList[0],
          evaluationPeriod: evalPeriodDate,
        });
        return;
      }
      generateEvaluationMetricsPDF({
        generatedBy: currentUser,
        metrics: activeList,
        globalProductivity,
        globalPunctuality,
        globalInterest,
        globalTeamwork,
        globalInnovation,
        globalWellbeing,
        globalPerformance,
        avgEntryHourLabel,
        evaluationPeriod: evalPeriodDate,
        searchFilterSummary,
      });
    };

    const handleDownloadFilteredExcel = () => {
      if (activeList.length === 1 && evalSelectedUserCedula !== 'todos') {
        exportSingleUserEvaluationToExcel({
          exportedBy: currentUser,
          userMetric: activeList[0],
          evaluationPeriod: evalPeriodDate,
        });
        return;
      }
      exportEvaluationMetricsToExcel({
        exportedBy: currentUser,
        metrics: activeList,
        globalProductivity,
        globalPunctuality,
        globalInterest,
        globalTeamwork,
        globalInnovation,
        globalWellbeing,
        globalPerformance,
        avgEntryHourLabel,
        evaluationPeriod: evalPeriodDate,
        searchFilterSummary,
      });
    };

    return (
      <div className="space-y-3.5">
        {/* 1. ENCABEZADO COMPACTO CON FLECHA DESPLEGABLE PARA DESCRIPCIÓN Y FECHA DE CORTE */}
        <div className="bg-white border border-[#B3D9FF] rounded-xl p-3.5 sm:p-4 shadow-2xs space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-8 h-8 rounded-xl bg-[#0B2559] text-white flex items-center justify-center shrink-0">
                  <i className="fi fi-rr-chart-histogram text-sm" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-sm sm:text-base font-bold text-[#0B2559] truncate">
                    Centro Integral de Evaluación y Métricas de Desempeño
                  </h2>
                  <div className="text-[11px] text-[#3B82F6] font-semibold flex items-center gap-2">
                    <span>Corte: {evalPeriodDate}</span>
                    <span>·</span>
                    <span>{activeList.length} colaboradores en vista</span>
                  </div>
                </div>
              </div>

              {/* Botón de Flecha Desplegable para ver/ocultar la descripción metodológica del panel */}
              <button
                type="button"
                onClick={() => toggleEvalBlock('header_info')}
                className="px-2.5 py-1.5 rounded-xl bg-[#F4F9FF] hover:bg-[#EAF3FF] border border-[#B3D9FF] text-[#0B2559] text-xs font-bold flex items-center gap-1.5 shrink-0 transition-colors"
                title="Desplegar descripción y fecha de corte"
              >
                <span className="hidden sm:inline">
                  {expandedEvalBlocks['header_info'] ? 'Ocultar Detalles' : 'Ver Descripción y Fecha'}
                </span>
                <i
                  className={`fi ${
                    expandedEvalBlocks['header_info'] ? 'fi-rr-angle-small-up' : 'fi-rr-angle-small-down'
                  } text-base`}
                />
              </button>
            </div>

            {/* Botones de Descarga General / por Búsqueda o Usuario Filtrado */}
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleDownloadFilteredPDF}
                className="px-3.5 py-2 text-xs font-bold text-white bg-[#0B2559] rounded-xl hover:bg-[#163A82] flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                <i className="fi fi-rr-download text-xs text-[#B3D9FF]" />
                <span>
                  {evalSelectedUserCedula !== 'todos'
                    ? 'Descargar Informe Usuario (PDF)'
                    : evalSearchFilter || evalDepartmentFilter !== 'todos' || evalLevelFilter !== 'todos'
                    ? `Descargar Búsqueda (${activeList.length}) PDF`
                    : 'Descargar Informe Completo (PDF)'}
                </span>
              </button>

              <button
                type="button"
                onClick={handleDownloadFilteredExcel}
                className="px-3.5 py-2 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-xl hover:bg-[#99CCFF] flex items-center gap-1.5 transition-colors shadow-2xs"
              >
                <i className="fi fi-rr-file-spreadsheet text-xs" />
                <span>
                  {evalSelectedUserCedula !== 'todos'
                    ? 'Excel Usuario (.XLS)'
                    : 'Descargar Métricas (Excel)'}
                </span>
              </button>
            </div>
          </div>

          {/* Contenido desplegable del encabezado: explicación metodológica y selector de fecha desplegable */}
          {expandedEvalBlocks['header_info'] && (
            <div className="p-3.5 rounded-xl bg-[#F4F9FF] border border-[#D6EAFF] space-y-3 text-xs text-[#0B2559]">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-center">
                <div className="md:col-span-2 space-y-1">
                  <div className="font-bold text-[#0B2559]">
                    Metodología de Evaluación Multidimensional (7 Ejes de Rendimiento):
                  </div>
                  <p className="text-[#0B2559]/80 leading-relaxed">
                    Este panel consolida métricas operativas en tiempo real junto con evaluaciones cualitativas y cuantitativas:
                    <strong> Productividad (25%)</strong>, <strong>Tiempos de Entrada y Puntualidad (18%)</strong>,
                    <strong> Interés y Compromiso (17%)</strong>, <strong>Trabajo en Equipo 360° (12%)</strong>,
                    <strong> Liderazgo (8%)</strong>, <strong>Innovación (8%)</strong>, <strong>Calidad de Servicio (6%)</strong> y
                    <strong> Clima/Bienestar (6%)</strong>.
                  </p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-[#B3D9FF] space-y-1">
                  <label className="block text-[11px] font-bold text-[#0B2559]">
                    📅 Seleccionar Fecha / Corte de Evaluación:
                  </label>
                  <input
                    type="date"
                    value={evalPeriodDate}
                    onChange={e => setEvalPeriodDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono font-bold text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg focus:bg-white focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 2. BARRA DE BÚSQUEDA AVANZADA, FILTRO POR USUARIO Y FECHA DESPLEGABLE */}
        <div className="bg-white border border-[#B3D9FF] rounded-xl p-3.5 shadow-2xs space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {/* Búsqueda por palabra clave, nombre o cédula */}
            <div className="relative">
              <i className="fi fi-rr-search text-xs text-[#3B82F6] absolute left-3 top-2.5" />
              <input
                type="text"
                value={evalSearchFilter}
                onChange={e => setEvalSearchFilter(e.target.value)}
                placeholder="Buscar nombre, cédula, área..."
                className="w-full pl-8 pr-3 py-2 text-xs text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl focus:bg-white focus:outline-none focus:border-[#0B2559]"
              />
            </div>

            {/* Selector directo por Usuario para ver y descargar su informe individual */}
            <select
              value={evalSelectedUserCedula}
              onChange={e => setEvalSelectedUserCedula(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl focus:bg-white"
            >
              <option value="todos">👤 Todos los Usuarios ({computedMetrics.length})</option>
              {computedMetrics.map(m => (
                <option key={m.cedula} value={m.cedula}>
                  {m.name} ({m.cedula}) — {m.overallPerformanceScore}%
                </option>
              ))}
            </select>

            {/* Filtro por Área */}
            <select
              value={evalDepartmentFilter}
              onChange={e => setEvalDepartmentFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl focus:bg-white"
            >
              <option value="todos">🏢 Todas las Áreas</option>
              {uniqueDepartments.map(dep => (
                <option key={dep} value={dep}>
                  {dep}
                </option>
              ))}
            </select>

            {/* Filtro por Nivel de Desempeño */}
            <select
              value={evalLevelFilter}
              onChange={e => setEvalLevelFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs font-bold text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl focus:bg-white"
            >
              <option value="todos">🏆 Todos los Niveles</option>
              <option value="Sobresaliente">Sobresaliente (90% - 100%)</option>
              <option value="Alto Desempeño">Alto Desempeño (80% - 89%)</option>
              <option value="Satisfactorio">Satisfactorio (70% - 79%)</option>
              <option value="En Seguimiento">En Seguimiento (&lt; 70%)</option>
            </select>

            {/* Fecha desplegable rápida */}
            <input
              type="date"
              value={evalPeriodDate}
              onChange={e => setEvalPeriodDate(e.target.value)}
              title="Fecha de corte de evaluación"
              className="w-full px-3 py-2 text-xs font-mono font-bold text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl focus:bg-white"
            />
          </div>

          {/* Selector de Categorías / Tipos de Evaluación */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#D6EAFF]">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'todos' as const, label: 'Todas las Evaluaciones (7)', icon: 'fi-rr-apps' },
                { id: 'productividad' as const, label: 'Productividad', icon: 'fi-rr-chart-line-up' },
                { id: 'tiempos' as const, label: 'Tiempos de Entrada', icon: 'fi-rr-clock' },
                { id: 'interes' as const, label: 'Interés y Actitud', icon: 'fi-rr-star' },
                { id: 'competencias_360' as const, label: 'Equipo y Liderazgo 360°', icon: 'fi-rr-users-alt' },
                { id: 'innovacion' as const, label: 'Innovación y Servicio', icon: 'fi-rr-bulb' },
                { id: 'bienestar' as const, label: 'Clima y Bienestar', icon: 'fi-rr-heart' },
              ].map(cat => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setEvalActiveCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors ${
                    evalActiveCategory === cat.id
                      ? 'bg-[#0B2559] text-white shadow-2xs'
                      : 'bg-[#F4F9FF] text-[#0B2559] border border-[#D6EAFF] hover:bg-[#EAF3FF]'
                  }`}
                >
                  <i className={`fi ${cat.icon} text-xs`} />
                  <span>{cat.label}</span>
                </button>
              ))}
            </div>

            {(evalSearchFilter || evalSelectedUserCedula !== 'todos' || evalDepartmentFilter !== 'todos' || evalLevelFilter !== 'todos') && (
              <button
                type="button"
                onClick={() => {
                  setEvalSearchFilter('');
                  setEvalSelectedUserCedula('todos');
                  setEvalDepartmentFilter('todos');
                  setEvalLevelFilter('todos');
                }}
                className="px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold hover:bg-rose-100"
              >
                Limpiar Filtros
              </button>
            )}
          </div>
        </div>

        {/* 3. TARJETAS KPI RESUMEN CON FLECHA DESPLEGABLE PARA VER DESCRIPCIÓN Y DETALLE */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
          {[
            {
              key: 'kpi_prod',
              label: 'Productividad',
              score: `${globalProductivity}%`,
              barPct: globalProductivity,
              color: 'bg-[#3B82F6]',
              icon: 'fi-rr-chart-line-up',
              detail: `${tasks.filter(t => t.status === 'completada').length} de ${tasks.length} tareas completadas y avance ponderado.`,
            },
            {
              key: 'kpi_time',
              label: 'Puntualidad / Entrada',
              score: `${globalPunctuality}%`,
              barPct: globalPunctuality,
              color: 'bg-emerald-500',
              icon: 'fi-rr-clock',
              detail: `Hora promedio de entrada: ${avgEntryHourLabel}. Meta institucional: 08:00 AM.`,
            },
            {
              key: 'kpi_interest',
              label: 'Nivel de Interés',
              score: `${globalInterest}%`,
              barPct: globalInterest,
              color: 'bg-amber-500',
              icon: 'fi-rr-star',
              detail: `Proactividad, ${auditLogs.length} acciones registradas y participación institucional.`,
            },
            {
              key: 'kpi_team',
              label: 'Equipo y 360°',
              score: `${globalTeamwork}%`,
              barPct: globalTeamwork,
              color: 'bg-indigo-500',
              icon: 'fi-rr-users-alt',
              detail: 'Colaboración interdepartamental, liderazgo y comunicación asertiva.',
            },
            {
              key: 'kpi_innov',
              label: 'Innovación / Servicio',
              score: `${globalInnovation}%`,
              barPct: globalInnovation,
              color: 'bg-cyan-600',
              icon: 'fi-rr-bulb',
              detail: 'Adaptabilidad digital, mejora de procesos y calidad de atención.',
            },
            {
              key: 'kpi_total',
              label: 'Desempeño Global',
              score: `${globalPerformance}%`,
              barPct: globalPerformance,
              color: 'bg-[#0B2559]',
              icon: 'fi-rr-trophy',
              detail: `Calificación integral ponderada sobre ${activeList.length} colaboradores evaluados.`,
            },
          ].map(kpi => {
            const isOpen = Boolean(expandedEvalBlocks[kpi.key]);
            return (
              <div
                key={kpi.key}
                className="bg-white border border-[#B3D9FF] rounded-xl p-3 shadow-2xs flex flex-col justify-between space-y-2"
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-bold text-[#0B2559] truncate">{kpi.label}</span>
                  <button
                    type="button"
                    onClick={() => toggleEvalBlock(kpi.key)}
                    className="w-6 h-6 rounded-lg bg-[#F4F9FF] hover:bg-[#EAF3FF] text-[#0B2559] flex items-center justify-center shrink-0"
                    title="Ver descripción del indicador"
                  >
                    <i className={`fi ${isOpen ? 'fi-rr-angle-small-up' : 'fi-rr-angle-small-down'} text-sm`} />
                  </button>
                </div>

                <div className="text-xl font-bold font-mono text-[#0B2559]">{kpi.score}</div>

                <div className="w-full h-1.5 bg-[#EAF3FF] rounded-full overflow-hidden">
                  <div className={`h-full ${kpi.color} rounded-full`} style={{ width: `${kpi.barPct}%` }} />
                </div>

                {isOpen && (
                  <div className="pt-1.5 border-t border-[#D6EAFF] text-[11px] text-[#0B2559]/80 leading-snug">
                    {kpi.detail}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 4. GRÁFICOS VISUALES INTERACTIVOS CON FLECHA DESPLEGABLE PARA VER DATOS DETALLADOS */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Gráfico 1: Productividad vs Desempeño */}
          <div className="bg-white border border-[#B3D9FF] rounded-xl p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between gap-2 border-b border-[#D6EAFF] pb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <i className="fi fi-rr-chart-histogram text-sm text-[#3B82F6]" />
                <h3 className="text-xs sm:text-sm font-bold text-[#0B2559] truncate">
                  Gráfico de Productividad y Desempeño por Colaborador
                </h3>
              </div>
              <button
                type="button"
                onClick={() => toggleEvalBlock('chart_prod_details')}
                className="px-2.5 py-1 rounded-lg bg-[#F4F9FF] hover:bg-[#EAF3FF] border border-[#B3D9FF] text-[11px] font-bold text-[#0B2559] flex items-center gap-1 shrink-0"
              >
                <span>{expandedEvalBlocks['chart_prod_details'] ? 'Ocultar Datos' : 'Ver Datos'}</span>
                <i
                  className={`fi ${
                    expandedEvalBlocks['chart_prod_details'] ? 'fi-rr-angle-small-up' : 'fi-rr-angle-small-down'
                  } text-sm`}
                />
              </button>
            </div>

            <div className="h-48 flex items-end gap-3 px-2 pt-5 pb-2 bg-[#F4F9FF] border border-[#D6EAFF] rounded-xl overflow-x-auto">
              {activeList.slice(0, 12).map(item => (
                <div
                  key={item.cedula}
                  className="flex-1 min-w-[52px] h-full flex flex-col items-center justify-end"
                >
                  <span className="text-[10px] font-mono font-bold text-[#0B2559] mb-1">
                    {item.productivityScore}%
                  </span>
                  <div className="w-full max-w-[34px] bg-[#D6EAFF] rounded-t-lg h-28 flex items-end overflow-hidden gap-0.5 px-0.5">
                    <div
                      className="w-1/2 bg-[#0B2559] rounded-t transition-all duration-500"
                      style={{ height: `${Math.max(12, item.productivityScore)}%` }}
                      title={`Productividad: ${item.productivityScore}%`}
                    />
                    <div
                      className="w-1/2 bg-[#3B82F6] rounded-t transition-all duration-500"
                      style={{ height: `${Math.max(12, item.interestScore)}%` }}
                      title={`Interés: ${item.interestScore}%`}
                    />
                  </div>
                  <span
                    className="text-[10px] font-bold text-[#0B2559] mt-1 truncate w-full text-center"
                    title={item.name}
                  >
                    {item.name.split(' ')[0]}
                  </span>
                </div>
              ))}
            </div>

            {expandedEvalBlocks['chart_prod_details'] && (
              <div className="p-3 rounded-xl bg-[#F4F9FF] border border-[#D6EAFF] space-y-2 text-xs">
                <p className="text-[#0B2559]/80">
                  <strong>Interpretación del Gráfico:</strong> La barra azul oscuro representa el porcentaje de{' '}
                  <strong>Productividad Operativa</strong> y la barra celeste representa el{' '}
                  <strong>Nivel de Interés y Compromiso</strong> de cada colaborador.
                </p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200">
                    <div className="text-[11px] font-bold text-emerald-800">Completadas</div>
                    <div className="text-sm font-mono font-bold text-emerald-700">
                      {tasks.filter(t => t.status === 'completada').length}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-white border border-[#B3D9FF]">
                    <div className="text-[11px] font-bold text-[#0B2559]">En Progreso</div>
                    <div className="text-sm font-mono font-bold text-[#3B82F6]">
                      {tasks.filter(t => t.status === 'en_progreso').length}
                    </div>
                  </div>
                  <div className="p-2 rounded-lg bg-amber-50 border border-amber-200">
                    <div className="text-[11px] font-bold text-amber-900">Pendientes</div>
                    <div className="text-sm font-mono font-bold text-amber-700">
                      {tasks.filter(t => t.status === 'pendiente').length}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Gráfico 2: Tiempos de Entrada, Salida y Puntualidad */}
          <div className="bg-white border border-[#B3D9FF] rounded-xl p-4 shadow-2xs space-y-3">
            <div className="flex items-center justify-between gap-2 border-b border-[#D6EAFF] pb-2.5">
              <div className="flex items-center gap-2 min-w-0">
                <i className="fi fi-rr-clock text-sm text-emerald-600" />
                <h3 className="text-xs sm:text-sm font-bold text-[#0B2559] truncate">
                  Gráfico de Tiempos de Entrada y Jornada ({avgEntryHourLabel})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => toggleEvalBlock('chart_entry_details')}
                className="px-2.5 py-1 rounded-lg bg-[#F4F9FF] hover:bg-[#EAF3FF] border border-[#B3D9FF] text-[11px] font-bold text-[#0B2559] flex items-center gap-1 shrink-0"
              >
                <span>{expandedEvalBlocks['chart_entry_details'] ? 'Ocultar Horarios' : 'Ver Horarios'}</span>
                <i
                  className={`fi ${
                    expandedEvalBlocks['chart_entry_details'] ? 'fi-rr-angle-small-up' : 'fi-rr-angle-small-down'
                  } text-sm`}
                />
              </button>
            </div>

            <div className="space-y-2.5 pt-1">
              {entryBands.map(band => {
                const pct = Math.round((band.count / safeCount) * 100);
                return (
                  <div key={band.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#0B2559]">{band.label}</span>
                      <span className="font-mono font-bold text-[#0B2559]">
                        {band.count} colab. ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-[#F4F9FF] border border-[#D6EAFF] rounded-full overflow-hidden">
                      <div
                        className={`h-full ${band.color} rounded-full transition-all duration-500`}
                        style={{ width: `${Math.max(pct, band.count > 0 ? 8 : 0)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {expandedEvalBlocks['chart_entry_details'] && (
              <div className="p-3 rounded-xl bg-[#F4F9FF] border border-[#D6EAFF] space-y-2 max-h-48 overflow-y-auto">
                <div className="text-[11px] font-bold text-[#0B2559] uppercase">
                  Horarios de Entrada, Salida y Puntualidad por Usuario
                </div>
                {activeList.map(m => (
                  <div
                    key={m.cedula}
                    className="flex items-center justify-between text-xs bg-white px-3 py-1.5 rounded-lg border border-[#B3D9FF]"
                  >
                    <span className="font-bold text-[#0B2559] truncate">{m.name}</span>
                    <div className="flex items-center gap-2 shrink-0 font-mono text-[11px]">
                      <span className="text-emerald-700 font-bold">Entrada: {m.avgEntryTime}</span>
                      <span className="text-[#0B2559]/70">Salida: {m.avgExitTime}</span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold">
                        {m.punctualityScore}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 5. PANEL DE LOS 6 TIPOS DE EVALUACIÓN CON FLECHA DESPLEGABLE PARA VER DESCRIPCIONES Y CRITERIOS */}
        <div className="bg-white border border-[#B3D9FF] rounded-xl p-4 shadow-2xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D6EAFF] pb-2.5">
            <div className="flex items-center gap-2">
              <i className="fi fi-rr-layers text-sm text-[#3B82F6]" />
              <h3 className="text-xs sm:text-sm font-bold text-[#0B2559]">
                Tipos de Evaluación Institucional y Rango Multidimensional (Haz clic en la flecha para desplegar)
              </h3>
            </div>
            <button
              type="button"
              onClick={() => {
                const allExpanded = visibleEvaluationTypes.every(t => expandedEvalBlocks[t.id]);
                const nextState: Record<string, boolean> = { ...expandedEvalBlocks };
                visibleEvaluationTypes.forEach(t => {
                  nextState[t.id] = !allExpanded;
                });
                setExpandedEvalBlocks(nextState);
              }}
              className="px-3 py-1 rounded-xl bg-[#F4F9FF] hover:bg-[#EAF3FF] border border-[#B3D9FF] text-xs font-bold text-[#0B2559] flex items-center gap-1.5"
            >
              <span>Expandir / Contraer Todas</span>
              <i className="fi fi-rr-angle-small-down text-sm" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {visibleEvaluationTypes.map(evType => {
              const isExpanded = Boolean(expandedEvalBlocks[evType.id]);
              return (
                <div
                  key={evType.id}
                  className={`border rounded-xl transition-all overflow-hidden ${
                    isExpanded ? 'border-[#0B2559] bg-white shadow-2xs' : 'border-[#B3D9FF] bg-[#F4F9FF]/60'
                  }`}
                >
                  <div
                    onClick={() => toggleEvalBlock(evType.id)}
                    className="px-3.5 py-2.5 flex items-center justify-between gap-2 cursor-pointer hover:bg-[#EAF3FF]/70 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-7 h-7 rounded-lg bg-[#0B2559] text-white flex items-center justify-center shrink-0">
                        <i className={`fi ${evType.icon} text-xs`} />
                      </span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[#0B2559] truncate">{evType.title}</div>
                        <div className="text-[11px] text-[#0B2559]/70 truncate">{evType.shortSummary}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2 py-0.5 rounded-md bg-[#0B2559] text-white font-mono text-xs font-bold">
                        {evType.score}%
                      </span>
                      <button
                        type="button"
                        className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                          isExpanded ? 'bg-[#0B2559] text-white' : 'bg-white text-[#0B2559] border border-[#B3D9FF]'
                        }`}
                      >
                        <i
                          className={`fi ${
                            isExpanded ? 'fi-rr-angle-small-up' : 'fi-rr-angle-small-down'
                          } text-base`}
                        />
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 py-3 border-t border-[#D6EAFF] bg-white space-y-2 text-xs">
                      <div className="flex items-center justify-between text-[11px] font-bold text-[#3B82F6]">
                        <span>Criterios y Datos Evaluados</span>
                        <span>Indicador: {evType.badge}</span>
                      </div>
                      <ul className="space-y-1 text-[#0B2559] list-disc pl-4">
                        {evType.detailedCriteria.map(crit => (
                          <li key={crit}>{crit}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 6. LISTADO DE COLABORADORES CON FLECHA DESPLEGABLE Y DESCARGA DE INFORME INDIVIDUAL POR USUARIO */}
        <div className="bg-white border border-[#B3D9FF] rounded-xl p-4 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#D6EAFF] pb-3">
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[#0B2559] flex items-center gap-2">
                <i className="fi fi-rr-user-check text-sm text-[#3B82F6]" />
                Evaluación y Descarga de Informes por Usuario ({activeList.length} Colaboradores)
              </h3>
              <p className="text-[11px] text-[#0B2559]/75">
                Haz clic en la flecha desplegable de cada colaborador para ver o calificar todas sus dimensiones, fortalezas y plan de mejora, o descarga su informe individual en PDF/Excel.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleDownloadFilteredPDF}
                className="px-3 py-1.5 text-xs font-bold text-white bg-[#0B2559] rounded-xl hover:bg-[#163A82] flex items-center gap-1.5"
              >
                <i className="fi fi-rr-file-pdf text-xs" />
                <span>PDF Filtrado ({activeList.length})</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadFilteredExcel}
                className="px-3 py-1.5 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-xl hover:bg-[#99CCFF] flex items-center gap-1.5"
              >
                <i className="fi fi-rr-file-spreadsheet text-xs" />
                <span>Excel Filtrado ({activeList.length})</span>
              </button>
            </div>
          </div>

          {activeList.length === 0 ? (
            <div className="p-6 text-center bg-[#F4F9FF] border border-[#D6EAFF] rounded-xl text-xs text-[#0B2559]">
              No se encontraron colaboradores con los criterios de búsqueda seleccionados.
            </div>
          ) : (
            <div className="space-y-2">
              {activeList.map(m => {
                const isRowExpanded = Boolean(expandedEvalUserRows[m.cedula]);
                return (
                  <div
                    key={m.cedula}
                    className={`border rounded-xl transition-all overflow-hidden ${
                      isRowExpanded ? 'border-[#0B2559] bg-white shadow-xs' : 'border-[#B3D9FF] bg-white'
                    }`}
                  >
                    {/* Barra compacta del usuario con botones de descarga individual y flecha desplegable */}
                    <div className="px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 hover:bg-[#F4F9FF] transition-colors">
                      <div
                        onClick={() => toggleEvalUserRow(m.cedula)}
                        className="flex items-center gap-3 min-w-0 cursor-pointer flex-1"
                      >
                        <div className="w-8 h-8 rounded-xl bg-[#0B2559] text-white font-bold text-xs flex items-center justify-center shrink-0">
                          {m.overallPerformanceScore}%
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-[#0B2559] truncate flex items-center gap-2">
                            <span>{m.name}</span>
                            <span className="text-[11px] font-mono text-[#3B82F6]">C.C. {m.cedula}</span>
                          </div>
                          <div className="text-[11px] text-[#0B2559]/75 flex flex-wrap items-center gap-2">
                            <span>{m.department}</span>
                            <span>·</span>
                            <span>Prod: <strong>{m.productivityScore}%</strong></span>
                            <span>·</span>
                            <span>Entrada: <strong>{m.avgEntryTime}</strong></span>
                            <span>·</span>
                            <span>Interés: <strong>{m.interestScore}%</strong></span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`hidden sm:inline-block px-2 py-0.5 rounded-lg text-[10px] font-bold ${
                            m.performanceLevel === 'Sobresaliente'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : m.performanceLevel === 'Alto Desempeño'
                              ? 'bg-[#EAF3FF] text-[#0B2559] border border-[#B3D9FF]'
                              : m.performanceLevel === 'Satisfactorio'
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-rose-100 text-rose-800 border border-rose-300'
                          }`}
                        >
                          {m.performanceLevel}
                        </span>

                        {/* Botón Descargar PDF Individual de este Usuario */}
                        <button
                          type="button"
                          onClick={() =>
                            generateSingleUserEvaluationPDF({
                              generatedBy: currentUser,
                              userMetric: m,
                              evaluationPeriod: evalPeriodDate,
                            })
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-[#0B2559] text-white hover:bg-[#163A82] text-[11px] font-bold flex items-center gap-1 transition-colors"
                          title={`Descargar Informe PDF Individual de ${m.name}`}
                        >
                          <i className="fi fi-rr-file-pdf text-xs text-[#B3D9FF]" />
                          <span>PDF</span>
                        </button>

                        {/* Botón Descargar Excel Individual de este Usuario */}
                        <button
                          type="button"
                          onClick={() =>
                            exportSingleUserEvaluationToExcel({
                              exportedBy: currentUser,
                              userMetric: m,
                              evaluationPeriod: evalPeriodDate,
                            })
                          }
                          className="px-2.5 py-1.5 rounded-lg bg-[#B3D9FF] text-[#0B2559] hover:bg-[#99CCFF] text-[11px] font-bold flex items-center gap-1 transition-colors"
                          title={`Descargar Métricas Excel de ${m.name}`}
                        >
                          <i className="fi fi-rr-download text-xs" />
                          <span>XLS</span>
                        </button>

                        {/* Flecha desplegable para abrir/cerrar todas las métricas y descripciones del usuario */}
                        <button
                          type="button"
                          onClick={() => toggleEvalUserRow(m.cedula)}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                            isRowExpanded
                              ? 'bg-[#0B2559] text-white'
                              : 'bg-[#EAF3FF] text-[#0B2559] hover:bg-[#B3D9FF]'
                          }`}
                          title="Desplegar ficha completa de evaluación"
                        >
                          <i
                            className={`fi ${
                              isRowExpanded ? 'fi-rr-angle-small-up' : 'fi-rr-angle-small-down'
                            } text-base`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Panel desplegable con todas las métricas, fecha de evaluación y observaciones del colaborador */}
                    {isRowExpanded && (
                      <div className="p-4 border-t border-[#D6EAFF] bg-[#F4F9FF] space-y-4 text-xs">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
                          <div className="bg-white p-2.5 rounded-xl border border-[#B3D9FF]">
                            <label className="block text-[10px] font-bold text-[#0B2559]/75 mb-1">
                              📅 Fecha Evaluación
                            </label>
                            <input
                              type="date"
                              value={m.evaluationDate}
                              onChange={e =>
                                handleUpdateEvalCustomMetric(m.cedula, { evaluationDate: e.target.value })
                              }
                              className="w-full px-2 py-1 text-xs font-mono font-bold text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg"
                            />
                          </div>

                          <div className="bg-white p-2.5 rounded-xl border border-[#B3D9FF]">
                            <label className="block text-[10px] font-bold text-[#0B2559]/75 mb-1">
                              🕒 Hora Entrada Prom.
                            </label>
                            <input
                              type="time"
                              value={m.avgEntryTime}
                              onChange={e =>
                                handleUpdateEvalCustomMetric(m.cedula, { entryTime: e.target.value })
                              }
                              className="w-full px-2 py-1 text-xs font-mono font-bold text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg"
                            />
                          </div>

                          <div className="bg-white p-2.5 rounded-xl border border-[#B3D9FF]">
                            <label className="block text-[10px] font-bold text-[#0B2559]/75 mb-1">
                              🕔 Hora Salida Prom.
                            </label>
                            <input
                              type="time"
                              value={m.avgExitTime}
                              onChange={e =>
                                handleUpdateEvalCustomMetric(m.cedula, { exitTime: e.target.value })
                              }
                              className="w-full px-2 py-1 text-xs font-mono font-bold text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg"
                            />
                          </div>

                          <div className="bg-white p-2.5 rounded-xl border border-[#B3D9FF]">
                            <label className="block text-[10px] font-bold text-[#0B2559]/75 mb-1">
                              ⏱️ Puntualidad (%)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={m.punctualityScore}
                              onChange={e =>
                                handleUpdateEvalCustomMetric(m.cedula, {
                                  punctualityOverride: Number(e.target.value),
                                })
                              }
                              className="w-full px-2 py-1 text-xs font-mono font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg"
                            />
                          </div>

                          <div className="bg-white p-2.5 rounded-xl border border-[#B3D9FF]">
                            <label className="block text-[10px] font-bold text-[#0B2559]/75 mb-1">
                              ⭐ Interés y Actitud (%)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={m.interestScore}
                              onChange={e =>
                                handleUpdateEvalCustomMetric(m.cedula, {
                                  interestBonus: Number(e.target.value),
                                })
                              }
                              className="w-full px-2 py-1 text-xs font-mono font-bold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg"
                            />
                          </div>
                        </div>

                        {/* Nuevas Dimensiones de Evaluación (360°, Liderazgo, Innovación, Comunicación, Servicio, Bienestar) */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                          <div className="bg-white p-2.5 rounded-xl border border-[#B3D9FF]">
                            <label className="block text-[10px] font-bold text-[#0B2559]/75 mb-1">
                              🤝 Trabajo Equipo 360° (%)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={m.teamworkScore}
                              onChange={e =>
                                handleUpdateEvalCustomMetric(m.cedula, {
                                  teamworkOverride: Number(e.target.value),
                                })
                              }
                              className="w-full px-2 py-1 text-xs font-mono font-bold text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg"
                            />
                          </div>

                          <div className="bg-white p-2.5 rounded-xl border border-[#B3D9FF]">
                            <label className="block text-[10px] font-bold text-[#0B2559]/75 mb-1">
                              🧭 Liderazgo (%)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={m.leadershipScore}
                              onChange={e =>
                                handleUpdateEvalCustomMetric(m.cedula, {
                                  leadershipOverride: Number(e.target.value),
                                })
                              }
                              className="w-full px-2 py-1 text-xs font-mono font-bold text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg"
                            />
                          </div>

                          <div className="bg-white p-2.5 rounded-xl border border-[#B3D9FF]">
                            <label className="block text-[10px] font-bold text-[#0B2559]/75 mb-1">
                              💡 Innovación Digital (%)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={m.innovationScore}
                              onChange={e =>
                                handleUpdateEvalCustomMetric(m.cedula, {
                                  innovationOverride: Number(e.target.value),
                                })
                              }
                              className="w-full px-2 py-1 text-xs font-mono font-bold text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg"
                            />
                          </div>

                          <div className="bg-white p-2.5 rounded-xl border border-[#B3D9FF]">
                            <label className="block text-[10px] font-bold text-[#0B2559]/75 mb-1">
                              💬 Comunicación (%)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={m.communicationScore}
                              onChange={e =>
                                handleUpdateEvalCustomMetric(m.cedula, {
                                  communicationOverride: Number(e.target.value),
                                })
                              }
                              className="w-full px-2 py-1 text-xs font-mono font-bold text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg"
                            />
                          </div>

                          <div className="bg-white p-2.5 rounded-xl border border-[#B3D9FF]">
                            <label className="block text-[10px] font-bold text-[#0B2559]/75 mb-1">
                              🌟 Calidad Servicio (%)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={m.serviceQualityScore}
                              onChange={e =>
                                handleUpdateEvalCustomMetric(m.cedula, {
                                  serviceQualityOverride: Number(e.target.value),
                                })
                              }
                              className="w-full px-2 py-1 text-xs font-mono font-bold text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg"
                            />
                          </div>

                          <div className="bg-white p-2.5 rounded-xl border border-[#B3D9FF]">
                            <label className="block text-[10px] font-bold text-[#0B2559]/75 mb-1">
                              💚 Clima y Bienestar (%)
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={100}
                              value={m.wellbeingScore}
                              onChange={e =>
                                handleUpdateEvalCustomMetric(m.cedula, {
                                  wellbeingOverride: Number(e.target.value),
                                })
                              }
                              className="w-full px-2 py-1 text-xs font-mono font-bold text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg"
                            />
                          </div>
                        </div>

                        {/* Observaciones cualitativas y Plan de Mejoramiento del Colaborador */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="bg-white p-3 rounded-xl border border-[#B3D9FF] space-y-1">
                            <label className="block text-[11px] font-bold text-[#0B2559]">
                              ✅ Fortalezas y Logros Destacados del Colaborador:
                            </label>
                            <textarea
                              rows={2}
                              value={m.strengthsNote}
                              onChange={e =>
                                handleUpdateEvalCustomMetric(m.cedula, { strengthsNote: e.target.value })
                              }
                              className="w-full px-2.5 py-1.5 text-xs text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg focus:bg-white focus:outline-none"
                            />
                          </div>

                          <div className="bg-white p-3 rounded-xl border border-[#B3D9FF] space-y-1">
                            <label className="block text-[11px] font-bold text-[#0B2559]">
                              🎯 Plan de Mejoramiento y Compromisos:
                            </label>
                            <textarea
                              rows={2}
                              value={m.improvementPlan}
                              onChange={e =>
                                handleUpdateEvalCustomMetric(m.cedula, { improvementPlan: e.target.value })
                              }
                              className="w-full px-2.5 py-1.5 text-xs text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg focus:bg-white focus:outline-none"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // 5. SECCIÓN: RESPALDOS Y PLANTILLA DE BASE DE DATOS POR PANTALLAS
  // ============================================================================
  return (
    <div className="space-y-3.5">
      <div className="bg-white border border-[#B3D9FF] rounded-xl p-2.5 shadow-2xs flex flex-wrap items-center gap-1.5">
        {[
          { id: 'export' as const, label: 'Pantalla 1: Descargar Respaldo (.JSON)', icon: 'fi-rr-database' },
          { id: 'import' as const, label: 'Pantalla 2: Cargar / Restaurar Respaldo (.JSON)', icon: 'fi-rr-cloud-upload-alt' },
          { id: 'template' as const, label: 'Pantalla 3: Plantilla Oficial (.JSON)', icon: 'fi-rr-file-code' },
        ].map(scr => (
          <button
            key={scr.id}
            type="button"
            onClick={() => setBackupScreen(scr.id)}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors ${
              backupScreen === scr.id
                ? 'bg-[#0B2559] text-white shadow-2xs'
                : 'bg-[#F4F9FF] text-[#0B2559] border border-[#D6EAFF] hover:bg-[#EAF3FF]'
            }`}
          >
            <i className={`fi ${scr.icon} text-xs`} />
            <span>{scr.label}</span>
          </button>
        ))}
      </div>

      {backupScreen === 'export' && (
        <div className="bg-white border border-[#B3D9FF] rounded-xl p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[#0B2559] flex items-center gap-2">
              <i className="fi fi-rr-database text-sm text-[#3B82F6]" />
              Pantalla 1: Descargar Respaldo Completo de Base de Datos (.JSON)
            </h3>
            <p className="text-xs text-[#0B2559]/80">
              Exporta en un clic los {users.length} usuarios, {tasks.length} tareas, {auditLogs.length} eventos de auditoría, mensajes de chat y calendario sincronizado.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDownloadBackup}
            className="px-4 py-2.5 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-xl hover:bg-[#99CCFF] flex items-center gap-2 shrink-0 transition-colors shadow-2xs"
          >
            <i className="fi fi-rr-download text-xs" /> Descargar Respaldo Ahora
          </button>
        </div>
      )}

      {backupScreen === 'import' && (
        <div className="bg-white border border-[#B3D9FF] rounded-xl p-5 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-[#0B2559] flex items-center gap-2">
                <i className="fi fi-rr-cloud-upload-alt text-sm text-[#3B82F6]" />
                Pantalla 2: Cargar Respaldo o Importar Base de Datos (.JSON)
              </h3>
              <p className="text-xs text-[#0B2559]/80">
                Selecciona un archivo de respaldo `.json` para restaurar registros de forma permanente.
              </p>
            </div>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleFileUploadBackup}
                className="hidden"
                id="backup-upload-input"
              />
              <label
                htmlFor="backup-upload-input"
                className="px-4 py-2.5 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-xl hover:bg-[#99CCFF] flex items-center gap-2 cursor-pointer shrink-0 transition-colors shadow-2xs"
              >
                <i className="fi fi-rr-upload text-xs" /> Seleccionar Archivo JSON
              </label>
            </div>
          </div>
          {importStatus && (
            <div className="p-3 rounded-lg bg-[#F4F9FF] border border-[#B3D9FF] text-xs text-[#0B2559] font-medium">
              {importStatus}
            </div>
          )}
        </div>
      )}

      {backupScreen === 'template' && (
        <div className="bg-white border border-[#B3D9FF] rounded-xl p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-[#0B2559] flex items-center gap-2">
              <i className="fi fi-rr-file-code text-sm text-[#3B82F6]" />
              Pantalla 3: Descargar Plantilla Oficial de Base de Datos (.JSON)
            </h3>
            <p className="text-xs text-[#0B2559]/80">
              Obtén la estructura base JSON para preparar cargas masivas de usuarios o actividades.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="px-4 py-2.5 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-xl hover:bg-[#99CCFF] flex items-center gap-2 shrink-0 transition-colors shadow-2xs"
          >
            <i className="fi fi-rr-download text-xs" /> Descargar Plantilla JSON
          </button>
        </div>
      )}
    </div>
  );
};
