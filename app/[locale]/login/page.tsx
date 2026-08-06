import { Suspense } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import Container from "@/components/Container";
import LoginForm from "./LoginForm";

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");

  return (
    <Container className="max-w-md py-16 sm:py-24">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {t("title")}
      </h1>
      <Suspense>
        <LoginForm />
      </Suspense>
    </Container>
  );
}
