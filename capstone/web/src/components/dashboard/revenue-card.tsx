import {Card} from "@heroui/react";

import {formatCurrency, formatNumber} from "@/lib/format";
import {revenueTrend} from "@/lib/data";

const max = Math.max(...revenueTrend.map((point) => point.mrr));

export function RevenueCard() {
  const latest = revenueTrend[revenueTrend.length - 1];
  const first = revenueTrend[0];
  const growth = ((latest.mrr - first.mrr) / first.mrr) * 100;

  return (
    <Card className="h-full">
      <Card.Header>
        <Card.Title>MRR trend</Card.Title>
        <Card.Description>
          Monthly recurring revenue over the last 6 months - {formatCurrency(latest.mrr)} in
          November, up {growth.toFixed(1)}% since June.
        </Card.Description>
      </Card.Header>
      <Card.Content>
        <div
          aria-label="Monthly recurring revenue, June to November 2026"
          className="app-bars"
          role="img"
        >
          {revenueTrend.map((point, index) => (
            <div className="app-bar-column" key={point.month}>
              <span className="app-bar-label">{formatNumber(Math.round(point.mrr / 1000))}k</span>
              <div className="app-bar-track">
                <div
                  className="app-bar-fill"
                  data-muted={index === revenueTrend.length - 1 ? "false" : "true"}
                  style={{height: `${Math.round((point.mrr / max) * 100)}%`}}
                />
              </div>
              <span className="app-bar-label">{point.month}</span>
            </div>
          ))}
        </div>
        <div className="app-legend" style={{marginTop: "var(--app-gap)"}}>
          <span>
            <span className="app-legend-swatch" />
            Current month
          </span>
          <span>
            <span className="app-legend-swatch" style={{background: "var(--accent-soft)"}} />
            Prior months
          </span>
        </div>
      </Card.Content>
    </Card>
  );
}
