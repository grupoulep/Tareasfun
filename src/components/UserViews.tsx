import React, { useState, useEffect } from 'react';
import { AppUser, TaskItem, TaskPriority, TaskStatus, CalendarEvent } from '../types';
import {
  saveTaskToFirestore,
  deleteTaskFromFirestore,
  saveCalendarEventToFirestore,
  deleteCalendarEventFromFirestore,
  saveUserToFirestore,
  hydrateCalendarEvent,
  recordAuditLog,
  cleanId
} from '../firebase';
import { SINGLE_ADMIN_CEDULA } from '../constants';

const EVENT_EMOJI_OPTIONS = [
  '📅', '🎉', '📌', '🤝', '🚀', '📊', '🏆', '💡', '🔔', '⭐',
  '📝', '💻', '📞', '🎯', '✅', '🎂', '📣', '🏥', '📚', '⚡',
];

const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

interface UserViewsProps {
  activeSection?: string;
  currentUser: AppUser;
  users?: AppUser[];
  tasks: TaskItem[];
  calendarEvents?: CalendarEvent[];
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

interface CircularProgressRingProps {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  colorClass?: string;
  trackClass?: string;
  labelSizeClass?: string;
  labelColorClass?: string;
  sublabel?: string;
}

const CircularProgressRing: React.FC<CircularProgressRingProps> = ({
  percentage,
  size = 68,
  strokeWidth = 6,
  colorClass = 'text-[#0B2559]',
  trackClass = 'text-[#D6EAFF]',
  labelSizeClass = 'text-xs',
  labelColorClass = 'text-[#0B2559]',
  sublabel,
}) => {
  const safePct = Math.max(0, Math.min(100, Math.round(percentage)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (safePct / 100) * circumference;

  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
    >
      <svg className="w-full h-full -rotate-90" viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className={trackClass}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="transparent"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          className={`${colorClass} transition-all duration-500 ease-out`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
        <span className={`font-mono font-bold tabular-nums ${labelColorClass} ${labelSizeClass}`}>
          {safePct}%
        </span>
        {sublabel && (
          <span className="text-[9px] font-semibold text-[#3B82F6] mt-0.5 tabular-nums">
            {sublabel}
          </span>
        )}
      </div>
    </div>
  );
};

export const UserViews: React.FC<UserViewsProps> = ({
  activeSection = 'user_personal',
  currentUser,
  users = [],
  tasks,
  calendarEvents = [],
  onOpenNewTask,
  deviceMode = 'pc',
}) => {
  const isMobile = deviceMode === 'mobile';

  // Estados para la sección Eventos (Calendario del mes actual)
  const [calendarDate, setCalendarDate] = useState<Date>(() => new Date());
  const [isAddEventModalOpen, setIsAddEventModalOpen] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDate, setEventDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [eventStartTime, setEventStartTime] = useState('08:00');
  const [eventEndTime, setEventEndTime] = useState('09:00');
  const [eventEmoji, setEventEmoji] = useState('📅');
  const [eventFormError, setEventFormError] = useState<string | null>(null);
  const [showAdminEventPermsPanel, setShowAdminEventPermsPanel] = useState(false);

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
  const [viewingAssignees, setViewingAssignees] = useState<string[]>([]);

  useEffect(() => {
    if (viewingTask) {
      setViewingAssignees([viewingTask.assignedToCedula || 'ABIERTA']);
    }
  }, [viewingTask?.id]);

  // Ocultar o mostrar hechas
  const [showCompleted, setShowCompleted] = useState(true);

  // Botón corredizo: Tareas Personales vs Tareas del Grupo Empresarial
  const [taskScope, setTaskScope] = useState<'personales' | 'grupo'>('personales');

  const isTaskVisibleInPersonal = (t: TaskItem) =>
    t.assignedToCedula === currentUser.cedula ||
    t.createdByCedula === currentUser.cedula ||
    t.assignedToCedula === 'ABIERTA';

  // Tareas base según la sección activa (Sección Personal del usuario que ingresó vs Tareas del Grupo)
  const sectionTasks = tasks.filter(t =>
    taskScope === 'personales' ? isTaskVisibleInPersonal(t) : true
  );

  // Contadores y porcentaje único de la sección activa para el usuario que ingresó
  const totalSectionTasks = sectionTasks.length;
  const sectionCompletedCount = sectionTasks.filter(t => t.status === 'completada').length;
  const sectionInProgressCount = sectionTasks.filter(t => t.status === 'en_progreso').length;
  const sectionStartedCount = sectionTasks.filter(t => t.status === 'pendiente').length;
  const sectionPendingTotalCount = sectionStartedCount + sectionInProgressCount;

  const sectionProgressPercent =
    totalSectionTasks > 0
      ? Math.round(
          sectionTasks.reduce((acc, t) => {
            if (t.status === 'completada') return acc + 100;
            if (t.status === 'en_progreso')
              return acc + (typeof t.progress === 'number' && t.progress > 0 ? t.progress : 50);
            return acc + (typeof t.progress === 'number' ? t.progress : 0);
          }, 0) / totalSectionTasks
        )
      : 0;

  // Contadores para los filtros rápidos
  const myPendingTasksCount = tasks.filter(
    t => isTaskVisibleInPersonal(t) && t.status !== 'completada'
  ).length;
  const completedTasksCount = sectionCompletedCount;
  const criticalTasksCount = sectionTasks.filter(t => t.priority === 'critica').length;

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
  const completionPercent = sectionProgressPercent;

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

  // Cambiar encargado(s) de una tarea existente (1 o varios usuarios -> tareas separadas)
  const handleApplyViewingAssignees = async (task: TaskItem, selectedCedulas: string[]) => {
    const effective =
      selectedCedulas.length > 0 ? selectedCedulas : [task.assignedToCedula || 'ABIERTA'];

    const ordered = effective.includes(task.assignedToCedula)
      ? [
          task.assignedToCedula,
          ...effective.filter(c => c !== task.assignedToCedula),
        ]
      : effective;

    for (let i = 0; i < ordered.length; i++) {
      const targetCedula = ordered[i];
      const isOpen = targetCedula === 'ABIERTA';
      const targetUser = isOpen ? null : users.find(u => u.cedula === targetCedula) || currentUser;
      const assignedCed = isOpen ? 'ABIERTA' : targetUser!.cedula;
      const assignedName = isOpen
        ? 'Abierta (Cualquiera puede realizarla)'
        : targetUser!.name;

      if (i === 0) {
        if (assignedCed !== task.assignedToCedula) {
          const updated: TaskItem = {
            ...task,
            assignedToCedula: assignedCed,
            assignedToName: assignedName,
          };
          await saveTaskToFirestore(updated);
          setViewingTask(updated);
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
        }
      } else {
        const separateTask: TaskItem = {
          ...task,
          id: cleanId(`chk_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`),
          assignedToCedula: assignedCed,
          assignedToName: assignedName,
        };
        await saveTaskToFirestore(separateTask);
        await recordAuditLog({
          actorCedula: currentUser.cedula,
          actorName: currentUser.name,
          actorRole: currentUser.role,
          actionType: 'ASIGNAR_ENCARGADO_TAREA',
          module: 'LISTA_CHEQUEO',
          description: `Asignó la tarea "${task.title}" a: ${separateTask.assignedToName}.`,
          targetId: separateTask.id,
          severity: 'info',
        });
      }
    }

    setViewingAssignees([ordered[0]]);
  };

  const toggleViewingAssignee = (targetCedula: string) => {
    if (targetCedula === 'ABIERTA') {
      setViewingAssignees(['ABIERTA']);
      return;
    }
    setViewingAssignees(prev => {
      const withoutOpen = prev.filter(c => c !== 'ABIERTA');
      if (withoutOpen.includes(targetCedula)) {
        return withoutOpen.filter(c => c !== targetCedula);
      }
      return [...withoutOpen, targetCedula];
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

  const canUserAddEvents =
    currentUser.role === 'admin' ||
    currentUser.cedula === SINGLE_ADMIN_CEDULA ||
    Boolean(currentUser.canCreateEvents);

  const openAddEventForDate = (isoDate?: string) => {
    if (!canUserAddEvents) return;
    const defaultDate = isoDate || new Date().toISOString().split('T')[0];
    setEventTitle('');
    setEventDate(defaultDate);
    setEventStartTime('08:00');
    setEventEndTime('09:00');
    setEventEmoji('📅');
    setEventFormError(null);
    setIsAddEventModalOpen(true);
  };

  const handleCreateCalendarEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUserAddEvents) return;
    if (!eventTitle.trim()) {
      setEventFormError('Ingresa el nombre del evento.');
      return;
    }
    if (!eventDate) {
      setEventFormError('Selecciona la fecha del evento.');
      return;
    }
    if (!eventStartTime || !eventEndTime) {
      setEventFormError('Ingresa la hora de inicio y la hora final.');
      return;
    }

    const newEv: CalendarEvent = {
      id: cleanId(`ev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
      title: eventTitle.trim(),
      date: eventDate,
      time: `${eventStartTime} - ${eventEndTime}`,
      startTime: eventStartTime,
      endTime: eventEndTime,
      emoji: eventEmoji.trim() || '📅',
      type: 'actividad',
      description: eventEmoji.trim() || '📅',
      createdByCedula: currentUser.cedula,
      createdByName: currentUser.name,
      linkedTaskId: '',
    };

    await saveCalendarEventToFirestore(newEv);
    await recordAuditLog({
      actorCedula: currentUser.cedula,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionType: 'CREAR_EVENTO_CALENDARIO',
      module: 'EVENTOS_CALENDARIO',
      description: `Agregó el evento ${newEv.emoji} "${newEv.title}" para el ${newEv.date} (${newEv.startTime} - ${newEv.endTime}).`,
      targetId: newEv.id,
      severity: 'info',
    });

    setIsAddEventModalOpen(false);
    setEventTitle('');
  };

  const handleDeleteCalendarEvent = async (ev: CalendarEvent) => {
    if (
      currentUser.role !== 'admin' &&
      currentUser.cedula !== SINGLE_ADMIN_CEDULA &&
      ev.createdByCedula !== currentUser.cedula
    ) {
      return;
    }
    await deleteCalendarEventFromFirestore(ev.id);
    await recordAuditLog({
      actorCedula: currentUser.cedula,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionType: 'ELIMINAR_EVENTO_CALENDARIO',
      module: 'EVENTOS_CALENDARIO',
      description: `Eliminó el evento "${ev.title}" del ${ev.date}.`,
      targetId: ev.id,
      severity: 'warning',
    });
  };

  const handleToggleUserEventPermInCalendar = async (targetUser: AppUser) => {
    if (currentUser.role !== 'admin' && currentUser.cedula !== SINGLE_ADMIN_CEDULA) return;
    if (targetUser.cedula === SINGLE_ADMIN_CEDULA) return;
    const nextVal = !targetUser.canCreateEvents;
    await saveUserToFirestore({
      ...targetUser,
      canCreateEvents: nextVal,
    });
    await recordAuditLog({
      actorCedula: currentUser.cedula,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionType: nextVal ? 'ACTIVAR_AGREGAR_EVENTO' : 'DESACTIVAR_AGREGAR_EVENTO',
      module: 'EVENTOS_CALENDARIO',
      description: `${nextVal ? 'Activó' : 'Desactivó'} la función de Agregar Evento para ${targetUser.name} (C.C. ${targetUser.cedula}).`,
      targetId: targetUser.cedula,
      severity: 'info',
    });
  };

  if (activeSection === 'user_calendar') {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
    const todayIso = new Date().toISOString().split('T')[0];

    const firstDayOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Lunes = 0 ... Domingo = 6
    const startWeekday = (firstDayOfMonth.getDay() + 6) % 7;

    const validEvents = calendarEvents
      .filter(
        ev =>
          ev.id !== 'config_event_permissions' &&
          ev.date !== 'CONFIG_PERMS' &&
          !ev.id.startsWith('ev_sync_')
      )
      .map(hydrateCalendarEvent);

    const monthEvents = validEvents
      .filter(ev => ev.date.startsWith(monthPrefix))
      .sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.startTime || a.time).localeCompare(b.startTime || b.time);
      });

    const calendarCells: { day: number | null; isoDate: string }[] = [];
    for (let i = 0; i < startWeekday; i++) {
      calendarCells.push({ day: null, isoDate: `empty-start-${i}` });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${monthPrefix}-${String(d).padStart(2, '0')}`;
      calendarCells.push({ day: d, isoDate: iso });
    }

    return (
      <div className={`space-y-4 mx-auto pb-20 ${isMobile ? 'max-w-lg' : 'max-w-6xl'}`}>
        {/* Cabecera del Calendario de Eventos del Mes */}
        <div className="bg-white border border-[#B3D9FF] rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-[#0B2559] text-white flex items-center justify-center shrink-0 shadow-xs">
                <i className="fi fi-rr-calendar text-base text-[#B3D9FF]" />
              </span>
              <div>
                <h2 className="text-base sm:text-lg font-extrabold text-[#0B2559] flex items-center gap-2">
                  <span>Eventos · {MONTH_NAMES_ES[month]} {year}</span>
                  <span className="text-xs font-mono px-2 py-0.5 rounded-lg bg-[#EAF3FF] text-[#0B2559] border border-[#B3D9FF]">
                    {monthEvents.length} en este mes
                  </span>
                </h2>
                <p className="text-xs text-[#3B82F6]">
                  Calendario mensual de actividades y eventos programados
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setCalendarDate(new Date(year, month - 1, 1))}
                  className="px-2.5 py-1.5 text-xs font-bold text-[#0B2559] hover:bg-[#B3D9FF]/50 rounded-lg transition-colors"
                  title="Mes anterior"
                >
                  <i className="fi fi-rr-angle-left text-xs" />
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarDate(new Date())}
                  className="px-3 py-1.5 text-xs font-bold text-[#0B2559] hover:bg-[#B3D9FF]/50 rounded-lg transition-colors"
                >
                  Mes Actual
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarDate(new Date(year, month + 1, 1))}
                  className="px-2.5 py-1.5 text-xs font-bold text-[#0B2559] hover:bg-[#B3D9FF]/50 rounded-lg transition-colors"
                  title="Mes siguiente"
                >
                  <i className="fi fi-rr-angle-right text-xs" />
                </button>
              </div>

              {(currentUser.role === 'admin' || currentUser.cedula === SINGLE_ADMIN_CEDULA) && (
                <button
                  type="button"
                  onClick={() => setShowAdminEventPermsPanel(prev => !prev)}
                  className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-bold text-[#0B2559] bg-[#EAF3FF] hover:bg-[#B3D9FF] border border-[#B3D9FF] flex items-center gap-1.5 transition-colors"
                >
                  <i className="fi fi-rr-user-gear text-xs" />
                  <span>Permisos Usuarios</span>
                </button>
              )}

              {canUserAddEvents && (
                <button
                  type="button"
                  onClick={() => openAddEventForDate()}
                  className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold text-white bg-[#0B2559] hover:bg-[#15397A] flex items-center gap-2 transition-colors shadow-xs"
                >
                  <i className="fi fi-rr-calendar-plus text-xs text-[#B3D9FF]" />
                  <span>+ Agregar Evento</span>
                </button>
              )}
            </div>
          </div>

          {/* Panel rápido exclusivo para Admin para activar/desactivar Agregar Evento a cada usuario */}
          {(currentUser.role === 'admin' || currentUser.cedula === SINGLE_ADMIN_CEDULA) &&
            showAdminEventPermsPanel && (
              <div className="pt-3 border-t border-[#D6EAFF] space-y-2">
                <div className="text-xs font-bold text-[#0B2559] flex items-center justify-between">
                  <span>Activar función "Agregar Evento" por usuario:</span>
                  <span className="text-[11px] text-[#3B82F6] font-normal">
                    Haz clic en un usuario para habilitar o deshabilitar el botón de agregar evento
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {users
                    .filter(u => u.cedula !== SINGLE_ADMIN_CEDULA)
                    .map(u => {
                      const active = Boolean(u.canCreateEvents);
                      return (
                        <button
                          key={u.cedula}
                          type="button"
                          onClick={() => handleToggleUserEventPermInCalendar(u)}
                          className={`p-2.5 rounded-xl border text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                            active
                              ? 'bg-emerald-50 border-emerald-300 text-[#0B2559]'
                              : 'bg-[#F4F9FF] border-[#B3D9FF] text-[#0B2559]/80'
                          }`}
                        >
                          <div className="truncate">
                            <div className="font-bold truncate">{u.name}</div>
                            <div className="text-[10px] font-mono text-[#3B82F6]">C.C. {u.cedula}</div>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                              active ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {active ? 'Activo' : 'Inactivo'}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            )}
        </div>

        {/* Cuadrícula del Calendario del Mes */}
        <div className="bg-white border border-[#B3D9FF] rounded-2xl overflow-hidden shadow-2xs">
          <div className="grid grid-cols-7 bg-[#0B2559] text-white text-center py-2.5 text-[11px] font-bold uppercase tracking-wider">
            <div>Lun</div>
            <div>Mar</div>
            <div>Mié</div>
            <div>Jue</div>
            <div>Vie</div>
            <div>Sáb</div>
            <div>Dom</div>
          </div>

          <div className="grid grid-cols-7 divide-x divide-y divide-[#D6EAFF] border-t border-[#D6EAFF]">
            {calendarCells.map(cell => {
              if (cell.day === null) {
                return (
                  <div
                    key={cell.isoDate}
                    className="min-h-[84px] sm:min-h-[112px] bg-[#F4F9FF]/50 p-1.5"
                  />
                );
              }

              const dayEvents = monthEvents.filter(ev => ev.date === cell.isoDate);
              const isToday = cell.isoDate === todayIso;

              return (
                <div
                  key={cell.isoDate}
                  onClick={() => {
                    if (canUserAddEvents) {
                      openAddEventForDate(cell.isoDate);
                    }
                  }}
                  className={`min-h-[84px] sm:min-h-[112px] p-1.5 sm:p-2 flex flex-col justify-between transition-colors ${
                    isToday ? 'bg-[#EAF3FF]/70' : 'bg-white hover:bg-[#F4F9FF]'
                  } ${canUserAddEvents ? 'cursor-pointer' : ''}`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center ${
                        isToday
                          ? 'bg-[#0B2559] text-white'
                          : 'text-[#0B2559]'
                      }`}
                    >
                      {cell.day}
                    </span>
                    {dayEvents.length > 0 && (
                      <span className="text-[10px] font-mono font-bold text-[#3B82F6]">
                        {dayEvents.length}
                      </span>
                    )}
                  </div>

                  <div className="mt-1 space-y-1 overflow-y-auto max-h-20">
                    {dayEvents.map(ev => (
                      <div
                        key={ev.id}
                        onClick={e => e.stopPropagation()}
                        className="px-1.5 py-1 rounded-lg bg-[#EAF3FF] border border-[#B3D9FF] text-[#0B2559] text-[10px] leading-tight"
                        title={`${ev.emoji || '📅'} ${ev.title} (${ev.startTime} - ${ev.endTime})`}
                      >
                        <div className="font-bold truncate flex items-center gap-1">
                          <span>{ev.emoji || '📅'}</span>
                          <span className="truncate">{ev.title}</span>
                        </div>
                        <div className="font-mono text-[9px] text-[#3B82F6] truncate">
                          {ev.startTime} - {ev.endTime}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Lista detallada de Eventos del Mes Actual */}
        <div className="bg-white border border-[#B3D9FF] rounded-2xl p-4 sm:p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between border-b border-[#D6EAFF] pb-2.5">
            <h3 className="text-sm font-bold text-[#0B2559] flex items-center gap-2">
              <i className="fi fi-rr-calendar-check text-xs text-[#3B82F6]" />
              <span>Eventos de {MONTH_NAMES_ES[month]} {year} ({monthEvents.length})</span>
            </h3>
            {canUserAddEvents && (
              <button
                type="button"
                onClick={() => openAddEventForDate()}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-[#0B2559] bg-[#B3D9FF] hover:bg-[#99CCFF] transition-colors flex items-center gap-1.5"
              >
                <i className="fi fi-rr-plus text-[10px]" />
                <span>Agregar Evento</span>
              </button>
            )}
          </div>

          {monthEvents.length === 0 ? (
            <div className="py-8 text-center text-xs text-[#3B82F6] bg-[#F4F9FF] rounded-xl border border-[#D6EAFF]">
              No hay eventos registrados en {MONTH_NAMES_ES[month]} {year}.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {monthEvents.map(ev => (
                <div
                  key={ev.id}
                  className="p-3 rounded-xl bg-[#F4F9FF] border border-[#B3D9FF] flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-white border border-[#B3D9FF] flex items-center justify-center text-lg shrink-0 shadow-2xs">
                      {ev.emoji || '📅'}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-bold text-[#0B2559] truncate">
                        {ev.title}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-[#3B82F6] mt-0.5">
                        <span>Fecha: {ev.date}</span>
                        <span>·</span>
                        <span className="font-bold text-[#0B2559]">
                          {ev.startTime} - {ev.endTime}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#0B2559]/70 truncate">
                        Por: {ev.createdByName}
                      </div>
                    </div>
                  </div>

                  {(currentUser.role === 'admin' ||
                    currentUser.cedula === SINGLE_ADMIN_CEDULA ||
                    ev.createdByCedula === currentUser.cedula) && (
                    <button
                      type="button"
                      onClick={() => handleDeleteCalendarEvent(ev)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0"
                      title="Eliminar evento"
                    >
                      <i className="fi fi-rr-trash text-xs" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal para Agregar Evento */}
        {isAddEventModalOpen && canUserAddEvents && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-[#0B2559]/60 backdrop-blur-xs">
            <div className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-xl border border-[#B3D9FF] overflow-hidden">
              <div className="px-5 py-3.5 bg-[#0B2559] text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <i className="fi fi-rr-calendar-plus text-sm text-[#B3D9FF]" />
                  <h3 className="text-sm font-bold">Agregar Evento</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAddEventModalOpen(false)}
                  className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
                >
                  <i className="fi fi-rr-cross-small text-base" />
                </button>
              </div>

              <form onSubmit={handleCreateCalendarEvent} className="p-5 space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-[#0B2559] mb-1">
                    Nombre del Evento
                  </label>
                  <input
                    type="text"
                    required
                    value={eventTitle}
                    onChange={e => setEventTitle(e.target.value)}
                    placeholder="Ej. Reunión mensual de seguimiento"
                    className="w-full min-h-[42px] px-3.5 py-2 text-xs text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl focus:bg-white focus:outline-none focus:border-[#0B2559]"
                  />
                </div>

                <div>
                  <label className="block font-bold text-[#0B2559] mb-1">
                    Fecha del Evento
                  </label>
                  <input
                    type="date"
                    required
                    value={eventDate}
                    onChange={e => setEventDate(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 py-2 text-xs font-mono text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl focus:bg-white focus:outline-none focus:border-[#0B2559]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-[#0B2559] mb-1">
                      Hora de Inicio
                    </label>
                    <input
                      type="time"
                      required
                      value={eventStartTime}
                      onChange={e => setEventStartTime(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 py-2 text-xs font-mono text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl focus:bg-white focus:outline-none focus:border-[#0B2559]"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-[#0B2559] mb-1">
                      Hora Final
                    </label>
                    <input
                      type="time"
                      required
                      value={eventEndTime}
                      onChange={e => setEventEndTime(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 py-2 text-xs font-mono text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl focus:bg-white focus:outline-none focus:border-[#0B2559]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-[#0B2559] mb-1.5">
                    Emoji del Evento
                  </label>
                  <div className="flex items-center gap-2 mb-2">
                    <input
                      type="text"
                      value={eventEmoji}
                      onChange={e => setEventEmoji(e.target.value)}
                      maxLength={8}
                      className="w-16 min-h-[42px] text-center text-lg bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl focus:bg-white focus:outline-none focus:border-[#0B2559]"
                    />
                    <span className="text-[11px] text-[#3B82F6]">
                      Selecciona un emoji o escríbelo directamente
                    </span>
                  </div>
                  <div className="grid grid-cols-10 gap-1.5 p-2 rounded-xl bg-[#F4F9FF] border border-[#D6EAFF]">
                    {EVENT_EMOJI_OPTIONS.map(em => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => setEventEmoji(em)}
                        className={`h-8 rounded-lg flex items-center justify-center text-base transition-all ${
                          eventEmoji === em
                            ? 'bg-[#0B2559] text-white shadow-2xs scale-105'
                            : 'bg-white hover:bg-[#EAF3FF]'
                        }`}
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                </div>

                {eventFormError && (
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 font-semibold">
                    {eventFormError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#D6EAFF]">
                  <button
                    type="button"
                    onClick={() => setIsAddEventModalOpen(false)}
                    className="min-h-[40px] px-4 py-2 rounded-xl font-bold text-[#0B2559] bg-white border border-[#B3D9FF] hover:bg-[#F4F9FF]"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="min-h-[40px] px-5 py-2 rounded-xl font-bold text-white bg-[#0B2559] hover:bg-[#15397A]"
                  >
                    Guardar Evento
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`space-y-4 mx-auto pb-20 ${isMobile ? 'max-w-lg' : 'max-w-6xl'}`}>
      {/* COMPONENTE VISUAL DE BARRA DE PROGRESO CIRCULAR ÚNICA (Sección Personal o Tareas del Grupo del Usuario Actual) */}
      <div className="bg-white border border-[#B3D9FF] rounded-2xl p-3.5 sm:p-4 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <CircularProgressRing
              percentage={sectionProgressPercent}
              size={isMobile ? 58 : 66}
              strokeWidth={6}
              colorClass={
                sectionProgressPercent >= 80
                  ? 'text-emerald-600'
                  : sectionProgressPercent >= 40
                  ? 'text-[#3B82F6]'
                  : 'text-[#0B2559]'
              }
              trackClass="text-[#D6EAFF]"
              labelSizeClass="text-xs"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xs sm:text-sm font-bold text-[#0B2559]">
                  {taskScope === 'personales'
                    ? `Avance de Sección Personal — ${currentUser.name}`
                    : `Avance de Tareas del Grupo Empresarial — ${currentUser.name}`}
                </h2>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#0B2559] text-white">
                  {taskScope === 'personales' ? 'Sección Personal' : 'Tareas del Grupo'}
                </span>
              </div>
              <p className="text-[11px] text-[#3B82F6] mt-0.5">
                {taskScope === 'personales'
                  ? 'Porcentaje de avance de tus tareas personales asignadas, creadas por ti o abiertas.'
                  : 'Porcentaje de avance general de las tareas en la sección del Grupo Empresarial.'}
              </p>
            </div>
          </div>

          {/* Resumen numérico tabular de la sección activa */}
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] tabular-nums sm:justify-end">
            <span className="px-2.5 py-1 rounded-xl font-bold bg-amber-50 text-amber-800 border border-amber-200">
              Pendientes: {sectionPendingTotalCount}
            </span>
            <span className="px-2.5 py-1 rounded-xl font-bold bg-[#EAF3FF] text-[#0B2559] border border-[#B3D9FF]">
              En proceso: {sectionInProgressCount}
            </span>
            <span className="px-2.5 py-1 rounded-xl font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
              Hechas: {sectionCompletedCount}
            </span>
          </div>
        </div>
      </div>

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

              {/* Selector de Encargado */}
              <div className="p-3.5 rounded-xl bg-[#F4F9FF] border border-[#B3D9FF] space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="block text-[11px] font-bold text-[#0B2559] uppercase tracking-wider">
                    Encargado de la Tarea
                  </label>
                  {(viewingAssignees.length > 1 ||
                    (viewingAssignees.length === 1 &&
                      viewingAssignees[0] !== (viewingTask.assignedToCedula || 'ABIERTA'))) && (
                    <button
                      type="button"
                      onClick={() => handleApplyViewingAssignees(viewingTask, viewingAssignees)}
                      className="px-2.5 py-1 rounded-lg bg-[#0B2559] text-white text-[10px] font-bold hover:bg-[#15397A] transition-colors"
                    >
                      Guardar
                    </button>
                  )}
                </div>
                <div className="max-h-40 overflow-y-auto border border-[#B3D9FF] rounded-xl bg-white divide-y divide-[#F4F9FF]">
                  <button
                    type="button"
                    onClick={() => toggleViewingAssignee('ABIERTA')}
                    className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2.5 transition-colors ${
                      viewingAssignees.includes('ABIERTA')
                        ? 'bg-[#EAF3FF] text-[#0B2559] font-bold'
                        : 'text-[#0B2559] hover:bg-[#F4F9FF] font-medium'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                        viewingAssignees.includes('ABIERTA')
                          ? 'bg-[#0B2559] border-[#0B2559] text-white'
                          : 'bg-white border-[#B3D9FF] text-transparent'
                      }`}
                    >
                      <i className="fi fi-rr-check text-[9px]" />
                    </span>
                    <span className="truncate">🌐 ABIERTA — Cualquiera puede realizarla</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleViewingAssignee(currentUser.cedula)}
                    className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2.5 transition-colors ${
                      viewingAssignees.includes(currentUser.cedula)
                        ? 'bg-[#EAF3FF] text-[#0B2559] font-bold'
                        : 'text-[#0B2559] hover:bg-[#F4F9FF] font-medium'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                        viewingAssignees.includes(currentUser.cedula)
                          ? 'bg-[#0B2559] border-[#0B2559] text-white'
                          : 'bg-white border-[#B3D9FF] text-transparent'
                      }`}
                    >
                      <i className="fi fi-rr-check text-[9px]" />
                    </span>
                    <span className="truncate">
                      👤 Asignarme a mí: {currentUser.name} (C.C. {currentUser.cedula})
                    </span>
                  </button>

                  {users
                    .filter(u => u.cedula !== currentUser.cedula)
                    .map(u => {
                      const isSelected = viewingAssignees.includes(u.cedula);
                      return (
                        <button
                          key={u.cedula}
                          type="button"
                          onClick={() => toggleViewingAssignee(u.cedula)}
                          className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2.5 transition-colors ${
                            isSelected
                              ? 'bg-[#EAF3FF] text-[#0B2559] font-bold'
                              : 'text-[#0B2559] hover:bg-[#F4F9FF] font-medium'
                          }`}
                        >
                          <span
                            className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                              isSelected
                                ? 'bg-[#0B2559] border-[#0B2559] text-white'
                                : 'bg-white border-[#B3D9FF] text-transparent'
                            }`}
                          >
                            <i className="fi fi-rr-check text-[9px]" />
                          </span>
                          <span className="truncate">
                            👥 {u.name} (C.C. {u.cedula})
                          </span>
                        </button>
                      );
                    })}
                </div>
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
                onClick={async () => {
                  if (
                    viewingAssignees.length > 1 ||
                    (viewingAssignees.length === 1 &&
                      viewingAssignees[0] !== (viewingTask.assignedToCedula || 'ABIERTA'))
                  ) {
                    await handleApplyViewingAssignees(viewingTask, viewingAssignees);
                  }
                  setViewingTask(null);
                }}
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
