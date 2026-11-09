function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** Local calendar date key (YYYY-MM-DD), matching the date inputs in the app. */
export function calendarDateKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function calendarMonthKey(value: Date | string) {
  return calendarDateKey(value).slice(0, 7);
}

/** Every date in a YYYY-MM month, in order. */
export function calendarMonthDates(month: string) {
  const [yearPart = "", monthPart = ""] = month.split("-");
  const year = Number(yearPart);
  const monthNumber = Number(monthPart);
  const total = new Date(year, monthNumber, 0).getDate();
  return Array.from(
    { length: total },
    (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`,
  );
}
