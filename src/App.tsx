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
  | 'admin_records'
  | 'admin_audit'
  | 'admin_backup'
  | 'user_personal'
  | 'user_all_tasks'
  | 'user_priority_alerts'
  | 'user_monthly_reports'
  | 'user_calendar'
  | 'user_chat';

export default function App() {
  const [users, setUsers] = useState<AppUser[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [loggedCedula, setLoggedCedula] = useState<string | null>(() => {
    return localStorage.getItem('taskflow_active_cedula');
  });
  const [loginCedulaInput, setLoginCedulaInput] = useState('');
  const [loginPasswordInput, setLoginPasswordInput] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [showDemoAccounts, setShowDemoAccounts] = useState(false);

  const [activePanelMode, setActivePanelMode] = useState<'admin' | 'user'>('user');
  const [activeSection, setActiveSection] = useState<NavSection>('user_personal');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);

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

  const currentUser = users.find(u => u.cedula === loggedCedula) || null;

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

  const handleQuickDemoFill = (u: AppUser) => {
    setLoginCedulaInput(u.cedula);
    setLoginPasswordInput(u.password);
    setLoginError(null);
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

  // PANTALLA DE INICIO DE SESIÓN CON EL NUEVO LOGO Y PALETA ULEP (#B3D9FF, #FFFFFF y #0B2559)
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#EAF3FF] flex flex-col justify-center py-10 px-4 sm:px-6">
        <div className="max-w-md w-full mx-auto bg-white border border-[#B3D9FF] rounded-2xl overflow-hidden shadow-sm">
          {/* Cabecera con el nuevo logo FUN_BLANCO sobre azul institucional para resaltar "Fundación" (blanco) y "ULEP" (#B3D9FF) */}
          <div className="bg-[#0B2559] px-8 py-7 flex flex-col items-center text-center border-b border-[#B3D9FF]/30">
            <img
              src={`${import.meta.env.BASE_URL}assets/aistudio/FUN_BLANCO_e68e4ad5`}
              alt="Fundación ULEP"
              className="h-24 w-auto object-contain mb-2"
              referrerPolicy="no-referrer"
            />
            <h1 className="text-lg font-bold text-white">
              Plataforma de Gestión y Auditoría
            </h1>
            <p className="text-xs text-[#B3D9FF] mt-1">
              Ingresa con tu número de Cédula y Contraseña asignada
            </p>
          </div>

          <div className="p-8">
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#0B2559] mb-1.5">
                  Número de Cédula
                </label>
                <div className="relative">
                  <i className="fi fi-rr-id-card-clip-alt text-sm text-[#3B82F6] absolute left-3.5 top-2.5" />
                  <input
                    type="text"
                    required
                    value={loginCedulaInput}
                    onChange={e => setLoginCedulaInput(e.target.value)}
                    placeholder="Ej. 10000001"
                    className="w-full pl-10 pr-4 py-2.5 text-sm font-mono text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl focus:bg-white focus:outline-none focus:border-[#0B2559] transition-colors"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#0B2559] mb-1.5">
                  Contraseña
                </label>
                <div className="relative">
                  <i className="fi fi-rr-lock text-sm text-[#3B82F6] absolute left-3.5 top-2.5" />
                  <input
                    type="password"
                    required
                    value={loginPasswordInput}
                    onChange={e => setLoginPasswordInput(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-4 py-2.5 text-sm font-mono text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl focus:bg-white focus:outline-none focus:border-[#0B2559] transition-colors"
                  />
                </div>
              </div>

              {loginError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium flex items-center gap-2">
                  <i className="fi fi-rr-exclamation text-sm text-rose-600 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-3 px-4 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-xl hover:bg-[#99CCFF] transition-colors flex items-center justify-center gap-2 shadow-2xs"
              >
                <i className="fi fi-rr-key text-xs" /> Iniciar Sesión
              </button>
            </form>

            {/* Desplegable con Flecha para Cuentas de Prueba */}
            <div className="mt-6 pt-4 border-t border-[#D6EAFF]">
              <button
                type="button"
                onClick={() => setShowDemoAccounts(!showDemoAccounts)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-[#F4F9FF] hover:bg-[#E3F0FF] border border-[#B3D9FF]/60 text-xs font-bold text-[#0B2559] transition-colors"
              >
                <span>Ver cuentas disponibles para acceso rápido</span>
                <i
                  className={`fi ${
                    showDemoAccounts ? 'fi-rr-angle-small-up' : 'fi-rr-angle-small-down'
                  } text-base text-[#0B2559]`}
                />
              </button>

              {showDemoAccounts && (
                <div className="mt-2.5 space-y-1.5">
                  {loadingData ? (
                    <div className="text-xs text-[#0B2559]/70 py-2 text-center">Cargando usuarios...</div>
                  ) : (
                    users.map(u => {
                      const isAdmin = u.role === 'admin';
                      return (
                        <button
                          key={u.cedula}
                          type="button"
                          onClick={() => handleQuickDemoFill(u)}
                          className="w-full text-left p-2.5 rounded-xl border border-[#B3D9FF] hover:border-[#0B2559] hover:bg-[#F4F9FF] bg-white transition-colors flex items-center justify-between text-xs"
                        >
                          <div>
                            <div className="font-bold text-[#0B2559]">{u.name}</div>
                            <div className="font-mono text-[11px] text-[#0B2559]/70">
                              Cédula: <span className="text-[#0B2559] font-semibold">{u.cedula}</span> · Clave: <span className="text-[#0B2559] font-semibold">{u.password}</span>
                            </div>
                          </div>
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-md ${
                              isAdmin
                                ? 'text-white bg-[#0B2559]'
                                : 'text-[#0B2559] bg-[#B3D9FF]'
                            }`}
                          >
                            {isAdmin ? 'Admin' : 'Usuario'}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

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
      badge: users.length,
    },
    {
      id: 'admin_records',
      label: '2. Registros de Tareas',
      iconClass: 'fi fi-rr-folder-open',
      badge: tasks.length,
    },
    {
      id: 'admin_audit',
      label: '3. Auditoría y Reporte PDF',
      iconClass: 'fi fi-rr-shield-check',
      badge: auditLogs.length,
    },
    {
      id: 'admin_backup',
      label: '4. Respaldos y GitHub',
      iconClass: 'fi fi-rr-database',
    }
  ];

  const userNavItems: {
    id: NavSection;
    label: string;
    iconClass: string;
    badge?: number;
  }[] = [
    {
      id: 'user_personal',
      label: '1. Bandeja de Tareas',
      iconClass: 'fi fi-rr-inbox-in',
      badge: tasks.length,
    },
    {
      id: 'user_calendar',
      label: '2. Calendario de Entregas',
      iconClass: 'fi fi-rr-calendar',
      badge: calendarEvents.length,
    },
    {
      id: 'user_chat',
      label: '3. Chat y Equipo en Línea',
      iconClass: 'fi fi-rr-comments',
      badge: users.filter(u => u.isOnline).length,
    }
  ];

  const currentNavList = activePanelMode === 'admin' ? adminNavItems : userNavItems;

  return (
    <div className="min-h-screen bg-[#F4F9FF] flex flex-col lg:flex-row">
      {/* Menú Lateral con el Nuevo Logo FUN_BLANCO y Tonos Celeste ULEP (#B3D9FF) */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#0B2559] text-white flex flex-col justify-between transition-transform lg:static lg:translate-x-0 border-r border-[#B3D9FF]/30 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div>
          <div className="flex items-center justify-between px-4 py-4 border-b border-[#B3D9FF]/20 bg-[#081C45]">
            <div className="flex items-center gap-3">
              <img
                src={`${import.meta.env.BASE_URL}assets/aistudio/FUN_BLANCO_e68e4ad5`}
                alt="Fundación ULEP"
                className="h-12 w-auto object-contain"
                referrerPolicy="no-referrer"
              />
              <div className="leading-tight">
                <span className="text-sm font-bold text-white block whitespace-nowrap">
                  Fundación ULEP
                </span>
                <span className="text-[11px] font-semibold text-[#B3D9FF] block">
                  Gestión & Auditoría
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 text-[#B3D9FF] hover:bg-white/10 rounded-lg"
            >
              <i className="fi fi-rr-cross text-xs" />
            </button>
          </div>

          {currentUser.role === 'admin' && (
            <div className="p-3 border-b border-[#B3D9FF]/20">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#B3D9FF] mb-1.5 px-1">
                Modo de Visualización
              </div>
              <div className="grid grid-cols-2 gap-1 p-1 bg-[#081C45] rounded-xl border border-[#B3D9FF]/20">
                <button
                  type="button"
                  onClick={() => {
                    setActivePanelMode('admin');
                    setActiveSection('admin_users');
                  }}
                  className={`py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
                    activePanelMode === 'admin'
                      ? 'bg-[#B3D9FF] text-[#0B2559]'
                      : 'text-[#B3D9FF]/80 hover:text-white'
                  }`}
                >
                  Panel Admin
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActivePanelMode('user');
                    setActiveSection('user_personal');
                  }}
                  className={`py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap ${
                    activePanelMode === 'user'
                      ? 'bg-[#B3D9FF] text-[#0B2559]'
                      : 'text-[#B3D9FF]/80 hover:text-white'
                  }`}
                >
                  Panel Usuario
                </button>
              </div>
            </div>
          )}

          <nav className="p-3 space-y-1.5">
            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#B3D9FF]">
              {activePanelMode === 'admin' ? 'Módulos de Administración' : 'Espacio Operativo'}
            </div>
            {currentNavList.map(item => {
              const isActive =
                activeSection === item.id ||
                (item.id === 'user_personal' &&
                  ['user_personal', 'user_all_tasks', 'user_priority_alerts', 'user_monthly_reports'].includes(
                    activeSection
                  ));
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveSection(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
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
            <span className="text-[11px] font-mono text-[#B3D9FF]">C.C. {currentUser.cedula}</span>
            <span className="text-[11px] text-[#B3D9FF] font-bold flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              En línea
            </span>
          </div>
          <div>
            <div className="text-xs font-bold text-white truncate">{currentUser.name}</div>
            <div className="text-[11px] text-[#B3D9FF]/80 truncate mt-0.5">
              <span className="text-[#B3D9FF] font-semibold">
                {currentUser.role === 'admin' ? 'Administrador' : 'Usuario'}
              </span>{' '}
              · {currentUser.department}
            </div>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-2 px-3 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] hover:bg-white rounded-xl transition-colors flex items-center justify-center gap-2"
          >
            <i className="fi fi-rr-sign-out-alt text-xs" /> Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Área Principal con Lienzo Celeste Suave y Blanco */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar con Colores del Logo ULEP */}
        <header className="bg-white border-b border-[#B3D9FF] px-4 sm:px-6 py-3 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 text-[#0B2559] hover:bg-[#EAF3FF] rounded-lg border border-[#B3D9FF]"
            >
              <i className="fi fi-rr-menu-burger text-sm" />
            </button>
            <div className="flex items-center gap-2.5 truncate">
              <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-[#7CC0FF]" />
              <span className="text-sm font-bold text-[#0B2559] truncate">
                {activePanelMode === 'admin' ? 'Panel de Control y Administración' : 'Espacio de Trabajo Operativo'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-[#0B2559] font-semibold bg-[#EAF3FF] px-3 py-1 rounded-lg border border-[#B3D9FF]">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              {users.filter(u => u.isOnline).length} en línea
            </span>
            {(currentUser.canCreateTasks || currentUser.role === 'admin') && (
              <button
                type="button"
                onClick={() => {
                  setEditingTask(null);
                  setTaskModalOpen(true);
                }}
                className="px-4 py-2 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-xl hover:bg-[#99CCFF] transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 shadow-2xs"
              >
                <i className="fi fi-rr-plus text-xs" /> Nueva Tarea
              </button>
            )}
          </div>
        </header>

        {/* Contenido Principal */}
        <main className="flex-1 p-4 sm:p-6 max-w-6xl w-full mx-auto">
          {activePanelMode === 'admin' && currentUser.role === 'admin' ? (
            <AdminViews
              activeSection={
                (activeSection.startsWith('admin_') ? activeSection : 'admin_users') as
                  | 'admin_users'
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
              onChangeSection={sec => setActiveSection(sec)}
              currentUser={currentUser}
              users={users}
              tasks={tasks}
              chatMessages={chatMessages}
              calendarEvents={calendarEvents}
              onOpenNewTask={() => {
                setEditingTask(null);
                setTaskModalOpen(true);
              }}
              onEditTask={t => {
                setEditingTask(t);
                setTaskModalOpen(true);
              }}
            />
          )}
        </main>
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
