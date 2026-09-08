import { useMemo, useState } from "react";
import Header from "./components/Header";

const REPO_URL = "https://github.com/Babug01/kubectl-command-builder";

const VERBS = [
  "get", "describe", "logs", "exec", "apply", "delete", "edit",
  "rollout restart", "rollout status", "scale", "port-forward", "top", "cp", "cordon", "drain",
];

const RESOURCE_TYPES = [
  "pod", "deployment", "replicaset", "statefulset", "daemonset", "service", "ingress",
  "configmap", "secret", "namespace", "node", "pv", "pvc", "job", "cronjob", "hpa", "networkpolicy",
];

// Verbs that operate on a node directly, not a resource type + name pair.
const NODE_ONLY_VERBS = new Set(["cordon", "drain"]);
// Verbs where a resource type genuinely doesn't apply (apply targets a
// manifest via -f, not a TYPE/NAME positional).
const NO_RESOURCE_TYPE_VERBS = new Set(["cp", "apply"]);
// kubectl logs/exec/port-forward attach to a running pod rather than going
// through the generic resource builder that get/describe/delete/scale/rollout
// use — they only accept a bare POD name or TYPE/NAME (slash-joined) as a
// single positional arg. "kubectl logs pod my-pod" (space-separated) is
// invalid and kubectl rejects it.
const SLASH_JOIN_VERBS = new Set(["logs", "exec", "port-forward"]);

function needsResourceType(verb) {
  return !NODE_ONLY_VERBS.has(verb) && !NO_RESOURCE_TYPE_VERBS.has(verb);
}
function needsName(verb) {
  return !NO_RESOURCE_TYPE_VERBS.has(verb);
}
function supportsNamespace(verb) {
  return !NODE_ONLY_VERBS.has(verb) && verb !== "cp";
}
function supportsAllNamespaces(verb) {
  return (verb === "get" || verb === "describe") && supportsNamespace(verb);
}

const OUTPUT_FORMATS = ["", "yaml", "json", "wide", "name"];

const styles = {
  root: { minHeight: "100dvh", display: "flex", flexDirection: "column" },
  content: { fontFamily: "system-ui, sans-serif", padding: "24px 32px", maxWidth: 980, margin: "0 auto", color: "var(--text, #1a1a1a)", width: "100%", boxSizing: "border-box", background: "var(--bg-subtle, #f0efed)", flex: 1 },
  title: { fontSize: 22, fontWeight: 700, margin: 0 },
  subtitle: { fontSize: 13, opacity: 0.6, margin: "4px 0 20px" },
  form: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 14, marginBottom: 16 },
  field: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 11, opacity: 0.6, textTransform: "uppercase", letterSpacing: "0.03em" },
  input: {
    padding: "9px 12px", borderRadius: 6, border: "1px solid var(--border, #e5e7eb)",
    background: "var(--input-bg, #f9fafb)", color: "var(--text, #1a1a1a)", fontSize: 13,
    fontFamily: "'SFMono-Regular', Consolas, monospace",
  },
  select: {
    padding: "9px 12px", borderRadius: 6, border: "1px solid var(--border, #e5e7eb)",
    background: "var(--input-bg, #f9fafb)", color: "var(--text, #1a1a1a)", fontSize: 13,
  },
  checkboxRow: { display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginTop: 22 },
  flagsSection: { marginTop: 8, marginBottom: 20 },
  flagsGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 },
  flagField: { display: "flex", alignItems: "center", gap: 8, fontSize: 13, background: "var(--input-bg, #f9fafb)", border: "1px solid var(--border, #e5e7eb)", borderRadius: 8, padding: "8px 12px" },
  sectionTitle: { fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", opacity: 0.6, marginBottom: 10, marginTop: 24 },
  commandBox: {
    display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderRadius: 8,
    border: "1px solid var(--border, #e5e7eb)", background: "var(--input-bg, #f9fafb)",
    fontFamily: "'SFMono-Regular', Consolas, monospace", fontSize: 14, wordBreak: "break-all",
  },
  copyBtn: {
    flexShrink: 0, padding: "8px 16px", borderRadius: 6, border: "none", background: "var(--accent, #4f46e5)",
    color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600,
  },
  refTable: { width: "100%", borderCollapse: "collapse", fontSize: 12.5 },
  refTh: { textAlign: "left", padding: "6px 10px 6px 0", opacity: 0.5, fontWeight: 600, textTransform: "uppercase", fontSize: 10, borderBottom: "2px solid var(--border, #e5e7eb)" },
  refTd: { padding: "8px 10px 8px 0", borderBottom: "1px solid var(--border, #e5e7eb)", verticalAlign: "top" },
  refCmd: { fontFamily: "'SFMono-Regular', Consolas, monospace", fontSize: 12, background: "var(--bg-subtle, #f0efed)", padding: "2px 6px", borderRadius: 4, display: "inline-block" },
};

