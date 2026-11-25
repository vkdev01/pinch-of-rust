import {Card, Label, ProgressBar} from "@heroui/react";

import {formatCompact, formatPercent} from "@/lib/format";
import {usage} from "@/lib/data";

function toPercent(used: number, limit: number): number {
  return Math.min(100, Math.round((used / limit) * 1000) / 10);
}

export function UsageCard() {
  return (
    <Card>
      <Card.Header>
        <Card.Title>Workspace usage</Card.Title>
        <Card.Description>
          Metered consumption against the committed Enterprise allowance for November 2026.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <ul className="app-stack" style={{listStyle: "none", margin: 0, padding: 0}}>
          {usage.map((row) => {
            const percent = toPercent(row.used, row.limit);

            return (
              <li key={row.id}>
                <ProgressBar aria-label={`${row.label} usage`} value={percent}>
                  <div className="flex items-center justify-between gap-2">
                    <Label>{row.label}</Label>
                    <span className="app-muted" style={{fontSize: "0.75rem"}}>
                      {formatCompact(row.used)} / {formatCompact(row.limit)} {row.unit} (
                      {formatPercent(percent)})
                    </span>
                  </div>
                  <ProgressBar.Track>
                    <ProgressBar.Fill />
                  </ProgressBar.Track>
                </ProgressBar>
              </li>
            );
          })}
        </ul>
      </Card.Content>
    </Card>
  );
}
