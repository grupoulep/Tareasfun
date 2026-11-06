import React, { useState, useRef } from 'react';
import { AppUser, TaskItem, AuditLog, ChatMessage, CalendarEvent } from '../types';
import {
  saveUserToFirestore,
  deleteUserFromFirestore,
  deleteTaskFromFirestore,
  recordAuditLog
} from '../firebase';
import {
  generateAuditAndTasksPDF,
  downloadDatabaseBackupJSON,
  downloadDatabaseTemplateJSON,
  restoreDatabaseFromBackupJSON,
  exportUsersPersonalDataToExcel
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
  EMERGENCY_RELATIONSHIPS,
  FAMILY_COMPOSITION_OPTIONS,
  BANK_HOLDER_OPTIONS,
  DEPARTMENT_OPTIONS,
  BLOOD_TYPES,
  MARITAL_STATUS_OPTIONS,
  RESIDENCE_TYPES,
  STRATUM_OPTIONS,
  BANK_ACCOUNT_TYPES
} from '../constants';
import { SearchableLocationSelect } from './SearchableLocationSelect';

interface AdminViewsProps {
  activeSection:
    | 'admin_users'
    | 'admin_approvals'
    | 'admin_records'
    | 'admin_audit'
    | 'admin_backup';
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
  const [showCreateUserForm, setShowCreateUserForm] = useState(false);
  const [showAdminPasswordBox, setShowAdminPasswordBox] = useState(false);
  const [adminAuthCedula, setAdminAuthCedula] = useState('');
  const [adminOldPassword, setAdminOldPassword] = useState('');
  const [adminNewPassword, setAdminNewPassword] = useState('');
  const [adminPwdError, setAdminPwdError] = useState<string | null>(null);
  const [adminPwdSuccess, setAdminPwdSuccess] = useState<string | null>(null);
  const [adminPwdSaving, setAdminPwdSaving] = useState(false);

  const [expandedUserIds, setExpandedUserIds] = useState<Record<string, boolean>>({});
  const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({});
  const [expandedLogIds, setExpandedLogIds] = useState<Record<string, boolean>>({});
  const [expandedBackupCards, setExpandedBackupCards] = useState<Record<string, boolean>>({
    backup_export: false,
    backup_import: false,
    backup_template: false,
    github_deploy: true,
  });
  const [copiedCodeKey, setCopiedCodeKey] = useState<string | null>(null);

