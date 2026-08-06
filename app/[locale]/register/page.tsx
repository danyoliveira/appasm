import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import Container from "@/components/Container";
import RegisterForm from "./RegisterForm";
import CreateCoachForm from "./CreateCoachForm";
import { validateInviteToken, coachExists } from "@/lib/invites";

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { token } = await searchParams;
  const t = await getTranslations("register");

  if (token) {
    const invite = await validateInviteToken(token);
    if (!invite) {
      return (
        <Container className="max-w-md py-16 sm:py-24">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("invalidInviteTitle")}
          </h1>
          <p className="mt-4 text-muted">{t("invalidInviteMessage")}</p>
        </Container>
      );
    }

    return (
      <Container className="max-w-md py-16 sm:py-24">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("title")}
        </h1>
        <RegisterForm email={invite.email} token={token} />
      </Container>
    );
  }

  // No token: only ever valid before the coach's own (bootstrap) account
  // exists. Once it exists, this disappears and falls back to "invalid
  // invite" for anyone else who lands here without a token.
  if (!(await coachExists())) {
    return (
      <Container className="max-w-md py-16 sm:py-24">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("bootstrapTitle")}
        </h1>
        <p className="mt-2 text-muted">{t("bootstrapSubtitle")}</p>
        <CreateCoachForm />
      </Container>
    );
  }

  return (
    <Container className="max-w-md py-16 sm:py-24">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {t("invalidInviteTitle")}
      </h1>
      <p className="mt-4 text-muted">{t("invalidInviteMessage")}</p>
    </Container>
  );
}
