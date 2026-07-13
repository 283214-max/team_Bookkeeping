import { withApi } from "@/lib/team-budget/http";
import { deleteUser, requireAdmin } from "@/lib/team-budget/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, context: RouteContext) {
  return withApi(async () => {
    const user = await requireAdmin(request);
    const { id } = await context.params;
    return Response.json(await deleteUser(user, id));
  });
}
