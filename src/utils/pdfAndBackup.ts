import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { AppUser, TaskItem, AuditLog, ChatMessage, CalendarEvent, DatabaseBackup } from '../types';
import {
  saveUserToFirestore,
  saveTaskToFirestore,
  saveChatMessageToFirestore,
  saveCalendarEventToFirestore,
  recordAuditLog,
  cleanId
} from '../firebase';

export function generateAuditAndTasksPDF(params: {
  generatedBy: AppUser;
  users: AppUser[];
  tasks: TaskItem[];
  auditLogs: AuditLog[];
  reportTitle?: string;
}) {
  const { generatedBy, users, tasks, auditLogs, reportTitle } = params;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const nowStr = new Date().toLocaleString('es-ES');

  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(reportTitle || 'REPORTE EJECUTIVO DE AUDITORÍA, USUARIOS Y AVANCE DE TAREAS', 14, 16);

  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(
    `Generado por: ${generatedBy.name} (Cédula: ${generatedBy.cedula})  ·  Fecha y Hora: ${nowStr}  ·  Total Tareas: ${tasks.length}  ·  Logs Auditados: ${auditLogs.length}`,
    14,
    22
  );

  const completedCount = tasks.filter(t => t.status === 'completada').length;
  const inProgressCount = tasks.filter(t => t.status === 'en_progreso').length;
  const pendingCount = tasks.filter(t => t.status === 'pendiente').length;
  const criticalCount = tasks.filter(t => t.priority === 'critica' && t.status !== 'completada').length;

  autoTable(doc, {
    startY: 27,
    head: [['Indicador del Sistema', 'Valor', 'Detalle Operativo']],
    body: [
      ['Usuarios Registrados', `${users.length}`, `${users.filter(u => u.isOnline).length} en línea actualmente`],
      ['Tareas Completadas', `${completedCount}`, `${tasks.length ? Math.round((completedCount / tasks.length) * 100) : 0}% de cumplimiento global`],
      ['Tareas En Progreso / Pendientes', `${inProgressCount} / ${pendingCount}`, `${criticalCount} con prioridad crítica activa`],
      ['Eventos de Auditoría Registrados', `${auditLogs.length}`, 'Sincronización en tiempo real con Firebase Firestore']
    ],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
  });

  const afterSummaryY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 65;

  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('1. Matriz de Tareas, Responsables, Fechas Límite y Estado', 14, afterSummaryY + 8);

  autoTable(doc, {
    startY: afterSummaryY + 11,
    head: [['Título de Tarea', 'Prioridad', 'Estado', 'Avance', 'Responsable (Cédula)', 'Asignado Por', 'Fecha Límite', 'Credenciales / Link']],
    body: tasks.map(t => [
      t.title,
      t.priority.toUpperCase(),
      t.status.replace('_', ' ').toUpperCase(),
      `${t.progress}%`,
      `${t.assignedToName} (${t.assignedToCedula})`,
      `${t.createdByName}`,
      new Date(t.dueDate).toLocaleString('es-ES'),
      `${t.accessEmail ? `Usuario: ${t.accessEmail}` : 'S/N'} ${t.directLink ? `| ${t.directLink}` : ''}`
    ]),
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 7.5 },
  });

  const afterTasksY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 130;

  doc.addPage();
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('2. Bitácora Detallada de Auditoría en Tiempo Real (Últimos Eventos)', 14, 16);

  autoTable(doc, {
    startY: 20,
    head: [['Fecha y Hora', 'Cédula', 'Usuario', 'Rol', 'Módulo', 'Acción', 'Severidad', 'Descripción Detallada']],
    body: auditLogs.slice(0, 60).map(log => [
      new Date(log.timestamp).toLocaleString('es-ES'),
      log.actorCedula,
      log.actorName,
      log.actorRole.toUpperCase(),
      log.module,
      log.actionType,
      log.severity.toUpperCase(),
      log.description
    ]),
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 7.5 },
  });

  void afterTasksY;
  const fileName = `Reporte_Auditoria_TaskFlow_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(fileName);
}

export function generateMonthlyProgressPDF(params: {
  generatedBy: AppUser;
  tasks: TaskItem[];
  monthLabel: string;
}) {
  const { generatedBy, tasks, monthLabel } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const nowStr = new Date().toLocaleString('es-ES');

  const completed = tasks.filter(t => t.status === 'completada');
  const pending = tasks.filter(t => t.status !== 'completada');
  const avgProgress = tasks.length
    ? Math.round(tasks.reduce((acc, t) => acc + (Number(t.progress) || 0), 0) / tasks.length)
    : 0;

  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text(`REPORTE MENSUAL DE AVANCE Y ENTREGAS (${monthLabel.toUpperCase()})`, 14, 18);

  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  doc.text(`Emitido por: ${generatedBy.name} (${generatedBy.cedula})  ·  Fecha: ${nowStr}`, 14, 24);
  doc.text(
    `Resumen Mensual: ${completed.length} Completadas  ·  ${pending.length} Pendientes/En Curso  ·  Avance Promedio: ${avgProgress}%`,
    14,
    30
  );

  doc.setFontSize(11);
  doc.setTextColor(22, 163, 74);
  doc.text(`Tareas Completadas (${completed.length})`, 14, 39);

  autoTable(doc, {
    startY: 42,
    head: [['Tarea', 'Responsable', 'Prioridad', 'Categoría', 'Fecha Entrega / Cierre']],
    body: completed.length
      ? completed.map(t => [
          t.title,
          `${t.assignedToName} (${t.assignedToCedula})`,
          t.priority.toUpperCase(),
          t.category || 'General',
          t.completedAt ? new Date(t.completedAt).toLocaleString('es-ES') : new Date(t.dueDate).toLocaleString('es-ES')
        ])
      : [['Sin tareas completadas registradas en este corte', '-', '-', '-', '-']],
    theme: 'grid',
    headStyles: { fillColor: [22, 163, 74], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 8 }
  });

  const nextY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 90) + 10;

  doc.setFontSize(11);
  doc.setTextColor(217, 119, 6);
  doc.text(`Tareas Pendientes y En Progreso (${pending.length})`, 14, nextY);

  autoTable(doc, {
    startY: nextY + 3,
    head: [['Tarea', 'Responsable', 'Prioridad', 'Avance', 'Fecha Límite']],
    body: pending.length
      ? pending.map(t => [
          t.title,
          `${t.assignedToName} (${t.assignedToCedula})`,
          t.priority.toUpperCase(),
          `${t.progress}%`,
          new Date(t.dueDate).toLocaleString('es-ES')
        ])
      : [['Todas las tareas se encuentran completadas', '-', '-', '100%', '-']],
    theme: 'grid',
    headStyles: { fillColor: [217, 119, 6], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 8 }
  });

  doc.save(`Reporte_Avance_Mensual_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function downloadDatabaseBackupJSON(params: {
  actor: AppUser;
  users: AppUser[];
  tasks: TaskItem[];
  auditLogs: AuditLog[];
  chatMessages: ChatMessage[];
  calendarEvents: CalendarEvent[];
}) {
  const backup: DatabaseBackup = {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    exportedBy: `${params.actor.name} (${params.actor.cedula})`,
    app_users: params.users,
    tasks: params.tasks,
    audit_logs: params.auditLogs,
    chat_messages: params.chatMessages,
    calendar_events: params.calendarEvents,
  };

  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Respaldo_BD_TaskFlow_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadDatabaseTemplateJSON() {
  const now = new Date().toISOString();
  const template: DatabaseBackup = {
    version: '1.0.0-PLANTILLA',
    exportedAt: now,
    exportedBy: 'PLANTILLA_OFICIAL_ESTRUCTURA_BD',
    app_users: [
      {
        cedula: '99001122',
        name: 'Nombre Completo Ejemplo',
        password: 'claveSegura123',
        role: 'user',
        email: 'usuario.ejemplo@empresa.com',
        department: 'Operaciones',
        isOnline: false,
        lastSeen: now,
        canCreateTasks: true,
        canEditTasks: true,
        canDeleteTasks: false,
        canSendChat: true,
        canViewVault: true,
        canExportReports: true,
        createdAt: now
      }
    ],
    tasks: [
      {
        id: 'task_ejemplo_plantilla_01',
        title: 'Tarea de Ejemplo desde Plantilla Oficial',
        description: 'Descripción detallada de la actividad o entrega requerida.',
        priority: 'alta',
        status: 'pendiente',
        progress: 0,
        tags: 'Plantilla, Operativo, Prioritario',
        assignedToCedula: '99001122',
        assignedToName: 'Nombre Completo Ejemplo',
        createdByCedula: '10000001',
        createdByName: 'Administrador Principal',
        createdAt: now,
        dueDate: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
        completedAt: '',
        notes: 'Notas operativas, instrucciones de acceso o pasos de verificación.',
        accessEmail: 'cuenta.servicio@empresa.com',
        accessPassword: 'PasswordTemporal#2026',
        directLink: 'https://panel.empresa.com/login',
        category: 'Operaciones'
      }
    ],
    audit_logs: [],
    chat_messages: [],
    calendar_events: [
      {
        id: 'ev_ejemplo_plantilla_01',
        title: 'Revisión de Entrega de Plantilla',
        date: now.split('T')[0],
        time: '15:00',
        type: 'entrega',
        description: 'Evento sincronizado de ejemplo en la plantilla de base de datos.',
        createdByCedula: '10000001',
        createdByName: 'Administrador Principal',
        linkedTaskId: 'task_ejemplo_plantilla_01'
      }
    ]
  };

  const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Plantilla_Estructura_BaseDeDatos_TaskFlow.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function restoreDatabaseFromBackupJSON(
  rawJson: string,
  actor: AppUser
): Promise<{ usersImported: number; tasksImported: number; eventsImported: number }> {
  const parsed = JSON.parse(rawJson) as Partial<DatabaseBackup>;
  let usersImported = 0;
  let tasksImported = 0;
  let eventsImported = 0;

  if (Array.isArray(parsed.app_users)) {
    for (const u of parsed.app_users) {
      if (u && u.cedula && u.name) {
        await saveUserToFirestore(u);
        usersImported++;
      }
    }
  }

  if (Array.isArray(parsed.tasks)) {
    for (const t of parsed.tasks) {
      if (t && t.title) {
        const id = cleanId(t.id);
        await saveTaskToFirestore({ ...t, id });
        tasksImported++;
      }
    }
  }

  if (Array.isArray(parsed.calendar_events)) {
    for (const ev of parsed.calendar_events) {
      if (ev && ev.title) {
        const id = cleanId(ev.id);
        await saveCalendarEventToFirestore({ ...ev, id });
        eventsImported++;
      }
    }
  }

  if (Array.isArray(parsed.chat_messages)) {
    for (const msg of parsed.chat_messages.slice(0, 30)) {
      if (msg && msg.text && msg.senderCedula) {
        await saveChatMessageToFirestore(msg, cleanId(msg.id));
      }
    }
  }

  await recordAuditLog({
    actorCedula: actor.cedula,
    actorName: actor.name,
    actorRole: actor.role,
    actionType: 'RESTAURAR_RESPALDO_BD',
    module: 'BASE_DE_DATOS',
    description: `Respaldo cargado en Firebase: ${usersImported} usuarios, ${tasksImported} tareas y ${eventsImported} eventos sincronizados.`,
    severity: 'warning'
  });

  return { usersImported, tasksImported, eventsImported };
}
