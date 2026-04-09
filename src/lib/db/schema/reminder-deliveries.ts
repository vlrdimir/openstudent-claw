import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { accounts } from "./accounts.ts";

export const reminderDeliveries = sqliteTable(
  "reminder_deliveries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    absenPathToken: text("absen_path_token").notNull(),
    attendanceDateLocal: text("attendance_date_local").notNull(),
    courseNameSnapshot: text("course_name_snapshot").notNull(),
    courseTimeSnapshot: text("course_time_snapshot").notNull(),
    status: text("status").notNull(),
    telegramChatId: text("telegram_chat_id").notNull(),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }),
    lastError: text("last_error"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => ({
    reminderDeliveriesAccountAbsenDateUnique: uniqueIndex(
      "reminder_deliveries_account_absen_date_unique",
    ).on(table.accountId, table.absenPathToken, table.attendanceDateLocal),
  }),
);
