import { db } from './index.ts';
import { users, appUsers, tasks, auditLogs, calendarEvents, chatMessages } from './schema.ts';
import { eq, desc } from 'drizzle-orm';

export async function getOrCreateUser(uid: string, email: string) {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database query failed in getOrCreateUser:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getSqlAppUsers() {
  try {
    return await db.select().from(appUsers);
  } catch (error) {
    console.error('Database query failed in getSqlAppUsers:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function upsertSqlAppUser(payload: typeof appUsers.$inferInsert) {
  try {
    const result = await db
      .insert(appUsers)
      .values(payload)
      .onConflictDoUpdate({
        target: appUsers.cedula,
        set: payload,
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database query failed in upsertSqlAppUser:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function deleteSqlAppUser(cedula: string) {
  try {
    await db.delete(appUsers).where(eq(appUsers.cedula, cedula));
  } catch (error) {
    console.error('Database query failed in deleteSqlAppUser:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getSqlTasks() {
  try {
    return await db.select().from(tasks);
  } catch (error) {
    console.error('Database query failed in getSqlTasks:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function upsertSqlTask(payload: typeof tasks.$inferInsert) {
  try {
    const result = await db
      .insert(tasks)
      .values(payload)
      .onConflictDoUpdate({
        target: tasks.id,
        set: payload,
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database query failed in upsertSqlTask:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function deleteSqlTask(taskId: string) {
  try {
    await db.delete(tasks).where(eq(tasks.id, taskId));
  } catch (error) {
    console.error('Database query failed in deleteSqlTask:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getSqlAuditLogs() {
  try {
    return await db.select().from(auditLogs).orderBy(desc(auditLogs.timestamp)).limit(120);
  } catch (error) {
    console.error('Database query failed in getSqlAuditLogs:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function insertSqlAuditLog(payload: typeof auditLogs.$inferInsert) {
  try {
    const result = await db
      .insert(auditLogs)
      .values(payload)
      .onConflictDoNothing()
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database query failed in insertSqlAuditLog:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function upsertSqlCalendarEvent(payload: typeof calendarEvents.$inferInsert) {
  try {
    const result = await db
      .insert(calendarEvents)
      .values(payload)
      .onConflictDoUpdate({
        target: calendarEvents.id,
        set: payload,
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database query failed in upsertSqlCalendarEvent:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function deleteSqlCalendarEvent(eventId: string) {
  try {
    await db.delete(calendarEvents).where(eq(calendarEvents.id, eventId));
  } catch (error) {
    console.error('Database query failed in deleteSqlCalendarEvent:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function upsertSqlChatMessage(payload: typeof chatMessages.$inferInsert) {
  try {
    const result = await db
      .insert(chatMessages)
      .values(payload)
      .onConflictDoUpdate({
        target: chatMessages.id,
        set: payload,
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database query failed in upsertSqlChatMessage:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}
