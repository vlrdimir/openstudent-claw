import { relations } from "drizzle-orm";
import { accounts } from "./accounts.ts";
import { studentSessions } from "./student-sessions.ts";

export const accountsRelations = relations(accounts, ({ many }) => ({
  sessions: many(studentSessions),
}));

export const studentSessionsRelations = relations(
  studentSessions,
  ({ one }) => ({
    account: one(accounts, {
      fields: [studentSessions.accountId],
      references: [accounts.id],
    }),
  }),
);
