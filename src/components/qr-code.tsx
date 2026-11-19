import { useMemo } from "react";
import { encode } from "uqr";

/**
 * A QR code drawn in the page, for a phone's camera. Encoded here, in the
 * browser: what it carries (an authenticator secret) is never sent to a
 * service to be drawn.
 */
export function QrCode({ value, label }: { value: string; label: string }) {
  const { path, size } = useMemo(() => {
    // A quiet zone of four modules, as scanners expect; medium error correction survives a smudged screen.
    const { data } = encode(value, { border: 4, ecc: "M" });
    const modules = data.flatMap((row, y) => row.map((dark, x) => (dark ? `M${x} ${y}h1v1h-1z` : "")));
    return { path: modules.join(""), size: data.length };
  }, [value]);

  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" className="size-64 self-center bg-white">
      <path d={path} fill="#000" />
    </svg>
  );
}
