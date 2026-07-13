import { readJson, withApi } from "@/lib/team-budget/http";
import { signupUser } from "@/lib/team-budget/store";
import type { AvatarUpload } from "@/lib/team-budget/types";

async function fileToAvatarUpload(file: File): Promise<AvatarUpload | null> {
  if (file.size <= 0) {
    return null;
  }

  return {
    fileName: file.name || "avatar",
    contentType: file.type || "application/octet-stream",
    size: file.size,
    bytes: await file.arrayBuffer(),
  };
}

export async function POST(request: Request) {
  return withApi(async () => {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const avatar = form.get("avatar");
      const result = await signupUser({
        name: String(form.get("name") ?? ""),
        email: String(form.get("email") ?? ""),
        approvalCode: String(form.get("approvalCode") ?? ""),
        avatar: avatar instanceof File ? await fileToAvatarUpload(avatar) : null,
        avatarPreset: String(form.get("avatarPreset") ?? ""),
      });

      return Response.json(result, { status: 201 });
    }

    const body = await readJson<{
      name?: string;
      email?: string;
      approvalCode?: string | null;
      avatarPreset?: string | null;
    }>(request);
    const result = await signupUser({
      name: body.name,
      email: body.email,
      approvalCode: body.approvalCode,
      avatarPreset: body.avatarPreset,
    });

    return Response.json(result, { status: 201 });
  });
}
