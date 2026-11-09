import { cn } from "@/lib/utils";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  TextareaHTMLAttributes,
  ReactNode,
} from "react";

export function Button({
  className,
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const styles = {
    primary:
      "bg-gradient-to-b from-primary-bright to-primary text-background shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:brightness-110",
    secondary:
      "bg-surface-2/80 border border-white/10 text-foreground hover:border-primary/50 hover:bg-surface-2",
    ghost: "text-muted hover:text-foreground hover:bg-surface-2",
    danger: "bg-red-600/90 hover:bg-red-500 text-white",
  }[variant];
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
        styles,
        className
      )}
      {...props}
    />
  );
}

export function Card({
  className,
  hover = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-white/8 bg-surface/70 backdrop-blur-sm p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        hover &&
          "transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/10",
        className
      )}
      {...props}
    />
  );
}

export function CardTitle({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <h3 className={cn("text-lg font-semibold mb-4", className)}>{children}</h3>
  );
}

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "w-full rounded-lg border border-white/10 bg-surface-2/80 px-3 py-2 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 transition-colors",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-lg border border-white/10 bg-surface-2/80 px-3 py-2 text-sm text-foreground placeholder:text-muted/50 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50 min-h-32 transition-colors",
        className
      )}
      {...props}
    />
  );
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "rounded-lg border border-white/10 bg-surface-2/80 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 transition-colors",
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Badge({
  className,
  tone = "default",
  children,
}: {
  className?: string;
  tone?: "default" | "green" | "red" | "yellow" | "accent";
  children: ReactNode;
}) {
  const tones = {
    default: "bg-surface-2 text-muted border-white/10",
    green: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    red: "bg-red-500/15 text-red-300 border-red-500/30",
    yellow: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    accent: "bg-primary/15 text-accent border-primary/40",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        tones,
        className
      )}
    >
      {children}
    </span>
  );
}

export function Label({
  className,
  children,
  ...props
}: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn("block text-sm font-medium text-muted mb-1.5", className)}
      {...props}
    >
      {children}
    </label>
  );
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  centered = false,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  centered?: boolean;
}) {
  return (
    <div className={cn("mb-10", centered && "text-center")}>
      {eyebrow && (
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
          {eyebrow}
        </p>
      )}
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      {subtitle && (
        <p
          className={cn(
            "mt-3 text-muted",
            centered && "mx-auto max-w-xl"
          )}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
