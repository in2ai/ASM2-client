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
import { CalendarIcon, Check, X } from "lucide-react";
import { useEffect, useState } from "react";
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

/**
 * Render a date range selector with quick presets, a clear option, and a popover calendar for selecting a custom range.
 *
 * The component is controlled by `value` and reports changes via `onChange`. It supports applying or canceling a drafted selection
 * and provides preset ranges (7, 30, 90 days) and a "Todos" (clear) action.
 *
 * @param value - The currently selected `DateRange` (may be `undefined` for no selection)
 * @param onChange - Callback invoked with a new `DateRange` or `undefined` when the selection is applied or cleared
 * @returns The rendered DateRangeSelector element
 */
export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  // Internal draft state for pending date selection
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(value);
  const [isOpen, setIsOpen] = useState(false);

  // Sync draft with external value when popover opens or value changes externally
  useEffect(() => {
    if (isOpen) {
      setDraftRange(value);
    }
  }, [isOpen, value]);

  const handlePresetClick = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);
    onChange({ from, to });
  };

  const handleClearFilter = () => {
    onChange(undefined);
  };

  const handleApply = () => {
    onChange(draftRange);
    setIsOpen(false);
  };

  const handleCancel = () => {
    setDraftRange(value); // Reset to current value
    setIsOpen(false);
  };

  // Check if the draft range is valid (has both from and to dates)
  const isDraftValid = draftRange?.from && draftRange?.to;

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
      <Popover open={isOpen} onOpenChange={setIsOpen}>
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
          <div className="flex flex-col">
            <Calendar
              mode="range"
              defaultMonth={draftRange?.from ?? value?.from}
              selected={draftRange}
              onSelect={setDraftRange}
              numberOfMonths={2}
              className="rounded-t-lg border-b-0 shadow-sm"
              locale={es}
            />
            <div className="bg-muted/50 flex items-center justify-end gap-2 border-t p-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCancel}
                className="h-8"
              >
                <X className="mr-1 h-4 w-4" />
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleApply}
                disabled={!isDraftValid}
                className="h-8"
              >
                <Check className="mr-1 h-4 w-4" />
                Aplicar
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
