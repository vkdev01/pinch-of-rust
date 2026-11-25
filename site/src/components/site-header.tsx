"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button, Drawer, Dropdown, Label } from "@heroui/react";

import { ChevronDown, Github, Menu } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV = [
  { href: "/learn", label: "Learn" },
  { href: "/projects", label: "Projects" },
  { href: "/use-cases", label: "Use cases" },
  { href: "/examples", label: "Examples" },
];

const REPO = "https://github.com/vkdev01/pinch-of-rust";

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <>
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-2.5 py-1.5 text-[13px] transition-colors ${
              active
                ? "bg-accent/10 font-medium text-foreground"
                : "text-muted hover:bg-foreground/5 hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1180px] items-center gap-3 px-4 sm:px-6">
        {/* mobile nav */}
        <div className="lg:hidden">
          <Drawer>
            <Button isIconOnly variant="secondary" size="sm" aria-label="Open navigation menu">
              <Menu className="size-4" />
            </Button>
            <Drawer.Backdrop>
              <Drawer.Content placement="left">
                <Drawer.Dialog>
                  <Drawer.CloseTrigger />
                  <Drawer.Header>
                    <Drawer.Heading>Navigate</Drawer.Heading>
                  </Drawer.Header>
                  <Drawer.Body>
                    <nav className="flex flex-col gap-1" aria-label="Sections">
                      <Link href="/" className="nav-link">
                        Home
                      </Link>
                      <NavLinks />
                    </nav>
                    <p className="label mt-6 mb-2">Elsewhere</p>
                    <a href={REPO} className="nav-link" rel="noreferrer" target="_blank">
                      <Github className="size-3.5" />
                      Source on GitHub
                    </a>
                  </Drawer.Body>
                </Drawer.Dialog>
              </Drawer.Content>
            </Drawer.Backdrop>
          </Drawer>
        </div>

        <Link href="/" className="flex items-center gap-2.5" aria-label="pinch/rust home">
          <span className="num grid size-7 place-items-center rounded-md bg-accent text-[13px] font-bold text-accent-foreground">
            R
          </span>
          <span className="flex flex-col leading-none">
            <span className="num text-[14px] font-semibold tracking-tight">
              pinch<span className="text-muted">/</span>rust
            </span>
            <span className="label mt-1 hidden text-[9px] sm:block">a complete learning path</span>
          </span>
        </Link>

        <nav className="ml-4 hidden items-center gap-0.5 lg:flex" aria-label="Sections">
          <NavLinks />
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <Dropdown>
            <Button variant="ghost" size="sm" className="hidden sm:flex">
              More
              <ChevronDown className="size-3.5" />
            </Button>
            <Dropdown.Popover>
              <Dropdown.Menu aria-label="More links">
                <Dropdown.Item id="repo" textValue="Source on GitHub">
                  <a href={REPO} target="_blank" rel="noreferrer">
                    <Label>Source on GitHub</Label>
                  </a>
                </Dropdown.Item>
                <Dropdown.Item id="plan" textValue="30-day plan">
                  <Link href="/learn#plan">
                    <Label>30-day plan</Label>
                  </Link>
                </Dropdown.Item>
                <Dropdown.Item id="reference" textValue="Cheat sheet">
                  <Link href="/learn/06-reference/01-cheatsheet">
                    <Label>Cheat sheet</Label>
                  </Link>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>

          <ThemeToggle />

          <Link href="/learn" className="btn-link hidden md:inline-flex">
            Start learning
          </Link>
        </div>
      </div>
    </header>
  );
}
