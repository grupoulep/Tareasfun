import React, { useState } from 'react';
import { AppUser, TaskItem, TaskPriority, TaskStatus } from '../types';
import {
  saveTaskToFirestore,
  deleteTaskFromFirestore,
  recordAuditLog,
  cleanId
} from '../firebase';

interface UserViewsProps {
  currentUser: AppUser;
  users?: AppUser[];
  tasks: TaskItem[];
  onOpenNewTask: () => void;
  deviceMode?: 'mobile' | 'tablet' | 'pc';
  [key: string]: any;
}

interface PrioritySection {
  key: TaskPriority;
  name: string;
  shortName: string;
  dotColor: string;
  badgeBg: string;
  badgeText: string;
  borderColor: string;
  accentBg: string;
  buttonBg: string;
}

const SECTIONS: PrioritySection[] = [
  {
    key: 'critica',
    name: 'Prioridad Crítica',
    shortName: 'Crítica',
    dotColor: 'bg-rose-600',
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-700',
    borderColor: 'border-rose-200',
    accentBg: 'bg-rose-50/50',
    buttonBg: 'bg-rose-600 hover:bg-rose-700 text-white',
  },
  {
    key: 'alta',
    name: 'Prioridad Alta',
    shortName: 'Alta',
    dotColor: 'bg-amber-500',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-800',
    borderColor: 'border-amber-200',
    accentBg: 'bg-amber-50/50',
    buttonBg: 'bg-amber-600 hover:bg-amber-700 text-white',
  },
  {
    key: 'media',
    name: 'Prioridad Media',
    shortName: 'Media',
    dotColor: 'bg-[#3B82F6]',
    badgeBg: 'bg-[#EAF3FF]',
    badgeText: 'text-[#0B2559]',
    borderColor: 'border-[#B3D9FF]',
    accentBg: 'bg-[#F4F9FF]',
    buttonBg: 'bg-[#0B2559] hover:bg-[#15397A] text-white',
  },
  {
    key: 'baja',
    name: 'Prioridad Baja',
    shortName: 'Baja',
    dotColor: 'bg-slate-400',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
    borderColor: 'border-slate-200',
    accentBg: 'bg-slate-50',
    buttonBg: 'bg-slate-700 hover:bg-slate-800 text-white',
  },
];

