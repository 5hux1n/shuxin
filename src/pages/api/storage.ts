import { z } from "zod";
import { guard, rateLimit } from "../../lib/auth";
import { endpoint, body, json } from "../../lib/http";
import {
  prepareStore,
  saveStore,
  selectStore,
  storageSettings,
} from "../../lib/storage/config";
import { ObjectClient } from "../../lib/storage/client";
import { cleanupOrphans } from "../../lib/storage/media";
export const POST = endpoint(async (ctx) => {
  guard(ctx);
  rateLimit("storage", 20);
  const raw = await body(ctx.request);
  const { action } = z
    .object({ action: z.enum(["save", "test", "select", "cleanup"]) })
    .parse(raw);
  if (action === "select") {
    selectStore(
      z.object({ id: z.union([z.literal(""), z.uuid()]) }).parse(raw).id,
    );
    return json({
      message: "文件存储已切换，已有文件保持原位置",
      storage: storageSettings(),
    });
  }
  if (action === "cleanup") {
    const result = await cleanupOrphans();
    return json({
      message: `已处理 ${result.attempted} 个待清理文件，${result.failed} 个仍待重试`,
    });
  }
  const input = prepareStore(raw);
  await new ObjectClient(input).test();
  if (action === "test")
    return json({ message: "连接成功，上传、读取、删除及私有访问检查通过" });
  saveStore(input);
  return json({
    message: "对象存储已保存并启用，新上传将使用此配置",
    storage: storageSettings(),
  });
});