function buildCommand(state) {
  const { verb, resourceType, name, namespace, allNamespaces, flags } = state;
  const parts = ["kubectl", ...verb.split(" ")];

  if (verb === "cp") {
    parts.push(flags.cpSrc || "<local-path-or-ns/pod:path>");
    parts.push(flags.cpDest || "<ns/pod:path-or-local-path>");
    return parts.join(" ");
  }

  if (NODE_ONLY_VERBS.has(verb)) {
    parts.push(name || "<node-name>");
    if (verb === "drain") {
      if (flags.ignoreDaemonsets) parts.push("--ignore-daemonsets");
      if (flags.deleteEmptydirData) parts.push("--delete-emptydir-data");
      if (flags.force) parts.push("--force");
    }
    return parts.join(" ");
  }

  if (SLASH_JOIN_VERBS.has(verb)) {
    // Bare pod name when resourceType is "pod" (the common case), otherwise
    // TYPE/NAME (e.g. deployment/my-app) to fetch logs/exec into one of its pods.
    if (resourceType === "pod") {
      parts.push(name || "<pod-name>");
    } else {
      parts.push(`${resourceType}/${name || "<name>"}`);
    }
  } else {
    if (needsResourceType(verb) && resourceType) {
      parts.push(resourceType);
    }
    if (needsName(verb) && name && verb !== "top") {
      parts.push(name);
    }
    if (verb === "top" && name) {
      parts.push(name);
    }
  }

  if (supportsNamespace(verb)) {
    if (allNamespaces && supportsAllNamespaces(verb)) {
      parts.push("--all-namespaces");
    } else if (namespace) {
      parts.push("-n", namespace);
    }
  }

  switch (verb) {
    case "get":
    case "describe":
      if (flags.selector) parts.push("-l", flags.selector);
      if (flags.fieldSelector) parts.push("--field-selector", flags.fieldSelector);
      if (verb === "get" && flags.output) parts.push("-o", flags.output);
      if (verb === "get" && flags.watch) parts.push("-w");
      break;
    case "logs":
      if (flags.follow) parts.push("-f");
      if (flags.container) parts.push("-c", flags.container);
      if (flags.tail) parts.push("--tail", flags.tail);
      if (flags.since) parts.push("--since", flags.since);
      if (flags.previous) parts.push("-p");
      break;
    case "exec":
      if (flags.interactive) parts.push("-it");
      if (flags.container) parts.push("-c", flags.container);
      parts.push("--");
      parts.push(flags.command || "/bin/sh");
      break;
    case "apply":
      parts.push("-f", flags.file || "<file-or-dir>");
      if (flags.dryRun) parts.push("--dry-run=client");
      break;
    case "delete":
      if (flags.selector) parts.push("-l", flags.selector);
      if (flags.gracePeriod0) parts.push("--grace-period=0");
      if (flags.force) parts.push("--force");
      break;
    case "scale":
      parts.push(`--replicas=${flags.replicas || "1"}`);
      break;
    case "rollout status":
    case "rollout restart":
      break;
    case "port-forward":
      parts.push(`${flags.localPort || "8080"}:${flags.remotePort || "80"}`);
      break;
    case "top":
      if (flags.containers) parts.push("--containers");
      break;
    case "edit":
      break;
    default:
      break;
  }

  return parts.join(" ");
}

