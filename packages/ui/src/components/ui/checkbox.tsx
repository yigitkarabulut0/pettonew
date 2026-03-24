import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@petto/ui/lib/utils";

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, ...props }, ref) => (
    <div className="relative inline-flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        ref={ref}
        checked={checked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
        className="peer sr-only"
        {...props}
      />
      <div
        className={cn(
          "h-4 w-4 rounded-sm border border-primary shadow-sm transition-colors",
          "peer-checked:bg-primary peer-checked:text-primary-foreground",
          "peer-focus-visible:outline-none peer-focus-visible:ring-1 peer-focus-visible:ring-ring",
          className
        )}
      >
        {checked && <Check className="h-3 w-3 mx-auto" strokeWidth={3} />}
      </div>
    </div>
  )
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
