import { format } from 'date-fns'
import { enUS, es } from 'date-fns/locale'
import { CalendarIcon, Check, X } from 'lucide-react'
import { useState } from 'react'
import { type DateRange } from 'react-day-picker'

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

  const handleOpenChange = (open: boolean) => {
    if (open) {
      setDraftRange(value)
    }
    setIsOpen(open)
  }

  const handlePresetClick = (days: number) => {
    const to = new Date()
    const from = new Date()
    from.setDate(from.getDate() - days)
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

  const isDraftValid = draftRange?.from && draftRange?.to

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant={!value ? 'default' : 'outline'}
        size="sm"
        onClick={handleClearFilter}
        className="min-h-11 text-xs sm:text-sm"
      >
        {t('all')}
      </Button>
      {presets.map((preset) => (
        <Button
          key={preset}
          variant="outline"
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
            variant="outline"
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