export const UserViews: React.FC<UserViewsProps> = ({
  currentUser,
  users = [],
  tasks,
  onOpenNewTask,
  deviceMode = 'pc',
}) => {
  const isMobile = deviceMode === 'mobile';

  // Inputs rápidos por sección
  const [quickInputs, setQuickInputs] = useState<Record<TaskPriority, string>>({
    critica: '',
    alta: '',
    media: '',
    baja: '',
  });

  // Encargado seleccionado en el creador rápido por sección ('ABIERTA' o cédula de cualquier usuario)
  const [quickAssignees, setQuickAssignees] = useState<Record<TaskPriority, string>>({
    critica: 'ABIERTA',
    alta: 'ABIERTA',
    media: currentUser.cedula,
    baja: currentUser.cedula,
  });

  // En Teléfono permite abrir/cerrar el input rápido para mantener la vista limpia
  const [mobileQuickAddOpen, setMobileQuickAddOpen] = useState<Record<TaskPriority, boolean>>({
    critica: false,
    alta: false,
    media: false,
    baja: false,
  });

  // Filtro de prioridad, estado y filtros rápidos en la Lista de Chequeo
  const [selectedPriorityTab, setSelectedPriorityTab] = useState<'todas' | TaskPriority>('todas');
  const [statusFilter, setStatusFilter] = useState<'todos' | TaskStatus>('todos');
  const [quickFilter, setQuickFilter] = useState<'ninguno' | 'mis_pendientes' | 'completadas' | 'criticas'>('ninguno');
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);

  // Vista en cuadrícula de 2 columnas o lista en PC/Tablet
  const [desktopGridLayout, setDesktopGridLayout] = useState<'stack' | 'grid'>('stack');

  // Tarea seleccionada exclusivamente para VER
  const [viewingTask, setViewingTask] = useState<TaskItem | null>(null);

  // Ocultar o mostrar hechas
  const [showCompleted, setShowCompleted] = useState(true);

  // Botón corredizo: Tareas Personales vs Tareas del Grupo Empresarial
  const [taskScope, setTaskScope] = useState<'personales' | 'grupo'>('personales');

  const isTaskVisibleInPersonal = (t: TaskItem) =>
    t.assignedToCedula === currentUser.cedula ||
    t.createdByCedula === currentUser.cedula ||
    t.assignedToCedula === 'ABIERTA';

  // Contadores para los filtros rápidos
  const myPendingTasksCount = tasks.filter(
    t => isTaskVisibleInPersonal(t) && t.status !== 'completada'
  ).length;
  const completedTasksCount = tasks.filter(t => {
    const inScope = taskScope === 'personales' ? isTaskVisibleInPersonal(t) : true;
    return inScope && t.status === 'completada';
  }).length;
  const criticalTasksCount = tasks.filter(t => {
    const inScope = taskScope === 'personales' ? isTaskVisibleInPersonal(t) : true;
    return inScope && t.priority === 'critica';
  }).length;

  // Filtrar según el botón corredizo (Personales vs Grupo Empresarial) y filtro rápido activo
  const scopedTasks = tasks.filter(t => {
    if (quickFilter === 'mis_pendientes') {
      return isTaskVisibleInPersonal(t) && t.status !== 'completada';
    }
    if (taskScope === 'personales') {
      return isTaskVisibleInPersonal(t);
    }
    return true; // Tareas del Grupo Empresarial
  });

  // Totales para resumen dentro del filtro
  const totalScoped = scopedTasks.length;
  const completedCount = scopedTasks.filter(t => t.status === 'completada').length;
  const inProgressCount = scopedTasks.filter(t => t.status === 'en_progreso').length;
  const startedCount = scopedTasks.filter(t => t.status === 'pendiente').length;
  const completionPercent = totalScoped > 0 ? Math.round((completedCount / totalScoped) * 100) : 0;

  // Cambiar el estado con un solo clic a: 'Iniciada', 'En proceso' o 'Hecha'
  const handleSetStatus = async (task: TaskItem, newStatus: TaskStatus) => {
    let progress = 0;
    if (newStatus === 'completada') progress = 100;
    else if (newStatus === 'en_progreso') progress = 50;
    else progress = 0;

    const updated: TaskItem = {
      ...task,
      status: newStatus,
      progress,
      completedAt: newStatus === 'completada' ? new Date().toISOString() : '',
    };

    await saveTaskToFirestore(updated);

    if (viewingTask && viewingTask.id === task.id) {
      setViewingTask(updated);
    }

    const labelMap: Record<TaskStatus, string> = {
      pendiente: 'INICIADA',
      en_progreso: 'EN PROCESO',
      completada: 'HECHA',
    };

    await recordAuditLog({
      actorCedula: currentUser.cedula,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionType: 'CAMBIO_ESTADO_CHEQUEO',
      module: 'LISTA_CHEQUEO',
      description: `Marcó tarea "${task.title}" como [${labelMap[newStatus]}].`,
      targetId: task.id,
      severity: 'info',
    });
  };

  // Cambiar encargado de una tarea existente (a cualquier usuario o Abierta)
  const handleChangeTaskAssignee = async (task: TaskItem, targetCedula: string) => {
    const isOpen = targetCedula === 'ABIERTA';
    const targetUser = isOpen ? null : users.find(u => u.cedula === targetCedula) || currentUser;
    const updated: TaskItem = {
      ...task,
      assignedToCedula: isOpen ? 'ABIERTA' : targetUser!.cedula,
      assignedToName: isOpen ? 'Abierta (Cualquiera puede realizarla)' : targetUser!.name,
    };
    await saveTaskToFirestore(updated);
    if (viewingTask && viewingTask.id === task.id) {
      setViewingTask(updated);
    }
    await recordAuditLog({
      actorCedula: currentUser.cedula,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionType: 'ASIGNAR_ENCARGADO_TAREA',
      module: 'LISTA_CHEQUEO',
      description: `Asignó la tarea "${task.title}" a: ${updated.assignedToName}.`,
      targetId: task.id,
      severity: 'info',
    });
  };

  // Toggle directo con la casilla: si está Hecha pasa a Iniciada, si no pasa a Hecha
  const handleToggleCheck = async (task: TaskItem) => {
    const nextStatus: TaskStatus = task.status === 'completada' ? 'pendiente' : 'completada';
    await handleSetStatus(task, nextStatus);
  };

  // Agregar tarea instantánea con Enter o botón (con opción de encargado o abierta)
  const handleAddQuick = async (priority: TaskPriority) => {
    const text = (quickInputs[priority] || '').trim();
    if (!text) return;

    const selectedAssignee = quickAssignees[priority] || 'ABIERTA';
    const isOpenTask = selectedAssignee === 'ABIERTA';
    const assignedUser = isOpenTask
      ? null
      : users.find(u => u.cedula === selectedAssignee) || currentUser;

    const newTask: TaskItem = {
      id: cleanId(`chk_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`),
      title: text,
      description: '',
      priority,
      status: 'pendiente',
      progress: 0,
      tags: priority.toUpperCase(),
      assignedToCedula: isOpenTask ? 'ABIERTA' : assignedUser!.cedula,
      assignedToName: isOpenTask
        ? 'Abierta (Cualquiera puede realizarla)'
        : assignedUser!.name,
      createdByCedula: currentUser.cedula,
      createdByName: currentUser.name,
      createdAt: new Date().toISOString(),
      dueDate: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
      completedAt: '',
      notes: '',
      accessEmail: '',
      accessPassword: '',
      directLink: '',
      category: 'Chequeo',
    };

    await saveTaskToFirestore(newTask);
    await recordAuditLog({
      actorCedula: currentUser.cedula,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionType: 'AGREGAR_CHEQUEO',
      module: 'LISTA_CHEQUEO',
      description: `Agregó a [${priority.toUpperCase()}] (${newTask.assignedToName}): "${text}".`,
      targetId: newTask.id,
      severity: 'info',
    });

    setQuickInputs(prev => ({ ...prev, [priority]: '' }));
    if (isMobile) {
      setMobileQuickAddOpen(prev => ({ ...prev, [priority]: false }));
    }
  };

  // Eliminar tarea
  const handleDelete = async (task: TaskItem) => {
    if (!currentUser.canDeleteTasks && currentUser.role !== 'admin') return;
    await deleteTaskFromFirestore(task.id);
    if (viewingTask && viewingTask.id === task.id) {
      setViewingTask(null);
    }
    await recordAuditLog({
      actorCedula: currentUser.cedula,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionType: 'ELIMINAR_CHEQUEO',
      module: 'LISTA_CHEQUEO',
      description: `Eliminó de la lista de chequeo: "${task.title}".`,
      targetId: task.id,
      severity: 'warning',
    });
  };

  const handleApplyQuickFilter = (mode: 'ninguno' | 'mis_pendientes' | 'completadas' | 'criticas') => {
    if (quickFilter === mode) {
      setQuickFilter('ninguno');
      setSelectedPriorityTab('todas');
      setStatusFilter('todos');
      setShowCompleted(true);
      return;
    }
    setQuickFilter(mode);
    if (mode === 'mis_pendientes') {
      setTaskScope('personales');
      setSelectedPriorityTab('todas');
      setStatusFilter('todos');
      setShowCompleted(false);
    } else if (mode === 'completadas') {
      setSelectedPriorityTab('todas');
      setStatusFilter('completada');
      setShowCompleted(true);
    } else if (mode === 'criticas') {
      setSelectedPriorityTab('critica');
      setStatusFilter('todos');
      setShowCompleted(true);
    } else {
      setSelectedPriorityTab('todas');
      setStatusFilter('todos');
      setShowCompleted(true);
    }
  };

  const visibleSections =
    selectedPriorityTab === 'todas'
      ? SECTIONS
      : SECTIONS.filter(s => s.key === selectedPriorityTab);

  const activeFilterCount =
    (quickFilter !== 'ninguno' ? 1 : 0) +
    (selectedPriorityTab !== 'todas' ? 1 : 0) +
    (statusFilter !== 'todos' ? 1 : 0) +
    (!showCompleted ? 1 : 0);

  return (
    <div className={`space-y-4 mx-auto pb-20 ${isMobile ? 'max-w-lg' : 'max-w-6xl'}`}>
      {/* Barra Superior con el Botón Corredizo, Botón Crear Tarea, Filtros Rápidos y Botón Tipo Filtro */}
      <div className="bg-white border border-[#B3D9FF] rounded-2xl p-3.5 sm:p-4 shadow-2xs relative space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Botón Corredizo: Tareas Personales / Tareas del Grupo Empresarial */}
          <div className="grid grid-cols-2 sm:inline-flex items-center p-1 bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl shadow-2xs w-full sm:w-auto">
            <button
              type="button"
              onClick={() => {
                setTaskScope('personales');
                if (quickFilter === 'ninguno') setShowCompleted(true);
              }}
              className={`min-h-[42px] sm:min-h-0 px-3 sm:px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
                taskScope === 'personales'
                  ? 'bg-[#0B2559] text-white shadow-xs'
                  : 'text-[#0B2559] hover:bg-[#B3D9FF]/40'
              }`}
            >
              <i className="fi fi-rr-user text-xs shrink-0" />
              <span className="truncate">Tareas Personales</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTaskScope('grupo');
                if (quickFilter === 'mis_pendientes') {
                  setQuickFilter('ninguno');
                  setShowCompleted(true);
                }
              }}
              className={`min-h-[42px] sm:min-h-0 px-3 sm:px-4 py-2 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
                taskScope === 'grupo'
                  ? 'bg-[#0B2559] text-white shadow-xs'
                  : 'text-[#0B2559] hover:bg-[#B3D9FF]/40'
              }`}
            >
              <i className="fi fi-rr-building text-xs shrink-0" />
              <span className="truncate">
                {isMobile ? 'Grupo Empresarial' : 'Tareas del Grupo Empresarial'}
              </span>
            </button>
          </div>

          {/* Acciones Principales: Botón Crear Tarea (Asignar a cualquiera o Abierta) + Botón Filtrar */}
          <div className="flex items-center justify-end gap-2 shrink-0 relative">
            <button
              type="button"
              onClick={onOpenNewTask}
              className="min-h-[42px] sm:min-h-0 flex-1 sm:flex-initial px-4 py-2 text-xs font-bold rounded-xl bg-[#0B2559] hover:bg-[#15397A] text-white border border-[#0B2559] transition-all flex items-center justify-center gap-2 whitespace-nowrap shadow-xs"
            >
              <i className="fi fi-rr-plus text-xs text-[#B3D9FF]" />
              <span>Crear Tarea</span>
            </button>

            <button
              type="button"
              onClick={() => setFilterMenuOpen(prev => !prev)}
              className={`min-h-[42px] sm:min-h-0 flex-1 sm:flex-initial px-4 py-2 text-xs font-bold rounded-xl border transition-all flex items-center justify-center gap-2 whitespace-nowrap shadow-2xs ${
                filterMenuOpen || activeFilterCount > 0
                  ? 'bg-[#0B2559] text-white border-[#0B2559]'
                  : 'bg-[#F4F9FF] text-[#0B2559] border-[#B3D9FF] hover:bg-[#EAF3FF]'
              }`}
            >
              <i className="fi fi-rr-filter text-xs" />
              <span>Filtrar</span>
              {activeFilterCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-mono rounded-full bg-[#B3D9FF] text-[#0B2559] font-bold">
                  {activeFilterCount}
                </span>
              )}
              <i
                className={`fi ${
                  filterMenuOpen ? 'fi-rr-angle-small-up' : 'fi-rr-angle-small-down'
                } text-sm`}
              />
            </button>

            {/* Menú Desplegable del Botón Tipo Filtro */}
            {filterMenuOpen && (
              <div className="absolute right-0 top-full mt-2 w-full sm:w-80 bg-white border border-[#B3D9FF] rounded-2xl shadow-xl p-4 z-30 space-y-4">
                <div className="flex items-center justify-between border-b border-[#EAF3FF] pb-2.5">
                  <span className="text-xs font-bold text-[#0B2559] flex items-center gap-1.5">
                    <i className="fi fi-rr-filter text-xs text-[#3B82F6]" />
                    Filtros de Lista de Chequeo
                  </span>
                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setQuickFilter('ninguno');
                        setSelectedPriorityTab('todas');
                        setStatusFilter('todos');
                        setShowCompleted(true);
                      }}
                      className="text-[11px] font-bold text-rose-600 hover:underline"
                    >
                      Restablecer
                    </button>
                  )}
                </div>

                {/* Resumen rápido de estado */}
                <div className="p-2.5 rounded-xl bg-[#F4F9FF] border border-[#B3D9FF]/60 space-y-2">
                  <div className="flex items-center justify-between text-[11px] text-[#0B2559] font-medium tabular-nums">
                    <span>Total: <strong>{totalScoped}</strong></span>
                    <span>Inic.: <strong>{startedCount}</strong></span>
                    <span className="text-amber-700">Proc.: <strong>{inProgressCount}</strong></span>
                    <span className="text-emerald-700">Hechas: <strong>{completedCount}</strong></span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-[#EAF3FF] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#0B2559] transition-all duration-300"
                        style={{ width: `${completionPercent}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-mono font-bold text-[#0B2559] tabular-nums">
                      {completionPercent}%
                    </span>
                  </div>
                </div>

                {/* Filtrar por Importancia */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#0B2559]/70">
                    Por Importancia
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelectedPriorityTab('todas')}
                      className={`col-span-2 px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-between transition-colors ${
                        selectedPriorityTab === 'todas'
                          ? 'bg-[#0B2559] text-white'
                          : 'bg-[#F4F9FF] text-[#0B2559] border border-[#B3D9FF] hover:bg-[#EAF3FF]'
                      }`}
                    >
                      <span>Todas las prioridades</span>
                      <span className="font-mono text-[11px] opacity-80">({scopedTasks.length})</span>
                    </button>
                    {SECTIONS.map(sec => {
                      const count = scopedTasks.filter(
                        t => t.priority === sec.key && (showCompleted || t.status !== 'completada')
                      ).length;
                      const isSelected = selectedPriorityTab === sec.key;
                      return (
                        <button
                          key={sec.key}
                          type="button"
                          onClick={() => setSelectedPriorityTab(sec.key)}
                          className={`px-2.5 py-2 rounded-xl text-xs font-bold flex items-center justify-between gap-1.5 transition-colors ${
                            isSelected
                              ? 'bg-[#0B2559] text-white'
                              : 'bg-[#F4F9FF] text-[#0B2559] border border-[#B3D9FF] hover:bg-[#EAF3FF]'
                          }`}
                        >
                          <span className="flex items-center gap-1.5 truncate">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${sec.dotColor}`} />
                            <span className="truncate">{sec.shortName}</span>
                          </span>
                          <span className="font-mono text-[11px] opacity-80">({count})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Filtrar por Estado */}
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-[#0B2559]/70">
                    Por Estado
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([
                      { id: 'todos', label: 'Todos' },
                      { id: 'pendiente', label: 'Iniciadas' },
                      { id: 'en_progreso', label: 'En proceso' },
                      { id: 'completada', label: 'Hechas' },
                    ] as const).map(st => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() => {
                          setStatusFilter(st.id);
                          if (st.id === 'completada') setShowCompleted(true);
                        }}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                          statusFilter === st.id
                            ? 'bg-[#0B2559] text-white'
                            : 'bg-[#F4F9FF] text-[#0B2559] border border-[#B3D9FF] hover:bg-[#EAF3FF]'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Ocultar/Ver hechas y Vista en PC/Tablet */}
                <div className="pt-2 border-t border-[#EAF3FF] flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCompleted(!showCompleted)}
                    className={`flex-1 px-3 py-2 text-xs font-bold rounded-xl border transition-colors ${
                      showCompleted
                        ? 'bg-[#EAF3FF] text-[#0B2559] border-[#B3D9FF]'
                        : 'bg-white text-slate-600 border-slate-200'
                    }`}
                  >
                    {showCompleted ? 'Ocultar hechas' : 'Ver hechas'}
                  </button>

                  {!isMobile && (
                    <button
                      type="button"
                      onClick={() =>
                        setDesktopGridLayout(prev => (prev === 'stack' ? 'grid' : 'stack'))
                      }
                      className="px-3 py-2 text-xs font-bold rounded-xl bg-[#F4F9FF] text-[#0B2559] border border-[#B3D9FF] hover:bg-[#EAF3FF] flex items-center gap-1.5"
                    >
                      <i
                        className={`fi ${
                          desktopGridLayout === 'grid' ? 'fi-rr-list' : 'fi-rr-apps'
                        } text-xs`}
                      />
                      <span>{desktopGridLayout === 'grid' ? 'Vista Lista' : '2 Columnas'}</span>
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setFilterMenuOpen(false)}
                  className="w-full py-2 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] hover:bg-[#99CCFF] rounded-xl transition-colors"
                >
                  Aplicar y Cerrar
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Barra de Filtros Rápidos: Mis tareas pendientes, Tareas completadas, Tareas con prioridad crítica */}
        <div className="pt-2.5 border-t border-[#EAF3FF] flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[#0B2559]/70 flex items-center gap-1.5 mr-1">
            <i className="fi fi-rr-bolt text-xs text-[#3B82F6]" />
            <span>Filtros rápidos:</span>
          </span>

          <button
            type="button"
            onClick={() => handleApplyQuickFilter('mis_pendientes')}
            className={`min-h-[36px] sm:min-h-0 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 ${
              quickFilter === 'mis_pendientes'
                ? 'bg-[#0B2559] text-white border-[#0B2559] shadow-xs'
                : 'bg-[#F4F9FF] text-[#0B2559] border-[#B3D9FF] hover:bg-[#EAF3FF]'
            }`}
          >
            <i className="fi fi-rr-time-fast text-xs shrink-0" />
            <span>Mis tareas pendientes</span>
            <span
              className={`px-1.5 py-0.5 text-[10px] font-mono rounded-md font-bold ${
                quickFilter === 'mis_pendientes'
                  ? 'bg-[#B3D9FF] text-[#0B2559]'
                  : 'bg-white text-[#0B2559] border border-[#B3D9FF]'
              }`}
            >
              {myPendingTasksCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleApplyQuickFilter('completadas')}
            className={`min-h-[36px] sm:min-h-0 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 ${
              quickFilter === 'completadas'
                ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                : 'bg-emerald-50/70 text-emerald-800 border-emerald-200 hover:bg-emerald-100/70'
            }`}
          >
            <i className="fi fi-rr-check-circle text-xs shrink-0" />
            <span>Tareas completadas</span>
            <span
              className={`px-1.5 py-0.5 text-[10px] font-mono rounded-md font-bold ${
                quickFilter === 'completadas'
                  ? 'bg-white text-emerald-800'
                  : 'bg-white text-emerald-800 border border-emerald-200'
              }`}
            >
              {completedTasksCount}
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleApplyQuickFilter('criticas')}
            className={`min-h-[36px] sm:min-h-0 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-2 ${
              quickFilter === 'criticas'
                ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                : 'bg-rose-50/80 text-rose-700 border-rose-200 hover:bg-rose-100/70'
            }`}
          >
            <i className="fi fi-rr-flame text-xs shrink-0" />
            <span>Tareas con prioridad crítica</span>
            <span
              className={`px-1.5 py-0.5 text-[10px] font-mono rounded-md font-bold ${
                quickFilter === 'criticas'
                  ? 'bg-white text-rose-700'
                  : 'bg-white text-rose-700 border border-rose-200'
              }`}
            >
              {criticalTasksCount}
            </span>
          </button>

          {quickFilter !== 'ninguno' && (
            <button
              type="button"
              onClick={() => handleApplyQuickFilter('ninguno')}
              className="min-h-[36px] sm:min-h-0 px-2.5 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 transition-colors flex items-center gap-1 ml-auto"
            >
              <i className="fi fi-rr-cross-small text-sm" />
              <span>Ver todas</span>
            </button>
          )}
        </div>
      </div>

      {/* Secciones de la Lista Ordenadas por Importancia */}
      <div
        className={
          !isMobile && desktopGridLayout === 'grid' && visibleSections.length > 1
            ? 'grid grid-cols-1 lg:grid-cols-2 gap-4 items-start'
            : 'space-y-3.5'
        }
      >
        {visibleSections.map(sec => {
          const allSectionTasks = scopedTasks.filter(t => t.priority === sec.key);
          const activeTasks = allSectionTasks.filter(t => t.status !== 'completada');
          const doneTasks = allSectionTasks.filter(t => t.status === 'completada');
          const baseTasks = showCompleted ? [...activeTasks, ...doneTasks] : activeTasks;
          const displayTasks =
            statusFilter === 'todos'
              ? baseTasks
              : baseTasks.filter(t => t.status === statusFilter);

          return (
            <div
              key={sec.key}
              className={`bg-white border ${sec.borderColor} rounded-2xl overflow-hidden shadow-2xs`}
            >
              {/* Encabezado limpio de la sección */}
              <div
                className={`${sec.accentBg} px-4 py-2.5 border-b ${sec.borderColor} flex items-center justify-between gap-3`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${sec.dotColor}`} />
                  <span className="text-xs font-bold text-[#0B2559] truncate">
                    {sec.name}
                  </span>
                  <span className="text-[11px] text-[#0B2559]/70 font-medium tabular-nums whitespace-nowrap">
                    · {activeTasks.length} pend.{doneTasks.length > 0 ? ` / ${doneTasks.length} hechas` : ''}
                  </span>
                </div>
              </div>

              {/* Items de la lista ordenados */}
              <div className="divide-y divide-[#F4F9FF]">
                {displayTasks.length === 0 ? (
                  <div className="py-4 px-4 text-center text-xs text-slate-400">
                    {allSectionTasks.length === 0
                      ? 'Sin tareas en esta categoría.'
                      : '¡Todas las tareas de esta categoría están hechas!'}
                  </div>
                ) : (
                  displayTasks.map(task => {
                    const isDone = task.status === 'completada';
                    const isInProgress = task.status === 'en_progreso';
                    const isStarted = task.status === 'pendiente';

                    return (
                      <div
                        key={task.id}
                        className={`px-3.5 sm:px-4 py-3 sm:py-2.5 transition-colors group ${
                          isDone ? 'bg-slate-50/70' : 'hover:bg-[#F4F9FF]'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                          {/* Casilla de verificación táctil y Nombre (Clic para ver detalles) */}
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => handleToggleCheck(task)}
                              className={`w-6 h-6 sm:w-5 sm:h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                isDone
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'bg-white border-[#B3D9FF] hover:border-[#0B2559] text-transparent'
                              }`}
                              title={isDone ? 'Marcar como iniciada' : 'Marcar como hecha'}
                            >
                              <i className="fi fi-rr-check text-[10px] font-bold" />
                            </button>

                            <div
                              onClick={() => setViewingTask(task)}
                              className="min-w-0 flex-1 cursor-pointer select-none"
                              title="Haz clic para ver los detalles de la tarea"
                            >
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`text-xs sm:text-xs truncate transition-all ${
                                    isDone
                                      ? 'line-through text-slate-400 font-normal'
                                      : isInProgress
                                      ? 'text-[#0B2559] font-bold'
                                      : 'text-[#0B2559] font-semibold'
                                  }`}
                                >
                                  {task.title}
                                </span>
                                {task.assignedToCedula === 'ABIERTA' ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                                    <span>🌐 Abierta (Cualquiera)</span>
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[#F4F9FF] text-[#0B2559] border border-[#B3D9FF] whitespace-nowrap">
                                    <i className="fi fi-rr-user text-[9px] text-[#3B82F6]" />
                                    <span className="truncate max-w-[140px]">{task.assignedToName}</span>
                                  </span>
                                )}
                              </div>

                              {/* En PC y Tablet se muestra información adicional en línea; en Teléfono se oculta para que se vea más sencilla */}
                              {!isMobile && (
                                <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#3B82F6] mt-0.5 tabular-nums">
                                  <span>
                                    {task.assignedToCedula === 'ABIERTA'
                                      ? 'Encargado: Abierta (Cualquiera puede realizarla)'
                                      : `Encargado: ${task.assignedToName}`}
                                  </span>
                                  {task.dueDate && (
                                    <>
                                      <span>·</span>
                                      <span>Vence: {task.dueDate.split('T')[0]}</span>
                                    </>
                                  )}
                                  {(task.accessEmail || task.directLink) && (
                                    <>
                                      <span>·</span>
                                      <span className="text-[#0B2559] font-medium">
                                        Incluye credenciales/link
                                      </span>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Botones de Estado Cliqueables: Iniciada, En proceso, Hecha + Ver + Eliminar */}
                          <div className="flex items-center justify-between sm:justify-end gap-1.5 shrink-0 pl-9 sm:pl-0">
                            <div className="inline-flex items-center p-0.5 rounded-lg bg-[#F4F9FF] border border-[#B3D9FF]/70">
                              <button
                                type="button"
                                onClick={() => handleSetStatus(task, 'pendiente')}
                                className={`px-2.5 py-1 sm:px-2 sm:py-0.5 text-[11px] font-bold rounded-md transition-all whitespace-nowrap ${
                                  isStarted
                                    ? 'bg-[#0B2559] text-white shadow-2xs'
                                    : 'text-[#0B2559]/70 hover:text-[#0B2559]'
                                }`}
                                title="Marcar como Iniciada"
                              >
                                Iniciada
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSetStatus(task, 'en_progreso')}
                                className={`px-2.5 py-1 sm:px-2 sm:py-0.5 text-[11px] font-bold rounded-md transition-all whitespace-nowrap ${
                                  isInProgress
                                    ? 'bg-amber-500 text-white shadow-2xs'
                                    : 'text-amber-800/80 hover:text-amber-900'
                                }`}
                                title="Marcar como En proceso"
                              >
                                En proceso
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSetStatus(task, 'completada')}
                                className={`px-2.5 py-1 sm:px-2 sm:py-0.5 text-[11px] font-bold rounded-md transition-all whitespace-nowrap ${
                                  isDone
                                    ? 'bg-emerald-600 text-white shadow-2xs'
                                    : 'text-emerald-700/80 hover:text-emerald-800'
                                }`}
                                title="Marcar como Hecha"
                              >
                                ✓ Hecha
                              </button>
                            </div>

                            <div className="flex items-center gap-1">
                              {/* Botón Ver Detalles */}
                              <button
                                type="button"
                                onClick={() => setViewingTask(task)}
                                className="min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 p-1.5 text-slate-500 hover:text-[#0B2559] hover:bg-[#EAF3FF] rounded-lg transition-colors flex items-center justify-center"
                                title="Ver detalles de la tarea"
                              >
                                <i className="fi fi-rr-eye text-xs" />
                              </button>

                              {/* Botón Eliminar (si tiene permisos) */}
                              {(currentUser.canDeleteTasks || currentUser.role === 'admin') && (
                                <button
                                  type="button"
                                  onClick={() => handleDelete(task)}
                                  className="min-w-[36px] min-h-[36px] sm:min-w-0 sm:min-h-0 p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors flex items-center justify-center"
                                  title="Eliminar tarea"
                                >
                                  <i className="fi fi-rr-trash text-xs" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL DE DETALLE DE LA TAREA */}
      {viewingTask && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-[#0B2559]/50 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-2xl shadow-xl border border-[#B3D9FF] overflow-hidden max-h-[90vh] flex flex-col">
            {/* Barra de arrastre visual para Teléfono */}
            <div className="sm:hidden pt-2.5 pb-1 bg-[#F4F9FF] flex justify-center">
              <div className="w-10 h-1.5 rounded-full bg-[#B3D9FF]" />
            </div>

            {/* Cabecera del Visor */}
            <div className="px-5 py-3.5 sm:py-4 bg-[#F4F9FF] border-b border-[#D6EAFF] flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-[#0B2559] text-white flex items-center justify-center">
                  <i className="fi fi-rr-eye text-xs" />
                </span>
                <div>
                  <h3 className="text-sm font-bold text-[#0B2559]">Detalle de la Actividad</h3>
                  <p className="text-[10px] text-[#3B82F6]">Consulta de tarea y asignación de encargado</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingTask(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-[#0B2559] hover:bg-[#EAF3FF] transition-colors"
              >
                <i className="fi fi-rr-cross-small text-base" />
              </button>
            </div>

            {/* Contenido */}
            <div className="p-5 space-y-4 text-xs overflow-y-auto">
              {/* Título */}
              <div>
                <label className="block text-[11px] font-bold text-[#3B82F6] uppercase tracking-wider mb-1">
                  Nombre de la Tarea
                </label>
                <div className="p-3 rounded-xl bg-[#F4F9FF] border border-[#B3D9FF] font-bold text-[#0B2559] text-sm">
                  {viewingTask.title}
                </div>
              </div>

              {/* Botones de Cambio Rápido de Estado */}
              <div>
                <label className="block text-[11px] font-bold text-[#3B82F6] uppercase tracking-wider mb-1.5">
                  Estado de la Actividad (Haz clic para cambiar)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSetStatus(viewingTask, 'pendiente')}
                    className={`min-h-[42px] py-2 px-3 rounded-xl font-bold border flex items-center justify-center gap-1.5 transition-all ${
                      viewingTask.status === 'pendiente'
                        ? 'bg-[#0B2559] text-white border-[#0B2559] shadow-xs'
                        : 'bg-white text-[#0B2559] border-[#B3D9FF] hover:bg-[#F4F9FF]'
                    }`}
                  >
                    <span>Iniciada</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetStatus(viewingTask, 'en_progreso')}
                    className={`min-h-[42px] py-2 px-3 rounded-xl font-bold border flex items-center justify-center gap-1.5 transition-all ${
                      viewingTask.status === 'en_progreso'
                        ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                        : 'bg-white text-amber-900 border-amber-200 hover:bg-amber-50'
                    }`}
                  >
                    <span>En proceso</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSetStatus(viewingTask, 'completada')}
                    className={`min-h-[42px] py-2 px-3 rounded-xl font-bold border flex items-center justify-center gap-1.5 transition-all ${
                      viewingTask.status === 'completada'
                        ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                        : 'bg-white text-emerald-800 border-emerald-200 hover:bg-emerald-50'
                    }`}
                  >
                    <span>✓ Hecha</span>
                  </button>
                </div>
              </div>

              {/* Selector de Encargado o Tarea Abierta */}
              <div className="p-3.5 rounded-xl bg-[#F4F9FF] border border-[#B3D9FF] space-y-2">
                <label className="block text-[11px] font-bold text-[#0B2559] uppercase tracking-wider">
                  Encargado de la Tarea (Asignar a cualquiera o dejar Abierta)
                </label>
                <select
                  value={viewingTask.assignedToCedula || 'ABIERTA'}
                  onChange={e => handleChangeTaskAssignee(viewingTask, e.target.value)}
                  className="w-full px-3 py-2 text-xs font-bold text-[#0B2559] bg-white border border-[#B3D9FF] rounded-xl focus:outline-none focus:border-[#0B2559]"
                >
                  <option value="ABIERTA">
                    🌐 ABIERTA — Cualquiera puede realizarla
                  </option>
                  <option value={currentUser.cedula}>
                    👤 Asignarme a mí: {currentUser.name} (C.C. {currentUser.cedula})
                  </option>
                  {users
                    .filter(u => u.cedula !== currentUser.cedula)
                    .map(u => (
                      <option key={u.cedula} value={u.cedula}>
                        👥 {u.name} (C.C. {u.cedula})
                      </option>
                    ))}
                </select>
              </div>

              {/* Datos de la Tarea (Prioridad, Fechas, Responsable) */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200 tabular-nums">
                <div>
                  <span className="text-slate-500">Nivel de Importancia:</span>
                  <div className="font-bold text-[#0B2559] capitalize mt-0.5">
                    {viewingTask.priority}
                  </div>
                </div>

                <div>
                  <span className="text-slate-500">Fecha Límite:</span>
                  <div className="font-bold text-[#0B2559] mt-0.5">
                    {viewingTask.dueDate ? viewingTask.dueDate.split('T')[0] : 'Sin fecha'}
                  </div>
                </div>

                <div>
                  <span className="text-slate-500">Encargado Actual:</span>
                  <div className="font-bold text-[#0B2559] mt-0.5">
                    {viewingTask.assignedToCedula === 'ABIERTA'
                      ? '🌐 Abierta (Cualquiera)'
                      : viewingTask.assignedToName || 'No asignado'}
                  </div>
                </div>

                <div>
                  <span className="text-slate-500">Creado Por:</span>
                  <div className="font-bold text-[#0B2559] mt-0.5">
                    {viewingTask.createdByName || 'Sistema'}
                  </div>
                </div>
              </div>

              {/* Descripción o Notas (si existen) */}
              {(viewingTask.description || viewingTask.notes) && (
                <div className="space-y-2">
                  {viewingTask.description && (
                    <div>
                      <label className="block text-[11px] font-bold text-[#3B82F6] uppercase tracking-wider mb-1">
                        Descripción
                      </label>
                      <div className="p-3 rounded-xl bg-[#F4F9FF] border border-[#B3D9FF] text-[#0B2559] whitespace-pre-wrap">
                        {viewingTask.description}
                      </div>
                    </div>
                  )}
                  {viewingTask.notes && (
                    <div>
                      <label className="block text-[11px] font-bold text-[#3B82F6] uppercase tracking-wider mb-1">
                        Notas y Observaciones
                      </label>
                      <div className="p-3 rounded-xl bg-[#F4F9FF] border border-[#B3D9FF] text-[#0B2559] whitespace-pre-wrap">
                        {viewingTask.notes}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Credenciales y Link Directo (si existen) */}
              {(viewingTask.accessEmail || viewingTask.accessPassword || viewingTask.directLink) && (
                <div className="p-3.5 rounded-xl bg-[#F4F9FF] border border-[#B3D9FF] space-y-2">
                  <div className="text-[11px] font-bold text-[#0B2559] uppercase tracking-wider">
                    Credenciales y Enlace Directo
                  </div>
                  {viewingTask.accessEmail && (
                    <div className="font-mono text-xs text-[#0B2559]">
                      Usuario / Correo: <strong>{viewingTask.accessEmail}</strong>
                    </div>
                  )}
                  {viewingTask.accessPassword && (currentUser.role === 'admin' || currentUser.canViewVault) && (
                    <div className="font-mono text-xs text-[#0B2559]">
                      Contraseña: <strong>{viewingTask.accessPassword}</strong>
                    </div>
                  )}
                  {viewingTask.directLink && (
                    <a
                      href={viewingTask.directLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0B2559] text-white font-bold text-xs hover:bg-[#15397A] transition-colors"
                    >
                      <span>Abrir Link Directo</span>
                      <i className="fi fi-rr-arrow-up-right-from-square text-[10px]" />
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* Pie del Visor */}
            <div className="px-5 py-3 bg-[#F4F9FF] border-t border-[#D6EAFF] flex items-center justify-between gap-2">
              {(currentUser.canDeleteTasks || currentUser.role === 'admin') ? (
                <button
                  type="button"
                  onClick={() => handleDelete(viewingTask)}
                  className="min-h-[40px] px-3 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl flex items-center gap-1.5 transition-colors"
                >
                  <i className="fi fi-rr-trash text-xs" />
                  <span>Eliminar Tarea</span>
                </button>
              ) : (
                <div />
              )}
              <button
                type="button"
                onClick={() => setViewingTask(null)}
                className="min-h-[40px] px-5 py-2 text-xs font-bold text-white bg-[#0B2559] hover:bg-[#15397A] rounded-xl transition-colors"
              >
                Cerrar Vista
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