function VerbFlags({ verb, flags, setFlag }) {
  const field = (key, label, placeholder, type = "text") => (
    <div style={styles.flagField}>
      <span style={{ opacity: 0.6, minWidth: 90 }}>{label}</span>
      <input style={{ ...styles.input, border: "none", background: "transparent", padding: 0, flex: 1 }} type={type} value={flags[key] || ""} placeholder={placeholder} onChange={(e) => setFlag(key, e.target.value)} />
    </div>
  );
  const checkbox = (key, label) => (
    <label style={styles.flagField}>
      <input type="checkbox" checked={!!flags[key]} onChange={(e) => setFlag(key, e.target.checked)} />
      {label}
    </label>
  );

  switch (verb) {
    case "get":
      return (
        <div style={styles.flagsGrid}>
          <div style={styles.flagField}>
            <span style={{ opacity: 0.6, minWidth: 90 }}>-o (output)</span>
            <select style={{ ...styles.select, border: "none", background: "transparent", flex: 1 }} value={flags.output || ""} onChange={(e) => setFlag("output", e.target.value)}>
              {OUTPUT_FORMATS.map((f) => <option key={f} value={f}>{f || "(default table)"}</option>)}
            </select>
          </div>
          {field("selector", "-l selector", "app=my-app")}
          {field("fieldSelector", "--field-selector", "status.phase=Running")}
          {checkbox("watch", "-w (watch)")}
        </div>
      );
    case "describe":
      return (
        <div style={styles.flagsGrid}>
          {field("selector", "-l selector", "app=my-app")}
          {field("fieldSelector", "--field-selector", "status.phase=Running")}
        </div>
      );
    case "logs":
      return (
        <div style={styles.flagsGrid}>
          {checkbox("follow", "-f (follow)")}
          {field("container", "-c container", "sidecar")}
          {field("tail", "--tail", "100")}
          {field("since", "--since", "1h")}
          {checkbox("previous", "-p (previous)")}
        </div>
      );
    case "exec":
      return (
        <div style={styles.flagsGrid}>
          {checkbox("interactive", "-it")}
          {field("container", "-c container", "app")}
          {field("command", "-- command", "/bin/sh")}
        </div>
      );
    case "apply":
      return (
        <div style={styles.flagsGrid}>
          {field("file", "-f file/dir", "./manifests/")}
          {checkbox("dryRun", "--dry-run=client")}
        </div>
      );
    case "delete":
      return (
        <div style={styles.flagsGrid}>
          {field("selector", "-l selector", "app=my-app")}
          {checkbox("gracePeriod0", "--grace-period=0")}
          {checkbox("force", "--force")}
        </div>
      );
    case "scale":
      return (
        <div style={styles.flagsGrid}>
          {field("replicas", "--replicas", "3", "number")}
        </div>
      );
    case "port-forward":
      return (
        <div style={styles.flagsGrid}>
          {field("localPort", "local port", "8080")}
          {field("remotePort", "remote port", "80")}
        </div>
      );
    case "top":
      return (
        <div style={styles.flagsGrid}>
          {checkbox("containers", "--containers")}
        </div>
      );
    case "cp":
      return (
        <div style={styles.flagsGrid}>
          {field("cpSrc", "source", "./local/file or ns/pod:/path")}
          {field("cpDest", "destination", "ns/pod:/path or ./local/file")}
        </div>
      );
    case "drain":
      return (
        <div style={styles.flagsGrid}>
          {checkbox("ignoreDaemonsets", "--ignore-daemonsets")}
          {checkbox("deleteEmptydirData", "--delete-emptydir-data")}
          {checkbox("force", "--force")}
        </div>
      );
    case "rollout restart":
    case "rollout status":
    case "edit":
    case "cordon":
      return <p style={{ fontSize: 12.5, opacity: 0.6 }}>No extra flags needed for this verb.</p>;
    default:
      return null;
  }
}

const ONE_LINERS = [
  { label: "Pods not in Running phase, all namespaces", cmd: "kubectl get pods -A --field-selector=status.phase!=Running" },
  { label: "Force-delete a stuck (Terminating) pod", cmd: "kubectl delete pod <name> -n <namespace> --grace-period=0 --force" },
  { label: "Sort pods by restart count", cmd: "kubectl get pods -A --sort-by='.status.containerStatuses[0].restartCount'" },
  { label: "Watch pods in a namespace", cmd: "kubectl get pods -n <namespace> -w" },
  { label: "Get events sorted by timestamp", cmd: "kubectl get events -n <namespace> --sort-by='.lastTimestamp'" },
  { label: "Nodes with their allocatable CPU/memory", cmd: "kubectl get nodes -o custom-columns='NAME:.metadata.name,CPU:.status.allocatable.cpu,MEM:.status.allocatable.memory'" },
  { label: "Which node a pod is scheduled on", cmd: "kubectl get pod <name> -n <namespace> -o jsonpath='{.spec.nodeName}'" },
  { label: "Restart a deployment (rolling)", cmd: "kubectl rollout restart deployment/<name> -n <namespace>" },
  { label: "Tail logs from all containers of a pod", cmd: "kubectl logs <pod> -n <namespace> --all-containers -f" },
  { label: "Get a secret value decoded", cmd: "kubectl get secret <name> -n <namespace> -o jsonpath='{.data.<key>}' | base64 -d" },
  { label: "Top pods by memory usage", cmd: "kubectl top pods -n <namespace> --sort-by=memory" },
  { label: "Drain a node before maintenance", cmd: "kubectl drain <node> --ignore-daemonsets --delete-emptydir-data --force" },
  { label: "List all images running in a namespace", cmd: "kubectl get pods -n <namespace> -o jsonpath='{range .items[*]}{.spec.containers[*].image}{\"\\n\"}{end}'" },
  { label: "Get pods with high restart counts (>5)", cmd: "kubectl get pods -A -o json | jq '.items[] | select(.status.containerStatuses[]?.restartCount > 5) | .metadata.name'" },
  { label: "Explain a resource field (e.g. spec.strategy)", cmd: "kubectl explain deployment.spec.strategy" },
];

