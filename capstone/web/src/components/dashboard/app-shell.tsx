"use client";

import {useState} from "react";
import {
  Avatar,
  Badge,
  Button,
  Drawer,
  Dropdown,
  Label,
  SearchField,
  Separator,
} from "@heroui/react";

import {DashboardView} from "@/components/dashboard/dashboard-view";
import {ChevronDownIcon, LogoMark, MenuIcon} from "@/components/dashboard/icons";
import {SidebarNav} from "@/components/dashboard/sidebar-nav";
import {company} from "@/lib/data";

export function AppShell() {
  const [activeNav, setActiveNav] = useState("overview");
  const [query, setQuery] = useState("");

  return (
    <div className="app-shell">
      {/* Desktop sidebar - hidden by CSS below 1024px, where the Drawer takes over. */}
      <aside aria-label="Sidebar" className="app-sidebar">
        <div className="app-sidebar-brand">
          <LogoMark className="size-8 text-accent" />
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">{company.name}</span>
            <span className="text-xs app-muted">Revenue workspace</span>
          </div>
        </div>

        <SidebarNav activeId={activeNav} idPrefix="desktop" onNavigate={setActiveNav} />

        <div className="mt-auto">
          <Separator />
          <p className="app-muted" style={{fontSize: "0.75rem", marginTop: "var(--app-gap-sm)"}}>
            Sandbox data - synced 12 min ago
          </p>
        </div>
      </aside>

      <div className="app-main">
        <header className="app-header">
          {/* Mobile navigation: a Drawer under 1024px. */}
          <Drawer>
            <Button
              aria-label="Open navigation menu"
              className="app-drawer-trigger"
              isIconOnly
              variant="secondary"
            >
              <MenuIcon className="size-5" />
            </Button>
            <Drawer.Backdrop>
              <Drawer.Content placement="left">
                <Drawer.Dialog>
                  <Drawer.CloseTrigger />
                  <Drawer.Header>
                    <Drawer.Heading>Navigation</Drawer.Heading>
                  </Drawer.Header>
                  <Drawer.Body>
                    <SidebarNav
                      activeId={activeNav}
                      idPrefix="drawer"
                      onNavigate={setActiveNav}
                    />
                  </Drawer.Body>
                  <Drawer.Footer>
                    <p className="app-muted" style={{fontSize: "0.75rem"}}>
                      {company.workspace}
                    </p>
                  </Drawer.Footer>
                </Drawer.Dialog>
              </Drawer.Content>
            </Drawer.Backdrop>
          </Drawer>

          <div className="app-header-search">
            <SearchField aria-label="Search" value={query} onChange={setQuery}>
              <Label className="sr-only">Search invoices and customers</Label>
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder="Search invoices, customers..." />
                <SearchField.ClearButton aria-label="Clear search" />
              </SearchField.Group>
            </SearchField>
          </div>

          <Dropdown>
            <Button aria-label="Open account menu" variant="secondary">
              <span className="flex items-center gap-2">
                <Badge.Anchor>
                  <Avatar size="sm">
                    <Avatar.Fallback>{company.user.initials}</Avatar.Fallback>
                  </Avatar>
                  <Badge color="accent" size="sm">
                    3
                  </Badge>
                </Badge.Anchor>
                <span className="hidden sm:inline">{company.user.name}</span>
                <ChevronDownIcon className="size-4" />
              </span>
            </Button>
            <Dropdown.Popover>
              <Dropdown.Menu
                aria-label="Account"
                onAction={(key) => {
                  // Scaffold: actions are wired to a no-op logger.
                  console.log(`account action: ${String(key)}`);
                }}
              >
                <Dropdown.Item id="profile" textValue="Profile">
                  <Label>Profile</Label>
                </Dropdown.Item>
                <Dropdown.Item id="team" textValue="Team and roles">
                  <Label>Team and roles</Label>
                </Dropdown.Item>
                <Separator />
                <Dropdown.Item id="sign-out" textValue="Sign out" variant="danger">
                  <Label>Sign out</Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
        </header>

        <DashboardView query={query} />
      </div>
    </div>
  );
}
