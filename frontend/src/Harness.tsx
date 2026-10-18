import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Card, EmptyState, ErrorMessage, Field, PageHeader } from "./ui";
import "./Harness.css";

interface Agent {
  name: string;
  description: string;
  tools: string[];
}
interface Skill {
  name: string;
  description: string;
}
interface Hook {
  event: string;
  script: string;
  timeout: number | null;
}
interface Rules {
  text: string;
  count: number;
}
interface Pair {
  key: string;
  value: string;
}
interface HarnessData {
  agents: Agent[];
  skills: Skill[];
  hooks: Hook[];
  deny_commands: Rules;
  deny_paths: Rules;
  commands: Pair[];
  complexity: Pair[];
}
interface Repo {
  id: string;
  path: string;
}

const GENERIC_ERROR = "Could not reach the server.";

function Section(props: {
  title: string;
  empty: boolean;
  children: ReactNode;
}) {
  return (
    <Card>
      <section>
        <h3>{props.title}</h3>
        {props.empty ? <EmptyState>None found.</EmptyState> : props.children}
      </section>
    </Card>
  );
}

function RuleBlock(props: { title: string; rules: Rules }) {
  return (
    <Section
      title={`${props.title} (${props.rules.count})`}
      empty={props.rules.count === 0 && !props.rules.text}
    >
      <pre>{props.rules.text}</pre>
    </Section>
  );
}

function Pairs(props: { title: string; pairs: Pair[] }) {
  return (
    <Section title={props.title} empty={props.pairs.length === 0}>
      <dl className="pairs">
        {props.pairs.map((p) => (
          <div key={p.key}>
            <dt>{p.key}</dt>
            <dd>{p.value}</dd>
          </div>
        ))}
      </dl>
    </Section>
  );
}

export default function Harness() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [repo, setRepo] = useState("");
  const [data, setData] = useState<HarnessData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/repos")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((body: { repos: Repo[] }) => {
        if (active) setRepos(Array.isArray(body.repos) ? body.repos : []);
      })
      .catch(() => {
        if (active) setError(GENERIC_ERROR);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!repo) return;
    let active = true;
    fetch(`/api/repos/${encodeURIComponent(repo)}/harness`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error())))
      .then((body: HarnessData) => {
        if (active) {
          setData(body);
          setError(null);
        }
      })
      .catch(() => {
        if (active) {
          setData(null);
          setError(GENERIC_ERROR);
        }
      });
    return () => {
      active = false;
    };
  }, [repo]);

  return (
    <section>
      <PageHeader title="Harness" />
      <div className="toolbar">
        <Field label="Repo">
          <select value={repo} onChange={(e) => setRepo(e.target.value)}>
            <option value="">Select a repo</option>
            {repos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.path}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {data && repo && (
        <>
          <Section title="Agents" empty={data.agents.length === 0}>
            <ul className="harness-list">
              {data.agents.map((a) => (
                <li key={a.name}>
                  <strong>{a.name}</strong> {a.description}
                  {a.tools.length > 0 && <em> Tools: {a.tools.join(", ")}</em>}
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Skills" empty={data.skills.length === 0}>
            <ul className="harness-list">
              {data.skills.map((s) => (
                <li key={s.name}>
                  <strong>{s.name}</strong> {s.description}
                </li>
              ))}
            </ul>
          </Section>
          <Section title="Hooks" empty={data.hooks.length === 0}>
            <ul className="harness-list">
              {data.hooks.map((h, i) => (
                <li key={`${h.event}-${i}`}>
                  <strong>{h.event}</strong> {h.script}
                  {h.timeout !== null && ` (timeout ${h.timeout}s)`}
                </li>
              ))}
            </ul>
          </Section>
          <RuleBlock title="Deny commands" rules={data.deny_commands} />
          <RuleBlock title="Deny paths" rules={data.deny_paths} />
          <Pairs title="Commands" pairs={data.commands} />
          <Pairs title="Complexity" pairs={data.complexity} />
        </>
      )}
    </section>
  );
}
