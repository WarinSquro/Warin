import { useCallback } from "react";
import { useSettings } from "../context/SettingsContext";
import {
  formatAppDate,
  formatAppDateTime,
  formatAppDateWithWeekday,
  formatAppTime12h,
} from "../utils/formatAppDate";
import type { DateFormatPattern } from "../data/settings";

/** Bound formatters using Settings → Date Format. */
export function useAppDateFormat() {
  const { settings } = useSettings();
  const pattern: DateFormatPattern = settings.dateFormat ?? "dd/MM/yyyy";

  const formatDate = useCallback(
    (iso: string | null | undefined) => formatAppDate(iso, pattern),
    [pattern]
  );
  const formatDateTime = useCallback(
    (value: string | Date | null | undefined) => formatAppDateTime(value, pattern),
    [pattern]
  );
  const formatTime = useCallback(
    (value: string | Date | null | undefined) => formatAppTime12h(value),
    []
  );
  const formatDateWithWeekday = useCallback(
    (iso: string | null | undefined) => formatAppDateWithWeekday(iso, pattern),
    [pattern]
  );

  return { dateFormat: pattern, formatDate, formatDateTime, formatTime, formatDateWithWeekday };
}
