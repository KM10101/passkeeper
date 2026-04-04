# PassKeeper UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign PassKeeper frontend from bare-bones inline styles to a production-quality three-column UI using shadcn/ui + Tailwind CSS with dark/light theme, full CRUD modals, and group management.

**Architecture:** ThemeProvider wraps the app and manages dark/light class on `<html>`; VaultPage owns selectedGroupId/selectedEntryId state and renders AppShell with three columns (GroupTree | EntryList | EntryDetail); all mutations go through existing useGroups/useEntries hooks; new/edit entry uses a centered Dialog modal.

**Tech Stack:** Tailwind CSS v3, PostCSS, shadcn/ui, lucide-react, React 18, TanStack React Query v5, TypeScript

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/lib/theme.ts` | applyTheme(), getStoredTheme() helpers |
| Create | `src/components/layout/ThemeProvider.tsx` | dark/light context + localStorage |
| Create | `src/components/layout/AppShell.tsx` | TopBar + three-column skeleton |
| Create | `src/components/sidebar/GroupMenu.tsx` | "..." dropdown: rename, delete, icon |
| Rewrite | `src/components/GroupTree.tsx` | Group list with active state + GroupMenu |
| Create | `src/components/entries/EntryCard.tsx` | Single entry card (favicon + title + meta) |
| Rewrite | `src/components/EntryList.tsx` | Scrollable card list with search + New Entry btn |
| Create | `src/components/entries/EntryDetail.tsx` | Right-panel detail view |
| Create | `src/components/entries/EntryDialog.tsx` | New/edit modal with full form |
| Rewrite | `src/pages/UnlockPage.tsx` | Centered card with shadcn components |
| Rewrite | `src/pages/VaultPage.tsx` | Mounts AppShell, owns selection state |
| Modify | `src/App.tsx` | Wrap with ThemeProvider |
| Modify | `src/main.tsx` | Import Tailwind CSS |
| Create | `src/index.css` | Tailwind directives + shadcn CSS vars |
| Modify | `package.json` | Add tailwindcss, postcss, shadcn deps |
| Create | `tailwind.config.js` | Tailwind config with shadcn dark mode |
| Create | `postcss.config.js` | PostCSS config |
| Create | `components.json` | shadcn/ui config |

---

### Task 1: Install dependencies and configure Tailwind + shadcn

**Files:**
- Modify: `package.json`
- Create: `tailwind.config.js`
- Create: `postcss.config.js`
- Create: `components.json`
- Create: `src/index.css`
- Modify: `src/main.tsx`

- [ ] **Step 1: Install npm packages**

```bash
npm install tailwindcss@^3 postcss autoprefixer @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-select @radix-ui/react-switch @radix-ui/react-tooltip @radix-ui/react-slot class-variance-authority clsx tailwind-merge lucide-react
```

Expected: packages installed, no peer dep errors.

- [ ] **Step 2: Create tailwind.config.js**

```js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 3: Create postcss.config.js**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 4: Create components.json (shadcn config)**

```json
{
  "$schema": "https://ui.shadcn.com/schema.json",
  "style": "default",
  "rsc": false,
  "tsx": true,
  "tailwind": {
    "config": "tailwind.config.js",
    "css": "src/index.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```

- [ ] **Step 5: Create src/index.css with Tailwind directives and CSS variables**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --primary: 221.2 83.2% 53.3%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --primary: 217.2 91.2% 59.8%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --ring: 224.3 76.3% 48%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

- [ ] **Step 6: Update src/main.tsx to import index.css**

Replace the existing CSS import (if any) or add at top:

```tsx
import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 7: Create src/lib/utils.ts (shadcn cn helper)**

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 8: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors (or only pre-existing errors unrelated to new files).

- [ ] **Step 9: Commit**

```bash
git add package.json tailwind.config.js postcss.config.js components.json src/index.css src/main.tsx src/lib/utils.ts
git commit -m "chore: install tailwind + shadcn deps and config"
```


- [ ] **Step 6: Update src/main.tsx to import index.css**

```tsx
import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 7: Create src/lib/utils.ts (shadcn cn helper)**

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 8: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors (only new files added so far).

