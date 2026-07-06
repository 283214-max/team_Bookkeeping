import { readJson, withApi } from "@/lib/team-budget/http";
import { requireAdmin, updateUserRole } from "@/lib/team-budget/store";
import type { Role } from "@/lib/team-budget/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  return withApi(async () => {
    const user = await requireAdmin(request);
    const { id } = await context.params;
    const body = await readJson<{ role?: Role }>(request);

    return Response.json(await updateUserRole(user, id, body.role ?? "MEMBER"));
  });
}
