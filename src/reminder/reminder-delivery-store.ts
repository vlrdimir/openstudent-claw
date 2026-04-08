import { and, eq } from "drizzle-orm";
import { reminderDeliveries } from "../lib/db/schema/index.ts";
import { getDb } from "../lib/db/index.ts";

export type ReminderDeliveryRow = typeof reminderDeliveries.$inferSelect;

export type ReminderDeliveryStatus = "pending" | "sent" | "failed";

export type ReminderDeliveryDedupeKey = {
  accountId: number;
  absenPathToken: string;
  attendanceDateLocal: string;
};

export type ClaimPendingReminderDeliveryInput = ReminderDeliveryDedupeKey & {
  courseNameSnapshot: string;
  courseTimeSnapshot: string;
  telegramChatId: string;
};

export type ClaimPendingReminderDeliveryResult = {
  row: ReminderDeliveryRow;
  claimed: boolean;
};

export type MarkReminderDeliverySentInput = ReminderDeliveryDedupeKey & {
  sentAt?: Date;
};

export type MarkReminderDeliveryFailedInput = ReminderDeliveryDedupeKey & {
  lastError: string;
};

function reminderDeliveryDedupeWhere(input: ReminderDeliveryDedupeKey) {
  return and(
    eq(reminderDeliveries.accountId, input.accountId),
    eq(reminderDeliveries.absenPathToken, input.absenPathToken),
    eq(reminderDeliveries.attendanceDateLocal, input.attendanceDateLocal),
  );
}

function buildPendingDeliveryValues(
  input: ClaimPendingReminderDeliveryInput,
  now: Date,
) {
  return {
    accountId: input.accountId,
    absenPathToken: input.absenPathToken,
    attendanceDateLocal: input.attendanceDateLocal,
    courseNameSnapshot: input.courseNameSnapshot,
    courseTimeSnapshot: input.courseTimeSnapshot,
    status: "pending" as const,
    telegramChatId: input.telegramChatId,
    sentAt: null,
    lastError: null,
    updatedAt: now,
  };
}

export async function getReminderDeliveryByDedupeKey(
  input: ReminderDeliveryDedupeKey,
): Promise<ReminderDeliveryRow | undefined> {
  const db = getDb();
  return db.query.reminderDeliveries.findFirst({
    where: reminderDeliveryDedupeWhere(input),
  });
}

async function requireReminderDeliveryByDedupeKey(
  input: ReminderDeliveryDedupeKey,
): Promise<ReminderDeliveryRow> {
  const row = await getReminderDeliveryByDedupeKey(input);
  if (!row) {
    throw new Error(
      "requireReminderDeliveryByDedupeKey: baris tidak ditemukan",
    );
  }
  return row;
}

export async function claimPendingReminderDelivery(
  input: ClaimPendingReminderDeliveryInput,
): Promise<ClaimPendingReminderDeliveryResult> {
  const db = getDb();
  const now = new Date();
  const [insertedRow] = await db
    .insert(reminderDeliveries)
    .values({
      ...buildPendingDeliveryValues(input, now),
      createdAt: now,
    })
    .onConflictDoNothing()
    .returning();

  if (insertedRow) {
    return {
      row: insertedRow,
      claimed: true,
    };
  }

  const [reclaimedFailedRow] = await db
    .update(reminderDeliveries)
    .set(buildPendingDeliveryValues(input, now))
    .where(
      and(
        reminderDeliveryDedupeWhere(input),
        eq(reminderDeliveries.status, "failed"),
      ),
    )
    .returning();

  if (reclaimedFailedRow) {
    return {
      row: reclaimedFailedRow,
      claimed: true,
    };
  }

  return {
    row: await requireReminderDeliveryByDedupeKey(input),
    claimed: false,
  };
}

export async function markReminderDeliverySent(
  input: MarkReminderDeliverySentInput,
): Promise<ReminderDeliveryRow> {
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .update(reminderDeliveries)
    .set({
      status: "sent",
      sentAt: input.sentAt ?? now,
      lastError: null,
      updatedAt: now,
    })
    .where(
      and(
        reminderDeliveryDedupeWhere(input),
        eq(reminderDeliveries.status, "pending"),
      ),
    )
    .returning();

  if (row) {
    return row;
  }

  return requireReminderDeliveryByDedupeKey(input);
}

export async function markReminderDeliveryFailed(
  input: MarkReminderDeliveryFailedInput,
): Promise<ReminderDeliveryRow> {
  const db = getDb();
  const now = new Date();
  const [row] = await db
    .update(reminderDeliveries)
    .set({
      status: "failed",
      lastError: input.lastError,
      updatedAt: now,
    })
    .where(
      and(
        reminderDeliveryDedupeWhere(input),
        eq(reminderDeliveries.status, "pending"),
      ),
    )
    .returning();

  if (row) {
    return row;
  }

  return requireReminderDeliveryByDedupeKey(input);
}
