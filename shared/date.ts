const KARACHI_TIME_ZONE = "Asia/Karachi";

const dateParts = (date: Date): Record<string, string> => {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en", {
      timeZone: KARACHI_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
};

export const karachiDateInputValue = (date = new Date()): string => {
  const parts = dateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const karachiYearMonth = (
  date = new Date(),
): { year: number; month: number } => {
  const parts = dateParts(date);
  return { year: Number(parts.year), month: Number(parts.month) };
};