export default function KubectlCommandBuilder() {
  const [verb, setVerb] = useState("get");
  const [resourceType, setResourceType] = useState("pod");
  const [name, setName] = useState("");
  const [namespace, setNamespace] = useState("default");
  const [allNamespaces, setAllNamespaces] = useState(false);
  const [flags, setFlags] = useState({});
  const [copied, setCopied] = useState(false);

  function setFlag(key, value) {
    setFlags((f) => ({ ...f, [key]: value }));
  }

  const command = useMemo(
    () => buildCommand({ verb, resourceType, name, namespace, allNamespaces, flags }),
    [verb, resourceType, name, namespace, allNamespaces, flags]
  );

  function copy() {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={styles.root}>
      <Header repoUrl={REPO_URL} />
      <div style={styles.content}>
        <h1 style={styles.title}>kubectl Command Builder</h1>
        <p style={styles.subtitle}>
          Pick a verb, resource, and flags — get the exact <code>kubectl</code> command assembled and ready to copy.
          Runs entirely in the browser; nothing you enter ever leaves your machine.
        </p>

        <div style={styles.form}>
          <div style={styles.field}>
            <span style={styles.label}>Verb</span>
            <select style={styles.select} value={verb} onChange={(e) => setVerb(e.target.value)}>
              {VERBS.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          {needsResourceType(verb) && (
            <div style={styles.field}>
              <span style={styles.label}>Resource type</span>
              <select style={styles.select} value={resourceType} onChange={(e) => setResourceType(e.target.value)}>
                {RESOURCE_TYPES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}

          {needsName(verb) && (
            <div style={styles.field}>
              <span style={styles.label}>{NODE_ONLY_VERBS.has(verb) ? "Node name" : "Name"}</span>
              <input style={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder={NODE_ONLY_VERBS.has(verb) ? "aks-nodepool1-12345-vmss000000" : "my-app-7d8f9c-xk2p1"} />
            </div>
          )}

          {supportsNamespace(verb) && !allNamespaces && (
            <div style={styles.field}>
              <span style={styles.label}>Namespace</span>
              <input style={styles.input} value={namespace} onChange={(e) => setNamespace(e.target.value)} placeholder="default" />
            </div>
          )}

          {supportsAllNamespaces(verb) && (
            <div style={styles.checkboxRow}>
              <input type="checkbox" id="allns" checked={allNamespaces} onChange={(e) => setAllNamespaces(e.target.checked)} />
              <label htmlFor="allns">All namespaces (-A)</label>
            </div>
          )}
        </div>

        <div style={styles.flagsSection}>
          <div style={styles.sectionTitle}>Flags for "{verb}"</div>
          <VerbFlags verb={verb} flags={flags} setFlag={setFlag} />
        </div>

        <div style={styles.sectionTitle}>Command</div>
        <div style={styles.commandBox}>
          <code style={{ flex: 1 }}>{command}</code>
          <button style={styles.copyBtn} onClick={copy}>{copied ? "Copied" : "Copy"}</button>
        </div>

        <div style={styles.sectionTitle}>Handy One-Liners</div>
        <table style={styles.refTable}>
          <thead>
            <tr><th style={styles.refTh}>What</th><th style={styles.refTh}>Command</th></tr>
          </thead>
          <tbody>
            {ONE_LINERS.map((o) => (
              <tr key={o.label}>
                <td style={styles.refTd}>{o.label}</td>
                <td style={styles.refTd}><span style={styles.refCmd}>{o.cmd}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
