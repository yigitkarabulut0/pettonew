import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60",
  {
    variants: {
      variant: {
        primary: "bg-[var(--petto-primary)] text-white hover:translate-y-[-1px]",
        secondary: "bg-[var(--petto-secondary)] text-white hover:translate-y-[-1px]",
        ghost: "border border-[var(--petto-border)] bg-white/60 text-[var(--petto-secondary)] hover:bg-white"
      }
    },
    defaultVariants: {
      variant: "primary"
    }
  }
);

export function Button({
  className,
  variant,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />;
}

