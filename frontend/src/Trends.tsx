import { useEffect, useState } from "react";
import { Card, ErrorMessage, PageHeader, TableWrap } from "./ui";
import "./Trends.css";

interface Day {
  date: string;
  sessions: number;
  errors: number;
  tool_failures: number;
  compactions: number;
  stop_blocks: number;
  verify_pass: number;
  verify_fail: number;
}

interface TrendsData {
  days: Day[];
  totals: Record<string, number>;
  verified: { repo_id: string; exists: boolean; mtime: string | null }[];
  enough_data: boolean;
  note: string | null;
}

// `bad` series are drawn in the danger colour AND with a dashed outline, and every
// chart carries its own caption, so no series is told apart by colour alone.
const METRICS: {
  key: keyof Omit<Day, "date">;
  label: string;
  bad?: boolean;
}[] = [
  { key: "sessions", label: "Sessions" },
  { key: "errors", label: "Errors", bad: true },
  { key: "tool_failures", label: "Tool failures", bad: true },
  { key: "compactions", label: "Compactions" },
  { key: "stop_blocks", label: "Stop-gate blocks" },
  { key: "verify_pass", label: "Verify PASS" },
  { key: "verify_fail", label: "Verify FAIL", bad: true },
];

function BarChart({
  days,
  field,
  label,
  bad,
}: {
  days: Day[];
  field: keyof Omit<Day, "date">;
  label: string;
  bad?: boolean;
}) {
  const max = Math.max(1, ...days.map((d) => d[field]));
  const w = 24;
  const h = 60;
  return (
    <figure>
      <svg
        role="img"
        aria-label={`${label} per day; see the table below for values`}
        width={days.length * w}
        height={h}
        viewBox={`0 0 ${days.length * w} ${h}`}
      >
        {days.map((d, i) => {
          const bh = (d[field] / max) * h;
          return (
            <rect
              key={d.date}
              x={i * w + 2}
              y={h - bh}
              width={w - 4}
              height={bh}
              className={bad ? "bar bar-bad" : "bar"}
            />
          );
        })}
      </svg>
      <figcaption>{label}</figcaption>
    </figure>
  );
}

export default function Trends() {
  const [data, setData] = useState<TrendsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/trends")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((body: TrendsData) => {
        if (active) setData(body);
      })
      .catch(() => {
        if (active) setError("Could not load trends.");
      });
    return () => {
      active = false;
    };
  }, []);

  const days = Array.isArray(data?.days) ? data.days : [];
  const totals = data?.totals ?? {};

  return (
    <section aria-label="Trends">
      <PageHeader title="Trends" />
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {data && !data.enough_data && (
        <p role="status">
          {data.note ?? "Trends need more data; showing totals only."}
        </p>
      )}
      {data && (
        <>
          <ul aria-label="Totals" className="totals">
            {METRICS.map((m) => (
              <li key={m.key}>
                {m.label}: {totals[m.key] ?? 0}
              </li>
            ))}
          </ul>
          {data.enough_data && days.length > 0 && (
            <Card>
              <div className="chart-grid">
                {METRICS.map((m) => (
                  <BarChart
                    key={m.key}
                    days={days}
                    field={m.key}
                    label={m.label}
                    bad={m.bad}
                  />
                ))}
              </div>
            </Card>
          )}
          {days.length > 0 && (
            <TableWrap label="Daily health counts table">
              <table>
                <caption>Daily health counts</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    {METRICS.map((m) => (
                      <th scope="col" key={m.key}>
                        {m.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.date}>
                      <th scope="row">{d.date}</th>
                      {METRICS.map((m) => (
                        <td key={m.key}>{d[m.key]}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </>
      )}
    </section>
  );
}
