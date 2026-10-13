import { useEffect, useState } from "react";
import { GENERIC_ERROR, readDetail } from "./detail";

interface Preview {
  preview_id: string;
  would_create: string[];
  would_overwrite: string[];
  requires_overwrite: boolean;
}

interface Result {
  exit_code: number;
  output: string;
}

const CHOICES = {
  repo: ["github", "local"],
  os: ["linux", "wsl", "windows"],
  assistant: ["copilot", "claude-code"],
  cloud: ["none", "aws"],
} as const;

type Options = { [K in keyof typeof CHOICES]: string };

const LABELS: Record<keyof Options, string> = {
  repo: "Repo type",
  os: "OS",
  assistant: "Assistant",
  cloud: "Cloud",
};

interface RepoItem {
  id: string;
  path: string;
}

export default function Install() {
  const [repos, setRepos] = useState<RepoItem[]>([]);
  const [target, setTarget] = useState("");
  const [options, setOptions] = useState<Options>({
    repo: "github",
    os: "linux",
    assistant: "copilot",
    cloud: "none",
  });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rescanned, setRescanned] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/repos");
        const data: unknown = await res.json();
        const list = (data as { repos?: unknown } | null)?.repos;
        if (live && Array.isArray(list)) {
          setRepos(
            list.filter(
              (r): r is RepoItem => typeof (r as RepoItem)?.path === "string",
            ),
          );
        }
      } catch {
        // Picker is optional; the typed path still works.
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  // Any input change invalidates the preview, so Confirm always matches it.
  function reset() {
    setPreview(null);
    setOverwrite(false);
    setResult(null);
    setRescanned(false);
  }

  async function post(url: string, body: unknown): Promise<Response | null> {
    setError(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(await readDetail(res));
        return null;
      }
      return res;
    } catch {
      setError(GENERIC_ERROR);
      return null;
    }
  }

  async function onPreview() {
    reset();
    const res = await post("/api/install/preview", { target, ...options });
    if (res) setPreview((await res.json()) as Preview);
  }

  async function onConfirm() {
    if (!preview) return;
    const res = await post("/api/install", {
      preview_id: preview.preview_id,
      overwrite,
    });
    if (!res) return;
    const data = (await res.json()) as Result;
    setResult(data);
    setPreview(null);
    if (data.exit_code === 0) {
      const scan = await post("/api/repos/rescan", {});
      if (scan) setRescanned(true);
    }
  }

  const blocked = !preview || (preview.requires_overwrite && !overwrite);

  return (
    <section>
      <h2>Install harness</h2>
      <label>
        Discovered repo
        <select
          value={repos.some((r) => r.path === target) ? target : ""}
          onChange={(e) => {
            setTarget(e.target.value);
            reset();
          }}
        >
          <option value="">(type a path below)</option>
          {repos.map((r) => (
            <option key={r.id} value={r.path}>
              {r.path}
            </option>
          ))}
        </select>
      </label>
      <label>
        Target folder
        <input
          value={target}
          onChange={(e) => {
            setTarget(e.target.value);
            reset();
          }}
        />
      </label>
      {(Object.keys(CHOICES) as (keyof Options)[]).map((key) => (
        <label key={key}>
          {LABELS[key]}
          <select
            value={options[key]}
            onChange={(e) => {
              setOptions({ ...options, [key]: e.target.value });
              reset();
            }}
          >
            {CHOICES[key].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
      ))}
      <button type="button" onClick={onPreview} disabled={!target}>
        Preview
      </button>
      {error && <p role="alert">{error}</p>}
      {preview && (
        <div>
          <h3>Would create</h3>
          <ul>
            {preview.would_create.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <h3>Would overwrite</h3>
          <ul>
            {preview.would_overwrite.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          {preview.requires_overwrite && (
            <label>
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
              />
              Overwrite existing files
            </label>
          )}
          <button type="button" onClick={onConfirm} disabled={blocked}>
            Confirm install
          </button>
        </div>
      )}
      {result && (
        <div>
          <p>Exit code: {result.exit_code}</p>
          <pre>{result.output}</pre>
        </div>
      )}
      {rescanned && <p>Repos rescanned.</p>}
    </section>
  );
}
