import { dashboardSummarySchema } from "@scheduling/dto";
import { authed } from "./base.js";
import { withOrg } from "../lib/db.js";
import { dashboardRepository } from "../repositories/dashboard.js";

export const summary = authed
  .route({ method: "GET", path: "/dashboard/summary" })
  .output(dashboardSummarySchema)
  .handler(async ({ context }) => {
    return withOrg(context.orgId, (tx) =>
      dashboardRepository.getSummary(tx, context.orgId),
    );
  });

export const dashboardRoutes = {
  summary,
};
