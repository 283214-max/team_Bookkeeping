import { withApi } from "@/lib/team-budget/http";
import { getUserAvatar } from "@/lib/team-budget/store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  return withApi(async () => {
    const { id } = await context.params;
    const avatar = await getUserAvatar(id);

    return new Response(avatar.body, {
      headers: {
        "content-type": avatar.contentType,
        "content-disposition": `inline; filename="${encodeURIComponent(
          avatar.fileName,
        )}"`,
        "cache-control": "public, max-age=300",
      },
    });
  });
}
