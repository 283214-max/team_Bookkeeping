import { withApi } from "@/lib/team-budget/http";
import { getCurrentUser, getDashboardSummary } from "@/lib/team-budget/store";

export async function GET(request: Request) {
  return withApi(async () => {
    await getCurrentUser(request);
    return Response.json(await getDashboardSummary());
  });
}
