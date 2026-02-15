import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { checkSnowflakeHealth } from "@/lib/snowflake";

export async function GET() {
  try {
    const health = await checkSnowflakeHealth();

    if (!health.configured) {
      return NextResponse.json(
        {
          ok: false,
          configured: false,
          reachable: false,
          message: "Snowflake env vars are not fully configured"
        },
        { status: 400 }
      );
    }

    if (!health.reachable) {
      return NextResponse.json(
        {
          ok: false,
          configured: true,
          reachable: false,
          message: health.error ?? "Snowflake not reachable"
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      configured: true,
      reachable: true,
      database: health.database,
      schema: health.schema,
      warehouse: health.warehouse,
      eventCount: health.eventCount
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        configured: true,
        reachable: false,
        message: error instanceof Error ? error.message : "Unknown error"
      },
      { status: 500 }
    );
  }
}
