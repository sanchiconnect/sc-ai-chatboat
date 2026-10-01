"use client";

import * as React from "react";
import Link from "next/link";
import { Menu, ArrowRight } from "lucide-react";
import { Logo } from "@/components/marketing/logo";
import { ThemeToggle } from "@/components/marketing/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetTrigger, SheetContent, SheetClose } from "@/components/ui/sheet";
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
} from "@/components/ui/navigation-menu";
import { mainNav } from "@/lib/config/site";

export function SiteHeader() {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/80 backdrop-blur-md">
      <div className="container flex h-[72px] items-center justify-between">
        <Link href="/" className="shrink-0">
          <Logo />
        </Link>

        <NavigationMenu className="hidden lg:flex">
          <NavigationMenuList>
            {mainNav.map((item) =>
              "items" in item ? (
                <NavigationMenuItem key={item.label}>
                  <NavigationMenuTrigger>{item.label}</NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <ul className="grid w-[420px] grid-cols-1 gap-1 p-3">
                      {item.items.map((sub) => (
                        <li key={sub.href}>
                          <NavigationMenuLink asChild>
                            <Link
                              href={sub.href}
                              className="block rounded-btn px-3.5 py-2.5 transition-colors hover:bg-surface-2"
                            >
                              <span className="block text-[14.5px] font-semibold text-fg">{sub.title}</span>
                              <span className="mt-0.5 block text-[13px] text-fg-muted">{sub.description}</span>
                            </Link>
                          </NavigationMenuLink>
                        </li>
                      ))}
                    </ul>
                  </NavigationMenuContent>
                </NavigationMenuItem>
              ) : (
                <NavigationMenuItem key={item.label}>
                  <NavigationMenuLink asChild>
                    <Link
                      href={item.href}
                      className="inline-flex items-center rounded-btn px-3.5 py-2 text-[14.5px] font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
                    >
                      {item.label}
                    </Link>
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ),
            )}
          </NavigationMenuList>
        </NavigationMenu>

        <div className="hidden items-center gap-2 lg:flex">
          <ThemeToggle />
          <Button variant="ghost" size="sm" asChild>
            <Link href="/auth/login">Log in</Link>
          </Button>
          <Button variant="warm" size="sm" asChild>
            <Link href="/auth/signup">
              Start free <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="flex items-center gap-1 lg:hidden">
          <ThemeToggle />
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <Logo />
              <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
                {mainNav.map((item) =>
                  "items" in item ? (
                    <div key={item.label} className="py-2">
                      <p className="px-1 pb-2 text-[12px] font-semibold uppercase tracking-wide text-fg-faint">
                        {item.label}
                      </p>
                      <div className="flex flex-col">
                        {item.items.map((sub) => (
                          <SheetClose asChild key={sub.href}>
                            <Link href={sub.href} className="rounded-btn px-2 py-2.5 text-[15px] font-medium text-fg hover:bg-surface-2">
                              {sub.title}
                            </Link>
                          </SheetClose>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <SheetClose asChild key={item.label}>
                      <Link href={item.href} className="rounded-btn px-2 py-2.5 text-[15px] font-medium text-fg hover:bg-surface-2">
                        {item.label}
                      </Link>
                    </SheetClose>
                  ),
                )}
              </nav>
              <div className="flex flex-col gap-2 border-t border-border pt-5">
                <Button variant="ghost" asChild>
                  <Link href="/auth/login">Log in</Link>
                </Button>
                <Button variant="warm" asChild>
                  <Link href="/auth/signup">Start free</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
