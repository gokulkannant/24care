import { NextResponse } from "next/server";
import { loadCaseDetail, toRepositoryError } from "@/lib/care-repository";
import { getAuthenticatedSession } from "@/lib/server-session";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getAuthenticatedSession();
  if (!session) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

  const { id } = await context.params;
  try {
    return NextResponse.json(await loadCaseDetail(session, id));
  } catch (error) {
    const failure = toRepositoryError(error, "Unable to load the care case.");
    return NextResponse.json({ error: failure.message }, { status: failure.status });
  }
}
