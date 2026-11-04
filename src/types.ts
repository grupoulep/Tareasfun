export interface AppUser {
  cedula: string;
  name: string;
  password: string;
  role: 'admin' | 'user';
  email: string;
  department: string;
  isOnline: boolean;
  lastSeen: string;
  canCreateTasks: boolean;
  canEditTasks: boolean;
  canDeleteTasks: boolean;
  canSendChat: boolean;
  canViewVault: boolean;
  canExportReports: boolean;
  createdAt: string;
}

export type TaskPriority = 'baja' | 'media' | 'alta' | 'critica';
export type TaskStatus = 'pendiente' | 'en_progreso' | 'completada';

export interface TaskItem {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  progress: number;
  tags: string;
  assignedToCedula: string;
  assignedToName: string;
  createdByCedula: string;
  createdByName: string;
  createdAt: string;
  dueDate: string;
  completedAt: string;
  notes: string;
  accessEmail: string;
  accessPassword: string;
  directLink: string;
  category: string;
}

export interface AuditLog {
  id: string;
  actorCedula: string;
  actorName: string;
  actorRole: 'admin' | 'user';
  actionType: string;
  module: string;
  description: string;
  targetId: string;
  timestamp: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface ChatMessage {
  id: string;
  senderCedula: string;
  senderName: string;
  senderRole: 'admin' | 'user';
  text: string;
  channel: string;
  relatedTaskId: string;
  timestamp: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  type: 'entrega' | 'reunion' | 'auditoria' | 'hito' | 'actividad';
  description: string;
  createdByCedula: string;
  createdByName: string;
  linkedTaskId: string;
}

export interface DatabaseBackup {
  version: string;
  exportedAt: string;
  exportedBy: string;
  app_users: AppUser[];
  tasks: TaskItem[];
  audit_logs: AuditLog[];
  chat_messages: ChatMessage[];
  calendar_events: CalendarEvent[];
}
