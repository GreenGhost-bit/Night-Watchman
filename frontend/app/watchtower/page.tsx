import { redirect } from "next/navigation";

// The Watchtower lives at "/" (the operator's home screen); this route exists
// because PROJECT.md 5.5 names it "/" or "/watchtower" — keep one canonical URL.
export default function WatchtowerRedirect() {
  redirect("/");
}
