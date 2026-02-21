import { getCurrentUser } from "@/lib/auth";
import { jsonUtf8 } from "@/lib/http";
import { getCurrentRoundSnapshot } from "@/services/game-round-snapshot.service";

export async function GET() {
  const current = await getCurrentUser();
  if (!current) {
    return jsonUtf8({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const snapshot = await getCurrentRoundSnapshot(current.user.id);
  if (!snapshot) {
    return jsonUtf8({ ok: false, error: "ROUND_NOT_FOUND" }, { status: 404 });
  }

  return jsonUtf8(snapshot);
}
