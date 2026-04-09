import { relations } from "drizzle-orm";
import { accounts } from "./accounts.ts";
import { reminderDeliveries } from "./reminder-deliveries.ts";
import { studentSessions } from "./student-sessions.ts";

export const accountsRelations = relations(accounts, ({ many }) => ({
  reminderDeliveries: many(reminderDeliveries),
  sessions: many(studentSessions),
}));

export const reminderDeliveriesRelations = relations(
  reminderDeliveries,
  ({ one }) => ({
    account: one(accounts, {
      fields: [reminderDeliveries.accountId],
      references: [accounts.id],
    }),
  }),
);

export const studentSessionsRelations = relations(
  studentSessions,
  ({ one }) => ({
    account: one(accounts, {
      fields: [studentSessions.accountId],
      references: [accounts.id],
    }),
  }),
);
