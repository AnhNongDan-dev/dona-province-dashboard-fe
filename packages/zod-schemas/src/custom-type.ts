import z from "zod";

export const dateOnlyZod = z.iso
  .date("Ngày không hợp lệ")
  .brand("YYYY-MM-DD")
  .meta({ examples: ["2024-01-15", "2024-06-20"] })
  .describe("DATE_ONLY");
export type DateOnly = z.infer<typeof dateOnlyZod>;
export function parseDateOnly(value: DateOnly): { year: number; month: number; day: number } {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

export function formatDateOnly(value: DateOnly): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export const timeOnlyZod = z.iso
  .time("Giờ không hợp lệ")
  .brand("HH:MM:SS")
  .meta({ examples: ["08:30:00", "14:45:00"] })
  .describe("TIME_ONLY");
export type TimeOnly = z.infer<typeof timeOnlyZod>;
export function parseTimeOnly(value: TimeOnly): {
  hour: number;
  minute: number;
  second: number;
} {
  const [hour, minute, second] = value.split(":").map(Number);
  return { hour, minute, second };
}

export function toDate(date: DateOnly, time: TimeOnly): Date {
  const { year, month, day } = parseDateOnly(date);
  const { hour, minute, second } = parseTimeOnly(time);
  return new Date(year, month - 1, day, hour, minute, second);
}
