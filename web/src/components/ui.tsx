import * as SwitchPrimitive from "@radix-ui/react-switch";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { useEffect, useId, useRef, useState } from "react";
import * as React from "react";
import { cn } from "@/lib/utils";

const focusRing =
  "outline-none focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-950";

const buttonVariants = cva(
  `inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${focusRing}`,
  {
    variants: {
      variant: {
        default: "bg-teal-700 text-white hover:bg-teal-800",
        secondary: "bg-zinc-200 text-zinc-900 hover:bg-zinc-300 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700",
        ghost: "hover:bg-zinc-200/70 dark:hover:bg-zinc-800",
        outline: "border border-zinc-300 bg-white hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800",
        destructive: "bg-rose-700 text-white hover:bg-rose-800",
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
  type,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp type={asChild ? type : (type ?? "button")} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
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
        `h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 ${focusRing}`,
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
        `h-9 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 ${focusRing}`,
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
        `min-h-20 w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm text-zinc-950 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 ${focusRing}`,
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

const popoverClass =
  "m-0 max-w-xs rounded-md border-0 bg-zinc-900 px-2 py-1.5 text-xs leading-relaxed text-white shadow-lg";

export function InfoTip({ text }: { text: string }) {
  const id = useId();
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-zinc-400 text-[10px] font-semibold leading-none text-zinc-600 hover:border-teal-700 hover:text-teal-800 dark:border-zinc-500 dark:text-zinc-300"
        aria-label={text}
      >
        i
      </button>
      <div id={id} popover="auto" className={popoverClass}>
        {text}
      </div>
    </>
  );
}

const labelledControl = new Set<unknown>([Input, Select, Textarea, "input", "select", "textarea"]);

export function Field({
  label,
  hint,
  info,
  children,
}: {
  label: string;
  hint?: string;
  info?: string;
  children: React.ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const canLabel = React.isValidElement(children) && labelledControl.has(children.type);
  const control = canLabel
    ? React.cloneElement(children as React.ReactElement<{ id?: string; "aria-describedby"?: string }>, {
        id,
        "aria-describedby": hint ? hintId : undefined,
      })
    : children;
  return (
    <div className="grid gap-1 text-sm">
      <div className="flex items-center gap-1.5 text-zinc-500">
        {canLabel ? <label htmlFor={id}>{label}</label> : <span>{label}</span>}
        {info ? <InfoTip text={info} /> : null}
      </div>
      {control}
      {hint ? (
        <span id={hintId} className="text-xs text-rose-600">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function Hint({ text, children }: { text?: string; children: React.ReactNode }) {
  const id = useId();
  if (!text) return <>{children}</>;
  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        className="cursor-help border-0 bg-transparent p-0 text-left text-inherit underline decoration-dotted underline-offset-4"
      >
        {children}
      </button>
      <div id={id} popover="auto" className={`${popoverClass} whitespace-pre-wrap`}>
        {text}
      </div>
    </>
  );
}

export function ConfirmButton({
  title,
  body,
  confirmLabel = "Confirm",
  destructive = false,
  onConfirm,
  children,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const trigger = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<{ onClick?: () => void }>, {
        onClick: () => dialogRef.current?.showModal(),
      })
    : (
        <Button onClick={() => dialogRef.current?.showModal()}>{children}</Button>
      );
  return (
    <>
      {trigger}
      <dialog
        ref={dialogRef}
        className="w-[min(24rem,calc(100%-2rem))] rounded-lg border border-zinc-200 bg-white p-4 text-zinc-950 shadow-lg backdrop:bg-black/40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        onClose={(event) => {
          if (event.currentTarget.returnValue === "confirm") void onConfirm();
        }}
      >
        <form method="dialog" className="grid gap-3">
          <h2 className="font-medium">{title}</h2>
          <p className="text-sm text-zinc-500">{body}</p>
          <div className="flex justify-end gap-2">
            <Button type="submit" variant="outline" value="cancel">
              Cancel
            </Button>
            <Button type="submit" variant={destructive ? "destructive" : "default"} value="confirm">
              {confirmLabel}
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  step = "any",
  info,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  step?: string;
  info?: string;
}) {
  const [text, setText] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setText(String(value)), [value]);
  return (
    <Field label={label} info={info} hint={error ?? undefined}>
      <Input
        inputMode="decimal"
        step={step}
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setError(null);
        }}
        onBlur={() => {
          if (text.trim() === "") {
            setError("Enter a number");
            return;
          }
          const next = Number(text);
          if (!Number.isFinite(next) || next < min) {
            setError(min > 0 ? `Must be at least ${min}` : "Enter a valid number");
            return;
          }
          setError(null);
          onChange(next);
        }}
      />
    </Field>
  );
}
