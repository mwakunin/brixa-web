import { en } from "@/strings/en";

/** The mark alone: in the desks' header, and in front of the name. */
export function BrandMark({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 40 40">
      <rect width="40" height="40" rx="8" fill="var(--primary)" />
      <path d="M17 9h6v8h8v6h-8v8h-6v-8H9v-6h8z" fill="var(--primary-foreground)" />
    </svg>
  );
}

/** The mark and the product's name, above the sign-in form and the pages like it. */
export function Brand() {
  return (
    <div className="flex items-center gap-3">
      <BrandMark size={40} />
      <span className="text-name font-bold tracking-[-0.01em]">{en.app.name}</span>
    </div>
  );
}
