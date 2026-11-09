import { NextResponse } from "next/server";

import { getSecurityTxtBody } from "@/lib/security/security-txt";

export async function GET() {
  return new NextResponse(getSecurityTxtBody(), {
    status: 200,
    headers: {
      "Content-Type": "text/plain",
    },
  });
}
