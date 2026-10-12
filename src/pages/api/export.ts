import { guard } from "../../lib/auth";
import { endpoint } from "../../lib/http";
import { exportBackup } from "../../lib/backup";
export const POST = endpoint(async (ctx) => {
  guard(ctx);
  const bytes = await exportBackup();
  return new Response(
    bytes instanceof Uint8Array ? new Uint8Array(bytes) : bytes,
    {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="shuxin-backup-${new Date().toISOString().slice(0, 10)}.zip"`,
        "Cache-Control": "no-store",
      },
    },
  );
});