- [ ] **Step 9: Commit**

```bash
git add package.json tailwind.config.js postcss.config.js components.json src/index.css src/main.tsx src/lib/utils.ts
git commit -m "chore: install tailwind + shadcn deps, add CSS vars and utils"
```

---

### Task 2: Create shadcn UI primitives

**Files:**
- Create: `src/components/ui/button.tsx`
- Create: `src/components/ui/input.tsx`
- Create: `src/components/ui/label.tsx`
- Create: `src/components/ui/textarea.tsx`
- Create: `src/components/ui/badge.tsx`
- Create: `src/components/ui/dialog.tsx`
- Create: `src/components/ui/dropdown-menu.tsx`
- Create: `src/components/ui/select.tsx`
- Create: `src/components/ui/switch.tsx`

- [ ] **Step 1: Create src/components/ui/button.tsx**

```tsx
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";
export { Button, buttonVariants };
```

- [ ] **Step 2: Create src/components/ui/input.tsx**

```tsx
import * as React from "react";
import { cn } from "../../lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    ref={ref}
    {...props}
  />
));
Input.displayName = "Input";
export { Input };
```

- [ ] **Step 3: Create src/components/ui/label.tsx**

```tsx
import * as React from "react";
import { cn } from "../../lib/utils";

const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70", className)}
      {...props}
    />
  ),
);
Label.displayName = "Label";
export { Label };
```

- [ ] **Step 4: Create src/components/ui/textarea.tsx**

```tsx
import * as React from "react";
import { cn } from "../../lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      ref={ref}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
export { Textarea };
```

- [ ] **Step 5: Create src/components/ui/badge.tsx**

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        secondary: "border-transparent bg-secondary text-secondary-foreground",
        outline: "text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
export { Badge, badgeVariants };
```

- [ ] **Step 6: Create src/components/ui/dialog.tsx**

```tsx
import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn("fixed inset-0 z-50 bg-black/80", className)}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 sm:rounded-lg",
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn("text-lg font-semibold leading-none tracking-tight", className)} {...props} />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

export { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogClose };
```

- [ ] **Step 7: Create src/components/ui/dropdown-menu.tsx**

```tsx
import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "../../lib/utils";

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 min-w-[8rem] overflow-hidden rounded-md border bg-background p-1 text-foreground shadow-md",
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName;

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { inset?: boolean }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      inset && "pl-8",
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = DropdownMenuPrimitive.Item.displayName;

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator ref={ref} className={cn("-mx-1 my-1 h-px bg-muted", className)} {...props} />
));
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName;

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator };
```

- [ ] **Step 8: Create src/components/ui/select.tsx**

```tsx
import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../../lib/utils";

const Select = SelectPrimitive.Root;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-4 w-4 opacity-50" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = "popper", ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      className={cn(
        "relative z-50 min-w-[8rem] overflow-hidden rounded-md border bg-background text-foreground shadow-md",
        className,
      )}
      position={position}
      {...props}
    >
      <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      "relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-4 w-4" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

export { Select, SelectValue, SelectTrigger, SelectContent, SelectItem };
```

- [ ] **Step 9: Create src/components/ui/switch.tsx**

```tsx
import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "../../lib/utils";

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input",
      className,
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0",
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = SwitchPrimitive.Root.displayName;
export { Switch };
```

- [ ] **Step 10: Commit**

```bash
git add src/components/ui/
git commit -m "feat: add shadcn UI primitives (button, input, label, textarea, badge, dialog, dropdown, select, switch)"
```

---

### Task 3: Theme system (lib/theme.ts + ThemeProvider)

**Files:**
- Create: `src/lib/theme.ts`
- Create: `src/components/layout/ThemeProvider.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create src/lib/theme.ts**

