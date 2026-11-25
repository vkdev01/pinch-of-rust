"use client";

import {useState} from "react";
import {Button, Dropdown, Label, ListBox, Select, Tabs} from "@heroui/react";

import {DownloadIcon} from "@/components/dashboard/icons";
import {InvoicesTable} from "@/components/dashboard/invoices-table";
import {MetricsGrid} from "@/components/dashboard/metrics-grid";
import {NewInvoiceModal} from "@/components/dashboard/new-invoice-modal";
import {PlanBreakdown} from "@/components/dashboard/plan-breakdown";
import {RevenueCard} from "@/components/dashboard/revenue-card";
import {TopAccounts} from "@/components/dashboard/top-accounts";
import {UsageCard} from "@/components/dashboard/usage-card";
import {dateRanges, type DateRangeId} from "@/lib/data";

type DashboardViewProps = {
  query: string;
};

export function DashboardView({query}: DashboardViewProps) {
  const [range, setRange] = useState<DateRangeId>("30d");
  const activeRange = dateRanges.find((item) => item.id === range) ?? dateRanges[1];

  return (
    <main className="app-content" id="overview">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="app-page-title">Revenue overview</h1>
          <p className="app-page-subtitle">
            {activeRange.label} - Northwind Analytics, updated 25 Nov 2026 at 09:12 IST
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select
            className="w-[190px]"
            selectedKey={range}
            onSelectionChange={(key) => {
              if (key != null) setRange(String(key) as DateRangeId);
            }}
          >
            <Label>Date range</Label>
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <ListBox>
                {dateRanges.map((item) => (
                  <ListBox.Item id={item.id} key={item.id} textValue={item.label}>
                    {item.label}
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          <Dropdown>
            <Button aria-label="Export report" variant="secondary">
              <DownloadIcon className="size-4" />
              Export
            </Button>
            <Dropdown.Popover>
              <Dropdown.Menu
                aria-label="Export format"
                onAction={(key) => {
                  console.log(`export as ${String(key)}`);
                }}
              >
                <Dropdown.Item id="csv" textValue="Export as CSV">
                  <Label>Export as CSV</Label>
                </Dropdown.Item>
                <Dropdown.Item id="xlsx" textValue="Export as XLSX">
                  <Label>Export as XLSX</Label>
                </Dropdown.Item>
                <Dropdown.Item id="pdf" textValue="Export as PDF">
                  <Label>Export as PDF</Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>

          <NewInvoiceModal />
        </div>
      </div>

      <Tabs defaultSelectedKey="overview">
        <Tabs.ListContainer>
          <Tabs.List aria-label="Dashboard sections">
            <Tabs.Tab id="overview">
              Overview
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="usage">
              Usage
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="customers">
              Customers
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        <Tabs.Panel className="pt-4" id="overview">
          <div className="app-stack">
            <MetricsGrid />
            <div className="app-grid-split">
              <RevenueCard />
              <PlanBreakdown />
            </div>
            <InvoicesTable query={query} />
          </div>
        </Tabs.Panel>

        <Tabs.Panel className="pt-4" id="usage">
          <div className="app-grid-split">
            <UsageCard />
            <PlanBreakdown />
          </div>
        </Tabs.Panel>

        <Tabs.Panel className="pt-4" id="customers">
          <div className="app-grid-split">
            <TopAccounts />
            <UsageCard />
          </div>
        </Tabs.Panel>
      </Tabs>
    </main>
  );
}
