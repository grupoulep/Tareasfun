import React, { useState, useEffect } from 'react';
import {
  collection,
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
  cleanId
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
  const [users, setUsers] = useState<AppUser[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [loggedCedula, setLoggedCedula] = useState<string | null>(() => {
    const saved = localStorage.getItem('taskflow_active_cedula');
    if (saved && ['10000001', '10203040', '20304050', '30405060', '99001122'].includes(saved)) {
      localStorage.removeItem('taskflow_active_cedula');
      return null;
    }
    return saved;
  });
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [loginCedulaInput, setLoginCedulaInput] = useState('');
  const [loginPasswordInput, setLoginPasswordInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

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
    seedInitialDatabaseIfEmpty();

    const unsubUsers = onSnapshot(
      query(collection(db, 'app_users'), limit(200)),
      snap => {
        const list: AppUser[] = [];
        snap.forEach(d => {
          list.push(d.data() as AppUser);
        });
        setUsers(list);
        setLoadingData(false);
      },
      err => handleFirestoreError(err, OperationType.LIST, 'app_users')
    );

    const unsubTasks = onSnapshot(
      query(collection(db, 'tasks'), limit(200)),
      snap => {
        const list: TaskItem[] = [];
        snap.forEach(d => {
          list.push({ ...(d.data() as Omit<TaskItem, 'id'>), id: d.id });
        });
        list.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
        setTasks(list);
      },
      err => handleFirestoreError(err, OperationType.LIST, 'tasks')
    );

    const unsubLogs = onSnapshot(
      query(collection(db, 'audit_logs'), orderBy('timestamp', 'desc'), limit(120)),
      snap => {
        const list: AuditLog[] = [];
        snap.forEach(d => {
          list.push({ ...(d.data() as Omit<AuditLog, 'id'>), id: d.id });
        });
        setAuditLogs(list);
      },
      err => handleFirestoreError(err, OperationType.LIST, 'audit_logs')
    );

    const unsubChat = onSnapshot(
      query(collection(db, 'chat_messages'), orderBy('timestamp', 'asc'), limit(150)),
      snap => {
        const list: ChatMessage[] = [];
        snap.forEach(d => {
          list.push({ ...(d.data() as Omit<ChatMessage, 'id'>), id: d.id });
        });
        setChatMessages(list);
      },
      err => handleFirestoreError(err, OperationType.LIST, 'chat_messages')
    );

    const unsubCal = onSnapshot(
      query(collection(db, 'calendar_events'), limit(200)),
      snap => {
        const list: CalendarEvent[] = [];
        snap.forEach(d => {
          list.push({ ...(d.data() as Omit<CalendarEvent, 'id'>), id: d.id });
        });
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

  useEffect(() => {
    if (!currentUser) return;

    const markOnline = async () => {
      try {
        await saveUserToFirestore({
          ...currentUser,
          isOnline: true,
          lastSeen: new Date().toISOString(),
        });
      } catch (e) {
        console.error(e);
      }
    };

    markOnline();
    const interval = setInterval(markOnline, 45000);

    const handleBeforeUnload = () => {
      saveUserToFirestore({
        ...currentUser,
        isOnline: false,
        lastSeen: new Date().toISOString(),
      });
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentUser?.cedula]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    const cleanCed = loginCedulaInput.trim();
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
        'Tu solicitud de registro fue rechazada por el Administrador. Contacta a Dirección General.'
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
        canEditTasks: true,
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

  // PANTALLA DE INICIO DE SESIÓN Y REGISTRO CON EL LOGO Y PALETA ULEP (#B3D9FF, #FFFFFF y #0B2559)
  if (!currentUser) {
    const showStepByStepReg = isMobileView && !regMobileShowAll;

    return (
      <div className="min-h-screen bg-[#EAF3FF] flex flex-col justify-center py-4 sm:py-8 px-3 sm:px-6">
        <div
          className={`${
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
                </div>

                {loginError && (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium flex items-center gap-2">
                    <i className="fi fi-rr-exclamation text-sm text-rose-600 shrink-0" />
                    <span>{loginError}</span>
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
                    }}
                    className="w-full min-h-[44px] py-2.5 px-4 text-xs font-bold text-[#0B2559] bg-white border border-[#B3D9FF] rounded-xl hover:bg-[#F4F9FF] transition-colors flex items-center justify-center gap-2"
                  >
                    <i className="fi fi-rr-user-add text-xs text-[#3B82F6]" /> Registrar Nueva Cuenta
                  </button>
                </div>
              </form>
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
    }
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
  ];

  const currentNavList = activePanelMode === 'admin' ? adminNavItems : userNavItems;

  return (
    <div className={`min-h-screen bg-[#F4F9FF] flex flex-col ${isPcView ? 'lg:flex-row' : ''}`}>
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

      {/* Área Principal con Lienzo Celeste Suave y Blanco */}
      <div className={`flex-1 flex flex-col min-w-0 ${isMobileView ? 'pb-16' : ''}`}>
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
          {activePanelMode === 'admin' && currentUser.role === 'admin' ? (
            <AdminViews
              activeSection={
                (activeSection.startsWith('admin_') ? activeSection : 'admin_users') as
                  | 'admin_users'
                  | 'admin_approvals'
                  | 'admin_records'
                  | 'admin_audit'
                  | 'admin_backup'
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
                setEditingTask(t);
                setTaskModalOpen(true);
              }}
            />
          )}
        </main>

        {/* En TELÉFONO: Barra Inferior Táctil (Bottom Navigation Bar) con todas las opciones a 1 toque */}
        {isMobileView && (
          <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#B3D9FF] px-2 py-1.5 shadow-lg">
            {activePanelMode === 'admin' && currentUser.role === 'admin' ? (
              <div className="grid grid-cols-5 gap-1 max-w-lg mx-auto">
                {([
                  { id: 'admin_users', shortLabel: 'Usuarios', icon: 'fi-rr-users-alt', badge: users.filter(u => !u.approvalStatus || u.approvalStatus === 'aprobado').length },
                  { id: 'admin_approvals', shortLabel: 'Autorizar', icon: 'fi-rr-user-check', badge: pendingApprovalsCount },
                  { id: 'admin_records', shortLabel: 'Tareas', icon: 'fi-rr-folder-open', badge: tasks.length },
                  { id: 'admin_audit', shortLabel: 'Auditoría', icon: 'fi-rr-shield-check', badge: undefined },
                  { id: 'admin_backup', shortLabel: 'Respaldos', icon: 'fi-rr-database', badge: undefined },
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
              <div className="grid grid-cols-2 gap-2 max-w-lg mx-auto">
                <button
                  type="button"
                  onClick={() => setActiveSection('user_personal')}
                  className="min-h-[44px] rounded-xl bg-[#0B2559] text-white font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <i className="fi fi-rr-checkbox text-xs text-[#B3D9FF]" />
                  <span>Chequeo ({pendingUserTasksCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  className="min-h-[44px] rounded-xl bg-[#F4F9FF] text-[#0B2559] border border-[#B3D9FF] font-bold text-xs flex items-center justify-center gap-1.5"
                >
                  <i className="fi fi-rr-menu-burger text-xs" />
                  <span>Menú / Perfil</span>
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
