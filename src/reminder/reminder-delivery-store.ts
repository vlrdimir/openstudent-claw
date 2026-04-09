import { and, eq } from "drizzle-orm";
import { reminderDeliveries } from "../lib/db/schema/index.ts";
import { getDb } from "../lib/db/index.ts";

export type ReminderDeliveryRow = typeof reminderDeliveries.$inferSelect;

export type ReminderDeliveryStatus = "pending" | "sent" | "failed";

export type ReminderDeliveryDedupeKey = {
  accountId: number;
  courseNameSnapshot: string;
  courseTimeSnapshot: string;
  attendanceDateLocal: string;
};

export type ClaimPendingReminderDeliveryInput = ReminderDeliveryDedupeKey & {
  absenPathToken: string;
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
    eq(reminderDeliveries.courseNameSnapshot, input.courseNameSnapshot),
    eq(reminderDeliveries.courseTimeSnapshot, input.courseTimeSnapshot),
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
  const rows = await db.query.reminderDeliveries.findMany({
    where: reminderDeliveryDedupeWhere(input),
  });

  return rows.sort((left, right) => {
    const statusRank = (status: string) => {
      if (status === "sent") return 0;
      if (status === "pending") return 1;
      return 2;
    };

    const rankDiff = statusRank(left.status) - statusRank(right.status);
    if (rankDiff !== 0) return rankDiff;

    return right.updatedAt.getTime() - left.updatedAt.getTime();
  })[0];
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
