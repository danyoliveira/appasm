import { redirect } from "next/navigation";
import Container from "@/components/Container";
import { createClient } from "@/lib/supabase/server";
import DashboardSidebar from "./DashboardSidebar";

export default async function DashboardLayout({
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

  if (!user) {
    // proxy.ts already guards this route; this is just a defensive fallback.
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, avatar_url, status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile) {
    return (
      <Container className="max-w-md py-16">
        <p className="text-sm text-muted">
          A tua conta ainda não tem um perfil associado. Fala com quem te
          convidou.
        </p>
      </Container>
    );
  }

  if (profile.status === "revoked") {
    await supabase.auth.signOut();
    redirect(`/${locale}/login?revoked=1`);
  }

  return (
    <Container className="flex max-w-6xl flex-1 flex-col md:flex-row md:items-start md:gap-8">
      <DashboardSidebar
        fullName={profile.full_name}
        email={profile.email}
        avatarUrl={profile.avatar_url}
      />
      <div className="min-w-0 flex-1 py-6 md:py-10">{children}</div>
    </Container>
  );
}
