import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// The archive (past clubs, their squads, preparations and dossier) is the
// coach's alone — it's gone from everyone else's menu, and a direct link
// lands back on the dashboard.
export default async function ArchiveLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "coach") redirect(`/${locale}/dashboard`);

  return children;
}
