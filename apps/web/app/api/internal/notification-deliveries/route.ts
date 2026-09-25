import { NextResponse } from "next/server";
import { processNotificationDeliveryBatch } from "../../../../lib/server/notification-delivery";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return run(request);
}

export async function GET(request: Request) {
  return run(request);
}

async function run(request: Request) {
  const secret = process.env.VETOLAYER_DELIVERY_WORKER_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "DELIVERY_WORKER_NOT_CONFIGURED" }, { status: 503 });
  }
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const result = await processNotificationDeliveryBatch({ limit: 50 });
  return NextResponse.json(result, { headers: { "Cache-Control": "private, no-store" } });
}
