import React, { useState, useRef, useEffect } from 'react';
import { AppUser, TaskItem, AuditLog, ChatMessage, CalendarEvent } from '../types';
import {
  saveUserToFirestore,
  deleteUserFromFirestore,
  deleteTaskFromFirestore,
  recordAuditLog,
} from '../firebase';
import {
  generateAuditAndTasksPDF,
  downloadDatabaseBackupJSON,
  downloadDatabaseTemplateJSON,
  restoreDatabaseFromBackupJSON,
  exportUsersPersonalDataToExcel,
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
    | 'admin_resend';
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

  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Estados exclusivos del Panel Admin para el módulo de correos automáticos Resend (24h, 12h, 6h y 2h) y edición de correos de recuperación por usuario
  const [resendScreen, setResendScreen] = useState<ResendScreen>('expiring_24h');
  const [resendHistory, setResendHistory] = useState<ResendSentRecord[]>([]);
  const [userRecoveryEmails, setUserRecoveryEmails] = useState<Record<string, string>>({});
  const [recoveryConfigSavedMsg, setRecoveryConfigSavedMsg] = useState<string | null>(null);

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
      canEditTasks: existing ? existing.canEditTasks : true,
      canDeleteTasks: existing ? existing.canDeleteTasks : isSingleAdmin,
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
    permKey: 'canCreateTasks' | 'canEditTasks' | 'canDeleteTasks' | 'canSendChat' | 'canViewVault' | 'canExportReports',
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
    key: 'canCreateTasks' | 'canEditTasks' | 'canDeleteTasks' | 'canSendChat' | 'canViewVault' | 'canExportReports';
    label: string;
  }[] = [
    { key: 'canCreateTasks', label: 'Crear Tareas' },
    { key: 'canEditTasks', label: 'Editar / Progreso' },
    { key: 'canDeleteTasks', label: 'Eliminar Tareas' },
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
                      </div>

                      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
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
                      <div className="px-3.5 sm:px-4 pb-4 pt-3 border-t border-[#D6EAFF] bg-[#F4F9FF] space-y-3 text-xs">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white p-3 rounded-xl border border-[#B3D9FF]">
                          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-3">
                            <div>
                              <span className="text-[#3B82F6]">Cédula: </span>
                              <strong className="font-mono text-[#0B2559]">{u.cedula}</strong>
                            </div>
                            <div>
                              <span className="text-[#3B82F6]">Contraseña: </span>
                              <strong className="font-mono text-[#0B2559]">
                                {isSingleAdmin ? '•••••••• (Protegida)' : u.password}
                              </strong>
                            </div>
                            <div>
                              <span className="text-[#3B82F6]">Área: </span>
                              <strong className="text-[#0B2559]">{u.department}</strong>
                            </div>
                            <div>
                              <span className="text-[#3B82F6]">Presencia: </span>
                              <strong className={u.isOnline ? 'text-emerald-700' : 'text-[#0B2559]/70'}>
                                {u.isOnline ? 'En línea' : `Últ. vez ${new Date(u.lastSeen).toLocaleTimeString('es-ES')}`}
                              </strong>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#EAF3FF]">
                            {isSingleAdmin && (
                              <button
                                type="button"
                                onClick={() => setAdminUsersScreen('security')}
                                className="px-2.5 py-1.5 text-xs font-bold text-white bg-[#0B2559] hover:bg-[#15397A] rounded-lg flex items-center gap-1.5 transition-colors"
                              >
                                <i className="fi fi-rr-key text-xs text-[#B3D9FF]" /> Cambiar Clave
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleSelectEditUser(u)}
                              className="px-2.5 py-1.5 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] hover:bg-[#99CCFF] rounded-lg flex items-center gap-1.5 transition-colors"
                            >
                              <i className="fi fi-rr-edit text-xs" /> Editar en Pantallas
                            </button>
                            {!isSingleAdmin && u.cedula !== currentUser.cedula && (
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u)}
                                className="px-2.5 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg flex items-center gap-1 transition-colors"
                              >
                                <i className="fi fi-rr-trash text-xs" /> Eliminar
                              </button>
                            )}
                          </div>
                        </div>

                        {renderConfidentialPersonalDataFicha(u)}
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
                        <div className="text-xs font-bold text-[#0B2559] truncate">
                          {u.name} <span className="font-mono text-[#3B82F6]">(C.C. {u.cedula})</span>
                        </div>
                        <div className="text-[10px] text-[#3B82F6]">
                          Se muestra al usuario: <strong className="font-mono text-[#0B2559]">{maskedPreview}</strong>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 sm:w-80">
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
                          className="flex-1 px-3 py-1.5 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveUserRecoveryEmail(u)}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-[#0B2559] hover:bg-[#15397A] rounded-lg transition-colors shrink-0"
                        >
                          Guardar
                        </button>
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
                    <div className="px-4 pb-4 pt-3 border-t border-[#D6EAFF] bg-[#F4F9FF] space-y-2.5 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 font-bold text-[#0B2559]">
                          <span>PRIORIDAD {task.priority.toUpperCase()}</span>
                          <span className="text-[#7CC0FF]">·</span>
                          <span>ESTADO: {task.status.replace('_', ' ').toUpperCase()} ({task.progress}%)</span>
                          <span className="text-[#7CC0FF]">·</span>
                          <span>ÁREA: {task.category}</span>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => onEditTask(task)}
                            className="px-3 py-1.5 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-lg hover:bg-[#99CCFF] flex items-center gap-1"
                          >
                            <i className="fi fi-rr-edit text-xs" /> Editar en Pantallas
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTaskRecord(task)}
                            className="px-3 py-1.5 text-xs font-bold text-rose-700 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 flex items-center gap-1"
                          >
                            <i className="fi fi-rr-trash text-xs" /> Eliminar
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-white p-3 rounded-xl border border-[#B3D9FF] tabular-nums">
                        <div>
                          <span className="text-[#3B82F6] block text-[11px]">Responsable Asignado:</span>
                          <strong className="text-[#0B2559]">{task.assignedToName}</strong>{' '}
                          <span className="font-mono text-[#3B82F6]">({task.assignedToCedula})</span>
                        </div>
                        <div>
                          <span className="text-[#3B82F6] block text-[11px]">Creado Por:</span>
                          <strong className="text-[#0B2559]">{task.createdByName}</strong>
                        </div>
                        <div>
                          <span className="text-[#3B82F6] block text-[11px]">Fecha Límite:</span>
                          <strong className={isOverdue ? 'text-rose-600' : 'text-[#0B2559]'}>
                            {new Date(task.dueDate).toLocaleString('es-ES')}
                          </strong>
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

          <button
            type="button"
            onClick={handleExportAuditPDF}
            className="px-3.5 py-2 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-xl hover:bg-[#99CCFF] flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            <i className="fi fi-rr-file-pdf text-xs" /> Reporte PDF
          </button>
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
                    <div className="px-4 pb-3.5 pt-2.5 border-t border-[#D6EAFF] bg-[#F4F9FF] text-xs space-y-2">
                      <div className="flex flex-wrap items-center gap-4 text-[#0B2559] font-mono">
                        <span>Fecha y Hora: <strong>{new Date(log.timestamp).toLocaleString('es-ES')}</strong></span>
                        <span>Cédula: <strong>{log.actorCedula}</strong> ({log.actorRole.toUpperCase()})</span>
                        <span>Módulo: <strong>{log.module}</strong></span>
                        <span>Severidad: <strong>{log.severity.toUpperCase()}</strong></span>
                      </div>
                      <div className="p-3 bg-white rounded-lg border border-[#B3D9FF] text-[#0B2559]">
                        <strong>Detalle de la acción: </strong> {log.description}
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
                        <div className="text-xs font-bold text-[#0B2559] truncate">
                          {u.name} <span className="font-mono text-[#3B82F6]">(C.C. {u.cedula})</span>
                        </div>
                        <div className="text-[10px] text-[#3B82F6]">
                          Vista al recuperar: <strong className="font-mono text-[#0B2559]">Digite el código enviado al correo {maskedPreview}</strong>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 sm:w-80">
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
                          className="flex-1 px-3 py-1.5 text-xs font-mono text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg focus:bg-white focus:outline-none focus:border-[#0B2559]"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveUserRecoveryEmail(u)}
                          className="px-3 py-1.5 text-xs font-bold text-white bg-[#0B2559] hover:bg-[#15397A] rounded-lg transition-colors shrink-0"
                        >
                          Guardar
                        </button>
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
