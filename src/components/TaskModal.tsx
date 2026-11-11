import React, { useState, useEffect } from 'react';
import { AppUser, TaskItem, TaskPriority, TaskStatus } from '../types';
import { cleanId } from '../firebase';
import { CollapsibleField } from './CollapsibleField';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: TaskItem) => Promise<void>;
  initialTask?: TaskItem | null;
  users: AppUser[];
  currentUser: AppUser;
}

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialTask,
  users,
  currentUser,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('alta');
  const [status, setStatus] = useState<TaskStatus>('pendiente');
  const [progress, setProgress] = useState(0);
  const [tags, setTags] = useState('');
  const [category, setCategory] = useState('Operaciones');
  const [assignedToCedulas, setAssignedToCedulas] = useState<string[]>([]);
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('17:00');
  const [notes, setNotes] = useState('');
  const [accessEmail, setAccessEmail] = useState('');
  const [accessPassword, setAccessPassword] = useState('');
  const [directLink, setDirectLink] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeScreen, setActiveScreen] = useState<'main' | 'details' | 'vault'>('main');
  const [expandAllFields, setExpandAllFields] = useState<boolean | undefined>(undefined);

  const DRAFT_STORAGE_KEY = 'ulep_new_task_draft_v1';

  useEffect(() => {
    if (!isOpen) return;

    if (initialTask) {
      setTitle(initialTask.title);
      setDescription(initialTask.description);
      setPriority(initialTask.priority);
      setStatus(initialTask.status);
      setProgress(initialTask.progress);
      setTags(initialTask.tags);
      setCategory(initialTask.category || 'Operaciones');
      setAssignedToCedulas([initialTask.assignedToCedula || currentUser.cedula]);
      const dt = initialTask.dueDate ? new Date(initialTask.dueDate) : new Date(Date.now() + 24 * 3600 * 1000);
      setDueDate(dt.toISOString().split('T')[0]);
      setDueTime(dt.toTimeString().slice(0, 5));
      setNotes(initialTask.notes || '');
      setAccessEmail(initialTask.accessEmail || '');
      setAccessPassword(initialTask.accessPassword || '');
      setDirectLink(initialTask.directLink || '');
    } else {
      const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
      try {
        const savedDraft = sessionStorage.getItem(DRAFT_STORAGE_KEY);
        if (savedDraft) {
          const parsed = JSON.parse(savedDraft);
          setTitle(parsed.title ?? '');
          setDescription(parsed.description ?? '');
          setPriority(parsed.priority ?? 'alta');
          setStatus(parsed.status ?? 'pendiente');
          setProgress(parsed.progress ?? 0);
          setTags(parsed.tags ?? 'Operativo, Entrega');
          setCategory(parsed.category ?? 'Operaciones');
          if (Array.isArray(parsed.assignedToCedulas) && parsed.assignedToCedulas.length > 0) {
            setAssignedToCedulas(parsed.assignedToCedulas);
          } else if (parsed.assignedToCedula) {
            setAssignedToCedulas([parsed.assignedToCedula]);
          } else {
            setAssignedToCedulas([currentUser.cedula]);
          }
          setDueDate(parsed.dueDate || tomorrow.toISOString().split('T')[0]);
          setDueTime(parsed.dueTime || '17:00');
          setNotes(parsed.notes ?? '');
          setAccessEmail(parsed.accessEmail ?? '');
          setAccessPassword(parsed.accessPassword ?? '');
          setDirectLink(parsed.directLink ?? '');
        } else {
          setTitle('');
          setDescription('');
          setPriority('alta');
          setStatus('pendiente');
          setProgress(0);
          setTags('Operativo, Entrega');
          setCategory('Operaciones');
          setAssignedToCedulas([currentUser.cedula]);
          setDueDate(tomorrow.toISOString().split('T')[0]);
          setDueTime('17:00');
          setNotes('');
          setAccessEmail('');
          setAccessPassword('');
          setDirectLink('');
        }
      } catch {
        setTitle('');
        setDescription('');
        setPriority('alta');
        setStatus('pendiente');
        setProgress(0);
        setTags('Operativo, Entrega');
        setCategory('Operaciones');
        setAssignedToCedulas([currentUser.cedula]);
        setDueDate(tomorrow.toISOString().split('T')[0]);
        setDueTime('17:00');
        setNotes('');
        setAccessEmail('');
        setAccessPassword('');
        setDirectLink('');
      }
    }
    setActiveScreen('main');
    setExpandAllFields(undefined);
    // Solo se inicializa al abrir el modal o cambiar de tarea a editar; NUNCA se reinicia por actualizaciones en segundo plano
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialTask?.id]);

  // Guardar borrador automático mientras se escribe una nueva tarea para que nunca se borre la información
  useEffect(() => {
    if (!isOpen || initialTask) return;
    try {
      sessionStorage.setItem(
        DRAFT_STORAGE_KEY,
        JSON.stringify({
          title,
          description,
          priority,
          status,
          progress,
          tags,
          category,
          assignedToCedulas,
          dueDate,
          dueTime,
          notes,
          accessEmail,
          accessPassword,
          directLink,
        })
      );
    } catch {
      // ignore storage quota errors
    }
  }, [
    isOpen,
    initialTask,
    title,
    description,
    priority,
    status,
    progress,
    tags,
    category,
    assignedToCedulas,
    dueDate,
    dueTime,
    notes,
    accessEmail,
    accessPassword,
    directLink,
  ]);

  if (!isOpen) return null;

  const canSeeVault = currentUser.role === 'admin' || currentUser.canViewVault;

  const handleCopy = (val: string, label: string) => {
    navigator.clipboard.writeText(val);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 1800);
  };

  const toggleUserAssignee = (targetCedula: string) => {
    if (targetCedula === 'ABIERTA') {
      setAssignedToCedulas(['ABIERTA']);
      return;
    }
    setAssignedToCedulas(prev => {
      const withoutOpen = prev.filter(c => c !== 'ABIERTA');
      if (withoutOpen.includes(targetCedula)) {
        return withoutOpen.filter(c => c !== targetCedula);
      }
      return [...withoutOpen, targetCedula];
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setActiveScreen('main');
      return;
    }
    setSaving(true);
    try {
      const effectiveCedulas =
        assignedToCedulas.length > 0 ? assignedToCedulas : [currentUser.cedula];
      const combinedDue = new Date(`${dueDate}T${dueTime || '17:00'}:00`).toISOString();
      const computedProgress = status === 'completada' ? 100 : progress;
      const nowIso = new Date().toISOString();

      const orderedCedulas =
        initialTask && effectiveCedulas.includes(initialTask.assignedToCedula)
          ? [
              initialTask.assignedToCedula,
              ...effectiveCedulas.filter(c => c !== initialTask.assignedToCedula),
            ]
          : effectiveCedulas;

      for (let i = 0; i < orderedCedulas.length; i++) {
        const targetCedula = orderedCedulas[i];
        const isOpenTask = targetCedula === 'ABIERTA';
        const assignedUser = isOpenTask
          ? null
          : users.find(u => u.cedula === targetCedula) || currentUser;

        const taskId =
          i === 0 && initialTask?.id
            ? initialTask.id
            : cleanId(`task_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`);

        const taskObj: TaskItem = {
          id: taskId,
          title: title.trim(),
          description: description.trim(),
          priority,
          status,
          progress: computedProgress,
          tags: tags.trim(),
          category: category.trim() || 'Operaciones',
          assignedToCedula: isOpenTask ? 'ABIERTA' : assignedUser!.cedula,
          assignedToName: isOpenTask
            ? 'Abierta (Cualquiera puede realizarla)'
            : assignedUser!.name,
          createdByCedula: initialTask?.createdByCedula || currentUser.cedula,
          createdByName: initialTask?.createdByName || currentUser.name,
          createdAt: i === 0 && initialTask?.createdAt ? initialTask.createdAt : nowIso,
          dueDate: combinedDue,
          completedAt:
            status === 'completada'
              ? (i === 0 && initialTask?.completedAt) || nowIso
              : '',
          notes: notes.trim(),
          accessEmail: accessEmail.trim(),
          accessPassword: accessPassword.trim(),
          directLink: directLink.trim(),
        };

        await onSave(taskObj);
      }

      try {
        sessionStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch {
        // ignore
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const assignedLabel =
    assignedToCedulas.includes('ABIERTA')
      ? 'ABIERTA (Cualquiera)'
      : assignedToCedulas.length === 0
      ? currentUser.name
      : assignedToCedulas
          .map(
            ced =>
              (ced === currentUser.cedula
                ? currentUser.name
                : users.find(u => u.cedula === ced)?.name) || ced
          )
          .join(', ');

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#0B2559]/70 sm:p-4 overflow-y-auto">
      <div className="bg-white border-t-2 sm:border border-[#B3D9FF] rounded-t-3xl sm:rounded-2xl w-full max-w-3xl max-h-[94vh] sm:max-h-none flex flex-col overflow-hidden sm:my-8 shadow-xl">
        {/* Barra de arrastre para Teléfono */}
        <div className="sm:hidden pt-2 pb-1 bg-[#0B2559] flex justify-center">
          <div className="w-10 h-1.5 rounded-full bg-[#B3D9FF]/50" />
        </div>

        {/* Cabecera del Modal */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 border-b border-[#B3D9FF]/30 bg-[#0B2559] text-white shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={`${import.meta.env.BASE_URL}assets/aistudio/FUN_BLANCO_e68e4ad5`}
              alt="Logo Fundación ULEP"
              className="h-8 sm:h-10 w-auto object-contain shrink-0"
              referrerPolicy="no-referrer"
            />
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold text-white truncate">
                {initialTask ? 'Editar Registro de Actividad / Tarea' : 'Nueva Actividad con Asignación y Credenciales'}
              </h2>
              <p className="hidden sm:block text-xs text-[#B3D9FF] mt-0.5 tabular-nums truncate">
                Haz clic en la frase principal de cada campo para desplegar su cuadro de llenado.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setExpandAllFields(prev => !prev)}
              className="px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-[#B3D9FF] hover:text-white text-[11px] font-bold flex items-center gap-1.5 transition-colors"
              title="Desplegar o minimizar todos los campos"
            >
              <i className={`fi ${expandAllFields ? 'fi-rr-compress-alt' : 'fi-rr-expand-arrows-alt'} text-xs`} />
              <span className="hidden sm:inline">{expandAllFields ? 'Minimizar' : 'Desplegar Todo'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 sm:w-8 sm:h-8 flex items-center justify-center text-[#B3D9FF] hover:text-white rounded-lg hover:bg-white/10 transition-colors shrink-0"
            >
              <i className="fi fi-rr-cross text-sm" />
            </button>
          </div>
        </div>

        {/* Barra de Pantallas del Modal */}
        <div className="bg-[#F4F9FF] border-b border-[#D6EAFF] px-4 py-2 flex items-center gap-1.5 overflow-x-auto shrink-0">
          {[
            { id: 'main' as const, label: 'Pantalla 1: Datos y Encargado', icon: 'fi-rr-list-check' },
            { id: 'details' as const, label: 'Pantalla 2: Descripción y Notas', icon: 'fi-rr-document' },
            { id: 'vault' as const, label: 'Pantalla 3: Claves y Link Directo', icon: 'fi-rr-key' },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveScreen(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${
                activeScreen === tab.id
                  ? 'bg-[#0B2559] text-white shadow-2xs'
                  : 'bg-white text-[#0B2559] border border-[#B3D9FF] hover:bg-[#EAF3FF]'
              }`}
            >
              <i className={`fi ${tab.icon} text-xs`} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-3.5 overflow-y-auto flex-1 max-h-[78vh]">
          {activeScreen === 'main' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <CollapsibleField
                label="Título de la Tarea o Entrega"
                valuePreview={title}
                required
                defaultOpen={!initialTask}
                forceOpen={expandAllFields}
                icon="fi-rr-edit"
                className="sm:col-span-2"
              >
                <input
                  type="text"
                  required
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Ej. Conciliación mensual de pasarela o despliegue de servidor"
                  className="w-full px-3.5 py-2 text-xs text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg focus:bg-white focus:outline-none focus:border-[#0B2559]"
                />
              </CollapsibleField>

              <CollapsibleField
                label="Encargado / Asignación"
                valuePreview={assignedLabel}
                required
                icon="fi-rr-user-check"
                forceOpen={expandAllFields}
                className="sm:col-span-2"
              >
                <div className="space-y-2">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() =>
                        setAssignedToCedulas(prev =>
                          prev.includes('ABIERTA') ? [currentUser.cedula] : ['ABIERTA']
                        )
                      }
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-md border transition-colors ${
                        assignedToCedulas.includes('ABIERTA')
                          ? 'bg-emerald-600 text-white border-emerald-600'
                          : 'bg-[#F4F9FF] text-[#0B2559] border-[#B3D9FF] hover:bg-[#B3D9FF]'
                      }`}
                    >
                      {assignedToCedulas.includes('ABIERTA') ? '✓ Abierta a todos' : 'Dejar Abierta'}
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-[#B3D9FF] rounded-lg bg-white divide-y divide-[#F4F9FF]">
                    <button
                      type="button"
                      onClick={() => toggleUserAssignee('ABIERTA')}
                      className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2.5 transition-colors ${
                        assignedToCedulas.includes('ABIERTA')
                          ? 'bg-[#EAF3FF] text-[#0B2559] font-bold'
                          : 'text-[#0B2559] hover:bg-[#F4F9FF] font-medium'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                          assignedToCedulas.includes('ABIERTA')
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
                      onClick={() => toggleUserAssignee(currentUser.cedula)}
                      className={`w-full px-3 py-2 text-left text-xs flex items-center gap-2.5 transition-colors ${
                        assignedToCedulas.includes(currentUser.cedula)
                          ? 'bg-[#EAF3FF] text-[#0B2559] font-bold'
                          : 'text-[#0B2559] hover:bg-[#F4F9FF] font-medium'
                      }`}
                    >
                      <span
                        className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                          assignedToCedulas.includes(currentUser.cedula)
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
                        const isSelected = assignedToCedulas.includes(u.cedula);
                        return (
                          <button
                            key={u.cedula}
                            type="button"
                            onClick={() => toggleUserAssignee(u.cedula)}
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
                              👥 {u.name} (C.C. {u.cedula}) — {u.department || 'General'}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                </div>
              </CollapsibleField>

              <CollapsibleField
                label="Prioridad"
                valuePreview={priority.toUpperCase()}
                icon="fi-rr-flag"
                forceOpen={expandAllFields}
              >
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value as TaskPriority)}
                  className="w-full px-3 py-2 text-xs text-[#0B2559] border border-[#B3D9FF] rounded-lg bg-white focus:outline-none focus:border-[#0B2559]"
                >
                  <option value="baja">Baja</option>
                  <option value="media">Media</option>
                  <option value="alta">Alta</option>
                  <option value="critica">Crítica (Alerta Cierre)</option>
                </select>
              </CollapsibleField>

              <CollapsibleField
                label="Estado y Progreso"
                valuePreview={`${status.replace('_', ' ').toUpperCase()} (${status === 'completada' ? 100 : progress}%)`}
                icon="fi-rr-chart-pie-alt"
                forceOpen={expandAllFields}
              >
                <div className="space-y-2">
                  <select
                    value={status}
                    onChange={e => {
                      const val = e.target.value as TaskStatus;
                      setStatus(val);
                      if (val === 'completada') setProgress(100);
                      else if (val === 'pendiente' && progress === 100) setProgress(0);
                    }}
                    className="w-full px-3 py-2 text-xs text-[#0B2559] border border-[#B3D9FF] rounded-lg bg-white focus:outline-none focus:border-[#0B2559]"
                  >
                    <option value="pendiente">Pendiente</option>
                    <option value="en_progreso">En Progreso</option>
                    <option value="completada">Completada</option>
                  </select>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={status === 'completada' ? 100 : progress}
                      onChange={e => {
                        const val = Number(e.target.value);
                        setProgress(val);
                        if (val === 100) setStatus('completada');
                        else if (val > 0) setStatus('en_progreso');
                        else setStatus('pendiente');
                      }}
                      className="flex-1 accent-[#0B2559]"
                    />
                    <span className="text-xs font-mono font-bold text-[#0B2559]">
                      {status === 'completada' ? 100 : progress}%
                    </span>
                  </div>
                </div>
              </CollapsibleField>

              <CollapsibleField
                label="Fecha Límite de Cierre"
                valuePreview={dueDate}
                required
                icon="fi-rr-calendar"
                forceOpen={expandAllFields}
              >
                <input
                  type="date"
                  required
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs text-[#0B2559] border border-[#B3D9FF] rounded-lg tabular-nums focus:outline-none focus:border-[#0B2559]"
                />
              </CollapsibleField>

              <CollapsibleField
                label="Hora Límite de Cierre"
                valuePreview={dueTime}
                required
                icon="fi-rr-clock"
                forceOpen={expandAllFields}
              >
                <input
                  type="time"
                  required
                  value={dueTime}
                  onChange={e => setDueTime(e.target.value)}
                  className="w-full px-3 py-2 text-xs text-[#0B2559] border border-[#B3D9FF] rounded-lg tabular-nums focus:outline-none focus:border-[#0B2559]"
                />
              </CollapsibleField>

              <CollapsibleField
                label="Categoría / Área"
                valuePreview={category}
                icon="fi-rr-folder"
                forceOpen={expandAllFields}
              >
                <input
                  type="text"
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  placeholder="Finanzas, TI, Auditoría..."
                  className="w-full px-3 py-2 text-xs text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg focus:bg-white focus:outline-none focus:border-[#0B2559]"
                />
              </CollapsibleField>

              <CollapsibleField
                label="Etiquetas Personalizadas"
                valuePreview={tags}
                icon="fi-rr-tags"
                forceOpen={expandAllFields}
              >
                <input
                  type="text"
                  value={tags}
                  onChange={e => setTags(e.target.value)}
                  placeholder="Urgente, Servidor, Cliente-A"
                  className="w-full px-3 py-2 text-xs text-[#0B2559] border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                />
              </CollapsibleField>
            </div>
          )}

          {activeScreen === 'details' && (
            <div className="space-y-2.5">
              <CollapsibleField
                label="Descripción de la Actividad"
                valuePreview={description}
                defaultOpen
                forceOpen={expandAllFields}
                icon="fi-rr-align-left"
              >
                <textarea
                  rows={3}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Detalla los objetivos y entregables requeridos..."
                  className="w-full px-3 py-2 text-xs text-[#0B2559] border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                />
              </CollapsibleField>

              <CollapsibleField
                label="Notas Técnicas / Observaciones"
                valuePreview={notes}
                forceOpen={expandAllFields}
                icon="fi-rr-comment-alt"
              >
                <textarea
                  rows={3}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Instrucciones paso a paso, advertencias o notas para el equipo..."
                  className="w-full px-3 py-2 text-xs text-[#0B2559] border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                />
              </CollapsibleField>
            </div>
          )}

          {activeScreen === 'vault' && (
            <div className="space-y-2.5">
              {!canSeeVault && (
                <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
                  Tu perfil tiene restringida la visualización de claves por el Administrador.
                </div>
              )}

              <CollapsibleField
                label="Correo o Usuario de Acceso"
                valuePreview={accessEmail}
                forceOpen={expandAllFields}
                icon="fi-rr-envelope"
              >
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={accessEmail}
                    onChange={e => setAccessEmail(e.target.value)}
                    placeholder="admin@plataforma.com"
                    className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] border border-[#B3D9FF] rounded-lg bg-white focus:outline-none focus:border-[#0B2559]"
                  />
                  {accessEmail && (
                    <button
                      type="button"
                      onClick={() => handleCopy(accessEmail, 'email')}
                      className="p-2 text-[#0B2559] hover:bg-[#B3D9FF] border border-[#B3D9FF] rounded-lg bg-white"
                      title="Copiar correo"
                    >
                      {copiedField === 'email' ? (
                        <i className="fi fi-rr-check text-xs text-emerald-600" />
                      ) : (
                        <i className="fi fi-rr-copy text-xs" />
                      )}
                    </button>
                  )}
                </div>
              </CollapsibleField>

              <CollapsibleField
                label="Contraseña o Token"
                valuePreview={accessPassword}
                isSecret={!showPass}
                forceOpen={expandAllFields}
                icon="fi-rr-key"
              >
                <div className="flex items-center gap-1">
                  <input
                    type={showPass && canSeeVault ? 'text' : 'password'}
                    value={accessPassword}
                    onChange={e => setAccessPassword(e.target.value)}
                    disabled={!canSeeVault}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] border border-[#B3D9FF] rounded-lg bg-white focus:outline-none focus:border-[#0B2559] disabled:bg-[#EAF3FF]"
                  />
                  {canSeeVault && (
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="p-2 text-[#0B2559] hover:bg-[#B3D9FF] border border-[#B3D9FF] rounded-lg bg-white"
                      title="Mostrar / Ocultar contraseña"
                    >
                      <i className={`fi ${showPass ? 'fi-rr-eye-crossed' : 'fi-rr-eye'} text-xs`} />
                    </button>
                  )}
                  {canSeeVault && accessPassword && (
                    <button
                      type="button"
                      onClick={() => handleCopy(accessPassword, 'pass')}
                      className="p-2 text-[#0B2559] hover:bg-[#B3D9FF] border border-[#B3D9FF] rounded-lg bg-white"
                      title="Copiar contraseña"
                    >
                      {copiedField === 'pass' ? (
                        <i className="fi fi-rr-check text-xs text-emerald-600" />
                      ) : (
                        <i className="fi fi-rr-copy text-xs" />
                      )}
                    </button>
                  )}
                </div>
              </CollapsibleField>

              <CollapsibleField
                label="Link Directo de la Tarea"
                valuePreview={directLink}
                forceOpen={expandAllFields}
                icon="fi-rr-link"
              >
                <div className="flex items-center gap-1">
                  <input
                    type="url"
                    value={directLink}
                    onChange={e => setDirectLink(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 text-xs font-mono text-[#0B2559] border border-[#B3D9FF] rounded-lg bg-white focus:outline-none focus:border-[#0B2559]"
                  />
                  {directLink && (
                    <a
                      href={directLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-[#0B2559] hover:bg-[#B3D9FF] border border-[#B3D9FF] rounded-lg bg-white shrink-0"
                      title="Abrir enlace directo"
                    >
                      <i className="fi fi-rr-arrow-up-right-from-square text-xs" />
                    </a>
                  )}
                </div>
              </CollapsibleField>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-3 border-t border-[#D6EAFF]">
            <div className="flex items-center gap-1.5">
              {activeScreen !== 'main' && (
                <button
                  type="button"
                  onClick={() =>
                    setActiveScreen(prev => (prev === 'vault' ? 'details' : 'main'))
                  }
                  className="px-3 py-1.5 text-xs font-bold text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg hover:bg-[#EAF3FF]"
                >
                  ← Anterior
                </button>
              )}
              {activeScreen !== 'vault' && (
                <button
                  type="button"
                  onClick={() =>
                    setActiveScreen(prev => (prev === 'main' ? 'details' : 'vault'))
                  }
                  className="px-3 py-1.5 text-xs font-bold text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg hover:bg-[#EAF3FF]"
                >
                  Siguiente Pantalla →
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg hover:bg-[#EAF3FF] transition-colors whitespace-nowrap shrink-0"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-lg hover:bg-[#99CCFF] transition-colors whitespace-nowrap shrink-0 disabled:opacity-50 shadow-2xs"
              >
                {saving ? 'Guardando...' : initialTask ? 'Guardar Cambios' : 'Registrar Tarea'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