```ts
export type Theme = "light" | "dark";
const KEY = "passkeeper-theme";

export function getStoredTheme(): Theme {
  return (localStorage.getItem(KEY) as Theme) ?? "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  localStorage.setItem(KEY, theme);
}
```

- [ ] **Step 2: Create src/components/layout/ThemeProvider.tsx**

```tsx
import { createContext, useContext, useEffect, useState } from "react";
import { type Theme, applyTheme, getStoredTheme } from "../../lib/theme";

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  toggleTheme: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => (t === "light" ? "dark" : "light"));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
```

- [ ] **Step 3: Wrap App with ThemeProvider in src/App.tsx**

```tsx
import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "./components/layout/ThemeProvider";
import { UnlockPage } from "./pages/UnlockPage";
import { VaultPage } from "./pages/VaultPage";

const queryClient = new QueryClient();

export default function App() {
  const [unlocked, setUnlocked] = useState(false);

  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        {unlocked
          ? <VaultPage onLock={() => setUnlocked(false)} />
          : <UnlockPage onUnlocked={() => setUnlocked(true)} />
        }
      </QueryClientProvider>
    </ThemeProvider>
  );
}
```

- [ ] **Step 4: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/theme.ts src/components/layout/ThemeProvider.tsx src/App.tsx
git commit -m "feat: add theme system with dark/light toggle and localStorage persistence"
```

---

### Task 4: AppShell (TopBar + three-column layout)

**Files:**
- Create: `src/components/layout/AppShell.tsx`

- [ ] **Step 1: Create src/components/layout/AppShell.tsx**

```tsx
import { Moon, Sun, Lock } from "lucide-react";
import { Button } from "../ui/button";
import { useTheme } from "./ThemeProvider";

interface AppShellProps {
  sidebar: React.ReactNode;
  entryList: React.ReactNode;
  detail: React.ReactNode;
  onLock: () => void;
}

export function AppShell({ sidebar, entryList, detail, onLock }: AppShellProps) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex flex-col h-screen bg-background text-foreground">
      {/* TopBar */}
      <header className="flex items-center px-4 h-12 border-b border-border shrink-0">
        <span className="font-bold text-primary text-lg">PassKeeper</span>
        <div className="flex-1" />
        <Button variant="ghost" size="icon" onClick={toggleTheme} title="Toggle theme">
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" onClick={onLock} title="Lock vault">
          <Lock className="h-4 w-4" />
        </Button>
      </header>

      {/* Three columns */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: 220px */}
        <aside className="w-[220px] shrink-0 border-r border-border flex flex-col overflow-y-auto">
          {sidebar}
        </aside>

        {/* Entry list: 320px */}
        <section className="w-[320px] shrink-0 border-r border-border flex flex-col overflow-y-auto">
          {entryList}
        </section>

        {/* Detail: flex-1 */}
        <main className="flex-1 overflow-y-auto">
          {detail}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/AppShell.tsx
git commit -m "feat: add AppShell with TopBar and three-column layout"
```

---

### Task 5: GroupTree + GroupMenu (sidebar)

**Files:**
- Create: `src/components/sidebar/GroupMenu.tsx`
- Rewrite: `src/components/GroupTree.tsx`

- [ ] **Step 1: Create src/components/sidebar/GroupMenu.tsx**

```tsx
import { useState } from "react";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Input } from "../ui/input";
import type { Group } from "../../lib/tauri";

interface GroupMenuProps {
  group: Group;
  onRename: (id: number, name: string) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

export function GroupMenu({ group, onRename, onDelete }: GroupMenuProps) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(group.name);

