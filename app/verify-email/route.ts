import { redirectToPath } from "@/lib/routing/redirects";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const token = requestUrl.searchParams.get("token");

  if (!token) {
    return redirectToPath("/login");
  }

  return redirectToPath(`/api/auth/verify-email${requestUrl.search}`);
}
