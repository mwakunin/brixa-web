import { en } from "@/strings/en";

/** The mark and the product's name, above the sign-in form and the pages like it. */
export function Brand() {
  return (
    <div className="flex items-center gap-3">
      <svg aria-hidden="true" width="40" height="40" viewBox="0 0 40 40">
        <rect width="40" height="40" rx="8" fill="#0f172a" />
        <path d="M17 9h6v8h8v6h-8v8h-6v-8H9v-6h8z" fill="#ffffff" />
      </svg>
      <span className="text-[28px] font-bold tracking-[-0.01em]">{en.app.name}</span>
    </div>
  );
}
