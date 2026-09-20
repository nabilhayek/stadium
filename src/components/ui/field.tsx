import type { InputHTMLAttributes, ReactNode } from "react";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  hint?: string;
};

/** HeroUI field styles on a native input — no react-aria on the checkout page. */
export function Field({ label, hint, className, id, ...rest }: Props) {
  const inputId = id ?? rest.name;
  return (
    <label className="flex min-w-0 flex-col gap-1.5" htmlFor={inputId}>
      <span className="text-[13px] font-medium text-muted">{label}</span>
      <input
        id={inputId}
        className={["input", "input--secondary", "input--full-width", "min-h-11 rounded-xl", className]
          .filter(Boolean)
          .join(" ")}
        {...rest}
      />
      {hint ? <span className="text-[12px] text-muted">{hint}</span> : null}
    </label>
  );
}
