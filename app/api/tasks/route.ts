import { NextResponse } from "next/server";

import { createTask } from "@/app/_lib/task-api";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const result = await createTask(await request.text());
  if (result.kind === "created") {
    return NextResponse.json(result.task, { status: 201 });
  }
  if (result.kind === "invalid") {
    return NextResponse.json(result.body, { status: 422 });
  }
  return NextResponse.json({ detail: "The task could not be saved." }, { status: 502 });
}
