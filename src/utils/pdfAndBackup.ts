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
        createdByCedula: '902050377',
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
        createdByCedula: '902050377',
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
      if (u && u.cedula && u.name && u.cedula !== '10000001') {
        const sanitizedUser: AppUser = {
          ...u,
          role: u.cedula === '902050377' ? 'admin' : 'user',
        };
        await saveUserToFirestore(sanitizedUser);
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

function escapeExcelHtml(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function exportUsersPersonalDataToExcel(params: {
  users: AppUser[];
  exportedBy: AppUser;
  customFileName?: string;
}) {
  const { users, exportedBy, customFileName } = params;
  const nowStr = new Date().toLocaleString('es-ES');

  const rowsHtml = users
    .map(u => {
      const statusLabel = (u.approvalStatus || 'aprobado').toUpperCase();
      return `<tr>
        <td style="mso-number-format:'\\@'; font-weight:bold;">${escapeExcelHtml(u.cedula)}</td>
        <td>${escapeExcelHtml(u.name)}</td>
        <td>${escapeExcelHtml(u.cedulaIssuePlace || 'No registrado')}</td>
        <td>${escapeExcelHtml(u.cedulaIssueDate || 'No registrado')}</td>
        <td>${escapeExcelHtml(u.birthDate || 'No registrado')}</td>
        <td>${escapeExcelHtml(u.birthPlace || 'No registrado')}</td>
        <td>${escapeExcelHtml(u.bloodType || 'No registrado')}</td>
        <td>${escapeExcelHtml(u.maritalStatus || 'No registrado')}</td>
        <td style="mso-number-format:'\\@';">${escapeExcelHtml(u.phone || 'No registrado')}</td>
        <td>${escapeExcelHtml(u.email || '')}</td>
        <td>${escapeExcelHtml(u.locationDepartmentState || 'No registrado')}</td>
        <td>${escapeExcelHtml(u.locationCity || 'No registrado')}</td>
        <td>${escapeExcelHtml(u.residenceAddress || 'No registrado')}</td>
        <td>${escapeExcelHtml(u.residenceType || 'No registrado')}</td>
        <td>${escapeExcelHtml(u.residenceStratum || 'No registrado')}</td>
        <td style="text-align:center;">${Number(u.familyMembersCount) || 0}</td>
        <td>${escapeExcelHtml(u.emergencyContactName || 'No registrado')}</td>
        <td style="mso-number-format:'\\@';">${escapeExcelHtml(u.emergencyContactPhone || 'No registrado')}</td>
        <td>${escapeExcelHtml(u.familyNotes || 'Sin observaciones')}</td>
        <td>${escapeExcelHtml(u.bankName || 'No aplica')}</td>
        <td>${escapeExcelHtml(u.bankAccountType || 'No aplica')}</td>
        <td style="mso-number-format:'\\@'; font-weight:bold;">${escapeExcelHtml(u.bankAccountNumber || 'No aplica')}</td>
        <td>${escapeExcelHtml(u.bankAccountHolder || u.name)}</td>
        <td>${escapeExcelHtml(u.department)}</td>
        <td>${escapeExcelHtml(u.role.toUpperCase())}</td>
        <td>${escapeExcelHtml(statusLabel)}</td>
        <td>${escapeExcelHtml(new Date(u.createdAt).toLocaleString('es-ES'))}</td>
      </tr>`;
    })
    .join('\n');

  const excelDocument = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
  <head>
    <meta charset="UTF-8" />
    <!--[if gte mso 9]>
    <xml>
      <x:ExcelWorkbook>
        <x:ExcelWorksheets>
          <x:ExcelWorksheet>
            <x:Name>Datos Personales y Bancarios</x:Name>
            <x:WorksheetOptions>
              <x:DisplayGridlines/>
            </x:WorksheetOptions>
          </x:ExcelWorksheet>
        </x:ExcelWorksheets>
      </x:ExcelWorkbook>
    </xml>
    <![endif]-->
    <style>
      table { border-collapse: collapse; font-family: Arial, sans-serif; font-size: 11px; }
      th { background-color: #0B2559; color: #FFFFFF; font-weight: bold; border: 1px solid #B3D9FF; padding: 8px; text-align: left; }
      td { border: 1px solid #CBD5E1; padding: 6px 8px; color: #0B2559; }
      .title-row { background-color: #EAF3FF; color: #0B2559; font-size: 14px; font-weight: bold; padding: 10px; }
    </style>
  </head>
  <body>
    <table>
      <tr>
        <td colspan="27" class="title-row">
          FUNDACIÓN ULEP - BASE DE DATOS CONFIDENCIAL DE PERSONAL, CÉDULA, UBICACIÓN, RESIDENCIA, FAMILIARES Y DATOS BANCARIOS (USO EXCLUSIVO ADMIN)
        </td>
      </tr>
      <tr>
        <td colspan="27">
          Exportado por: ${escapeExcelHtml(exportedBy.name)} (C.C. ${escapeExcelHtml(exportedBy.cedula)}) · Fecha de corte: ${escapeExcelHtml(nowStr)} · Total registros: ${users.length}
        </td>
      </tr>
      <thead>
        <tr>
          <th>N° Cédula</th>
          <th>Nombre Completo</th>
          <th>Lugar Expedición Cédula</th>
          <th>Fecha Expedición Cédula</th>
          <th>Fecha de Nacimiento</th>
          <th>Lugar de Nacimiento</th>
          <th>RH / Grupo Sanguíneo</th>
          <th>Estado Civil</th>
          <th>Teléfono / Celular</th>
          <th>Correo Electrónico</th>
          <th>Departamento / Estado Ubicación</th>
          <th>Ciudad / Municipio</th>
          <th>Dirección de Residencia</th>
          <th>Tipo de Residencia / Vivienda</th>
          <th>Estrato / Zona</th>
          <th>N° de Familiares</th>
          <th>Contacto de Emergencia / Familiar</th>
          <th>Teléfono Emergencia</th>
          <th>Detalle Núcleo Familiar</th>
          <th>Banco / Entidad de Pago</th>
          <th>Tipo de Cuenta Bancaria</th>
          <th>N° Cuenta / Llave Bancaria</th>
          <th>Titular Cuenta Bancaria</th>
          <th>Área / Departamento ULEP</th>
          <th>Rol en Plataforma</th>
          <th>Estado de Autorización</th>
          <th>Fecha de Registro</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  </body>
</html>`;

  const blob = new Blob(['\ufeff', excelDocument], {
    type: 'application/vnd.ms-excel;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download =
    customFileName ||
    `Datos_Personales_Bancarios_ULEP_${new Date().toISOString().slice(0, 10)}.xls`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