  const [cedula, setCedula] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'user'>('user');
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('Operaciones');
  const [cedulaIssueDate, setCedulaIssueDate] = useState('');
  const [cedulaIssuePlace, setCedulaIssuePlace] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [birthPlace, setBirthPlace] = useState('');
  const [bloodType, setBloodType] = useState('');
  const [maritalStatus, setMaritalStatus] = useState('');
  const [phone, setPhone] = useState('');
  const [locationDepartmentState, setLocationDepartmentState] = useState('');
  const [locationCity, setLocationCity] = useState('');
  const [residenceAddress, setResidenceAddress] = useState('');
  const [residenceType, setResidenceType] = useState('');
  const [residenceStratum, setResidenceStratum] = useState('');
  const [familyMembersCount, setFamilyMembersCount] = useState<number>(0);
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [familyNotes, setFamilyNotes] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountType, setBankAccountType] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankAccountHolder, setBankAccountHolder] = useState('');

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

  const [auditSearch, setAuditSearch] = useState('');
  const [auditUserFilter, setAuditUserFilter] = useState<string>('todos');
  const [auditSeverityFilter, setAuditSeverityFilter] = useState<string>('todos');

  const [importStatus, setImportStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const toggleUserExpand = (id: string) => {
    setExpandedUserIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleTaskExpand = (id: string) => {
    setExpandedTaskIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleLogExpand = (id: string) => {
    setExpandedLogIds(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleBackupCard = (key: string) => {
    setExpandedBackupCards(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const resetUserForm = () => {
    setCedula('');
    setName('');
    setPassword('');
    setRole('user');
    setEmail('');
    setDepartment('Operaciones');
    setCedulaIssueDate('');
    setCedulaIssuePlace('');
    setBirthDate('');
    setBirthPlace('');
    setBloodType('');
    setMaritalStatus('');
    setPhone('');
    setLocationDepartmentState('');
    setLocationCity('');
    setResidenceAddress('');
    setResidenceType('');
    setResidenceStratum('');
    setFamilyMembersCount(0);
    setEmergencyContactName('');
    setEmergencyContactPhone('');
    setFamilyNotes('');
    setBankName('');
    setBankAccountType('');
    setBankAccountNumber('');
    setBankAccountHolder('');
    setEditingCedula(null);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cedula.trim() || !name.trim() || !password.trim()) return;

    const cleanCed = cedula.trim();
    const existing = users.find(u => u.cedula === cleanCed);

    if (cleanCed === SINGLE_ADMIN_CEDULA && existing) {
      openEditUserModal(existing, 'personal');
      setShowCreateUserForm(false);
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
      severity: 'info'
    });

    resetUserForm();
    setShowCreateUserForm(false);
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

  const renderConfidentialPersonalDataFicha = (u: AppUser) => (
    <div className="bg-white border border-[#B3D9FF] rounded-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-[#D6EAFF]">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-lg bg-[#0B2559] text-white flex items-center justify-center">
            <i className="fi fi-rr-shield-check text-xs" />
          </span>
          <div>
            <div className="text-xs font-extrabold text-[#0B2559]">
              Ficha Confidencial de Datos Personales, Ubicación, Familiares y Bancarios (Solo Admin)
            </div>
            <div className="text-[11px] text-[#3B82F6]">
              Información privada registrada por el colaborador. Oculta para el resto de usuarios.
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openEditUserModal(u)}
            className="px-3 py-1.5 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] hover:bg-[#99CCFF] rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs"
          >
            <i className="fi fi-rr-edit text-xs" /> Editar Datos
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
            <i className="fi fi-rr-file-excel text-xs" /> Descargar Ficha en Excel (.XLS)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
        {/* 1. Datos de Cédula e Identificación */}
        <div className="p-3 rounded-xl bg-[#F4F9FF] border border-[#D6EAFF] space-y-1.5">
          <div className="font-extrabold text-[#0B2559] uppercase tracking-wider text-[10px] flex items-center gap-1.5 pb-1 border-b border-[#D6EAFF]">
            <i className="fi fi-rr-id-badge text-[#3B82F6]" /> 1. Datos de Cédula y Personales
          </div>
          <div>
            <span className="text-[#3B82F6]">N° Cédula: </span>
            <strong className="font-mono text-[#0B2559]">{u.cedula}</strong>
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
          <div className="flex items-center justify-between gap-2">
            <span>
              <span className="text-[#3B82F6]">RH: </span>
              <strong className="text-[#0B2559]">{u.bloodType || 'N/A'}</strong>
            </span>
            <span>
              <span className="text-[#3B82F6]">Est. Civil: </span>
              <strong className="text-[#0B2559]">{u.maritalStatus || 'N/A'}</strong>
            </span>
          </div>
          <div>
            <span className="text-[#3B82F6]">Celular / WhatsApp: </span>
            <strong className="font-mono text-[#0B2559]">{u.phone || 'No registrado'}</strong>
          </div>
          <div className="truncate" title={u.email}>
            <span className="text-[#3B82F6]">Correo: </span>
            <strong className="text-[#0B2559]">{u.email || 'No registrado'}</strong>
          </div>
        </div>

        {/* 2. Ubicación y Residencia */}
        <div className="p-3 rounded-xl bg-[#F4F9FF] border border-[#D6EAFF] space-y-1.5">
          <div className="font-extrabold text-[#0B2559] uppercase tracking-wider text-[10px] flex items-center gap-1.5 pb-1 border-b border-[#D6EAFF]">
            <i className="fi fi-rr-marker text-[#3B82F6]" /> 2. Ubicación y Residencia
          </div>
          <div>
            <span className="text-[#3B82F6]">Departamento / Estado: </span>
            <strong className="text-[#0B2559]">{u.locationDepartmentState || 'No registrado'}</strong>
          </div>
          <div>
            <span className="text-[#3B82F6]">Ciudad / Municipio: </span>
            <strong className="text-[#0B2559]">{u.locationCity || 'No registrado'}</strong>
          </div>
          <div>
            <span className="text-[#3B82F6]">Dirección Residencia: </span>
            <strong className="text-[#0B2559]">{u.residenceAddress || 'No registrada'}</strong>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span>
              <span className="text-[#3B82F6]">Vivienda: </span>
              <strong className="text-[#0B2559]">{u.residenceType || 'N/A'}</strong>
            </span>
            <span>
              <span className="text-[#3B82F6]">Estrato: </span>
              <strong className="text-[#0B2559]">{u.residenceStratum || 'N/A'}</strong>
            </span>
          </div>
        </div>

        {/* 3. Núcleo Familiar y Contacto de Emergencia */}
        <div className="p-3 rounded-xl bg-[#F4F9FF] border border-[#D6EAFF] space-y-1.5">
          <div className="font-extrabold text-[#0B2559] uppercase tracking-wider text-[10px] flex items-center gap-1.5 pb-1 border-b border-[#D6EAFF]">
            <i className="fi fi-rr-users text-[#3B82F6]" /> 3. Núcleo Familiar
          </div>
          <div>
            <span className="text-[#3B82F6]">Número de Familiares: </span>
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

        {/* 4. Datos Bancarios para Pagos */}
        <div className="p-3 rounded-xl bg-[#F4F9FF] border border-[#D6EAFF] space-y-1.5">
          <div className="font-extrabold text-[#0B2559] uppercase tracking-wider text-[10px] flex items-center gap-1.5 pb-1 border-b border-[#D6EAFF]">
            <i className="fi fi-rr-bank text-[#3B82F6]" /> 4. Datos Bancarios (Pagos)
          </div>
          <div>
            <span className="text-[#3B82F6]">Banco / Billetera: </span>
            <strong className="text-[#0B2559]">{u.bankName || 'No aplica / Sin cuenta'}</strong>
          </div>
          <div>
            <span className="text-[#3B82F6]">Tipo de Cuenta: </span>
            <strong className="text-[#0B2559]">{u.bankAccountType || 'N/A'}</strong>
          </div>
          <div>
            <span className="text-[#3B82F6]">Número de Cuenta / Llave: </span>
            <strong className="font-mono text-[#0B2559]">{u.bankAccountNumber || 'No registrado'}</strong>
          </div>
          <div>
            <span className="text-[#3B82F6]">Titular de la Cuenta: </span>
            <strong className="text-[#0B2559]">{u.bankAccountHolder || u.name}</strong>
          </div>
        </div>
      </div>
    </div>
  );

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
      severity: newValue ? 'info' : 'warning'
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
      severity: 'critical'
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
      severity: 'warning'
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
      severity: 'info'
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
      severity: 'info'
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
      severity: 'info'
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

  // 1. SECCIÓN: CREAR USUARIOS Y MATRIZ DE PERMISOS CON PALETA ULEP (#B3D9FF, #FFFFFF y #0B2559)
  if (activeSection === 'admin_users') {
    const filteredUsers = users.filter(
      u =>
        u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.cedula.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.department.toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.locationCity || '').toLowerCase().includes(userSearch.toLowerCase()) ||
        (u.bankName || '').toLowerCase().includes(userSearch.toLowerCase())
    );

    return (
      <div className="space-y-4">
        {/* Cuadro Exclusivo en Panel Admin para Cambiar Contraseña del Único Administrador (902050377) */}
        <section className="bg-white border border-[#0B2559]/30 rounded-xl overflow-hidden shadow-2xs">
          <div
            onClick={() => {
              setShowAdminPasswordBox(!showAdminPasswordBox);
              setAdminPwdError(null);
              setAdminPwdSuccess(null);
            }}
            className="flex items-center justify-between px-5 py-3.5 cursor-pointer bg-[#F4F9FF] hover:bg-[#EAF3FF] transition-colors"
          >
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-[#0B2559] text-white flex items-center justify-center shrink-0">
                <i className="fi fi-rr-shield-keyhole text-xs text-[#B3D9FF]" />
              </span>
              <div>
                <span className="text-sm font-bold text-[#0B2559]">
                  Cambiar Contraseña del Administrador Único (C.C. {SINGLE_ADMIN_CEDULA})
                </span>
                <span className="ml-2 text-[10px] font-bold uppercase px-2 py-0.5 rounded-md bg-[#0B2559] text-white">
                  Protegido · No Eliminable
                </span>
              </div>
            </div>
            <button
              type="button"
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                showAdminPasswordBox ? 'bg-[#0B2559] text-white' : 'bg-white text-[#0B2559] border border-[#B3D9FF]'
              }`}
            >
              <i
                className={`fi ${
                  showAdminPasswordBox ? 'fi-rr-angle-small-up' : 'fi-rr-angle-small-down'
                } text-base`}
              />
            </button>
          </div>

          {showAdminPasswordBox && (
            <form onSubmit={handleAdminPasswordPanelSubmit} className="p-5 border-t border-[#D6EAFF] bg-white space-y-4">
              <div className="p-3 rounded-xl bg-[#F4F9FF] border border-[#B3D9FF] text-xs text-[#0B2559] flex items-center gap-2">
                <i className="fi fi-rr-lock text-sm text-[#3B82F6] shrink-0" />
                <span>
                  Para modificar la contraseña del Administrador (<strong>{SINGLE_ADMIN_CEDULA}</strong>), ingresa el <strong>Número de Cédula de Autorización</strong>, la <strong>Contraseña Anterior</strong> y la <strong>Nueva Contraseña</strong>.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#0B2559] mb-1">
                    Número de Cédula de Autorización *
                  </label>
                  <input
                    type="password"
                    required
                    value={adminAuthCedula}
                    onChange={e => setAdminAuthCedula(e.target.value)}
                    placeholder="Cédula autorizada"
                    autoComplete="off"
                    className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg focus:bg-white focus:outline-none focus:border-[#0B2559]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0B2559] mb-1">
                    Contraseña Anterior *
                  </label>
                  <input
                    type="password"
                    required
                    value={adminOldPassword}
                    onChange={e => setAdminOldPassword(e.target.value)}
                    placeholder="Contraseña actual"
                    autoComplete="off"
                    className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg focus:bg-white focus:outline-none focus:border-[#0B2559]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-[#0B2559] mb-1">
                    Nueva Contraseña *
                  </label>
                  <input
                    type="password"
                    required
                    value={adminNewPassword}
                    onChange={e => setAdminNewPassword(e.target.value)}
                    placeholder="Nueva contraseña"
                    autoComplete="new-password"
                    className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg focus:bg-white focus:outline-none focus:border-[#0B2559]"
                  />
                </div>
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

              <div className="flex justify-end">
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
          )}
        </section>

        {/* Cuadro Desplegable para Crear / Editar Usuario + Datos Personales y Bancarios */}
        <section className="bg-white border border-[#B3D9FF] rounded-xl overflow-hidden shadow-2xs">
          <div
            onClick={() => setShowCreateUserForm(!showCreateUserForm)}
            className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-[#F4F9FF] transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <span className="w-7 h-7 rounded-lg bg-[#B3D9FF] text-[#0B2559] flex items-center justify-center shrink-0">
                <i className="fi fi-rr-user-add text-xs" />
              </span>
              <span className="text-sm font-bold text-[#0B2559]">
                {editingCedula
                  ? `Editando Usuario y Ficha Personal · Cédula ${editingCedula}`
                  : 'Crear Nuevo Usuario con Ficha Personal, Residencia, Familiares y Datos Bancarios'}
              </span>
            </div>
            <button
              type="button"
              className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                showCreateUserForm ? 'bg-[#0B2559] text-white' : 'bg-[#EAF3FF] text-[#0B2559] hover:bg-[#B3D9FF]'
              }`}
            >
              <i
                className={`fi ${
                  showCreateUserForm ? 'fi-rr-angle-small-up' : 'fi-rr-angle-small-down'
                } text-base`}
              />
            </button>
          </div>

          {showCreateUserForm && (
            <div className="p-5 border-t border-[#D6EAFF] bg-[#F4F9FF]">
              <form onSubmit={handleSaveUser} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[#0B2559] mb-1">Número de Cédula *</label>
                    <input
                      type="text"
                      required
                      disabled={Boolean(editingCedula)}
                      value={cedula}
                      onChange={e => setCedula(e.target.value)}
                      placeholder="Ej. 10203040"
                      className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559] disabled:bg-[#EAF3FF]"
                    />
                  </div>

                  <div className="lg:col-span-2">
                    <label className="block text-xs font-semibold text-[#0B2559] mb-1">Nombre Completo *</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={e => setName(e.target.value)}
                      placeholder="Ej. María Fernanda Ortiz"
                      className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#0B2559] mb-1">Contraseña de Acceso *</label>
                    <input
                      type="text"
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="Clave de ingreso"
                      className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#0B2559] mb-1">Departamento / Área</label>
                    <select
                      value={department}
                      onChange={e => setDepartment(e.target.value)}
                      className="w-full px-2.5 py-2 text-xs text-[#0B2559] border border-[#B3D9FF] rounded-lg bg-white focus:outline-none focus:border-[#0B2559]"
                    >
                      {DEPARTMENT_OPTIONS.map(d => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[#0B2559] mb-1">Rol de Panel</label>
                    <select
                      value="user"
                      disabled
                      onChange={e => setRole(e.target.value as 'admin' | 'user')}
                      className="w-full px-2.5 py-2 text-xs font-bold text-[#0B2559] border border-[#B3D9FF] rounded-lg bg-[#EAF3FF] cursor-not-allowed"
                    >
                      <option value="user">Panel Usuario Operativo</option>
                    </select>
                  </div>
                </div>

                {/* Campos Personales, Residencia, Familiares y Bancarios (Solo Admin) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-[#D6EAFF]">
                  <SearchableLocationSelect
                    label="Lugar Expedición Cédula"
                    value={cedulaIssuePlace || 'Bogotá D.C.'}
                    onChange={setCedulaIssuePlace}
                    options={COLOMBIAN_CITIES}
                    searchPlaceholder="Buscar municipio de expedición..."
                  />
                  <div>
                    <label className="block text-[11px] font-semibold text-[#0B2559] mb-1">Fecha Expedición Cédula</label>
                    <input
                      type="date"
                      value={cedulaIssueDate}
                      onChange={e => setCedulaIssueDate(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#0B2559] mb-1">Fecha de Nacimiento</label>
                    <input
                      type="date"
                      value={birthDate}
                      onChange={e => setBirthDate(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    />
                  </div>
                  <SearchableLocationSelect
                    label="Lugar de Nacimiento"
                    value={birthPlace || 'Bogotá D.C.'}
                    onChange={setBirthPlace}
                    options={COLOMBIAN_CITIES}
                    searchPlaceholder="Buscar municipio de nacimiento..."
                  />
                  <div>
                    <label className="block text-[11px] font-semibold text-[#0B2559] mb-1">RH / Grupo Sanguíneo</label>
                    <select
                      value={bloodType || 'O+'}
                      onChange={e => setBloodType(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    >
                      {BLOOD_TYPES.map(rh => (
                        <option key={rh} value={rh}>
                          {rh}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#0B2559] mb-1">Estado Civil</label>
                    <select
                      value={maritalStatus || 'Soltero(a)'}
                      onChange={e => setMaritalStatus(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    >
                      {MARITAL_STATUS_OPTIONS.map(ms => (
                        <option key={ms} value={ms}>
                          {ms}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#0B2559] mb-1">Teléfono / Celular</label>
                    <input
                      type="text"
                      value={phone}
                      onChange={e => setPhone(e.target.value)}
                      placeholder="Ej. 3001234567"
                      className="w-full px-3 py-1.5 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#0B2559] mb-1">Correo Electrónico</label>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="correo@dominio.com"
                      className="w-full px-3 py-1.5 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    />
                  </div>
                  <SearchableLocationSelect
                    label="Departamento Ubicación"
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
                  <SearchableLocationSelect
                    label="Ciudad / Municipio"
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
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-[#0B2559] mb-1">Dirección de Residencia</label>
                    <input
                      type="text"
                      value={residenceAddress}
                      onChange={e => setResidenceAddress(e.target.value)}
                      placeholder="Dirección completa y barrio"
                      className="w-full px-3 py-1.5 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#0B2559] mb-1">Tipo Vivienda</label>
                    <select
                      value={residenceType || 'Arrendada'}
                      onChange={e => setResidenceType(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    >
                      {RESIDENCE_TYPES.map(vt => (
                        <option key={vt} value={vt}>
                          {vt}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#0B2559] mb-1">Estrato</label>
                    <select
                      value={residenceStratum || 'Estrato 3'}
                      onChange={e => setResidenceStratum(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    >
                      {STRATUM_OPTIONS.map(s => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#0B2559] mb-1">N° de Familiares</label>
                    <select
                      value={familyMembersCount}
                      onChange={e => setFamilyMembersCount(Number(e.target.value) || 0)}
                      className="w-full px-3 py-1.5 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    >
                      <option value={0}>0 (Vive solo)</option>
                      <option value={1}>1 familiar</option>
                      <option value={2}>2 familiares</option>
                      <option value={3}>3 familiares</option>
                      <option value={4}>4 familiares</option>
                      <option value={5}>5 familiares</option>
                      <option value={6}>6 o más familiares</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#0B2559] mb-1">Contacto Emergencia</label>
                    <input
                      type="text"
                      value={emergencyContactName}
                      onChange={e => setEmergencyContactName(e.target.value)}
                      placeholder="Nombre completo"
                      className="w-full px-3 py-1.5 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#0B2559] mb-1">Tel. Emergencia</label>
                    <input
                      type="text"
                      value={emergencyContactPhone}
                      onChange={e => setEmergencyContactPhone(e.target.value)}
                      placeholder="Teléfono de emergencia"
                      className="w-full px-3 py-1.5 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#0B2559] mb-1">Detalle Núcleo Familiar</label>
                    <select
                      value={familyNotes || 'Cónyuge e hijos menores de edad'}
                      onChange={e => setFamilyNotes(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    >
                      {FAMILY_COMPOSITION_OPTIONS.map(opt => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#0B2559] mb-1">Banco / Billetera (Pagos)</label>
                    <select
                      value={bankName || 'Bancolombia'}
                      onChange={e => setBankName(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    >
                      {BANK_OPTIONS.map(b => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#0B2559] mb-1">Tipo de Cuenta</label>
                    <select
                      value={bankAccountType || 'Cuenta de Ahorros'}
                      onChange={e => setBankAccountType(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    >
                      {BANK_ACCOUNT_TYPES.map(t => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#0B2559] mb-1">Número de Cuenta / Llave</label>
                    <input
                      type="text"
                      value={bankAccountNumber}
                      onChange={e => setBankAccountNumber(e.target.value)}
                      placeholder="Número para pagos"
                      className="w-full px-3 py-1.5 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#0B2559] mb-1">Titular de la Cuenta</label>
                    <select
                      value={bankAccountHolder || 'A mi nombre (Mismo titular del colaborador)'}
                      onChange={e => setBankAccountHolder(e.target.value)}
                      className="w-full px-3 py-1.5 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg"
                    >
                      {BANK_HOLDER_OPTIONS.map(h => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  {editingCedula && (
                    <button
                      type="button"
                      onClick={() => {
                        resetUserForm();
                        setShowCreateUserForm(false);
                      }}
                      className="px-4 py-2 text-xs font-bold text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg hover:bg-[#EAF3FF]"
                    >
                      Cancelar Edición
                    </button>
                  )}
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold text-white bg-[#0B2559] rounded-lg hover:bg-[#15397A] transition-colors flex items-center gap-1.5"
                  >
                    <i className="fi fi-rr-check text-xs" />
                    {editingCedula ? 'Guardar Cambios del Usuario' : 'Crear Usuario'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </section>

        {/* Lista de Usuarios */}
        <section className="bg-white border border-[#B3D9FF] rounded-xl p-5 space-y-4 shadow-2xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-[#D6EAFF]">
            <div>
              <h3 className="text-sm font-bold text-[#0B2559] flex items-center gap-2">
                <i className="fi fi-rr-users-alt text-sm text-[#3B82F6]" />
                Usuarios Registrados ({filteredUsers.length}) · Datos Personales, Bancarios y Permisos (Solo Admin)
              </h3>
              <p className="text-xs text-[#3B82F6] mt-0.5">
                Haz clic en la flecha de cada usuario para ver su ficha personal, cédula, ubicación, familiares y cuenta bancaria
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative w-full sm:w-64">
                <i className="fi fi-rr-search text-xs text-[#3B82F6] absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={e => setUserSearch(e.target.value)}
                  placeholder="Buscar nombre, cédula, ciudad o banco..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg focus:bg-white focus:outline-none focus:border-[#0B2559]"
                />
              </div>
              <button
                type="button"
                onClick={() => handleExportUsersExcel(filteredUsers)}
                className="px-3.5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs shrink-0"
              >
                <i className="fi fi-rr-file-excel text-xs" />
                Descargar Datos Personales en Excel (.XLS)
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {filteredUsers.map(u => {
              const isExpanded = Boolean(expandedUserIds[u.cedula]);
              const isSingleAdmin = u.cedula === SINGLE_ADMIN_CEDULA;
              const isAdmin = isSingleAdmin || u.role === 'admin';
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
                    className="flex items-center justify-between gap-2.5 px-3.5 sm:px-4 py-3 cursor-pointer hover:bg-[#F4F9FF] transition-colors"
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
                      {!isMobile && u.bankName && u.bankName !== 'No tengo / No aplica' && (
                        <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800">
                          <i className="fi fi-rr-bank text-[10px] mr-1" />
                          {u.bankName}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                      {!isMobile && isSingleAdmin && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditUserModal(u, 'security');
                          }}
                          className="px-2.5 py-1 text-xs font-bold text-white bg-[#0B2559] hover:bg-[#15397A] rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs"
                          title="Cambiar contraseña del Administrador con cédula autorizada y contraseña anterior"
                        >
                          <i className="fi fi-rr-key text-xs text-[#B3D9FF]" />
                          <span>Cambiar Contraseña</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditUserModal(u, 'personal');
                        }}
                        className="min-h-[36px] sm:min-h-0 px-2.5 py-1 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] hover:bg-[#99CCFF] rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs"
                        title="Editar todos los datos de este usuario"
                      >
                        <i className="fi fi-rr-edit text-xs" />
                        <span>Editar</span>
                      </button>

                      <button
                        type="button"
                        className={`w-8 h-8 sm:w-7 sm:h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
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
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-[#B3D9FF]">
                        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-3 sm:gap-4">
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
                            <span className="text-[#3B82F6]">Rol: </span>
                            <strong className="uppercase text-[#0B2559]">
                              {isSingleAdmin ? 'ADMIN ÚNICO' : 'USUARIO'}
                            </strong>
                          </div>
                          <div>
                            <span className="text-[#3B82F6]">Área: </span>
                            <strong className="text-[#0B2559]">{u.department}</strong>
                          </div>
                          <div className="col-span-2 sm:col-span-1">
                            <span className="text-[#3B82F6]">Presencia: </span>
                            <strong className={u.isOnline ? 'text-emerald-700' : 'text-[#0B2559]/70'}>
                              {u.isOnline ? 'En línea ahora' : `Últ. vez ${new Date(u.lastSeen).toLocaleTimeString('es-ES')}`}
                            </strong>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-[#EAF3FF]">
                          {isSingleAdmin && (
                            <button
                              type="button"
                              onClick={() => openEditUserModal(u, 'security')}
                              className="min-h-[38px] sm:min-h-0 flex-1 sm:flex-initial justify-center px-3 py-1.5 text-xs font-bold text-white bg-[#0B2559] hover:bg-[#15397A] rounded-lg flex items-center gap-1.5 transition-colors"
                            >
                              <i className="fi fi-rr-key text-xs text-[#B3D9FF]" /> Cambiar Contraseña
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleSelectEditUser(u)}
                            className="min-h-[38px] sm:min-h-0 flex-1 sm:flex-initial justify-center px-3 py-1.5 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] hover:bg-[#99CCFF] rounded-lg flex items-center gap-1.5 transition-colors"
                          >
                            <i className="fi fi-rr-edit text-xs" /> Editar Ficha y Usuario
                          </button>
                          {!isSingleAdmin && u.cedula !== currentUser.cedula && (
                            <button
                              type="button"
                              onClick={() => handleDeleteUser(u)}
                              className="min-h-[38px] sm:min-h-0 px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg flex items-center gap-1 transition-colors"
                            >
                              <i className="fi fi-rr-trash text-xs" /> Eliminar
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Ficha Confidencial de Datos Personales, Cédula, Ubicación, Familiares y Bancarios */}
                      {renderConfidentialPersonalDataFicha(u)}

                      <div>
                        <div className="text-[11px] font-bold text-[#0B2559] mb-2">
                          {isSingleAdmin
                            ? 'Permisos del Administrador Único (Todos habilitados permanentemente):'
                            : 'Permisos de Acciones del Usuario (Clic para permitir o quitar permiso):'}
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
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {renderEditUserModal()}
      </div>
    );
  }

  // NUEVO PANEL: AUTORIZACIÓN DE REGISTROS (admin_approvals)
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
      <div className="space-y-4">
        <div className="bg-white border border-[#B3D9FF] rounded-xl p-5 space-y-4 shadow-2xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-[#D6EAFF]">
            <div>
              <h2 className="text-sm font-bold text-[#0B2559] flex items-center gap-2">
                <i className="fi fi-rr-user-check text-sm text-[#3B82F6]" />
                Panel de Autorización de Registros de Usuarios ({filteredApprovalUsers.length})
              </h2>
              <p className="text-xs text-[#3B82F6] mt-0.5">
                Revisa la ficha personal, cédula, ubicación, núcleo familiar y datos bancarios enviados en el registro antes de autorizar
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative w-52">
                <i className="fi fi-rr-search text-xs text-[#3B82F6] absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={approvalSearch}
                  onChange={e => setApprovalSearch(e.target.value)}
                  placeholder="Buscar cédula, nombre o ciudad..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg focus:bg-white focus:outline-none focus:border-[#0B2559]"
                />
              </div>

              <div className="flex items-center gap-1 p-1 bg-[#F4F9FF] rounded-lg border border-[#B3D9FF]">
                <button
                  type="button"
                  onClick={() => setApprovalFilter('pendiente')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors whitespace-nowrap ${
                    approvalFilter === 'pendiente'
                      ? 'bg-[#0B2559] text-white shadow-2xs'
                      : 'text-[#0B2559] hover:bg-[#B3D9FF]/50'
                  }`}
                >
                  Pendientes ({pendingCount})
                </button>
                <button
                  type="button"
                  onClick={() => setApprovalFilter('aprobado')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors whitespace-nowrap ${
                    approvalFilter === 'aprobado'
                      ? 'bg-[#0B2559] text-white shadow-2xs'
                      : 'text-[#0B2559] hover:bg-[#B3D9FF]/50'
                  }`}
                >
                  Autorizados ({approvedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setApprovalFilter('rechazado')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors whitespace-nowrap ${
                    approvalFilter === 'rechazado'
                      ? 'bg-[#0B2559] text-white shadow-2xs'
                      : 'text-[#0B2559] hover:bg-[#B3D9FF]/50'
                  }`}
                >
                  Rechazados ({rejectedCount})
                </button>
                <button
                  type="button"
                  onClick={() => setApprovalFilter('todos')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-md transition-colors whitespace-nowrap ${
                    approvalFilter === 'todos'
                      ? 'bg-[#0B2559] text-white shadow-2xs'
                      : 'text-[#0B2559] hover:bg-[#B3D9FF]/50'
                  }`}
                >
                  Todos ({users.length})
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleExportUsersExcel(filteredApprovalUsers.length > 0 ? filteredApprovalUsers : users)}
                className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs shrink-0"
              >
                <i className="fi fi-rr-file-excel text-xs" />
                Descargar Excel (.XLS)
              </button>
            </div>
          </div>

          {filteredApprovalUsers.length === 0 ? (
            <div className="p-8 text-center bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl space-y-1.5">
              <div className="text-sm font-bold text-[#0B2559]">
                No hay registros en estado "{approvalFilter.toUpperCase()}"
              </div>
              <p className="text-xs text-[#3B82F6]">
                Cuando un usuario utilice el botón "Registrar" en el inicio de sesión, aparecerá aquí con todos sus datos personales y bancarios para tu autorización.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredApprovalUsers.map(u => {
                const isExpanded = Boolean(expandedUserIds[`apr_${u.cedula}`]);
                const status = u.approvalStatus || 'aprobado';
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
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-[#F4F9FF] transition-colors"
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
                        {u.locationCity && (
                          <span className="text-[11px] px-2 py-0.5 rounded-md bg-[#F4F9FF] border border-[#D6EAFF] text-[#0B2559]">
                            <i className="fi fi-rr-marker text-[10px] text-[#3B82F6] mr-1" />
                            {u.locationCity}
                          </span>
                        )}
                      </div>

                      <div
                        className="flex items-center gap-2"
                        onClick={e => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => openEditUserModal(u)}
                          className="px-2.5 py-1.5 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] hover:bg-[#99CCFF] rounded-lg flex items-center gap-1.5 transition-colors shadow-2xs"
                          title="Editar datos de este usuario"
                        >
                          <i className="fi fi-rr-edit text-xs" />
                          <span>Editar</span>
                        </button>
                        {status !== 'aprobado' && (
                          <button
                            type="button"
                            onClick={() => handleSetUserApprovalStatus(u, 'aprobado')}
                            className="px-3 py-1.5 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] hover:bg-[#99CCFF] rounded-lg flex items-center gap-1.5 transition-colors"
                          >
                            <i className="fi fi-rr-check text-xs" /> Autorizar Registro
                          </button>
                        )}
                        {status !== 'rechazado' && u.cedula !== SINGLE_ADMIN_CEDULA && u.cedula !== currentUser.cedula && (
                          <button
                            type="button"
                            onClick={() => handleSetUserApprovalStatus(u, 'rechazado')}
                            className="px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg flex items-center gap-1.5 transition-colors"
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
                        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-[#B3D9FF]">
                          <div className="flex flex-wrap items-center gap-4">
                            <div>
                              <span className="text-[#3B82F6]">Cédula: </span>
                              <strong className="font-mono text-[#0B2559]">{u.cedula}</strong>
                            </div>
                            <div>
                              <span className="text-[#3B82F6]">Correo: </span>
                              <strong className="text-[#0B2559]">{u.email}</strong>
                            </div>
                            <div>
                              <span className="text-[#3B82F6]">Área: </span>
                              <strong className="text-[#0B2559]">{u.department}</strong>
                            </div>
                            <div>
                              <span className="text-[#3B82F6]">Fecha Solicitud: </span>
                              <strong className="font-mono text-[#0B2559]">
                                {new Date(u.createdAt).toLocaleString('es-ES')}
                              </strong>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-[#0B2559]">Rol Asignado:</span>
                            <span className="px-2.5 py-1 text-xs font-bold text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg">
                              {u.cedula === SINGLE_ADMIN_CEDULA ? 'Administrador Único' : 'Usuario Operativo'}
                            </span>

                            {u.cedula !== SINGLE_ADMIN_CEDULA && u.cedula !== currentUser.cedula && (
                              <button
                                type="button"
                                onClick={() => handleDeleteUser(u)}
                                className="px-2.5 py-1 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg flex items-center gap-1"
                              >
                                <i className="fi fi-rr-trash text-xs" /> Eliminar
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Ficha Confidencial de Datos Personales, Cédula, Ubicación, Familiares y Bancarios */}
                        {renderConfidentialPersonalDataFicha(u)}

                        <div>
                          <div className="text-[11px] font-bold text-[#0B2559] mb-2">
                            Configurar Permisos antes o después de Autorizar:
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                            {permButtons.map(p => {
                              const enabled = u[p.key];
                              return (
                                <button
                                  key={p.key}
                                  type="button"
                                  onClick={() => handleTogglePermission(u, p.key, p.label)}
                                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-bold border transition-colors ${
                                    enabled
                                      ? 'bg-white text-[#0B2559] border-[#B3D9FF] hover:bg-[#EAF3FF]'
                                      : 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                                  }`}
                                >
                                  <span className="truncate">{p.label}</span>
                                  <i
                                    className={`fi ${
                                      enabled
                                        ? 'fi-rr-check-circle text-emerald-600'
                                        : 'fi-rr-cross-circle text-rose-600'
                                    } text-xs ml-1.5`}
                                  />
                                </button>
                              );
                            })}
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

        {renderEditUserModal()}
      </div>
    );
  }

  // 2. SECCIÓN: GESTIONAR REGISTROS
  if (activeSection === 'admin_records') {
    const filteredTasks = tasks.filter(t => {
      const matchesQuery =
        t.title.toLowerCase().includes(recordSearch.toLowerCase()) ||
        t.assignedToName.toLowerCase().includes(recordSearch.toLowerCase()) ||
        t.assignedToCedula.includes(recordSearch) ||
        t.tags.toLowerCase().includes(recordSearch.toLowerCase());
      const matchesPriority = priorityFilter === 'todos' || t.priority === priorityFilter;
      return matchesQuery && matchesPriority;
    });

    return (
      <div className="bg-white border border-[#B3D9FF] rounded-xl p-5 space-y-4 shadow-2xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-[#D6EAFF]">
          <div>
            <h2 className="text-sm font-bold text-[#0B2559] flex items-center gap-2">
              <i className="fi fi-rr-folder-open text-sm text-[#3B82F6]" />
              Gestión de Registros y Actividades ({filteredTasks.length}) · Clic en la flecha para desplegar información
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative w-60">
              <i className="fi fi-rr-search text-xs text-[#3B82F6] absolute left-3 top-2.5" />
              <input
                type="text"
                value={recordSearch}
                onChange={e => setRecordSearch(e.target.value)}
                placeholder="Buscar actividad o responsable..."
                className="w-full pl-9 pr-3 py-1.5 text-xs text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg focus:bg-white focus:outline-none focus:border-[#0B2559]"
              />
            </div>

            <div className="flex items-center gap-1 p-1 bg-[#F4F9FF] rounded-lg border border-[#B3D9FF]">
              {(['todos', 'critica', 'alta', 'media', 'baja'] as const).map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriorityFilter(p)}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                    priorityFilter === p
                      ? 'bg-[#0B2559] text-white shadow-2xs'
                      : 'text-[#0B2559] hover:bg-[#B3D9FF]/50'
                  }`}
                >
                  {p === 'todos' ? 'Todas' : p.charAt(0).toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onOpenNewTask}
              className="px-4 py-1.5 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-lg hover:bg-[#99CCFF] transition-colors flex items-center gap-1.5"
            >
              <i className="fi fi-rr-plus text-xs" /> Nueva Actividad
            </button>
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
                  className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-[#F4F9FF] transition-colors"
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
                  <div className="px-4 pb-4 pt-3 border-t border-[#D6EAFF] bg-[#F4F9FF] space-y-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2 font-bold text-[#0B2559]">
                        <span>PRIORIDAD {task.priority.toUpperCase()}</span>
                        <span className="text-[#7CC0FF]">·</span>
                        <span>ESTADO: {task.status.replace('_', ' ').toUpperCase()} ({task.progress}%)</span>
                        <span className="text-[#7CC0FF]">·</span>
                        <span>ÁREA: {task.category}</span>
                        {task.tags && (
                          <>
                            <span className="text-[#7CC0FF]">·</span>
                            <span className="text-[#3B82F6]">{task.tags}</span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onEditTask(task)}
                          className="px-3 py-1.5 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-lg hover:bg-[#99CCFF] flex items-center gap-1"
                        >
                          <i className="fi fi-rr-edit text-xs" /> Editar Registro
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

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white p-3.5 rounded-xl border border-[#B3D9FF] tabular-nums">
                      <div>
                        <span className="text-[#3B82F6] block text-[11px]">Responsable Asignado:</span>
                        <strong className="text-[#0B2559]">{task.assignedToName}</strong>{' '}
                        <span className="font-mono text-[#3B82F6]">(C.C. {task.assignedToCedula})</span>
                      </div>
                      <div>
                        <span className="text-[#3B82F6] block text-[11px]">Creado Por (Fecha/Hora):</span>
                        <strong className="text-[#0B2559]">{task.createdByName}</strong>{' '}
                        <span className="text-[#0B2559]/70">({new Date(task.createdAt).toLocaleString('es-ES')})</span>
                      </div>
                      <div>
                        <span className="text-[#3B82F6] block text-[11px]">Fecha Límite de Cierre:</span>
                        <strong className={isOverdue ? 'text-rose-600' : 'text-[#0B2559]'}>
                          {new Date(task.dueDate).toLocaleString('es-ES')}
                        </strong>
                      </div>
                    </div>

                    {(task.description || task.notes) && (
                      <div className="bg-white p-3.5 rounded-xl border border-[#B3D9FF] space-y-1.5">
                        {task.description && (
                          <div>
                            <strong className="text-[#0B2559]">Descripción: </strong>
                            <span className="text-[#0B2559]/90">{task.description}</span>
                          </div>
                        )}
                        {task.notes && (
                          <div>
                            <strong className="text-[#0B2559]">Notas: </strong>
                            <span className="text-[#0B2559]/90">{task.notes}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {(task.accessEmail || task.accessPassword || task.directLink) && (
                      <div className="bg-white p-3.5 rounded-xl border border-[#B3D9FF] flex flex-wrap items-center justify-between gap-3 font-mono text-[#0B2559]">
                        <div className="flex flex-wrap items-center gap-4">
                          {task.accessEmail && <span>Usuario: <strong>{task.accessEmail}</strong></span>}
                          {task.accessPassword && <span>Clave: <strong>{task.accessPassword}</strong></span>}
                        </div>
                        {task.directLink && (
                          <a
                            href={task.directLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 text-xs font-sans font-bold text-[#0B2559] bg-[#B3D9FF] rounded-lg hover:bg-[#99CCFF] flex items-center gap-1.5 transition-colors"
                          >
                            Entrar al Link Directo <i className="fi fi-rr-arrow-up-right-from-square text-[10px]" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 3. SECCIÓN: VIGILAR CADA ACCIÓN QUE HACE CADA USUARIO + AUDITORÍA
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
      <div className="space-y-4">
        <div className="bg-white border border-[#B3D9FF] rounded-xl p-5 space-y-4 shadow-2xs">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-[#D6EAFF]">
            <div>
              <h2 className="text-sm font-bold text-[#0B2559] flex items-center gap-2">
                <i className="fi fi-rr-shield-check text-sm text-[#3B82F6]" />
                Vigilancia y Logs de Auditoría en Tiempo Real ({filteredLogs.length}) · Clic en la flecha para ver el detalle
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-56">
                <i className="fi fi-rr-search text-xs text-[#3B82F6] absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={auditSearch}
                  onChange={e => setAuditSearch(e.target.value)}
                  placeholder="Buscar acción o usuario..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg focus:bg-white focus:outline-none focus:border-[#0B2559]"
                />
              </div>

              <select
                value={auditUserFilter}
                onChange={e => setAuditUserFilter(e.target.value)}
                className="px-3 py-1.5 text-xs text-[#0B2559] border border-[#B3D9FF] rounded-lg bg-[#F4F9FF] focus:bg-white"
              >
                <option value="todos">Todos los usuarios</option>
                {users.map(u => (
                  <option key={u.cedula} value={u.cedula}>
                    {u.name} ({u.cedula})
                  </option>
                ))}
              </select>

              <select
                value={auditSeverityFilter}
                onChange={e => setAuditSeverityFilter(e.target.value)}
                className="px-3 py-1.5 text-xs text-[#0B2559] border border-[#B3D9FF] rounded-lg bg-[#F4F9FF] focus:bg-white"
              >
                <option value="todos">Toda severidad</option>
                <option value="info">Info</option>
                <option value="warning">Advertencia</option>
                <option value="critical">Crítico</option>
              </select>

              <button
                type="button"
                onClick={handleExportAuditPDF}
                className="px-3.5 py-1.5 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-lg hover:bg-[#99CCFF] flex items-center gap-1.5 transition-colors"
              >
                <i className="fi fi-rr-file-pdf text-xs" /> Reporte PDF
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
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

  // 4. SECCIÓN: RESPALDOS Y PLANTILLA DE BASE DE DATOS
  return (
    <div className="space-y-3">
      {/* 1. Descargar Respaldo */}
      <div className="bg-white border border-[#B3D9FF] rounded-xl overflow-hidden shadow-2xs">
        <div
          onClick={() => toggleBackupCard('backup_export')}
          className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-[#F4F9FF] transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-[#B3D9FF] text-[#0B2559] flex items-center justify-center shrink-0">
              <i className="fi fi-rr-database text-sm" />
            </span>
            <span className="text-sm font-bold text-[#0B2559]">
              1. Descargar Respaldo Completo de Base de Datos (.JSON)
            </span>
          </div>
          <button
            type="button"
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              expandedBackupCards.backup_export ? 'bg-[#0B2559] text-white' : 'bg-[#EAF3FF] text-[#0B2559]'
            }`}
          >
            <i
              className={`fi ${
                expandedBackupCards.backup_export ? 'fi-rr-angle-small-up' : 'fi-rr-angle-small-down'
              } text-base`}
            />
          </button>
        </div>
        {expandedBackupCards.backup_export && (
          <div className="p-5 border-t border-[#D6EAFF] bg-[#F4F9FF] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-xs text-[#0B2559]">
              Exporta en un clic los {users.length} usuarios, {tasks.length} tareas, {auditLogs.length} eventos de auditoría, mensajes de chat y calendario sincronizado.
            </p>
            <button
              type="button"
              onClick={handleDownloadBackup}
              className="px-4 py-2 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-lg hover:bg-[#99CCFF] flex items-center gap-2 shrink-0 transition-colors"
            >
              <i className="fi fi-rr-download text-xs" /> Descargar Respaldo Ahora
            </button>
          </div>
        )}
      </div>

      {/* 2. Cargar Respaldo */}
      <div className="bg-white border border-[#B3D9FF] rounded-xl overflow-hidden shadow-2xs">
        <div
          onClick={() => toggleBackupCard('backup_import')}
          className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-[#F4F9FF] transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-[#B3D9FF] text-[#0B2559] flex items-center justify-center shrink-0">
              <i className="fi fi-rr-cloud-upload-alt text-sm" />
            </span>
            <span className="text-sm font-bold text-[#0B2559]">
              2. Cargar Respaldo o Importar Base de Datos (.JSON)
            </span>
          </div>
          <button
            type="button"
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              expandedBackupCards.backup_import ? 'bg-[#0B2559] text-white' : 'bg-[#EAF3FF] text-[#0B2559]'
            }`}
          >
            <i
              className={`fi ${
                expandedBackupCards.backup_import ? 'fi-rr-angle-small-up' : 'fi-rr-angle-small-down'
              } text-base`}
            />
          </button>
        </div>
        {expandedBackupCards.backup_import && (
          <div className="p-5 border-t border-[#D6EAFF] bg-[#F4F9FF] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <p className="text-xs text-[#0B2559]">
                Selecciona un archivo de respaldo `.json` para restaurar registros directamente en Firebase Firestore.
              </p>
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
                  className="px-4 py-2 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-lg hover:bg-[#99CCFF] flex items-center gap-2 cursor-pointer shrink-0 transition-colors"
                >
                  <i className="fi fi-rr-upload text-xs" /> Seleccionar Archivo JSON
                </label>
              </div>
            </div>
            {importStatus && (
              <div className="p-3 rounded-lg bg-white border border-[#B3D9FF] text-xs text-[#0B2559] font-medium">
                {importStatus}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};


