"use client";

import { useEffect, useState } from "react";

import { businessDate, msUntilNextBusinessDay } from "@/lib/dates";

/**
 * Today's Kenyan date, which moves to the next day at Nairobi's midnight by
 * itself: a desk left open overnight shows the new day's work, not the last
 * day's, without anyone touching it.
 */
export function useBusinessDate(): string {
  const [today, setToday] = useState(() => businessDate());
  useEffect(() => {
    // A moment past midnight, so the new day has begun when it is read.
    const timer = setTimeout(() => setToday(businessDate()), msUntilNextBusinessDay() + 1_000);
    return () => clearTimeout(timer);
  }, [today]);
  return today;
}
