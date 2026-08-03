type ProductLogoProps = {
  className?: string;
  height?: number;
  align?: "left" | "center";
  /** Default = Warin color logo · contrast = light mark for dark backgrounds */
  variant?: "default" | "contrast";
  /** White pad behind default logo — use on dark backgrounds when not using contrast */
  framed?: boolean;
};

export function ProductLogo({
  className = "",
  height = 32,
  align = "center",
  variant = "default",
  framed = false,
}: ProductLogoProps) {
  const src = variant === "contrast" ? "/f-logo-1.png" : "/Warin-logo.png";

  const img = (
    <img
      src={src}
      alt="Warin"
      className={`block w-auto max-w-full object-contain ${
        align === "center" ? "mx-auto object-center" : "object-left"
      }`}
      style={{ height }}
      draggable={false}
    />
  );

  if (framed && variant === "default") {
    return (
      <div
        className={`inline-flex items-center justify-center rounded-md bg-white px-3 py-1 shadow-sm ${
          align === "center" ? "" : "justify-start"
        } ${className}`}
      >
        {img}
      </div>
    );
  }

  return (
    <div className={`${align === "left" ? "w-fit" : ""} ${className}`}>{img}</div>
  );
}
