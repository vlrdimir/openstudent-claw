const JAKARTA_TIME_ZONE = "Asia/Jakarta";

type JakartaDateParts = {
  year: string;
  month: string;
  day: string;
  hour: string;
  minute: string;
  second: string;
};

const jakartaDateTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: JAKARTA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function getJakartaDateTimeParts(now: Date): JakartaDateParts {
  const parts = jakartaDateTimeFormatter.formatToParts(now);
  const lookup = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: lookup.get("year") ?? "0000",
    month: lookup.get("month") ?? "00",
    day: lookup.get("day") ?? "00",
    hour: lookup.get("hour") ?? "00",
    minute: lookup.get("minute") ?? "00",
    second: lookup.get("second") ?? "00",
  };
}

export function formatJakartaLocalDate(now: Date = new Date()): string {
  const parts = getJakartaDateTimeParts(now);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatJakartaLocalTime(
  now: Date = new Date(),
  options?: { includeSeconds?: boolean },
): string {
  const parts = getJakartaDateTimeParts(now);
  if (options?.includeSeconds) {
    return `${parts.hour}:${parts.minute}:${parts.second}`;
  }
  return `${parts.hour}:${parts.minute}`;
}

export function formatJakartaLocalDateTime(
  now: Date = new Date(),
  options?: { includeSeconds?: boolean; includeZoneLabel?: boolean },
): string {
  const date = formatJakartaLocalDate(now);
  const time = formatJakartaLocalTime(now, {
    includeSeconds: options?.includeSeconds,
  });

  return options?.includeZoneLabel === false
    ? `${date} ${time}`
    : `${date} ${time} WIB`;
}

export { JAKARTA_TIME_ZONE };
