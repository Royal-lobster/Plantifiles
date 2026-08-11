import { NextResponse } from "next/server";
import { PublishError } from "@/lib/plans";

export function apiError(error: unknown): NextResponse {
  if (error instanceof PublishError) {
    return NextResponse.json({ error: error.message, details: error.details }, { status: error.status });
  }
  if (error instanceof Error && error.message.includes("Unique constraint")) {
    return NextResponse.json({ error: "A record with that identifier already exists." }, { status: 409 });
  }
  console.error(error);
  return NextResponse.json({ error: "Internal server error." }, { status: 500 });
}
