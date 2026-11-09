import { relations } from 'drizzle-orm';
import { boolean, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

// Tabla de usuarios autenticados con Firebase Auth UID (Requerida por Cloud SQL + Firebase Auth)
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Tabla de colaboradores y perfiles de Fundación ULEP (Cédula, Datos Personales, Ubicación, Familiares y Bancarios)
export const appUsers = pgTable('app_users', {
  cedula: text('cedula').primaryKey(),
  uid: text('uid').references(() => users.uid),
  name: text('name').notNull(),
  password: text('password').notNull(),
  role: text('role').notNull().default('user'),
  email: text('email').notNull().default(''),
  department: text('department').notNull().default('Operaciones'),
  approvalStatus: text('approval_status').notNull().default('aprobado'),
  isOnline: boolean('is_online').notNull().default(false),
  lastSeen: text('last_seen').notNull().default(''),
  canCreateTasks: boolean('can_create_tasks').notNull().default(true),
  canEditTasks: boolean('can_edit_tasks').notNull().default(true),
  canDeleteTasks: boolean('can_delete_tasks').notNull().default(false),
  canSendChat: boolean('can_send_chat').notNull().default(true),
  canViewVault: boolean('can_view_vault').notNull().default(false),
  canExportReports: boolean('can_export_reports').notNull().default(true),
  cedulaIssuePlace: text('cedula_issue_place').default(''),
  cedulaIssueDate: text('cedula_issue_date').default(''),
  birthDate: text('birth_date').default(''),
  birthPlace: text('birth_place').default(''),
  bloodType: text('blood_type').default(''),
  maritalStatus: text('marital_status').default(''),
  phone: text('phone').default(''),
  locationDepartmentState: text('location_department_state').default(''),
  locationCity: text('location_city').default(''),
  residenceAddress: text('residence_address').default(''),
  residenceType: text('residence_type').default(''),
  residenceStratum: text('residence_stratum').default(''),
  familyMembersCount: integer('family_members_count').default(0),
  emergencyContactName: text('emergency_contact_name').default(''),
  emergencyContactPhone: text('emergency_contact_phone').default(''),
  familyNotes: text('family_notes').default(''),
  bankName: text('bank_name').default(''),
  bankAccountType: text('bank_account_type').default(''),
  bankAccountNumber: text('bank_account_number').default(''),
  bankAccountHolder: text('bank_account_holder').default(''),
  createdAt: text('created_at').notNull(),
});

// Tabla de Lista de Chequeo y Tareas Operativas
export const tasks = pgTable('tasks', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  priority: text('priority').notNull().default('media'),
  status: text('status').notNull().default('pendiente'),
  progress: integer('progress').notNull().default(0),
  tags: text('tags').notNull().default(''),
  assignedToCedula: text('assigned_to_cedula').notNull(),
  assignedToName: text('assigned_to_name').notNull(),
  createdByCedula: text('created_by_cedula').notNull(),
  createdByName: text('created_by_name').notNull(),
  createdAt: text('created_at').notNull(),
  dueDate: text('due_date').notNull(),
  completedAt: text('completed_at').notNull().default(''),
  notes: text('notes').notNull().default(''),
  accessEmail: text('access_email').notNull().default(''),
  accessPassword: text('access_password').notNull().default(''),
  directLink: text('direct_link').notNull().default(''),
  category: text('category').notNull().default('Chequeo'),
});

// Tabla de Bitácora de Auditoría
export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  actorCedula: text('actor_cedula').notNull(),
  actorName: text('actor_name').notNull(),
  actorRole: text('actor_role').notNull(),
  actionType: text('action_type').notNull(),
  module: text('module').notNull(),
  description: text('description').notNull(),
  targetId: text('target_id').default(''),
  timestamp: text('timestamp').notNull(),
  severity: text('severity').notNull().default('info'),
});

// Tabla de Eventos de Calendario
export const calendarEvents = pgTable('calendar_events', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  date: text('date').notNull(),
  time: text('time').notNull().default('09:00'),
  type: text('type').notNull().default('actividad'),
  description: text('description').notNull().default(''),
  createdByCedula: text('created_by_cedula').notNull().default(''),
  createdByName: text('created_by_name').notNull().default(''),
  linkedTaskId: text('linked_task_id').default(''),
});

// Tabla de Mensajes de Chat Interno
export const chatMessages = pgTable('chat_messages', {
  id: text('id').primaryKey(),
  senderCedula: text('sender_cedula').notNull(),
  senderName: text('sender_name').notNull(),
  senderRole: text('sender_role').notNull().default('user'),
  text: text('text').notNull(),
  channel: text('channel').notNull().default('general'),
  relatedTaskId: text('related_task_id').default(''),
  timestamp: text('timestamp').notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  profiles: many(appUsers),
}));

export const appUsersRelations = relations(appUsers, ({ one }) => ({
  authUser: one(users, {
    fields: [appUsers.uid],
    references: [users.uid],
  }),
}));
