import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600",
  {
    variants: {
      variant: {
        default: "bg-teal-700 text-white hover:bg-teal-800",
        secondary: "bg-zinc-200 text-zinc-900 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700",
        ghost: "hover:bg-zinc-200/70 dark:hover:bg-zinc-800",
        outline: "border border-zinc-300 bg-transparent hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-900",
      },
      size: {
        default: "h-9 px-3",
        sm: "h-8 px-2 text-xs",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("rounded-lg border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900", className)}
      {...props}
    />
  );
}

export function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-zinc-300 px-2 py-0.5 text-xs text-zinc-600 dark:border-zinc-700 dark:text-zinc-300",
        className,
      )}
      {...props}
    />
  );
}

export function Input(props: React.ComponentProps<"input">) {
  return (
    <input
      {...props}
      className={cn(
        "h-9 w-full rounded-md border border-zinc-300 bg-transparent px-2 text-sm outline-none focus:border-teal-600 dark:border-zinc-700",
        props.className,
      )}
    />
  );
}

export function Select(props: React.ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={cn(
        "h-9 w-full rounded-md border border-zinc-300 bg-transparent px-2 text-sm outline-none focus:border-teal-600 dark:border-zinc-700",
        props.className,
      )}
    />
  );
}

export function Textarea(props: React.ComponentProps<"textarea">) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-20 w-full rounded-md border border-zinc-300 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-teal-600 dark:border-zinc-700",
        props.className,
      )}
    />
  );
}

export function Switch(props: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      {...props}
      className={cn(
        "inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-zinc-300 bg-zinc-200 data-[state=checked]:bg-teal-700 dark:border-zinc-600 dark:bg-zinc-800",
        props.className,
      )}
    >
      <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white transition data-[state=checked]:translate-x-4" />
    </SwitchPrimitive.Root>
  );
}

export const Tabs = TabsPrimitive.Root;
export const TabsList = ({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) => (
  <TabsPrimitive.List className={cn("inline-flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800", className)} {...props} />
);
export const TabsTrigger = ({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) => (
  <TabsPrimitive.Trigger
    className={cn(
      "rounded-md px-3 py-1 text-sm data-[state=active]:bg-white data-[state=active]:shadow-sm dark:data-[state=active]:bg-zinc-950",
      className,
    )}
    {...props}
  />
);
export const TabsContent = TabsPrimitive.Content;

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="text-zinc-500">{label}</span>
      {children}
    </label>
  );
}
