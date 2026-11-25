"use client";

import Link from "next/link";
import {Chip} from "@heroui/react";

import {
  BillingIcon,
  OverviewIcon,
  SettingsIcon,
  UsageIcon,
  UsersIcon,
} from "@/components/dashboard/icons";

export type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: (props: {className?: string}) => React.ReactElement;
  badge?: string;
};

export const navItems: NavItem[] = [
  {id: "overview", label: "Overview", href: "#overview", icon: OverviewIcon},
  {id: "customers", label: "Customers", href: "#customers", icon: UsersIcon},
  {id: "billing", label: "Billing", href: "#billing", icon: BillingIcon, badge: "2"},
  {id: "usage", label: "Usage", href: "#usage", icon: UsageIcon},
  {id: "settings", label: "Settings", href: "#settings", icon: SettingsIcon},
];

type SidebarNavProps = {
  activeId: string;
  onNavigate: (id: string) => void;
  /** Unique per instance so two rendered navs never share ids. */
  idPrefix: string;
};

export function SidebarNav({activeId, onNavigate, idPrefix}: SidebarNavProps) {
  return (
    <nav aria-label="Primary" className="app-stack" data-nav={idPrefix}>
      <ul className="app-stack" style={{listStyle: "none", margin: 0, padding: 0}}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activeId;

          return (
            <li key={item.id}>
              <Link
                aria-current={isActive ? "page" : undefined}
                className="app-nav-link"
                href={item.href}
                onClick={() => onNavigate(item.id)}
              >
                <Icon className="size-4 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.badge ? (
                  <Chip color="danger" size="sm">
                    {item.badge}
                  </Chip>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
