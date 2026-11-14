import { getRepos } from "@/lib/services/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** GET /api/results/[id]/status – lightweight polling for the paid search status. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: "Not found" }, { status: 404 });
  const result = await getRepos().results.getById(id);
  if (!result) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ paidStatus: result.paid_status }, { headers: { "cache-control": "no-store" } });
}
