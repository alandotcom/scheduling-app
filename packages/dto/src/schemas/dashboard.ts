import { z } from "zod";
import { nonNegativeIntSchema } from "./common";

export const dashboardSummarySchema = z.object({
  todayAppointments: nonNegativeIntSchema,
  weekAppointments: nonNegativeIntSchema,
  clients: nonNegativeIntSchema,
  calendars: nonNegativeIntSchema,
  pendingAppointments: nonNegativeIntSchema,
  noShows: nonNegativeIntSchema,
});

export type DashboardSummary = z.infer<typeof dashboardSummarySchema>;
