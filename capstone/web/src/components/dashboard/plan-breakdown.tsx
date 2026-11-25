import {Card, Label, ProgressBar} from "@heroui/react";

import {formatCurrency, formatNumber} from "@/lib/format";
import {plans} from "@/lib/data";

export function PlanBreakdown() {
  return (
    <Card className="h-full">
      <Card.Header>
        <Card.Title>Plan breakdown</Card.Title>
        <Card.Description>
          Share of the {formatCurrency(184320)} November MRR across 6,596 paying accounts.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <ul className="app-stack" style={{listStyle: "none", margin: 0, padding: 0}}>
          {plans.map((plan) => (
            <li key={plan.id}>
              <ProgressBar aria-label={`${plan.plan} share of MRR`} value={plan.share}>
                <div className="flex items-center justify-between gap-2">
                  <Label>{plan.plan}</Label>
                  <span className="app-muted" style={{fontSize: "0.75rem"}}>
                    {formatCurrency(plan.mrr)} - {formatNumber(plan.accounts)} accounts
                  </span>
                </div>
                <ProgressBar.Track>
                  <ProgressBar.Fill />
                </ProgressBar.Track>
              </ProgressBar>
            </li>
          ))}
        </ul>
      </Card.Content>
    </Card>
  );
}
