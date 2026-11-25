"use client";

import {useState} from "react";
import {Avatar, Card, Description, Label, ListBox} from "@heroui/react";

import {formatCurrency, formatNumber} from "@/lib/format";
import {accounts} from "@/lib/data";

export function TopAccounts() {
  const [selected, setSelected] = useState<string>(accounts[0].id);
  const current = accounts.find((account) => account.id === selected) ?? accounts[0];

  return (
    <Card className="h-full">
      <Card.Header>
        <Card.Title>Top accounts</Card.Title>
        <Card.Description>Ranked by monthly recurring revenue.</Card.Description>
      </Card.Header>
      <Card.Content>
        <ListBox
          aria-label="Top accounts by monthly recurring revenue"
          className="w-full"
          selectedKeys={[selected]}
          selectionMode="single"
          onSelectionChange={(keys) => {
            if (keys === "all") return;
            const [first] = Array.from(keys);
            if (first != null) setSelected(String(first));
          }}
        >
          {accounts.map((account) => (
            <ListBox.Item id={account.id} key={account.id} textValue={account.name}>
              <Avatar size="sm">
                <Avatar.Fallback>{account.initials}</Avatar.Fallback>
              </Avatar>
              <div className="flex flex-col">
                <Label>{account.name}</Label>
                <Description>
                  {account.plan} - {formatNumber(account.seats)} seats
                </Description>
              </div>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>

        <div
          aria-live="polite"
          className="app-panel"
          style={{marginTop: "var(--app-gap)", padding: "var(--app-gap)"}}
        >
          <p className="app-stat-label">Selected account</p>
          <p style={{fontWeight: 600}}>{current.name}</p>
          <p className="app-muted" style={{fontSize: "0.8125rem"}}>
            {formatCurrency(current.mrr)} MRR - {formatNumber(current.seats)} active seats
          </p>
        </div>
      </Card.Content>
    </Card>
  );
}
