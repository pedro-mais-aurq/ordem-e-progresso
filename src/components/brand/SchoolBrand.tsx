import Image from "next/image";
import { SCHOOL_BRAND, SCHOOL_LOGO_SRC } from "@/src/config/branding";
import { withBasePath } from "@/src/config/base-path";

interface SchoolBrandProps {
  context?: keyof typeof SCHOOL_BRAND;
  theme?: "light" | "dark";
  className?: string;
}

export function SchoolBrand({
  context = "institutional",
  theme = "light",
  className = "",
}: SchoolBrandProps) {
  const brand = SCHOOL_BRAND[context];
  const classes = [
    "school-brand",
    `school-brand--${context}`,
    `school-brand--${theme}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes}>
      {SCHOOL_LOGO_SRC ? (
        <Image
          className="school-brand__logo"
          src={withBasePath(SCHOOL_LOGO_SRC)}
          alt=""
          width={1024}
          height={1024}
          sizes="56px"
          unoptimized
        />
      ) : null}
      <span className="school-brand__text">
        <strong>{brand.eyebrow}</strong>
        <span>{brand.name}</span>
      </span>
    </span>
  );
}
