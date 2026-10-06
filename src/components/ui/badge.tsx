import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-sm px-1.5 py-0.5 text-[0.65rem] font-medium tracking-widest uppercase",
  {
    variants: {
      variant: {
        default: "bg-elevated text-muted",
        smash: "bg-brick text-paper",
        strong: "bg-pine/20 text-pine",
        lean: "bg-paper/10 text-paper",
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
