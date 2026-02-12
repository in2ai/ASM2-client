"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import { useTranslations } from "next-intl";

interface ChartHintProps {
  hint: string;
}

/**
 * A small info icon with a tooltip that explains what the chart shows.
 * Place next to chart titles to provide context to users.
 */
export function ChartHint({ hint }: ChartHintProps) {
  const t = useTranslations("ChartHint");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground ml-1.5 inline-flex cursor-help transition-colors"
          aria-label={t("ariaLabel")}
        >
          <HelpCircle size={14} />
        </button>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-[280px] text-left"
        sideOffset={4}
      >
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}
