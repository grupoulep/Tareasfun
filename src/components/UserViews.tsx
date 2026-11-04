import React, { useState, useEffect } from 'react';
import { AppUser, TaskItem, ChatMessage, CalendarEvent } from '../types';
import {
  saveTaskToFirestore,
  deleteTaskFromFirestore,
  saveChatMessageToFirestore,
  saveCalendarEventToFirestore,
  deleteCalendarEventFromFirestore,
  recordAuditLog,
  cleanId
} from '../firebase';
import { generateMonthlyProgressPDF } from '../utils/pdfAndBackup';

interface UserViewsProps {
  activeSection:
    | 'user_personal'
    | 'user_all_tasks'
    | 'user_priority_alerts'
    | 'user_monthly_reports'
    | 'user_calendar'
    | 'user_chat';
  onChangeSection?: (
    sec:
      | 'user_personal'
      | 'user_all_tasks'
      | 'user_priority_alerts'
      | 'user_monthly_reports'
      | 'user_calendar'
      | 'user_chat'
  ) => void;
  currentUser: AppUser;
  users: AppUser[];
  tasks: TaskItem[];
  chatMessages: ChatMessage[];
  calendarEvents: CalendarEvent[];
  onOpenNewTask: () => void;
  onEditTask: (task: TaskItem) => void;
}

type InboxScope = 'mis_tareas' | 'equipo' | 'urgentes' | 'completadas';

