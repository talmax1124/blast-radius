import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tracking-wide uppercase",
  {
    variants: {
      variant: {
        default: "bg-elevated text-muted",
        smash: "bg-brick/15 text-brick",
        strong: "bg-pine/15 text-pine",
        lean: "bg-accent/10 text-accent",
        spec: "bg-elevated text-faint",
        brick: "bg-brick/15 text-brick",
        pine: "bg-pine/15 text-pine",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
