import { withApi } from "@/lib/team-budget/http";
import {
  getCurrentUser,
  getTransactionReceipt,
} from "@/lib/team-budget/store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  return withApi(async () => {
    const user = await getCurrentUser(request);
    const { id } = await context.params;
    const receipt = await getTransactionReceipt(user, id);

    return new Response(receipt.body, {
      headers: {
        "content-type": receipt.contentType,
        "content-disposition": `inline; filename="${encodeURIComponent(
          receipt.fileName,
        )}"`,
        "cache-control": "private, max-age=300",
      },
    });
  });
}
