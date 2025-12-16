"use client";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { type DateRange } from "react-day-picker";

interface DateRangeSelectorProps {
  readonly value: DateRange | undefined;
  readonly onChange: (range: DateRange | undefined) => void;
}

const presets = [
  { label: "Últimos 7 días", days: 7 },
  { label: "Últimos 30 días", days: 30 },
  { label: "Últimos 90 días", days: 90 },
];

export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  const handlePresetClick = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    onChange({ from, to });
  };

  const handleClearFilter = () => {
    onChange(undefined);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant={!value ? "default" : "outline"}
        size="sm"
        onClick={handleClearFilter}
        className="min-h-[44px] text-xs sm:text-sm"
      >
        Todos
      </Button>
      {presets.map((preset) => (
        <Button
          key={preset.days}
          variant="outline"
          size="sm"
          onClick={() => handlePresetClick(preset.days)}
          className="min-h-[44px] text-xs sm:text-sm"
        >
          <span className="hidden sm:inline">{preset.label}</span>
          <span className="sm:hidden">{preset.days}d</span>
        </Button>
      ))}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className={cn(
              "min-h-[44px] justify-start text-left text-xs font-normal sm:text-sm",
              !value && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
            <span className="truncate">
              {value?.from ? (
                value.to ? (
                  <>
                    <span className="hidden sm:inline">
                      {format(value.from, "dd MMM yyyy", { locale: es })} -{" "}
                      {format(value.to, "dd MMM yyyy", { locale: es })}
                    </span>
                    <span className="sm:hidden">
                      {format(value.from, "dd/MM", { locale: es })} -{" "}
                      {format(value.to, "dd/MM", { locale: es })}
                    </span>
                  </>
                ) : (
                  format(value.from, "dd MMM yyyy", { locale: es })
                )
              ) : (
                <>
                  <span className="hidden sm:inline">Rango personalizado</span>
                  <span className="sm:hidden">Personalizado</span>
                </>
              )}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="range"
            defaultMonth={value?.from}
            selected={value}
            onSelect={onChange}
            numberOfMonths={1}
            className="sm:hidden"
            locale={es}
          />
          <Calendar
            mode="range"
            defaultMonth={value?.from}
            selected={value}
            onSelect={onChange}
            numberOfMonths={2}
            className="hidden sm:block"
            locale={es}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
