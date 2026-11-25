import {Card, Chip} from "@heroui/react";

import {metrics} from "@/lib/data";

export function MetricsGrid() {
  return (
    <section aria-label="Key revenue metrics" className="app-grid-metrics">
      {metrics.map((metric) => (
        <Card key={metric.id}>
          <Card.Header>
            <Card.Title className="app-stat-label">{metric.label}</Card.Title>
          </Card.Header>
          <Card.Content>
            <div className="flex items-baseline gap-2">
              <span className="app-stat-value">{metric.value}</span>
              <Chip color={metric.trend === "up" ? "success" : "danger"} size="sm">
                {metric.delta}
              </Chip>
            </div>
            <p className="app-muted" style={{fontSize: "0.75rem"}}>
              {metric.hint}
            </p>
          </Card.Content>
        </Card>
      ))}
    </section>
  );
}