  const handleRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && name.trim() !== group.name) {
      await onRename(group.id, name.trim());
    }
    setRenaming(false);
  };

  if (renaming) {
    return (
      <form onSubmit={handleRename} className="flex gap-1 px-1">
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          className="h-6 text-xs"
          autoFocus
          onBlur={() => setRenaming(false)}
        />
      </form>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100">
          <MoreHorizontal className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => { setName(group.name); setRenaming(true); }}>
          <Pencil className="mr-2 h-3 w-3" /> Rename
        </DropdownMenuItem>
        <DropdownMenuItem
          className="text-destructive"
          onClick={() => onDelete(group.id)}
        >
          <Trash2 className="mr-2 h-3 w-3" /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

- [ ] **Step 2: Rewrite src/components/GroupTree.tsx**

```tsx
import { useState } from "react";
import { FolderOpen, FolderClosed, Plus } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { GroupMenu } from "./sidebar/GroupMenu";
import { useGroups } from "../hooks/useGroups";
import { cn } from "../lib/utils";

interface Props {
  selected: number | null;
  onSelect: (id: number | null) => void;
}

export function GroupTree({ selected, onSelect }: Props) {
  const { groups, createGroup, updateGroup, deleteGroup } = useGroups();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newName.trim()) {
      await createGroup({ name: newName.trim(), parentId: null, icon: null, sortOrder: groups.length });
      setNewName("");
      setAdding(false);
    }
  };

  const handleRename = async (id: number, name: string) => {
    const g = groups.find(g => g.id === id)!;
    await updateGroup({ id, name, icon: g.icon, sortOrder: g.sort_order });
  };

  return (
    <div className="flex flex-col gap-0.5 p-2">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm w-full text-left transition-colors",
          selected === null
            ? "bg-primary text-primary-foreground"
            : "hover:bg-accent hover:text-accent-foreground",
        )}
      >
        <FolderOpen className="h-4 w-4 shrink-0" />
        All Entries
      </button>

      {groups.map(group => (
        <div key={group.id} className="group flex items-center gap-1">
          <button
            onClick={() => onSelect(group.id)}
            className={cn(
              "flex items-center gap-2 px-2 py-1.5 rounded-md text-sm flex-1 text-left transition-colors",
              selected === group.id
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <FolderClosed className="h-4 w-4 shrink-0" />
            <span className="truncate">{group.name}</span>
          </button>
          <GroupMenu group={group} onRename={handleRename} onDelete={deleteGroup} />
        </div>
      ))}

      {adding ? (
        <form onSubmit={handleAdd} className="flex gap-1 px-1 mt-1">
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Group name"
            className="h-7 text-xs"
            autoFocus
            onBlur={() => setAdding(false)}
          />
        </form>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 w-full justify-start text-muted-foreground text-xs"
          onClick={() => setAdding(true)}
        >
          <Plus className="h-3 w-3 mr-1" /> New Group
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/GroupTree.tsx src/components/sidebar/GroupMenu.tsx
git commit -m "feat: rewrite GroupTree with active state and GroupMenu (rename/delete)"
```

---

### Task 6: EntryCard + EntryList rewrite

**Files:**
- Create: `src/components/entries/EntryCard.tsx`
- Rewrite: `src/components/EntryList.tsx`

- [ ] **Step 1: Create src/components/entries/EntryCard.tsx**

```tsx
import { Star } from "lucide-react";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";
import type { Entry } from "../../lib/tauri";

interface Props {
  entry: Entry;
  selected: boolean;
  onClick: () => void;
}

export function EntryCard({ entry, selected, onClick }: Props) {
  const tags = entry.tags ? entry.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
  const domain = entry.url ? (() => { try { return new URL(entry.url).hostname; } catch { return null; } })() : null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2.5 border-b border-border transition-colors flex items-start gap-3",
        selected ? "bg-primary/10 border-l-2 border-l-primary" : "hover:bg-accent",
      )}
    >
      {/* Favicon */}
      <div className="shrink-0 w-8 h-8 rounded-md bg-muted flex items-center justify-center overflow-hidden mt-0.5">
        {domain ? (
          <img
            src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
            alt=""
            className="w-6 h-6"
            onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        ) : (
          <span className="text-xs font-bold text-muted-foreground">
            {entry.title.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-sm font-medium truncate">{entry.title}</span>
          {entry.favorite && <Star className="h-3 w-3 text-yellow-500 shrink-0 fill-yellow-500" />}
        </div>
        {entry.username && (
          <p className="text-xs text-muted-foreground truncate">{entry.username}</p>
        )}
        {entry.url && (
          <p className="text-xs text-muted-foreground truncate">{domain}</p>
        )}
        {tags.length > 0 && (
          <div className="flex gap-1 mt-1 flex-wrap">
            {tags.slice(0, 3).map(tag => (
              <Badge key={tag} variant="secondary" className="text-[10px] px-1 py-0">{tag}</Badge>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}
```

- [ ] **Step 2: Rewrite src/components/EntryList.tsx**

```tsx
import { useState } from "react";
import { Search, Plus } from "lucide-react";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { EntryCard } from "./entries/EntryCard";
import { useEntries } from "../hooks/useEntries";

interface Props {
  groupId: number | null;
  selectedEntryId: number | null;
  onSelect: (id: number) => void;
  onNewEntry: () => void;
}

export function EntryList({ groupId, selectedEntryId, onSelect, onNewEntry }: Props) {
  const [search, setSearch] = useState("");
  const { entries } = useEntries(groupId ?? undefined, search || undefined);

  return (
    <div className="flex flex-col h-full">
      {/* Search + New button */}
      <div className="p-2 border-b border-border flex gap-2 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="pl-7 h-8 text-sm"
          />
        </div>
        <Button size="sm" className="h-8 px-2" onClick={onNewEntry}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Entry cards */}
      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-sm">
            No entries
          </div>
        ) : (
          entries.map(entry => (
            <EntryCard
              key={entry.id}
              entry={entry}
              selected={entry.id === selectedEntryId}
              onClick={() => onSelect(entry.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/entries/EntryCard.tsx src/components/EntryList.tsx
git commit -m "feat: add EntryCard and rewrite EntryList with search and new entry button"
```

---

### Task 7: EntryDialog (new/edit modal)

**Files:**
- Create: `src/components/entries/EntryDialog.tsx`

- [ ] **Step 1: Create src/components/entries/EntryDialog.tsx**

```tsx
import { useState, useEffect } from "react";
import { Eye, EyeOff, Plus, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { Switch } from "../ui/switch";
import { useGroups } from "../../hooks/useGroups";
import { useEntries } from "../../hooks/useEntries";
import type { EntryDetail } from "../../lib/tauri";

interface CustomField { field_name: string; field_value: string; sort_order: number; }

interface Props {
  open: boolean;
  onClose: () => void;
  existing?: EntryDetail;
  defaultGroupId?: number | null;
}

export function EntryDialog({ open, onClose, existing, defaultGroupId }: Props) {
  const { groups } = useGroups();
  const { createEntry, updateEntry } = useEntries();
  const [title, setTitle] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [groupId, setGroupId] = useState<number | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (existing) {
      setTitle(existing.entry.title);
      setUsername(existing.entry.username ?? "");
      setUrl(existing.entry.url ?? "");
      setNotes(existing.entry.notes ?? "");
      setTagsInput(existing.entry.tags);
      setGroupId(existing.entry.group_id);
      setFavorite(existing.entry.favorite);
      const pwField = existing.fields.find(f => f.field_name === "password");
      setPassword(pwField?.plaintext ?? "");
      setCustomFields(
        existing.fields
          .filter(f => f.field_name !== "password")
          .map(f => ({ field_name: f.field_name, field_value: f.plaintext, sort_order: f.sort_order })),
      );
    } else {
      setTitle(""); setUsername(""); setPassword(""); setUrl("");
      setNotes(""); setTagsInput(""); setGroupId(defaultGroupId ?? null);
      setFavorite(false); setCustomFields([]);
    }
    setError(null);
    setShowPassword(false);
  }, [existing, defaultGroupId, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError("Title is required"); return; }
    setSaving(true); setError(null);
    try {
      const fields = [
        { field_name: "password", field_value: password, sort_order: 0 },
        ...customFields.map((f, i) => ({ ...f, sort_order: i + 1 })),
      ];
      const args = {
        groupId, title: title.trim(), url: url.trim() || null, siteTitle: null,
        username: username.trim() || null, templateType: "login",
        tags: tagsInput.trim(), notes: notes.trim() || null, favorite, fields,
      };
      if (existing) {
        await updateEntry({ id: existing.entry.id, ...args });
      } else {
        await createEntry(args);
      }
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  const tags = tagsInput.split(",").map(t => t.trim()).filter(Boolean);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit Entry" : "New Entry"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Title *</Label>
            <Input id="title" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. GitHub" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="username">Username</Label>
            <Input id="username" value={username} onChange={e => setUsername(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input id="password" type={showPassword ? "text" : "password"}
                value={password} onChange={e => setPassword(e.target.value)} className="pr-10" />
              <button type="button" onClick={() => setShowPassword(v => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="url">URL</Label>
            <Input id="url" type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input id="tags" value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="work, personal" />
            {tags.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group">Group</Label>
            <select
              id="group"
              value={groupId ?? ""}
              onChange={e => setGroupId(e.target.value ? Number(e.target.value) : null)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">No group</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="favorite" checked={favorite} onCheckedChange={setFavorite} />
            <Label htmlFor="favorite">Favorite</Label>
          </div>

          {/* Custom fields */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Custom Fields</Label>
              <Button type="button" variant="ghost" size="sm" onClick={() =>
                setCustomFields(prev => [...prev, { field_name: "", field_value: "", sort_order: prev.length + 1 }])
              }>
                <Plus className="h-3 w-3 mr-1" /> Add Field
              </Button>
            </div>
            {customFields.map((field, i) => (
              <div key={i} className="flex gap-2 items-center">
                <Input
                  placeholder="Field name"
                  value={field.field_name}
                  onChange={e => setCustomFields(prev => prev.map((f, idx) => idx === i ? { ...f, field_name: e.target.value } : f))}
                  className="w-1/3"
                />
                <Input
                  type="password"
                  placeholder="Value"
                  value={field.field_value}
                  onChange={e => setCustomFields(prev => prev.map((f, idx) => idx === i ? { ...f, field_value: e.target.value } : f))}
                  className="flex-1"
                />
                <Button type="button" variant="ghost" size="icon"
                  onClick={() => setCustomFields(prev => prev.filter((_, idx) => idx !== i))}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/entries/EntryDialog.tsx
git commit -m "feat: add EntryDialog modal with full form (title, username, password, url, notes, tags, group, favorite, custom fields)"
```

---

### Task 8: EntryDetail (right panel)

**Files:**
- Create: `src/components/entries/EntryDetail.tsx`

- [ ] **Step 1: Create src/components/entries/EntryDetail.tsx**

```tsx
import { useState } from "react";
import { Eye, EyeOff, Copy, Star, Pencil, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { useEntries } from "../../hooks/useEntries";
import { getEntry } from "../../lib/tauri";
import { useQuery } from "@tanstack/react-query";

interface Props {
  entryId: number;
  onEdit: () => void;
  onDeleted: () => void;
}

function FieldRow({ label, value, secret }: { label: string; value: string; secret?: boolean }) {
  const [show, setShow] = useState(false);
  const copy = () => navigator.clipboard.writeText(value);
  return (
    <div className="flex flex-col gap-0.5 py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm flex-1 break-all font-mono">
          {secret && !show ? "..." : value}
        </span>
        {secret && (
          <button onClick={() => setShow(v => !v)} className="text-muted-foreground hover:text-foreground">
            {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
        )}
        <button onClick={copy} className="text-muted-foreground hover:text-foreground">
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export function EntryDetail({ entryId, onEdit, onDeleted }: Props) {
  const { deleteEntry } = useEntries();
  const { data: detail, isLoading } = useQuery({
    queryKey: ["entry", entryId],
    queryFn: () => getEntry(entryId),
  });

  if (isLoading || !detail) {
    return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Loading...</div>;
  }

  const { entry, fields } = detail;
  const tags = entry.tags ? entry.tags.split(",").map(t => t.trim()).filter(Boolean) : [];
  const domain = entry.url ? (() => { try { return new URL(entry.url).hostname; } catch { return null; } })() : null;
  const pwField = fields.find(f => f.field_name === "password");
  const customFields = fields.filter(f => f.field_name !== "password");

  const handleDelete = async () => {
    if (confirm(`Delete "${entry.title}"?`)) {
      await deleteEntry(entry.id);
      onDeleted();
    }
  };

  return (
    <div className="flex flex-col h-full p-6 gap-4">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center overflow-hidden shrink-0">
          {domain ? (
            <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=48`} alt="" className="w-8 h-8"
              onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
          ) : (
            <span className="text-xl font-bold text-muted-foreground">{entry.title.charAt(0).toUpperCase()}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold truncate">{entry.title}</h2>
            {entry.favorite && <Star className="h-4 w-4 text-yellow-500 fill-yellow-500 shrink-0" />}
          </div>
          {entry.url && (
            <a href={entry.url} target="_blank" rel="noreferrer"
              className="text-sm text-primary hover:underline truncate block">{domain}</a>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <Button variant="outline" size="icon" onClick={onEdit}><Pencil className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={handleDelete}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
      </div>
      {tags.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {tags.map(tag => <Badge key={tag} variant="secondary">{tag}</Badge>)}
        </div>
      )}
      <div className="flex flex-col">
        {entry.username && <FieldRow label="Username" value={entry.username} />}
        {pwField && <FieldRow label="Password" value={pwField.plaintext} secret />}
        {entry.url && <FieldRow label="URL" value={entry.url} />}
        {entry.notes && <FieldRow label="Notes" value={entry.notes} />}
        {customFields.map(f => <FieldRow key={f.id} label={f.field_name} value={f.plaintext} secret />)}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/entries/EntryDetail.tsx
git commit -m "feat: add EntryDetail right panel with field display, copy, show/hide, edit/delete"
```

---

### Task 9: Rewrite UnlockPage

**Files:**
- Rewrite: `src/pages/UnlockPage.tsx`

- [ ] **Step 1: Rewrite src/pages/UnlockPage.tsx**

```tsx
import { useState } from "react";
import { Moon, Sun, Lock } from "lucide-react";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useTheme } from "../components/layout/ThemeProvider";
import { unlockVault } from "../lib/tauri";

interface Props { onUnlocked: () => void; }

export function UnlockPage({ onUnlocked }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await unlockVault(password);
      onUnlocked();
    } catch {
      setError("Invalid master password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="absolute top-4 right-4">
        <Button variant="ghost" size="icon" onClick={toggleTheme}>
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-6">
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center">
            <Lock className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">PassKeeper</h1>
          <p className="text-sm text-muted-foreground">Enter your master password to unlock</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Master Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Enter master password"
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Unlocking..." : "Unlock"}
          </Button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/UnlockPage.tsx
git commit -m "feat: rewrite UnlockPage with shadcn components and theme toggle"
```

---

### Task 10: Rewrite VaultPage (wire everything together)

**Files:**
- Rewrite: `src/pages/VaultPage.tsx`

- [ ] **Step 1: Rewrite src/pages/VaultPage.tsx**

```tsx
import { useState } from "react";
import { AppShell } from "../components/layout/AppShell";
import { GroupTree } from "../components/GroupTree";
import { EntryList } from "../components/EntryList";
import { EntryDetail } from "../components/entries/EntryDetail";
import { EntryDialog } from "../components/entries/EntryDialog";
import { useVault } from "../hooks/useVault";
import { getEntry } from "../lib/tauri";
import { useQuery } from "@tanstack/react-query";

interface Props { onLock: () => void; }

export function VaultPage({ onLock }: Props) {
  const { lock } = useVault();
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedEntryId, setSelectedEntryId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<number | null>(null);

  const { data: editingDetail } = useQuery({
    queryKey: ["entry", editingEntryId],
    queryFn: () => getEntry(editingEntryId!),
    enabled: editingEntryId !== null,
  });

  const handleLock = async () => {
    await lock();
    onLock();
  };

  const openNewEntry = () => {
    setEditingEntryId(null);
    setDialogOpen(true);
  };

  const openEditEntry = (id: number) => {
    setEditingEntryId(id);
    setDialogOpen(true);
  };

  const handleDialogClose = () => {
    setDialogOpen(false);
    setEditingEntryId(null);
  };

  return (
    <>
      <AppShell
        onLock={handleLock}
        sidebar={
          <GroupTree
            selected={selectedGroupId}
            onSelect={id => { setSelectedGroupId(id); setSelectedEntryId(null); }}
          />
        }
        entryList={
          <EntryList
            groupId={selectedGroupId}
            selectedEntryId={selectedEntryId}
            onSelect={setSelectedEntryId}
            onNewEntry={openNewEntry}
          />
        }
        detail={
          selectedEntryId !== null ? (
            <EntryDetail
              entryId={selectedEntryId}
              onEdit={() => openEditEntry(selectedEntryId)}
              onDeleted={() => setSelectedEntryId(null)}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <p className="text-sm">Select an entry to view details</p>
            </div>
          )
        }
      />

      <EntryDialog
        open={dialogOpen}
        onClose={handleDialogClose}
        existing={editingDetail}
        defaultGroupId={selectedGroupId}
      />
    </>
  );
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run frontend tests**

```bash
npm test
```

Expected: 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/pages/VaultPage.tsx
git commit -m "feat: rewrite VaultPage wiring AppShell, GroupTree, EntryList, EntryDetail, EntryDialog"
```

---

### Task 11: Smoke test the full UI

**Files:** (no code changes — manual verification)

- [ ] **Step 1: Start the app**

```bash
npm run tauri dev
```

- [ ] **Step 2: Verify UnlockPage**

- Page shows centered card with lock icon, title "PassKeeper", password input, Unlock button
- Theme toggle in top-right switches dark/light; preference persists on reload
- Wrong password shows "Invalid master password" inline

- [ ] **Step 3: Verify three-column layout**

- TopBar shows "PassKeeper" logo, theme toggle, lock button
- Sidebar (220px) shows "All Entries" + any groups
- Entry list (320px) shows search bar + "+" button
- Detail panel shows "Select an entry to view details" when nothing selected

- [ ] **Step 4: Verify group management**

- Click "+ New Group" in sidebar, type a name, press Enter — group appears
- Hover a group row — "..." button appears; click it — Rename / Delete options
- Rename: inline input replaces name; Delete: group removed

- [ ] **Step 5: Verify entry creation**

- Click "+" in entry list — EntryDialog opens
- Fill title, username, password (show/hide toggle works), URL, notes, tags, group, favorite
- Add a custom field — name + value inputs appear; remove button works
- Click Save — dialog closes, entry appears in list

- [ ] **Step 6: Verify entry detail**

- Click an entry — right panel shows favicon, title, username, URL, tags, fields
- Password field shows "..." by default; eye icon reveals it
- Copy button copies value to clipboard
- Edit button opens EntryDialog pre-filled; Save updates the entry
- Delete button shows confirm dialog; confirms removes entry

- [ ] **Step 7: Commit final**

```bash
git add -A
git commit -m "chore: complete PassKeeper UI redesign with shadcn/ui + Tailwind CSS"
```
