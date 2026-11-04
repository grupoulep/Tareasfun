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
  restoreDatabaseFromBackupJSON
} from '../utils/pdfAndBackup';

interface AdminViewsProps {
  activeSection: 'admin_users' | 'admin_records' | 'admin_audit' | 'admin_backup';
  currentUser: AppUser;
  users: AppUser[];
  tasks: TaskItem[];
  auditLogs: AuditLog[];
  chatMessages: ChatMessage[];
  calendarEvents: CalendarEvent[];
  onOpenNewTask: () => void;
  onEditTask: (task: TaskItem) => void;
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
}) => {
  const [showCreateUserForm, setShowCreateUserForm] = useState(false);
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
  const [editingCedula, setEditingCedula] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');

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

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cedula.trim() || !name.trim() || !password.trim()) return;

    const existing = users.find(u => u.cedula === cedula.trim());
    const newUser: AppUser = {
      cedula: cedula.trim(),
      name: name.trim(),
      password: password.trim(),
      role,
      email: email.trim() || `${cedula.trim()}@fundacionulep.org`,
      department: department.trim() || 'Operaciones',
      isOnline: existing ? existing.isOnline : false,
      lastSeen: existing ? existing.lastSeen : new Date().toISOString(),
      canCreateTasks: existing ? existing.canCreateTasks : true,
      canEditTasks: existing ? existing.canEditTasks : true,
      canDeleteTasks: existing ? existing.canDeleteTasks : role === 'admin',
      canSendChat: existing ? existing.canSendChat : true,
      canViewVault: existing ? existing.canViewVault : true,
      canExportReports: existing ? existing.canExportReports : true,
      createdAt: existing ? existing.createdAt : new Date().toISOString(),
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

    setCedula('');
    setName('');
    setPassword('');
    setRole('user');
    setEmail('');
    setDepartment('Operaciones');
    setEditingCedula(null);
    setShowCreateUserForm(false);
  };

  const handleSelectEditUser = (u: AppUser) => {
    setEditingCedula(u.cedula);
    setCedula(u.cedula);
    setName(u.name);
    setPassword(u.password);
    setRole(u.role);
    setEmail(u.email);
    setDepartment(u.department);
    setShowCreateUserForm(true);
  };

  const handleTogglePermission = async (
    targetUser: AppUser,
    permKey: 'canCreateTasks' | 'canEditTasks' | 'canDeleteTasks' | 'canSendChat' | 'canViewVault' | 'canExportReports',
    permLabel: string
  ) => {
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
    if (target.cedula === currentUser.cedula) return;
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

  // 1. SECCIÓN: CREAR USUARIOS Y MATRIZ DE PERMISOS CON PALETA ULEP (#B3D9FF, #FFFFFF y #0B2559)
  if (activeSection === 'admin_users') {
    const filteredUsers = users.filter(
      u =>
        u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.cedula.toLowerCase().includes(userSearch.toLowerCase()) ||
        u.department.toLowerCase().includes(userSearch.toLowerCase())
    );

    return (
      <div className="space-y-4">
        {/* Cuadro Desplegable para Crear / Editar Usuario */}
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
                  ? `Editando Usuario Cédula ${editingCedula}`
                  : 'Crear Nuevo Usuario con Cédula y Contraseña'}
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
              <form onSubmit={handleSaveUser} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
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
                  <input
                    type="text"
                    value={department}
                    onChange={e => setDepartment(e.target.value)}
                    placeholder="Operaciones, Auditoría..."
                    className="w-full px-3 py-2 text-xs text-[#0B2559] bg-white border border-[#B3D9FF] rounded-lg focus:outline-none focus:border-[#0B2559]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#0B2559] mb-1">Rol de Panel</label>
                  <div className="flex items-center gap-2">
                    <select
                      value={role}
                      onChange={e => setRole(e.target.value as 'admin' | 'user')}
                      className="w-full px-2.5 py-2 text-xs text-[#0B2559] border border-[#B3D9FF] rounded-lg bg-white focus:outline-none focus:border-[#0B2559]"
                    >
                      <option value="user">Panel Usuario</option>
                      <option value="admin">Panel Admin</option>
                    </select>
                    <button
                      type="submit"
                      className="px-4 py-2 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-lg hover:bg-[#99CCFF] transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5"
                    >
                      <i className="fi fi-rr-check text-xs" />
                      {editingCedula ? 'Guardar' : 'Crear'}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}
        </section>

        {/* Lista de Usuarios */}
        <section className="bg-white border border-[#B3D9FF] rounded-xl p-5 space-y-4 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#D6EAFF]">
            <div>
              <h3 className="text-sm font-bold text-[#0B2559] flex items-center gap-2">
                <i className="fi fi-rr-users-alt text-sm text-[#3B82F6]" />
                Usuarios Registrados ({filteredUsers.length}) · Haz clic en la flecha para ver permisos y acciones
              </h3>
            </div>
            <div className="relative w-full sm:w-72">
              <i className="fi fi-rr-search text-xs text-[#3B82F6] absolute left-3 top-2.5" />
              <input
                type="text"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="Buscar usuario o cédula..."
                className="w-full pl-9 pr-3 py-1.5 text-xs text-[#0B2559] bg-[#F4F9FF] border border-[#B3D9FF] rounded-lg focus:bg-white focus:outline-none focus:border-[#0B2559]"
              />
            </div>
          </div>

          <div className="space-y-2">
            {filteredUsers.map(u => {
              const isExpanded = Boolean(expandedUserIds[u.cedula]);
              const isAdmin = u.role === 'admin';
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
                    className="flex items-center justify-between gap-3 px-4 py-3 cursor-pointer hover:bg-[#F4F9FF] transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          u.isOnline ? 'bg-emerald-500' : 'bg-[#B3D9FF]'
                        }`}
                      />
                      <span className="text-sm font-bold text-[#0B2559] truncate">
                        {u.name}
                      </span>
                      <span className="text-[#B3D9FF]">·</span>
                      <span className="text-xs font-semibold text-[#3B82F6] shrink-0">
                        {isAdmin ? 'Admin' : u.department}
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
                      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-[#B3D9FF]">
                        <div className="flex flex-wrap items-center gap-4">
                          <div>
                            <span className="text-[#3B82F6]">Cédula: </span>
                            <strong className="font-mono text-[#0B2559]">{u.cedula}</strong>
                          </div>
                          <div>
                            <span className="text-[#3B82F6]">Contraseña: </span>
                            <strong className="font-mono text-[#0B2559]">{u.password}</strong>
                          </div>
                          <div>
                            <span className="text-[#3B82F6]">Rol: </span>
                            <strong className="uppercase text-[#0B2559]">{u.role}</strong>
                          </div>
                          <div>
                            <span className="text-[#3B82F6]">Área: </span>
                            <strong className="text-[#0B2559]">{u.department}</strong>
                          </div>
                          <div>
                            <span className="text-[#3B82F6]">Presencia: </span>
                            <strong className={u.isOnline ? 'text-emerald-700' : 'text-[#0B2559]/70'}>
                              {u.isOnline ? 'En línea ahora' : `Últ. vez ${new Date(u.lastSeen).toLocaleTimeString('es-ES')}`}
                            </strong>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleSelectEditUser(u)}
                            className="px-2.5 py-1.5 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] hover:bg-[#99CCFF] rounded-lg flex items-center gap-1 transition-colors"
                          >
                            <i className="fi fi-rr-edit text-xs" /> Editar Usuario
                          </button>
                          {u.cedula !== currentUser.cedula && (
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

                      <div>
                        <div className="text-[11px] font-bold text-[#0B2559] mb-2">
                          Permisos de Acciones del Usuario (Clic para permitir o quitar permiso):
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
                Selecciona un archivo de respaldo o plantilla `.json` para restaurar registros directamente en Firebase Firestore.
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

      {/* 3. Descargar Plantilla de Base de Datos */}
      <div className="bg-white border border-[#B3D9FF] rounded-xl overflow-hidden shadow-2xs">
        <div
          onClick={() => toggleBackupCard('backup_template')}
          className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-[#F4F9FF] transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-[#B3D9FF] text-[#0B2559] flex items-center justify-center shrink-0">
              <i className="fi fi-rr-file-code text-sm" />
            </span>
            <span className="text-sm font-bold text-[#0B2559]">
              3. Descargar Plantilla Oficial de la Base de Datos (.JSON)
            </span>
          </div>
          <button
            type="button"
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              expandedBackupCards.backup_template ? 'bg-[#0B2559] text-white' : 'bg-[#EAF3FF] text-[#0B2559]'
            }`}
          >
            <i
              className={`fi ${
                expandedBackupCards.backup_template ? 'fi-rr-angle-small-up' : 'fi-rr-angle-small-down'
              } text-base`}
            />
          </button>
        </div>
        {expandedBackupCards.backup_template && (
          <div className="p-5 border-t border-[#D6EAFF] bg-[#F4F9FF] space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <p className="text-xs text-[#0B2559]">
                Descarga la plantilla con la estructura oficial de usuarios, permisos booleanos y tareas con credenciales.
              </p>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="px-4 py-2 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-lg hover:bg-[#99CCFF] flex items-center gap-2 shrink-0 transition-colors"
              >
                <i className="fi fi-rr-download text-xs" /> Descargar Plantilla (.JSON)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 4. Códigos para Despliegue en GitHub (GitHub Pages & Actions) */}
      <div className="bg-white border border-[#B3D9FF] rounded-xl overflow-hidden shadow-2xs">
        <div
          onClick={() => toggleBackupCard('github_deploy')}
          className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-[#F4F9FF] transition-colors"
        >
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-lg bg-[#0B2559] text-[#B3D9FF] flex items-center justify-center shrink-0">
              <i className="fi fi-rr-code-branch text-sm" />
            </span>
            <div>
              <span className="text-sm font-bold text-[#0B2559] block">
                4. Códigos para Despliegue en GitHub (GitHub Pages & GitHub Actions)
              </span>
              <span className="text-[11px] text-[#3B82F6]">
                Comandos de terminal Git, archivo .github/workflows/deploy.yml y configuración lista para producción
              </span>
            </div>
          </div>
          <button
            type="button"
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
              expandedBackupCards.github_deploy ? 'bg-[#0B2559] text-white' : 'bg-[#EAF3FF] text-[#0B2559]'
            }`}
          >
            <i
              className={`fi ${
                expandedBackupCards.github_deploy ? 'fi-rr-angle-small-up' : 'fi-rr-angle-small-down'
              } text-base`}
            />
          </button>
        </div>

        {expandedBackupCards.github_deploy && (() => {
          const gitCommandsCode = `# 1. Inicializar repositorio Git en la carpeta del proyecto
git init

# 2. Agregar todos los archivos del sistema Fundación ULEP
git add .

# 3. Crear el primer commit
git commit -m "Despliegue inicial plataforma Fundación ULEP"

# 4. Definir la rama principal como main
git branch -M main

# 5. Vincular con tu repositorio en GitHub (reemplaza USUARIO y REPOSITORIO)
git remote add origin https://github.com/USUARIO/REPOSITORIO.git

# 6. Subir el código a GitHub (activará el despliegue automático)
git push -u origin main`;

          const githubWorkflowYaml = `name: Desplegar Fundación ULEP en GitHub Pages

on:
  push:
    branches:
      - main
      - master
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Descargar código del repositorio (Checkout)
        uses: actions/checkout@v4

      - name: Configurar Node.js 22
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Instalar dependencias (evitando conflicto ERESOLVE)
        run: npm install --legacy-peer-deps

      - name: Compilar aplicación para producción
        run: npm run build

      - name: Configurar GitHub Pages
        uses: actions/configure-pages@v5

      - name: Subir artefacto compilado (carpeta dist)
        uses: actions/upload-pages-artifact@v3
        with:
          path: './dist'

  deploy:
    environment:
      name: github-pages
      url: \${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Desplegar en GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4`;

          const ghPagesManualCode = `# Opción alternativa: Despliegue directo con paquete gh-pages
npm install -D gh-pages --legacy-peer-deps

# Agrega estos scripts en tu package.json:
# "predeploy": "npm run build",
# "deploy": "gh-pages -d dist"

# Ejecutar despliegue directo a la rama gh-pages:
npm run deploy`;

          const handleCopyCode = (code: string, key: string) => {
            navigator.clipboard.writeText(code);
            setCopiedCodeKey(key);
            setTimeout(() => setCopiedCodeKey(null), 2000);
          };

          const handleDownloadWorkflowYaml = () => {
            const blob = new Blob([githubWorkflowYaml], { type: 'text/yaml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'deploy.yml';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          };

          return (
            <div className="p-5 border-t border-[#D6EAFF] bg-[#F4F9FF] space-y-5">
              {/* Bloque 1: Comandos Git */}
              <div className="bg-white border border-[#B3D9FF] rounded-xl p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-[#0B2559]">
                      Paso 1: Comandos de Terminal para Subir el Proyecto a tu Repositorio GitHub
                    </h4>
                    <p className="text-[11px] text-[#3B82F6]">
                      Ejecuta estos comandos en la terminal dentro de la carpeta del proyecto
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyCode(gitCommandsCode, 'git_cmds')}
                    className="px-3 py-1.5 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-lg hover:bg-[#99CCFF] flex items-center gap-1.5 transition-colors"
                  >
                    <i className={`fi ${copiedCodeKey === 'git_cmds' ? 'fi-rr-check' : 'fi-rr-copy'} text-xs`} />
                    {copiedCodeKey === 'git_cmds' ? '¡Comandos Copiados!' : 'Copiar Comandos Git'}
                  </button>
                </div>
                <pre className="p-3.5 rounded-xl bg-[#0B2559] text-[#EAF3FF] font-mono text-xs overflow-x-auto leading-relaxed">
                  <code>{gitCommandsCode}</code>
                </pre>
              </div>

              {/* Bloque 2: GitHub Actions deploy.yml */}
              <div className="bg-white border border-[#B3D9FF] rounded-xl p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-[#0B2559]">
                      Paso 2: Flujo Automático GitHub Actions (`.github/workflows/deploy.yml`)
                    </h4>
                    <p className="text-[11px] text-[#3B82F6]">
                      Ya incluido en el proyecto en <span className="font-mono font-semibold">/.github/workflows/deploy.yml</span>. En GitHub ve a <strong>Settings → Pages → Build and deployment → Source: GitHub Actions</strong>.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyCode(githubWorkflowYaml, 'gh_yaml')}
                      className="px-3 py-1.5 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-lg hover:bg-[#99CCFF] flex items-center gap-1.5 transition-colors"
                    >
                      <i className={`fi ${copiedCodeKey === 'gh_yaml' ? 'fi-rr-check' : 'fi-rr-copy'} text-xs`} />
                      {copiedCodeKey === 'gh_yaml' ? '¡YAML Copiado!' : 'Copiar deploy.yml'}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadWorkflowYaml}
                      className="px-3 py-1.5 text-xs font-bold text-white bg-[#0B2559] rounded-lg hover:bg-[#163B82] flex items-center gap-1.5 transition-colors"
                    >
                      <i className="fi fi-rr-download text-xs" /> Descargar deploy.yml
                    </button>
                  </div>
                </div>
                <pre className="p-3.5 rounded-xl bg-[#0B2559] text-[#EAF3FF] font-mono text-xs overflow-x-auto max-h-80 leading-relaxed">
                  <code>{githubWorkflowYaml}</code>
                </pre>
              </div>

              {/* Bloque 3: Despliegue manual con gh-pages */}
              <div className="bg-white border border-[#B3D9FF] rounded-xl p-4 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-xs font-bold text-[#0B2559]">
                      Paso 3 (Opcional): Despliegue Rápido por Consola con `gh-pages`
                    </h4>
                    <p className="text-[11px] text-[#3B82F6]">
                      Alternativa si prefieres publicar manualmente desde tu computadora con un solo comando
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyCode(ghPagesManualCode, 'gh_pages')}
                    className="px-3 py-1.5 text-xs font-bold text-[#0B2559] bg-[#B3D9FF] rounded-lg hover:bg-[#99CCFF] flex items-center gap-1.5 transition-colors"
                  >
                    <i className={`fi ${copiedCodeKey === 'gh_pages' ? 'fi-rr-check' : 'fi-rr-copy'} text-xs`} />
                    {copiedCodeKey === 'gh_pages' ? '¡Copiado!' : 'Copiar Comandos gh-pages'}
                  </button>
                </div>
                <pre className="p-3.5 rounded-xl bg-[#0B2559] text-[#EAF3FF] font-mono text-xs overflow-x-auto leading-relaxed">
                  <code>{ghPagesManualCode}</code>
                </pre>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
};

