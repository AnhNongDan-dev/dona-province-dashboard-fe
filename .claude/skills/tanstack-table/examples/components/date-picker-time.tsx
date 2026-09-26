// =============================================================================
// DatePickerTime — calendar date picker + time input (HH:mm:ss) combo.
// Used internally by DateRangeFilter.
//
// Drop into: src/components/common/date-picker-time.tsx
//
// This file references project-specific helpers (`convertDateTimeVietnam`,
// `logger`) that handle Asia/Saigon timezone arithmetic. Replace those with
// your own date/timezone helpers — the component shape stays the same.
//
//   - `convertDateTimeVietnam({ date })` → returns `{ parsedDate, date }`
//     where `parsedDate` is `{ day, month, year, hours, minutes, seconds }`
//     in Asia/Saigon. The inverse takes `parsedDate` and returns a `Date`.
//   - `logger` is a wrapper around console.log. Strip the calls if you don't
//     have one.
//
// If you don't need the time input (date-only filter), swap this for a plain
// shadcn Calendar inside a Popover.
//
// Shadcn primitives required: button, button-group, calendar, input, popover.
// Internal dep: useIsMobile hook (renders stacked column on mobile).
// =============================================================================

import { format } from "date-fns";
import { vi } from "date-fns/locale";
import { ChevronDownIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { logger } from "@/lib/client-logger";
import { convertDateTimeVietnam, type ParsedDate } from "@/utils/datetime-vietnam";

interface DatePickerTimeProps {
  date: Date;
  onChange: (dateTime: Date) => void;
  disabled?: boolean;
}

function formatTime({
  hours,
  minutes,
  seconds,
}: Pick<ParsedDate, "minutes" | "hours" | "seconds">): string {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function DatePickerTime({ date, onChange, disabled }: DatePickerTimeProps) {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const { hours, minutes, seconds, day, month, year } = convertDateTimeVietnam({ date }).parsedDate;

  const dateButton = (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          id="date-picker-optional"
          className={
            isMobile
              ? "w-full justify-between font-normal"
              : "w-50 min-w-50 justify-between font-normal"
          }
        >
          {date ? format(date, "dd/MM/yyyy", { locale: vi }) : "Select date"}
          <ChevronDownIcon data-icon="inline-end" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <Calendar
          mode="single"
          selected={date}
          captionLayout="dropdown"
          timeZone="Asia/Saigon"
          locale={vi}
          startMonth={new Date(2025, 0)}
          endMonth={new Date(new Date().getFullYear() + 4, 0)}
          defaultMonth={date}
          disabled={disabled}
          onSelect={(selectedDate) => {
            if (selectedDate instanceof Date) {
              logger.info("logger ~ date-picker-time.tsx ~ line 54:", selectedDate.toISOString());
              const [yyyy, mm, dd] = selectedDate
                .toISOString()
                .split("T")[0]
                .split("-")
                .map(Number);
              logger.info("logger ~ date-picker-time.tsx ~ line 57:", [yyyy, mm, dd]);
              const newDate = convertDateTimeVietnam({
                parsedDate: {
                  day: dd,
                  month: mm,
                  year: yyyy,
                  hours,
                  minutes,
                  seconds,
                },
              }).date;
              logger.info("logger ~ date-picker-time.tsx ~ line 62:", newDate);
              onChange(new Date(newDate.toISOString()));
            }
            setOpen(false);
          }}
          showOutsideDays={false}
          formatters={{
            formatMonthDropdown(month) {
              const mm = convertDateTimeVietnam({ date: month }).parsedDate.month;
              return `Tháng ${mm}`;
            },
          }}
        />
      </PopoverContent>
    </Popover>
  );

  const timeInput = (
    <Input
      type="time"
      id="time-picker-optional"
      step="1"
      value={formatTime({ hours, minutes, seconds })}
      disabled={disabled}
      onChange={(e) => {
        const [hh, mm = minutes, ss = seconds] = e.currentTarget.value.split(":").map(Number);
        if (hh === undefined || mm === undefined || ss === undefined) return;
        const newDate = convertDateTimeVietnam({
          parsedDate: {
            day,
            month,
            year,
            hours: hh,
            minutes: mm,
            seconds: ss,
          },
        }).date;
        onChange(newDate);
      }}
      className={`bg-background appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none ${isMobile ? "w-full" : "w-48"}`}
    />
  );

  if (isMobile) {
    return (
      <div className="flex flex-col gap-2 max-w-xs">
        {dateButton}
        {timeInput}
      </div>
    );
  }

  return (
    <ButtonGroup className="max-w-xs flex-row">
      {dateButton}
      {timeInput}
    </ButtonGroup>
  );
}
