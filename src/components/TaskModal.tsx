import React, { useState, useEffect } from 'react';
import { AppUser, TaskItem, TaskPriority, TaskStatus } from '../types';
import { cleanId } from '../firebase';

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
  const [assignedToCedula, setAssignedToCedula] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('17:00');
  const [notes, setNotes] = useState('');
  const [accessEmail, setAccessEmail] = useState('');
  const [accessPassword, setAccessPassword] = useState('');
  const [directLink, setDirectLink] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialTask) {
      setTitle(initialTask.title);
      setDescription(initialTask.description);
      setPriority(initialTask.priority);
      setStatus(initialTask.status);
      setProgress(initialTask.progress);
      setTags(initialTask.tags);
      setCategory(initialTask.category || 'Operaciones');
      setAssignedToCedula(initialTask.assignedToCedula);
      const dt = initialTask.dueDate ? new Date(initialTask.dueDate) : new Date(Date.now() + 24 * 3600 * 1000);
      setDueDate(dt.toISOString().split('T')[0]);
      setDueTime(dt.toTimeString().slice(0, 5));
      setNotes(initialTask.notes || '');
      setAccessEmail(initialTask.accessEmail || '');
      setAccessPassword(initialTask.accessPassword || '');
      setDirectLink(initialTask.directLink || '');
    } else {
      const tomorrow = new Date(Date.now() + 24 * 3600 * 1000);
      setTitle('');
      setDescription('');
      setPriority('alta');
      setStatus('pendiente');
      setProgress(0);
      setTags('Operativo, Entrega');
      setCategory('Operaciones');
      setAssignedToCedula(currentUser.cedula);
      setDueDate(tomorrow.toISOString().split('T')[0]);
      setDueTime('17:00');
      setNotes('');
      setAccessEmail('');
      setAccessPassword('');
      setDirectLink('');
    }
  }, [initialTask, isOpen, currentUser]);

  if (!isOpen) return null;

  const canSeeVault = currentUser.role === 'admin' || currentUser.canViewVault;

  const handleCopy = (val: string, label: string) => {
    navigator.clipboard.writeText(val);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 1800);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const assignedUser = users.find(u => u.cedula === assignedToCedula) || currentUser;
      const combinedDue = new Date(`${dueDate}T${dueTime || '17:00'}:00`).toISOString();
      const computedProgress = status === 'completada' ? 100 : progress;

      const taskObj: TaskItem = {
        id: initialTask?.id || cleanId(`task_${Date.now()}`),
        title: title.trim(),
        description: description.trim(),
        priority,
        status,
        progress: computedProgress,
        tags: tags.trim(),
        category: category.trim() || 'Operaciones',
        assignedToCedula: assignedUser.cedula,
        assignedToName: assignedUser.name,
        createdByCedula: initialTask?.createdByCedula || currentUser.cedula,
        createdByName: initialTask?.createdByName || currentUser.name,
        createdAt: initialTask?.createdAt || new Date().toISOString(),
        dueDate: combinedDue,
        completedAt: status === 'completada' ? (initialTask?.completedAt || new Date().toISOString()) : '',
        notes: notes.trim(),
        accessEmail: accessEmail.trim(),
        accessPassword: accessPassword.trim(),
        directLink: directLink.trim(),
      };

      await onSave(taskObj);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B2559]/70 p-4 overflow-y-auto">
      <div className="bg-white border border-[#B3D9FF] rounded-2xl w-full max-w-3xl overflow-hidden my-8 shadow-xl">
        {/* Cabecera del Modal con el nuevo logo FUN_BLANCO sobre fondo institucional */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#B3D9FF]/30 bg-[#0B2559] text-white">
          <div className="flex items-center gap-3">
            <img
              src={`${import.meta.env.BASE_URL}assets/aistudio/FUN_BLANCO_e68e4ad5`}
              alt="Logo Fundación ULEP"
              className="h-10 w-auto object-contain"
              referrerPolicy="no-referrer"
            />
            <div>
              <h2 className="text-base font-bold text-white">
                {initialTask ? 'Editar Registro de Actividad / Tarea' : 'Nueva Actividad con Asignación y Credenciales'}
              </h2>
              <p className="text-xs text-[#B3D9FF] mt-0.5 tabular-nums">
                {initialTask
                  ? `Registrado por: ${initialTask.createdByName} (${initialTask.createdByCedula}) · Fecha: ${new Date(initialTask.createdAt).toLocaleString('es-ES')}`
                  : `Autor actual: ${currentUser.name} (Cédula: ${currentUser.cedula}) · Fecha y hora automática`}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[#B3D9FF] hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <i className="fi fi-rr-cross text-sm" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-[#0B2559] mb-1">
                Título de la Tarea o Entrega *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ej. Conciliación mensual de pasarela o despliegue de servidor"
                className="w-full px-3.5 py-2 text-sm text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg focus:bg-white focus:outline-none focus:border-[#0B2559]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2559] mb-1">
                Categoría / Área
              </label>
              <input
                type="text"
                value={category}
                onChange={e => setCategory(e.target.value)}
                placeholder="Finanzas, TI, Auditoría..."
                className="w-full px-3.5 py-2 text-sm text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg focus:bg-white focus:outline-none focus:border-[#0B2559]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-[#F4F9FF] border border-[#B3D9FF]">
            <div>
              <label className="block text-xs font-semibold text-[#0B2559] mb-1">
                Prioridad
              </label>
              <select
                value={priority}
                onChange={e => setPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 text-sm text-[#0B2559] border border-[#B3D9FF] rounded-lg bg-white focus:outline-none focus:border-[#0B2559]"
              >
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
                <option value="critica">Crítica (Alerta Cierre)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2559] mb-1">
                Estado Actual
              </label>
              <select
                value={status}
                onChange={e => {
                  const val = e.target.value as TaskStatus;
                  setStatus(val);
                  if (val === 'completada') setProgress(100);
                  else if (val === 'pendiente' && progress === 100) setProgress(0);
                }}
                className="w-full px-3 py-2 text-sm text-[#0B2559] border border-[#B3D9FF] rounded-lg bg-white focus:outline-none focus:border-[#0B2559]"
              >
                <option value="pendiente">Pendiente</option>
                <option value="en_progreso">En Progreso</option>
                <option value="completada">Completada</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2559] mb-1 tabular-nums">
                Progreso ({status === 'completada' ? 100 : progress}%)
              </label>
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
                className="w-full mt-2 accent-[#0B2559]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2559] mb-1 flex items-center gap-1.5">
                <i className="fi fi-rr-user-check text-xs text-[#3B82F6]" /> Responsable Asignado
              </label>
              <select
                value={assignedToCedula}
                onChange={e => setAssignedToCedula(e.target.value)}
                className="w-full px-3 py-2 text-sm text-[#0B2559] border border-[#B3D9FF] rounded-lg bg-white focus:outline-none focus:border-[#0B2559]"
              >
                {users.map(u => (
                  <option key={u.cedula} value={u.cedula}>
                    {u.name} (C.C. {u.cedula})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#0B2559] mb-1 flex items-center gap-1.5">
                <i className="fi fi-rr-calendar text-xs text-[#3B82F6]" /> Fecha Límite de Cierre
              </label>
              <input
                type="date"
                required
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm text-[#0B2559] border border-[#B3D9FF] rounded-lg tabular-nums focus:outline-none focus:border-[#0B2559]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2559] mb-1">
                Hora Límite de Cierre
              </label>
              <input
                type="time"
                required
                value={dueTime}
                onChange={e => setDueTime(e.target.value)}
                className="w-full px-3 py-2 text-sm text-[#0B2559] border border-[#B3D9FF] rounded-lg tabular-nums focus:outline-none focus:border-[#0B2559]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2559] mb-1">
                Etiquetas Personalizadas (separadas por coma)
              </label>
              <input
                type="text"
                value={tags}
                onChange={e => setTags(e.target.value)}
                placeholder="Urgente, Servidor, Cliente-A"
                className="w-full px-3 py-2 text-sm text-[#0B2559] border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-[#0B2559] mb-1">
                Descripción de la Actividad
              </label>
              <textarea
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Detalla los objetivos y entregables requeridos..."
                className="w-full px-3.5 py-2 text-sm text-[#0B2559] border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#0B2559] mb-1">
                Notas Técnicas / Observaciones de Ejecución
              </label>
              <textarea
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Instrucciones paso a paso, advertencias o notas para el equipo..."
                className="w-full px-3.5 py-2 text-sm text-[#0B2559] border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
              />
            </div>
          </div>

          {/* Bóveda de Credenciales y Link Directo */}
          <div className="p-4 bg-[#F4F9FF] border border-[#B3D9FF] rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <i className="fi fi-rr-key text-sm text-[#3B82F6]" />
                <span className="text-xs font-bold text-[#0B2559]">
                  Credenciales de Acceso (Correos / Contraseñas) y Link Directo de la Tarea
                </span>
              </div>
              {!canSeeVault && (
                <span className="text-xs text-amber-800">
                  Tu perfil tiene restringida la visualización de claves por el Administrador
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-[#0B2559] mb-1">
                  Correo o Usuario de Acceso
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={accessEmail}
                    onChange={e => setAccessEmail(e.target.value)}
                    placeholder="admin@plataforma.com"
                    className="w-full px-3 py-1.5 text-xs font-mono text-[#0B2559] border border-[#B3D9FF] rounded-lg bg-white focus:outline-none focus:border-[#0B2559]"
                  />
                  {accessEmail && (
                    <button
                      type="button"
                      onClick={() => handleCopy(accessEmail, 'email')}
                      className="p-1.5 text-[#0B2559] hover:bg-[#B3D9FF] border border-[#B3D9FF] rounded-lg bg-white"
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
              </div>

              <div>
                <label className="block text-xs font-medium text-[#0B2559] mb-1">
                  Contraseña o Token si necesita
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type={showPass && canSeeVault ? 'text' : 'password'}
                    value={accessPassword}
                    onChange={e => setAccessPassword(e.target.value)}
                    disabled={!canSeeVault}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-1.5 text-xs font-mono text-[#0B2559] border border-[#B3D9FF] rounded-lg bg-white focus:outline-none focus:border-[#0B2559] disabled:bg-[#EAF3FF]"
                  />
                  {canSeeVault && (
                    <button
                      type="button"
                      onClick={() => setShowPass(!showPass)}
                      className="p-1.5 text-[#0B2559] hover:bg-[#B3D9FF] border border-[#B3D9FF] rounded-lg bg-white"
                      title="Mostrar / Ocultar contraseña"
                    >
                      <i className={`fi ${showPass ? 'fi-rr-eye-crossed' : 'fi-rr-eye'} text-xs`} />
                    </button>
                  )}
                  {canSeeVault && accessPassword && (
                    <button
                      type="button"
                      onClick={() => handleCopy(accessPassword, 'pass')}
                      className="p-1.5 text-[#0B2559] hover:bg-[#B3D9FF] border border-[#B3D9FF] rounded-lg bg-white"
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
              </div>

              <div>
                <label className="block text-xs font-medium text-[#0B2559] mb-1">
                  Link Directo para Entrar a la Tarea
                </label>
                <div className="flex items-center gap-1">
                  <input
                    type="url"
                    value={directLink}
                    onChange={e => setDirectLink(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-1.5 text-xs font-mono text-[#0B2559] border border-[#B3D9FF] rounded-lg bg-white focus:outline-none focus:border-[#0B2559]"
                  />
                  {directLink && (
                    <a
                      href={directLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 text-[#0B2559] hover:bg-[#B3D9FF] border border-[#B3D9FF] rounded-lg bg-white shrink-0"
                      title="Abrir enlace directo"
                    >
                      <i className="fi fi-rr-arrow-up-right-from-square text-xs" />
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#D6EAFF]">
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
              {saving ? 'Guardando en Tiempo Real...' : initialTask ? 'Guardar Cambios de Tarea' : 'Registrar y Sincronizar Tarea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
