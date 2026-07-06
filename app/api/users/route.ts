import { withApi } from "@/lib/team-budget/http";
import { listUsers, requireAdmin } from "@/lib/team-budget/store";

export async function GET(request: Request) {
  return withApi(async () => {
    const user = await requireAdmin(request);
    return Response.json(await listUsers(user));
  });
}
