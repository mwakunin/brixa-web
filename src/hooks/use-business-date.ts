"use client";

import { useEffect, useState } from "react";

import { businessDate, msUntilDayAfter } from "@/lib/dates";

/**
 * Today's Kenyan date, which moves to the next day at Nairobi's midnight by
 * itself: a desk left open overnight shows the new day's work, not the last
 * day's, without anyone touching it.
 */
export function useBusinessDate(): string {
  const [today, setToday] = useState(() => businessDate());
  useEffect(() => {
    // A moment past the midnight that ends the day shown, so the new day has begun when it is read. Timed from the
    // day shown, not the clock: a day that ended between reading it and this effect moves on at once.
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      timer = setTimeout(() => {
        const now = businessDate();
        // Still the day shown, the device's clock having been set back since: timed again to its new midnight.
        if (now === today)
          arm();
        else
          setToday(now);
      }, Math.max(0, msUntilDayAfter(today)) + 1_000);
    };
    arm();
    return () => clearTimeout(timer);
  }, [today]);
  return today;
}
