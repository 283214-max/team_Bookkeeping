import { readJson, withApi } from "@/lib/team-budget/http";
import {
  getSignupApprovalCode,
  requireAdmin,
  updateSignupApprovalCode,
} from "@/lib/team-budget/store";

export async function GET(request: Request) {
  return withApi(async () => {
    const user = await requireAdmin(request);
    return Response.json(await getSignupApprovalCode(user));
  });
}

export async function PUT(request: Request) {
  return withApi(async () => {
    const user = await requireAdmin(request);
    const body = await readJson<{ approvalCode?: string | null }>(request);
    return Response.json(
      await updateSignupApprovalCode(user, {
        approvalCode: body.approvalCode,
      }),
    );
  });
}
