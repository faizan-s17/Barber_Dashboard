import * as React from "react"
import { addDays, format } from "date-fns"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

function parseYMD(str) {
  if (!str) return undefined
  const [y, m, d] = str.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function toYMD(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, "0")
  const d = String(date.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

const PRESETS = [
  { label: "Today", value: 0 },
  { label: "Tomorrow", value: 1 },
  { label: "In 3 days", value: 3 },
  { label: "In a week", value: 7 },
  { label: "In 2 weeks", value: 14 },
]

// Date-only picker with quick presets. `value`/`onChange` are 'YYYY-MM-DD'
// strings (matching the rest of the booking form), not Date objects, so
// callers never need date-fns themselves.
export function DatePickerField({ value, onChange, minDateStr }) {
  const [open, setOpen] = React.useState(false)
  const selected = parseYMD(value)
  const minDate = minDateStr ? parseYMD(minDateStr) : undefined
  const [month, setMonth] = React.useState(selected || minDate || new Date())

  function select(date) {
    if (!date) return
    onChange(toYMD(date))
    setMonth(date)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-start text-left font-normal h-auto py-2",
            !selected && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="size-4" />
          {selected ? format(selected, "EEE d MMM yyyy") : "Pick a date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start" side="bottom" avoidCollisions={false}>
        <div className="p-3">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={select}
            month={month}
            onMonthChange={setMonth}
            fixedWeeks
            disabled={minDate ? { before: minDate } : undefined}
            className="p-0"
          />
        </div>
        <div className="flex flex-wrap gap-2 border-t p-3">
          {PRESETS.map((preset) => {
            const d = addDays(new Date(), preset.value)
            if (minDate && d < minDate) return null
            return (
              <Button
                key={preset.value}
                type="button"
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => select(d)}
              >
                {preset.label}
              </Button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}
