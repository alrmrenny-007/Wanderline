import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { getUid } from "@/lib/session";

export async function POST(req: Request) {
  const uid = await getUid();
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const file = (await req.formData()).get("file");
  if (!(file instanceof File) || !file.type.startsWith("image/") || file.size > 8_000_000)
    return NextResponse.json({ error: "Upload an image under 8 MB." }, { status: 400 });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    // Local dev fallback: inline the image so the app works with zero setup.
    const b64 = Buffer.from(await file.arrayBuffer()).toString("base64");
    return NextResponse.json({ url: `data:${file.type};base64,${b64}` });
  }
  const safe = file.name.replace(/[^a-z0-9._-]/gi, "_").slice(-60);
  const blob = await put(`media/${uid}/${Date.now()}-${safe}`, file, { access: "public", contentType: file.type });
  return NextResponse.json({ url: blob.url });
}
