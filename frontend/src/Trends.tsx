import { useEffect, useState } from "react";

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

const METRICS: { key: keyof Omit<Day, "date">; label: string }[] = [
  { key: "sessions", label: "Sessions" },
  { key: "errors", label: "Errors" },
  { key: "tool_failures", label: "Tool failures" },
  { key: "compactions", label: "Compactions" },
  { key: "stop_blocks", label: "Stop-gate blocks" },
  { key: "verify_pass", label: "Verify PASS" },
  { key: "verify_fail", label: "Verify FAIL" },
];

function BarChart({
  days,
  field,
  label,
}: {
  days: Day[];
  field: keyof Omit<Day, "date">;
  label: string;
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
              fill="currentColor"
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
    <section aria-labelledby="trends-h">
      <h2 id="trends-h">Trends</h2>
      {error && <p role="alert">{error}</p>}
      {data && !data.enough_data && (
        <p role="status">
          {data.note ?? "Trends need more data; showing totals only."}
        </p>
      )}
      {data && (
        <>
          <ul aria-label="Totals">
            {METRICS.map((m) => (
              <li key={m.key}>
                {m.label}: {totals[m.key] ?? 0}
              </li>
            ))}
          </ul>
          {data.enough_data && days.length > 0 && (
            <div>
              {METRICS.map((m) => (
                <BarChart
                  key={m.key}
                  days={days}
                  field={m.key}
                  label={m.label}
                />
              ))}
            </div>
          )}
          {days.length > 0 && (
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
          )}
        </>
      )}
    </section>
  );
}
