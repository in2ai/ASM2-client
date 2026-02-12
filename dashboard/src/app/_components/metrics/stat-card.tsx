"use client";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { type ElementType } from "react";

interface StatCardProps {
  label: string;
  value: string;
  helper?: string;
  icon: ElementType;
  trend?: { value: string; positive: boolean };
}

/**
 * Render a stylized statistic card with an icon, a prominent value, a label, and optional trend badge and helper text.
 *
 * @param label - The uppercase label text shown above the main value
 * @param value - The primary statistic displayed prominently as the card title
 * @param helper - Optional small helper text rendered below the card content
 * @param icon - React component type used for the card icons (rendered at two sizes)
 * @param trend - Optional trend indicator with shape `{ value: string; positive: boolean }`; `value` is displayed inside the badge and `positive` controls its styling
 * @returns The rendered statistic card element
 */
export function StatCard({
  label,
  value,
  helper,
  icon: Icon,
  trend,
}: Readonly<StatCardProps>) {
  return (
    <Card className="group border-border/50 bg-card/80 hover:shadow-primary/5 relative overflow-hidden rounded-2xl backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      <div className="absolute top-0 right-0 p-4 opacity-[0.04] transition-opacity group-hover:opacity-[0.08]">
        <Icon size={80} />
      </div>
      <CardHeader className="p-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="bg-primary/10 text-primary group-hover:bg-primary/15 rounded-lg p-2 transition-colors">
            <Icon size={18} />
          </div>
          {trend && (
            <Badge
              variant={trend.positive ? "default" : "destructive"}
              className={cn(
                "h-5 px-1 text-[10px] font-bold",
                trend.positive &&
                  "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20",
              )}
            >
              {trend.value}
            </Badge>
          )}
        </div>
        <CardDescription className="text-muted-foreground mt-2 text-[11px] font-semibold tracking-wider uppercase">
          {label}
        </CardDescription>
        <CardTitle className="text-2xl font-black tracking-tight lg:text-3xl">
          {value}
        </CardTitle>
      </CardHeader>
      {helper ? (
        <CardContent className="p-4 pt-0">
          <p className="text-muted-foreground text-[10px] font-medium">
            {helper}
          </p>
        </CardContent>
      ) : null}
    </Card>
  );
}
