"use client";

import {useMemo} from "react";
import {Avatar, Card, Chip, Table} from "@heroui/react";

import {formatCurrency, formatDate} from "@/lib/format";
import {invoices, type Invoice} from "@/lib/data";

const statusColor: Record<Invoice["status"], "success" | "warning" | "danger"> = {
  Paid: "success",
  Pending: "warning",
  Overdue: "danger",
};

type InvoicesTableProps = {
  query: string;
};

export function InvoicesTable({query}: InvoicesTableProps) {
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();

    if (!needle) return invoices;

    return invoices.filter((invoice) =>
      [invoice.id, invoice.customer, invoice.plan, invoice.status, invoice.owner]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [query]);

  return (
    <Card>
      <Card.Header>
        <Card.Title>Recent invoices</Card.Title>
        <Card.Description id="invoices-table-description">
          {rows.length} of {invoices.length} invoices for the current billing cycle. Use the column
          headers to review amounts, plans and due dates.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <Table>
          <Table.ScrollContainer>
            <Table.Content
              aria-describedby="invoices-table-description"
              aria-label="Recent invoices"
              className="min-w-[720px]"
            >
              <Table.Header>
                <Table.Column isRowHeader>Invoice</Table.Column>
                <Table.Column>Customer</Table.Column>
                <Table.Column>Plan</Table.Column>
                <Table.Column>Amount</Table.Column>
                <Table.Column>Due</Table.Column>
                <Table.Column>Status</Table.Column>
              </Table.Header>
              <Table.Body>
                {rows.map((invoice) => (
                  <Table.Row id={invoice.id} key={invoice.id}>
                    <Table.Cell>{invoice.id}</Table.Cell>
                    <Table.Cell>
                      <span className="flex items-center gap-2">
                        <Avatar size="sm">
                          <Avatar.Fallback>{invoice.initials}</Avatar.Fallback>
                        </Avatar>
                        <span className="flex flex-col">
                          <span style={{fontWeight: 500}}>{invoice.customer}</span>
                          <span className="app-muted" style={{fontSize: "0.75rem"}}>
                            Owner: {invoice.owner}
                          </span>
                        </span>
                      </span>
                    </Table.Cell>
                    <Table.Cell>{invoice.plan}</Table.Cell>
                    <Table.Cell>{formatCurrency(invoice.amount)}</Table.Cell>
                    <Table.Cell>{formatDate(invoice.due)}</Table.Cell>
                    <Table.Cell>
                      <Chip color={statusColor[invoice.status]} size="sm">
                        {invoice.status}
                      </Chip>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
          <Table.Footer>
            <p className="app-muted" style={{fontSize: "0.75rem"}}>
              Amounts in USD. Overdue invoices are escalated to the finance lead after 14 days.
            </p>
          </Table.Footer>
        </Table>
      </Card.Content>
    </Card>
  );
}