export const UserViews: React.FC<UserViewsProps> = ({
  activeSection,
  currentUser,
  users,
  tasks,
  chatMessages,
  calendarEvents,
  onOpenNewTask,
  onEditTask,
}) => {
  const [expandedTaskIds, setExpandedTaskIds] = useState<Record<string, boolean>>({});
  const [expandedEventIds, setExpandedEventIds] = useState<Record<string, boolean>>({});
  const [showNewEventForm, setShowNewEventForm] = useState(false);

  const [inboxScope, setInboxScope] = useState<InboxScope>('mis_tareas');
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [nowTick, setNowTick] = useState<number>(Date.now());

  // Chat state
  const [chatInput, setChatInput] = useState('');
  const [chatChannel, setChatChannel] = useState('general');
  const [linkedTaskChat, setLinkedTaskChat] = useState('');

  // Calendar state
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [newEvTitle, setNewEvTitle] = useState('');
  const [newEvTime, setNewEvTime] = useState('10:00');
  const [newEvType, setNewEvType] = useState<'entrega' | 'reunion' | 'auditoria' | 'hito' | 'actividad'>('actividad');
  const [newEvDesc, setNewEvDesc] = useState('');

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (activeSection === 'user_personal') setInboxScope('mis_tareas');
    else if (activeSection === 'user_all_tasks') setInboxScope('equipo');
    else if (activeSection === 'user_priority_alerts') setInboxScope('urgentes');
    else if (activeSection === 'user_monthly_reports') setInboxScope('completadas');
  }, [activeSection]);

  const canSeeVault = currentUser.role === 'admin' || currentUser.canViewVault;

  const toggleTaskExpand = (taskId: string) => {
    setExpandedTaskIds(prev => ({ ...prev, [taskId]: !prev[taskId] }));
  };

  const toggleEventExpand = (evId: string) => {
    setExpandedEventIds(prev => ({ ...prev, [evId]: !prev[evId] }));
  };

  const formatCountdown = (dueDateStr: string, status: string) => {
    if (status === 'completada') {
      return { text: 'Entregada / Cerrada', urgent: false, overdue: false };
    }
    const diffMs = new Date(dueDateStr).getTime() - nowTick;
    const absHours = Math.floor(Math.abs(diffMs) / (1000 * 60 * 60));
    const absMins = Math.floor((Math.abs(diffMs) % (1000 * 60 * 60)) / (1000 * 60));

    if (diffMs < 0) {
      return {
        text: `Vencida hace ${absHours}h ${absMins}m`,
        urgent: true,
        overdue: true
      };
    }
    if (diffMs <= 24 * 3600 * 1000) {
      return {
        text: `Cierra en ${absHours}h ${absMins}m`,
        urgent: true,
        overdue: false
      };
    }
    const days = Math.floor(absHours / 24);
    return {
      text: `${days}d ${absHours % 24}h restantes`,
      urgent: false,
      overdue: false
    };
  };

  const handleQuickProgressChange = async (task: TaskItem, newProgress: number) => {
    if (!currentUser.canEditTasks && currentUser.role !== 'admin') return;
    const newStatus = newProgress === 100 ? 'completada' : newProgress > 0 ? 'en_progreso' : 'pendiente';
    const updated: TaskItem = {
      ...task,
      progress: newProgress,
      status: newStatus,
      completedAt: newStatus === 'completada' ? new Date().toISOString() : '',
    };
    await saveTaskToFirestore(updated);
    await recordAuditLog({
      actorCedula: currentUser.cedula,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionType: newStatus === 'completada' ? 'COMPLETAR_TAREA' : 'ACTUALIZAR_PROGRESO',
      module: 'BANDEJA_TAREAS',
      description: `Actualizó el progreso de "${task.title}" a ${newProgress}% (${newStatus.toUpperCase()}).`,
      targetId: task.id,
      severity: 'info'
    });
  };

  const handleToggleRevealPassword = async (task: TaskItem) => {
    if (!canSeeVault) return;
    const nextState = !revealedPasswords[task.id];
    setRevealedPasswords(prev => ({ ...prev, [task.id]: nextState }));
    if (nextState) {
      await recordAuditLog({
        actorCedula: currentUser.cedula,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        actionType: 'CONSULTAR_CONTRASENA_TAREA',
        module: 'BOVEDA_CREDENCIALES',
        description: `Visualizó las credenciales de acceso adjuntas en la actividad "${task.title}".`,
        targetId: task.id,
        severity: 'warning'
      });
    }
  };

  const handleCopyText = async (text: string, keyId: string, label: string, taskTitle: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(keyId);
    setTimeout(() => setCopiedId(null), 1800);
    await recordAuditLog({
      actorCedula: currentUser.cedula,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionType: 'COPIAR_CREDENCIAL',
      module: 'BOVEDA_CREDENCIALES',
      description: `Copió ${label} de la tarea "${taskTitle}".`,
      severity: 'info'
    });
  };

  const handleOpenDirectLink = async (task: TaskItem) => {
    await recordAuditLog({
      actorCedula: currentUser.cedula,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionType: 'ABRIR_LINK_DIRECTO',
      module: 'ENLACES_TAREAS',
      description: `Accedió al link directo (${task.directLink}) de la actividad "${task.title}".`,
      targetId: task.id,
      severity: 'info'
    });
  };

  const handleDeleteTask = async (task: TaskItem) => {
    if (!currentUser.canDeleteTasks && currentUser.role !== 'admin') return;
    await deleteTaskFromFirestore(task.id);
    await recordAuditLog({
      actorCedula: currentUser.cedula,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionType: 'ELIMINAR_TAREA',
      module: 'TAREAS',
      description: `Eliminó la tarea "${task.title}".`,
      targetId: task.id,
      severity: 'warning'
    });
  };

  const handleDownloadMonthlyPDF = async () => {
    if (!currentUser.canExportReports && currentUser.role !== 'admin') return;
    const monthName = new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    generateMonthlyProgressPDF({
      generatedBy: currentUser,
      tasks,
      monthLabel: monthName,
    });
    await recordAuditLog({
      actorCedula: currentUser.cedula,
      actorName: currentUser.name,
      actorRole: currentUser.role,
      actionType: 'DESCARGAR_REPORTE_MENSUAL_PDF',
      module: 'REPORTES_MENSUALES',
      description: `Descargó el reporte de avance mensual en PDF.`,
      severity: 'info'
    });
  };

  const myTasks = tasks.filter(t => t.assignedToCedula === currentUser.cedula);
  const urgentTasks = tasks.filter(
    t =>
      t.status !== 'completada' &&
      (t.priority === 'critica' ||
        t.priority === 'alta' ||
        new Date(t.dueDate).getTime() - nowTick <= 48 * 3600 * 1000)
  );
  const completedTasks = tasks.filter(t => t.status === 'completada');

  // Renderizado de cada cuadrito de tarea con la paleta ULEP (#B3D9FF, #FFFFFF y #0B2559)
  const renderCollapsibleTaskBox = (task: TaskItem) => {
    const isExpanded = Boolean(expandedTaskIds[task.id]);
    const isCompleted = task.status === 'completada';
    const isPasswordShown = Boolean(revealedPasswords[task.id]);
    const countdown = formatCountdown(task.dueDate, task.status);

    return (
      <div
        key={task.id}
        className={`border rounded-xl transition-all overflow-hidden ${
          isExpanded
            ? 'border-[#0B2559] bg-white shadow-sm'
            : 'border-[#B3D9FF] bg-white hover:border-[#7CC0FF]'
        }`}
      >
        {/* Cabecera Minimalista: Actividad + Flecha */}
        <div
          onClick={() => toggleTaskExpand(task.id)}
          className="flex items-center justify-between gap-3 px-4 py-3.5 cursor-pointer select-none hover:bg-[#F4F9FF] transition-colors"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                isCompleted ? 'bg-emerald-500' : countdown.overdue ? 'bg-rose-500' : 'bg-[#7CC0FF]'
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
            onClick={e => {
              e.stopPropagation();
              toggleTaskExpand(task.id);
            }}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
              isExpanded
                ? 'bg-[#0B2559] text-white'
                : 'bg-[#EAF3FF] text-[#0B2559] hover:bg-[#B3D9FF]'
            }`}
            title={isExpanded ? 'Ocultar detalles' : 'Ver toda la información de la tarea'}
          >
            <i
              className={`fi ${
                isExpanded ? 'fi-rr-angle-small-up' : 'fi-rr-angle-small-down'
              } text-base`}
            />
          </button>
        </div>

        {/* Cuerpo Desplegable con Toda la Información Organizada */}
        {isExpanded && (
          <div className="px-5 pb-5 pt-4 border-t border-[#D6EAFF] bg-[#F4F9FF] space-y-4 text-xs">
            {/* Fila 1: Estado, Prioridad y Botones de Acción Directa */}
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#D6EAFF]">
              <div className="flex flex-wrap items-center gap-2 text-[#0B2559]">
                <span
                  className={`font-bold uppercase ${
                    task.priority === 'critica'
                      ? 'text-rose-700'
                      : task.priority === 'alta'
                      ? 'text-amber-700'
                      : 'text-[#0B2559]'
                  }`}
                >
                  Prioridad {task.priority}
                </span>
                <span className="text-[#7CC0FF]">·</span>
                <span className="font-bold">
                  {task.status.replace('_', ' ').toUpperCase()} ({task.progress}%)
                </span>
                <span className="text-[#7CC0FF]">·</span>
                <span>{task.category || 'Operaciones'}</span>
                {task.tags && (
                  <>
                    <span className="text-[#7CC0FF]">·</span>
                    <span className="text-[#3B82F6] font-medium">{task.tags}</span>
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                {task.status !== 'completada' && (
                  <button
                    type="button"
                    disabled={!currentUser.canEditTasks && currentUser.role !== 'admin'}
                    onClick={() => handleQuickProgressChange(task, 100)}
                    className="px-3 py-1.5 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] hover:bg-[#99CCFF] rounded-lg flex items-center gap-1.5 disabled:opacity-40 transition-colors"
                  >
                    <i className="fi fi-rr-check-circle text-xs" /> Marcar Completada
                  </button>
                )}

                {(currentUser.canEditTasks || currentUser.role === 'admin') && (
                  <button
                    type="button"
                    onClick={() => onEditTask(task)}
                    className="px-3 py-1.5 text-xs font-bold text-[#0B2559] bg-white border border-[#B3D9FF] hover:bg-[#EAF3FF] rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <i className="fi fi-rr-edit text-xs" /> Editar
                  </button>
                )}

                {(currentUser.canDeleteTasks || currentUser.role === 'admin') && (
                  <button
                    type="button"
                    onClick={() => handleDeleteTask(task)}
                    className="px-3 py-1.5 text-xs font-bold text-rose-700 bg-white border border-rose-200 hover:bg-rose-50 rounded-lg flex items-center gap-1.5 transition-colors"
                  >
                    <i className="fi fi-rr-trash text-xs" /> Eliminar
                  </button>
                )}
              </div>
            </div>

            {/* Fila 2: Quién asignó, Responsable y Tiempos de Cierre */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-white p-3.5 rounded-xl border border-[#B3D9FF] tabular-nums">
              <div>
                <div className="text-[11px] text-[#3B82F6]">Responsable:</div>
                <div className="font-bold text-[#0B2559]">{task.assignedToName}</div>
                <div className="font-mono text-[11px] text-[#3B82F6]">C.C. {task.assignedToCedula}</div>
              </div>
              <div>
                <div className="text-[11px] text-[#3B82F6]">Asignada por:</div>
                <div className="font-bold text-[#0B2559]">{task.createdByName}</div>
                <div className="font-mono text-[11px] text-[#3B82F6]">C.C. {task.createdByCedula}</div>
              </div>
              <div>
                <div className="text-[11px] text-[#3B82F6]">Fecha de registro:</div>
                <div className="font-bold text-[#0B2559]">
                  {new Date(task.createdAt).toLocaleString('es-ES')}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#3B82F6]">Fecha Límite / Cierre:</div>
                <div className="font-bold text-[#0B2559]">
                  {new Date(task.dueDate).toLocaleString('es-ES')}
                </div>
                <div
                  className={`text-[11px] font-bold mt-0.5 ${
                    countdown.overdue
                      ? 'text-rose-600'
                      : countdown.urgent
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {countdown.text}
                </div>
              </div>
            </div>

            {/* Fila 3: Descripción y Notas */}
            {(task.description || task.notes) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {task.description && (
                  <div className="p-3.5 bg-white rounded-xl border border-[#B3D9FF]">
                    <div className="text-[11px] font-bold text-[#3B82F6] mb-1">Descripción:</div>
                    <p className="text-[#0B2559] leading-relaxed whitespace-pre-line">{task.description}</p>
                  </div>
                )}
                {task.notes && (
                  <div className="p-3.5 bg-white rounded-xl border border-[#B3D9FF]">
                    <div className="text-[11px] font-bold text-[#3B82F6] mb-1">Notas Operativas:</div>
                    <p className="text-[#0B2559] leading-relaxed whitespace-pre-line">{task.notes}</p>
                  </div>
                )}
              </div>
            )}

            {/* Fila 4: Credenciales (Correo, Clave) y Link Directo */}
            {(task.accessEmail || task.accessPassword || task.directLink) && (
              <div className="p-3.5 bg-white rounded-xl border border-[#B3D9FF] space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-[#0B2559] flex items-center gap-1.5">
                    <i className="fi fi-rr-key text-xs text-[#3B82F6]" /> Credenciales de Acceso y Enlace de la Actividad
                  </span>
                  {task.directLink && (
                    <a
                      href={task.directLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => handleOpenDirectLink(task)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-lg hover:bg-[#99CCFF] transition-colors"
                    >
                      Entrar al Link Directo <i className="fi fi-rr-arrow-up-right-from-square text-[10px]" />
                    </a>
                  )}
                </div>

                {(task.accessEmail || task.accessPassword) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 font-mono">
                    {task.accessEmail && (
                      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#F4F9FF] rounded-lg border border-[#B3D9FF]">
                        <span className="truncate text-[#0B2559]">Correo/Usuario: <strong>{task.accessEmail}</strong></span>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyText(task.accessEmail, `${task.id}_email`, 'correo de acceso', task.title)
                          }
                          className="p-1 text-[#0B2559] hover:bg-[#B3D9FF] rounded transition-colors"
                          title="Copiar usuario"
                        >
                          <i
                            className={`fi ${
                              copiedId === `${task.id}_email` ? 'fi-rr-check text-emerald-600' : 'fi-rr-copy'
                            } text-xs`}
                          />
                        </button>
                      </div>
                    )}

                    {task.accessPassword && (
                      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#F4F9FF] rounded-lg border border-[#B3D9FF]">
                        {canSeeVault ? (
                          <>
                            <span className="truncate text-[#0B2559]">
                              Clave: <strong>{isPasswordShown ? task.accessPassword : '••••••••••••'}</strong>
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={() => handleToggleRevealPassword(task)}
                                className="p-1 text-[#0B2559] hover:bg-[#B3D9FF] rounded transition-colors"
                                title="Mostrar / ocultar clave"
                              >
                                <i
                                  className={`fi ${
                                    isPasswordShown ? 'fi-rr-eye-crossed' : 'fi-rr-eye'
                                  } text-xs`}
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleCopyText(
                                    task.accessPassword,
                                    `${task.id}_pass`,
                                    'contraseña de tarea',
                                    task.title
                                  )
                                }
                                className="p-1 text-[#0B2559] hover:bg-[#B3D9FF] rounded transition-colors"
                                title="Copiar clave"
                              >
                                <i
                                  className={`fi ${
                                    copiedId === `${task.id}_pass`
                                      ? 'fi-rr-check text-emerald-600'
                                      : 'fi-rr-copy'
                                  } text-xs`}
                                />
                              </button>
                            </div>
                          </>
                        ) : (
                          <span className="text-amber-700 font-sans text-[11px]">
                            Visualización restringida por el Administrador
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Fila 5: Selector de Porcentaje de Avance */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-bold text-[#0B2559] mr-1">Cambiar avance:</span>
                {[0, 25, 50, 75, 100].map(pct => (
                  <button
                    key={pct}
                    type="button"
                    disabled={!currentUser.canEditTasks && currentUser.role !== 'admin'}
                    onClick={() => handleQuickProgressChange(task, pct)}
                    className={`px-2.5 py-1 text-[11px] font-mono font-bold rounded-md transition-colors ${
                      task.progress === pct
                        ? 'bg-[#0B2559] text-white'
                        : 'bg-white text-[#0B2559] border border-[#B3D9FF] hover:bg-[#B3D9FF]/40'
                    } disabled:opacity-40`}
                  >
                    {pct}%
                  </button>
                ))}
              </div>

              <div className="w-full sm:w-48 h-2.5 bg-[#D6EAFF] rounded-full overflow-hidden">
                <div
                  className="h-full transition-all duration-150 bg-[#0B2559]"
                  style={{ width: `${task.progress}%` }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // MÓDULO 2: CALENDARIO INTERACTIVO
  if (activeSection === 'user_calendar') {
    const handleAddCalendarEvent = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newEvTitle.trim()) return;
      const ev: CalendarEvent = {
        id: cleanId(`ev_${Date.now()}`),
        title: newEvTitle.trim(),
        date: selectedDate,
        time: newEvTime,
        type: newEvType,
        description: newEvDesc.trim(),
        createdByCedula: currentUser.cedula,
        createdByName: currentUser.name,
        linkedTaskId: '',
      };
      await saveCalendarEventToFirestore(ev);
      await recordAuditLog({
        actorCedula: currentUser.cedula,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        actionType: 'CREAR_EVENTO_CALENDARIO',
        module: 'CALENDARIO_SINCRONIZADO',
        description: `Agendó el evento "${ev.title}" para la fecha ${ev.date} a las ${ev.time}.`,
        targetId: ev.id,
        severity: 'info'
      });
      setNewEvTitle('');
      setNewEvDesc('');
      setShowNewEventForm(false);
    };

    const handleDeleteEvent = async (ev: CalendarEvent) => {
      await deleteCalendarEventFromFirestore(ev.id);
      await recordAuditLog({
        actorCedula: currentUser.cedula,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        actionType: 'ELIMINAR_EVENTO_CALENDARIO',
        module: 'CALENDARIO_SINCRONIZADO',
        description: `Eliminó el evento "${ev.title}" del calendario.`,
        targetId: ev.id,
        severity: 'warning'
      });
    };

    const tasksOnSelectedDate = tasks.filter(t => t.dueDate.startsWith(selectedDate));
    const eventsOnSelectedDate = calendarEvents.filter(ev => ev.date === selectedDate);

    const upcomingDays = Array.from({ length: 7 }, (_, idx) => {
      const d = new Date();
      d.setDate(d.getDate() - 1 + idx);
      const isoDate = d.toISOString().split('T')[0];
      const dayTasksCount = tasks.filter(t => t.dueDate.startsWith(isoDate)).length;
      const dayEventsCount = calendarEvents.filter(e => e.date === isoDate).length;
      return {
        isoDate,
        dayName: d.toLocaleDateString('es-ES', { weekday: 'short' }),
        dayNum: d.getDate(),
        totalItems: dayTasksCount + dayEventsCount,
      };
    });

    return (
      <div className="bg-white border border-[#B3D9FF] rounded-2xl p-6 space-y-6 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#D6EAFF]">
          <div>
            <h2 className="text-base font-bold text-[#0B2559] flex items-center gap-2">
              <i className="fi fi-rr-calendar text-sm text-[#3B82F6]" />
              Calendario de Entregas y Actividades
            </h2>
            <p className="text-xs text-[#0B2559]/70">
              Selecciona un día para ver sus tareas sincronizadas y haz clic en la flecha para desplegar los detalles.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 text-xs font-mono text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg focus:bg-white focus:outline-none focus:border-[#0B2559]"
            />
            <button
              type="button"
              onClick={() => setShowNewEventForm(!showNewEventForm)}
              className="px-3.5 py-2 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-lg hover:bg-[#99CCFF] flex items-center gap-1.5 transition-colors"
            >
              <i className="fi fi-rr-plus text-xs" /> Nuevo Evento
              <i className={`fi ${showNewEventForm ? 'fi-rr-angle-small-up' : 'fi-rr-angle-small-down'} text-sm`} />
            </button>
          </div>
        </div>

        {showNewEventForm && (
          <form
            onSubmit={handleAddCalendarEvent}
            className="p-4 bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl grid grid-cols-1 sm:grid-cols-4 gap-3"
          >
            <input
              type="text"
              required
              value={newEvTitle}
              onChange={e => setNewEvTitle(e.target.value)}
              placeholder="Título del evento..."
              className="sm:col-span-2 px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
            />
            <input
              type="time"
              required
              value={newEvTime}
              onChange={e => setNewEvTime(e.target.value)}
              className="px-3 py-2 text-xs font-mono text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
            />
            <select
              value={newEvType}
              onChange={e =>
                setNewEvType(e.target.value as 'entrega' | 'reunion' | 'auditoria' | 'hito' | 'actividad')
              }
              className="px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
            >
              <option value="actividad">Actividad General</option>
              <option value="entrega">Entrega Clave</option>
              <option value="reunion">Reunión de Equipo</option>
              <option value="auditoria">Corte de Auditoría</option>
              <option value="hito">Hito de Proyecto</option>
            </select>
            <input
              type="text"
              value={newEvDesc}
              onChange={e => setNewEvDesc(e.target.value)}
              placeholder="Notas o detalles adicionales..."
              className="sm:col-span-3 px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
            />
            <button
              type="submit"
              className="py-2 px-4 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-lg hover:bg-[#99CCFF] transition-colors"
            >
              Guardar en Calendario
            </button>
          </form>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-7 gap-2">
          {upcomingDays.map(day => {
            const isSelected = day.isoDate === selectedDate;
            return (
              <button
                key={day.isoDate}
                type="button"
                onClick={() => setSelectedDate(day.isoDate)}
                className={`p-3 rounded-xl border text-center transition-colors ${
                  isSelected
                    ? 'bg-[#0B2559] text-white border-[#0B2559] shadow-xs'
                    : 'bg-[#F4F9FF] text-[#0B2559] border-[#B3D9FF] hover:bg-[#B3D9FF]/40'
                }`}
              >
                <div className="text-[10px] uppercase opacity-75 font-semibold">{day.dayName}</div>
                <div className="text-lg font-bold font-mono tabular-nums mt-0.5">{day.dayNum}</div>
                <div className={`mt-1 text-[10px] font-mono tabular-nums font-bold ${isSelected ? 'text-[#B3D9FF]' : 'text-[#3B82F6]'}`}>
                  {day.totalItems > 0 ? `${day.totalItems} act.` : 'Libre'}
                </div>
              </button>
            );
          })}
        </div>

        <div className="space-y-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#0B2559]">
            Actividades del {selectedDate} ({tasksOnSelectedDate.length + eventsOnSelectedDate.length})
          </h3>

          {tasksOnSelectedDate.length === 0 && eventsOnSelectedDate.length === 0 ? (
            <div className="py-10 text-center text-xs text-[#0B2559]/70 bg-[#F4F9FF] rounded-xl border border-[#B3D9FF]">
              No hay entregas ni actividades programadas para este día.
            </div>
          ) : (
            <div className="space-y-2">
              {tasksOnSelectedDate.map(t => renderCollapsibleTaskBox(t))}

              {eventsOnSelectedDate.map(ev => {
                const isEvOpen = Boolean(expandedEventIds[ev.id]);
                return (
                  <div
                    key={ev.id}
                    className={`border rounded-xl bg-white overflow-hidden transition-all ${
                      isEvOpen ? 'border-[#0B2559] shadow-2xs' : 'border-[#B3D9FF] hover:border-[#7CC0FF]'
                    }`}
                  >
                    <div
                      onClick={() => toggleEventExpand(ev.id)}
                      className="flex items-center justify-between gap-3 px-4 py-3.5 cursor-pointer hover:bg-[#F4F9FF]"
                    >
                      <span className="text-sm font-bold text-[#0B2559] truncate">
                        {ev.title}
                      </span>
                      <button
                        type="button"
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                          isEvOpen ? 'bg-[#0B2559] text-white' : 'bg-[#EAF3FF] text-[#0B2559]'
                        }`}
                      >
                        <i
                          className={`fi ${
                            isEvOpen ? 'fi-rr-angle-small-up' : 'fi-rr-angle-small-down'
                          } text-base`}
                        />
                      </button>
                    </div>

                    {isEvOpen && (
                      <div className="px-4 pb-3.5 pt-2.5 border-t border-[#D6EAFF] bg-[#F4F9FF] flex items-center justify-between gap-3 text-xs">
                        <div className="space-y-1">
                          <div className="font-bold text-[#0B2559] uppercase">
                            Evento ({ev.type}) · Hora: {ev.time} HRS · Creado por: {ev.createdByName}
                          </div>
                          {ev.description && <div className="text-[#0B2559]/90">{ev.description}</div>}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteEvent(ev)}
                          className="px-2.5 py-1.5 text-xs font-bold text-rose-700 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 shrink-0"
                        >
                          <i className="fi fi-rr-trash text-xs" /> Eliminar
                        </button>
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

  // MÓDULO 3: CHAT Y EQUIPO EN LÍNEA
  if (activeSection === 'user_chat') {
    const channelMessages = chatMessages.filter(m => m.channel === chatChannel);

    const handleSendMessage = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!chatInput.trim()) return;
      if (!currentUser.canSendChat && currentUser.role !== 'admin') return;

      const textToSend = chatInput.trim();
      setChatInput('');

      await saveChatMessageToFirestore({
        senderCedula: currentUser.cedula,
        senderName: currentUser.name,
        senderRole: currentUser.role,
        text: textToSend,
        channel: chatChannel,
        relatedTaskId: linkedTaskChat,
        timestamp: new Date().toISOString(),
      });

      await recordAuditLog({
        actorCedula: currentUser.cedula,
        actorName: currentUser.name,
        actorRole: currentUser.role,
        actionType: 'ENVIAR_MENSAJE_CHAT',
        module: 'CHAT_COORDINACION',
        description: `Envió mensaje en el canal #${chatChannel}: "${textToSend.slice(0, 80)}"`,
        severity: 'info'
      });
    };

    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-3 bg-white border border-[#B3D9FF] rounded-2xl p-4 space-y-4 shadow-2xs">
          <div>
            <h3 className="text-xs font-bold text-[#0B2559] uppercase tracking-wider mb-2">
              Canales del Equipo
            </h3>
            <div className="space-y-1">
              {(['general', 'entregas-urgentes', 'soporte-accesos'] as const).map(ch => (
                <button
                  key={ch}
                  type="button"
                  onClick={() => setChatChannel(ch)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold transition-colors ${
                    chatChannel === ch
                      ? 'bg-[#B3D9FF] text-[#0B2559]'
                      : 'text-[#0B2559] hover:bg-[#F4F9FF]'
                  }`}
                >
                  # {ch}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-3 border-t border-[#D6EAFF]">
            <h3 className="text-xs font-bold text-[#0B2559] uppercase tracking-wider mb-2">
              Estado en Tiempo Real ({users.filter(u => u.isOnline).length}/{users.length} en línea)
            </h3>
            <div className="space-y-2">
              {users.map(u => (
                <div
                  key={u.cedula}
                  className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#F4F9FF] border border-[#B3D9FF] text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        u.isOnline ? 'bg-emerald-500' : 'bg-[#B3D9FF]'
                      }`}
                    />
                    <span className="font-bold text-[#0B2559] truncate">{u.name}</span>
                  </div>
                  <span className={`text-[10px] font-bold shrink-0 ${u.isOnline ? 'text-emerald-700' : 'text-[#0B2559]/50'}`}>
                    {u.isOnline ? 'En línea' : 'Off'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-9 bg-white border border-[#B3D9FF] rounded-2xl flex flex-col h-[580px] overflow-hidden shadow-2xs">
          <div className="px-5 py-3.5 border-b border-[#D6EAFF] bg-[#F4F9FF] flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm font-bold text-[#0B2559] flex items-center gap-2">
              <i className="fi fi-rr-comments text-sm text-[#3B82F6]" /> Canal #{chatChannel}
            </span>
            <select
              value={linkedTaskChat}
              onChange={e => setLinkedTaskChat(e.target.value)}
              className="px-3 py-1.5 text-xs text-[#0B2559] border border-[#B3D9FF] rounded-lg bg-white max-w-xs truncate focus:outline-none focus:border-[#0B2559]"
            >
              <option value="">Vincular una tarea al mensaje (Opcional)...</option>
              {tasks.map(t => (
                <option key={t.id} value={t.id}>
                  Tarea: {t.title}
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1 p-5 overflow-y-auto space-y-3 bg-[#F4F9FF]/60">
            {channelMessages.map(msg => {
              const isMe = msg.senderCedula === currentUser.cedula;
              const relatedTask = tasks.find(t => t.id === msg.relatedTaskId);
              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-1.5 text-[11px] text-[#0B2559]/70 mb-1 tabular-nums">
                    <span className="font-bold text-[#0B2559]">{msg.senderName}</span>
                    <span>·</span>
                    <span>
                      {new Date(msg.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div
                    className={`max-w-xl px-4 py-2.5 rounded-2xl text-xs leading-relaxed ${
                      isMe
                        ? 'bg-[#0B2559] text-white'
                        : 'bg-white text-[#0B2559] border border-[#B3D9FF]'
                    }`}
                  >
                    {relatedTask && (
                      <div
                        className={`text-[11px] font-bold pb-1 mb-1 border-b ${
                          isMe ? 'border-[#B3D9FF]/30 text-[#B3D9FF]' : 'border-[#D6EAFF] text-[#3B82F6]'
                        }`}
                      >
                        Ref: {relatedTask.title} ({relatedTask.progress}%)
                      </div>
                    )}
                    <div>{msg.text}</div>
                  </div>
                </div>
              );
            })}
          </div>

          <form onSubmit={handleSendMessage} className="p-3.5 border-t border-[#D6EAFF] flex items-center gap-2 bg-white">
            <input
              type="text"
              disabled={!currentUser.canSendChat && currentUser.role !== 'admin'}
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder={
                currentUser.canSendChat || currentUser.role === 'admin'
                  ? `Escribe un mensaje al equipo en #${chatChannel}...`
                  : 'Permiso de chat deshabilitado por el Administrador.'
              }
              className="flex-1 px-4 py-2 text-xs text-[#0B2559] border border-[#B3D9FF] rounded-full bg-[#F4F9FF] focus:bg-white focus:outline-none focus:border-[#0B2559]"
            />
            <button
              type="submit"
              disabled={!currentUser.canSendChat && currentUser.role !== 'admin'}
              className="px-5 py-2 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-full hover:bg-[#99CCFF] transition-colors flex items-center gap-1.5 shrink-0 disabled:opacity-40"
            >
              <i className="fi fi-rr-paper-plane text-xs" /> Enviar
            </button>
          </form>
        </div>
      </div>
    );
  }

  // MÓDULO 1 (PRINCIPAL): BANDEJA UNIFICADA CON PALETA ULEP (#B3D9FF, #FFFFFF y #0B2559)
  let sourceList: TaskItem[] = myTasks;
  if (inboxScope === 'mis_tareas') sourceList = myTasks;
  else if (inboxScope === 'equipo') sourceList = tasks;
  else if (inboxScope === 'urgentes') sourceList = urgentTasks;
  else if (inboxScope === 'completadas') sourceList = completedTasks;

  const filteredTasks = sourceList.filter(t => {
    const q = searchQuery.toLowerCase();
    return (
      !q ||
      t.title.toLowerCase().includes(q) ||
      t.assignedToName.toLowerCase().includes(q) ||
      t.tags.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q)
    );
  });

  return (
    <div className="bg-white border border-[#B3D9FF] rounded-2xl overflow-hidden shadow-2xs">
      {/* Cabecera Unificada: Buscador + Botones de Acción */}
      <div className="p-4 bg-[#F4F9FF] border-b border-[#B3D9FF] flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-xl">
          <i className="fi fi-rr-search text-xs text-[#3B82F6] absolute left-4 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Buscar actividad por nombre, responsable o etiqueta..."
            className="w-full pl-10 pr-4 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-full focus:outline-none focus:border-[#0B2559]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(currentUser.canExportReports || currentUser.role === 'admin') && (
            <button
              type="button"
              onClick={handleDownloadMonthlyPDF}
              className="px-3.5 py-2 text-xs font-bold text-[#0B2559] bg-white border border-[#B3D9FF] rounded-xl hover:bg-[#EAF3FF] flex items-center gap-1.5 transition-colors"
            >
              <i className="fi fi-rr-file-pdf text-xs text-[#3B82F6]" /> Reporte Mensual PDF
            </button>
          )}

          {(currentUser.canCreateTasks || currentUser.role === 'admin') && (
            <button
              type="button"
              onClick={onOpenNewTask}
              className="px-4 py-2 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-xl hover:bg-[#99CCFF] flex items-center gap-1.5 transition-colors shadow-2xs"
            >
              <i className="fi fi-rr-plus text-xs" /> Nueva Tarea
            </button>
          )}
        </div>
      </div>

      {/* Pestañas Simples con Paleta ULEP */}
      <div className="flex items-center overflow-x-auto px-4 border-b border-[#D6EAFF] bg-white">
        <button
          type="button"
          onClick={() => setInboxScope('mis_tareas')}
          className={`flex items-center gap-2 px-5 py-3.5 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
            inboxScope === 'mis_tareas'
              ? 'border-[#0B2559] text-[#0B2559] bg-[#F4F9FF]'
              : 'border-transparent text-[#0B2559]/70 hover:bg-[#F4F9FF]/60'
          }`}
        >
          <i className="fi fi-rr-inbox-in text-xs text-[#3B82F6]" />
          Mis Tareas ({myTasks.length})
        </button>

        <button
          type="button"
          onClick={() => setInboxScope('urgentes')}
          className={`flex items-center gap-2 px-5 py-3.5 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
            inboxScope === 'urgentes'
              ? 'border-[#0B2559] text-[#0B2559] bg-[#F4F9FF]'
              : 'border-transparent text-[#0B2559]/70 hover:bg-[#F4F9FF]/60'
          }`}
        >
          <i className="fi fi-rr-alarm-exclamation text-xs text-rose-500" />
          Alertas Prioridad y Cierre ({urgentTasks.length})
        </button>

        <button
          type="button"
          onClick={() => setInboxScope('equipo')}
          className={`flex items-center gap-2 px-5 py-3.5 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
            inboxScope === 'equipo'
              ? 'border-[#0B2559] text-[#0B2559] bg-[#F4F9FF]'
              : 'border-transparent text-[#0B2559]/70 hover:bg-[#F4F9FF]/60'
          }`}
        >
          <i className="fi fi-rr-list-check text-xs text-[#3B82F6]" />
          Tareas de Todos ({tasks.length})
        </button>

        <button
          type="button"
          onClick={() => setInboxScope('completadas')}
          className={`flex items-center gap-2 px-5 py-3.5 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
            inboxScope === 'completadas'
              ? 'border-[#0B2559] text-[#0B2559] bg-[#F4F9FF]'
              : 'border-transparent text-[#0B2559]/70 hover:bg-[#F4F9FF]/60'
          }`}
        >
          <i className="fi fi-rr-check-circle text-xs text-emerald-600" />
          Completadas y Avance ({completedTasks.length}/{tasks.length})
        </button>
      </div>

      {/* Lista Limpia de Cuadritos de Tareas */}
      <div className="p-4 space-y-2 bg-[#F4F9FF] min-h-[460px]">
        {filteredTasks.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <i className="fi fi-rr-inbox text-2xl text-[#B3D9FF]" />
            <p className="text-sm font-bold text-[#0B2559]">No hay actividades en esta pestaña</p>
            <p className="text-xs text-[#0B2559]/70">
              Cambia de pestaña arriba o haz clic en "Nueva Tarea" para registrar una actividad.
            </p>
          </div>
        ) : (
          filteredTasks.map(task => renderCollapsibleTaskBox(task))
        )}
      </div>
    </div>
  );
};
