# kubectl Command Builder

**Live demo:** https://kubectl-command-builder.vercel.app (Vercel) · [GitHub Pages mirror](https://babug01.github.io/kubectl-command-builder/)

Pick a verb, resource type, name/namespace, and the flags that verb actually supports — get the
exact `kubectl` command assembled and ready to copy, instead of reconstructing it from memory or
`kubectl --help` every time. Runs entirely in the browser; nothing you enter ever leaves your
machine.

## Features

- **15 verbs**: `get`, `describe`, `logs`, `exec`, `apply`, `delete`, `edit`, `rollout restart`,
  `rollout status`, `scale`, `port-forward`, `top`, `cp`, `cordon`, `drain`
- **17 resource types**: pods, deployments, replicasets, statefulsets, daemonsets, services,
  ingresses, configmaps, secrets, namespaces, nodes, PVs, PVCs, jobs, cronjobs, HPAs, network
  policies
- **Flags that change based on the verb** — `logs` gets `-f`/`--tail`/`-c`/`--since`/`-p`; `exec`
  gets `-it`/`-c`/`--`  command; `get`/`describe` get `-o yaml|json|wide`, `-l` selector,
  `--field-selector`; `scale` gets `--replicas`; `drain` gets `--ignore-daemonsets`/
  `--delete-emptydir-data`/`--force`; and so on
- **Correct positional-argument form per verb** — `get`/`describe`/`delete`/`scale`/`rollout` accept
  `TYPE NAME` as two space-separated tokens, but `logs`/`exec`/`port-forward` don't: they only accept
  a bare pod name or `TYPE/NAME` (slash-joined), since they attach to a running pod rather than going
  through the generic resource builder — mixing this up produces a command kubectl rejects outright,
  so the builder assembles the correct form for whichever verb is selected
- **Namespace handling**, including an all-namespaces checkbox for `get`/`describe`
- One-click copy of the assembled command
- A static reference list of ~15 handy one-liners (finding not-ready pods, force-deleting a stuck
  pod, sorting by restart count, draining a node, and more)

## Why I built this

I kept re-deriving the same handful of `kubectl` invocations from muscle memory, including
re-learning the hard way that `kubectl logs deployment my-app` isn't valid but `kubectl logs
deployment/my-app` is. This is also one piece of a larger internal DevOps tool I built at work
consolidating the utility pages a platform engineer reaches for daily into one place — this repo is
the kubectl builder piece, cleaned up and open-sourced on its own.

## Tech Stack

- [React](https://react.dev/) + [Vite](https://vitejs.dev/) — no other runtime dependencies; this is
  pure form-state and string assembly, no parsing involved

## Running locally

```bash
git clone https://github.com/Babug01/kubectl-command-builder.git
cd kubectl-command-builder
npm install
npm run dev
```

## License

MIT — see [LICENSE](LICENSE).
