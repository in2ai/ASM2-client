"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type AppLocale } from "@/i18n/config";
import { Check, Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

const languageOptions: ReadonlyArray<{ value: AppLocale }> = [
  { value: "es" },
  { value: "en" },
];

export function LanguageSwitcher() {
  const t = useTranslations("LanguageSwitcher");
  const optionLabels: Record<AppLocale, string> = {
    es: t("spanish"),
    en: t("english"),
  };
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSelectLocale = (nextLocale: AppLocale) => {
    if (nextLocale === locale) {
      return;
    }

    startTransition(() => {
      void (async () => {
        await fetch("/api/locale", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ locale: nextLocale }),
        });

        router.refresh();
      })();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="bg-muted/50 hover:bg-muted h-9 w-9 rounded-xl transition-colors"
          aria-label={t("ariaLabel")}
          disabled={isPending}
        >
          <Languages className="h-4 w-4" />
          <span className="sr-only">{t("ariaLabel")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[140px]">
        {languageOptions.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onClick={() => handleSelectLocale(option.value)}
            className="flex cursor-pointer items-center gap-2"
          >
            <span>{optionLabels[option.value]}</span>
            {locale === option.value && <Check className="ml-auto h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
