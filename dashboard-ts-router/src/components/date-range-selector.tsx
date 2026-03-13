import { differenceInCalendarDays, endOfDay, format, isSameDay, startOfDay, subDays } from 'date-fns'
import { enUS, es } from 'date-fns/locale'
import { CalendarIcon, Check, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type {DateRange} from 'react-day-picker';

import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useLocale, useTranslations } from 'next-intl'

interface DateRangeSelectorProps {
  readonly value: DateRange | undefined
  readonly onChange: (range: DateRange | undefined) => void
}

export function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  const t = useTranslations('DateRangeSelector')
  const locale = useLocale()
  const dateLocale = locale === 'en' ? enUS : es
  const presets = [7, 30, 90]

  const [draftRange, setDraftRange] = useState<DateRange | undefined>(value)
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setDraftRange(value)
    }
  }, [isOpen, value])

  const isAllSelected = value === undefined
  const selectedPreset = presets.find((preset) => isPresetRange(value, preset))
  const hasCustomRange = Boolean(value?.from && value.to && !selectedPreset)

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setDraftRange(value)
    }
    setIsOpen(open)
  }

  const handlePresetClick = (days: number) => {
    const to = endOfDay(new Date())
    const from = startOfDay(subDays(to, days - 1))
    onChange({ from, to })
  }

  const handleClearFilter = () => {
    onChange(undefined)
  }

  const handleApply = () => {
    onChange(draftRange)
    setIsOpen(false)
  }

  const handleCancel = () => {
    setDraftRange(value)
    setIsOpen(false)
  }

  const isDraftValid = draftRange?.from && draftRange.to

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant={isAllSelected ? 'default' : 'outline'}
        size="sm"
        onClick={handleClearFilter}
        className="min-h-11 text-xs sm:text-sm"
      >
        {t('all')}
      </Button>
      {presets.map((preset) => (
        <Button
          key={preset}
          variant={selectedPreset === preset ? 'default' : 'outline'}
          size="sm"
          onClick={() => handlePresetClick(preset)}
          className="min-h-11 text-xs sm:text-sm"
        >
          <span className="hidden sm:inline">{t('lastDays', { count: preset })}</span>
          <span className="sm:hidden">{preset}d</span>
        </Button>
      ))}
      <Popover open={isOpen} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant={hasCustomRange ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'min-h-11 justify-start text-left text-xs font-normal sm:text-sm',
              !value && 'text-muted-foreground',
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
            <span className="truncate">
              {value?.from ? (
                value.to ? (
                  <>
                    <span className="hidden sm:inline">
                      {format(value.from, 'dd MMM yyyy', {
                        locale: dateLocale,
                      })}{' '}
                      - {format(value.to, 'dd MMM yyyy', { locale: dateLocale })}
                    </span>
                    <span className="sm:hidden">
                      {format(value.from, 'dd/MM', { locale: dateLocale })} -{' '}
                      {format(value.to, 'dd/MM', { locale: dateLocale })}
                    </span>
                  </>
                ) : (
                  format(value.from, 'dd MMM yyyy', { locale: dateLocale })
                )
              ) : (
                <>
                  <span className="hidden sm:inline">{t('customRange')}</span>
                  <span className="sm:hidden">{t('customShort')}</span>
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
              locale={dateLocale}
            />
            <div className="bg-muted/50 flex items-center justify-end gap-2 border-t p-3">
              <Button variant="ghost" size="sm" onClick={handleCancel} className="h-8">
                <X className="mr-1 h-4 w-4" />
                {t('cancel')}
              </Button>
              <Button size="sm" onClick={handleApply} disabled={!isDraftValid} className="h-8">
                <Check className="mr-1 h-4 w-4" />
                {t('apply')}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function isPresetRange(range: DateRange | undefined, days: number): boolean {
  if (!range?.from || !range.to) {
    return false
  }

  const today = new Date()

  return (
    isSameDay(range.to, today) &&
    differenceInCalendarDays(range.to, range.from) === days - 1
  )
}
