# T004 — Public metadata prep

- `package.json`: removed `private: true` for public GitHub intent
- `README.md`: clone URL template `https://github.com/OWNER/goalbuddy-cursor-port.git` + Publishing section
- **Not pushed** — waiting on GitHub `OWNER/repo` and `gh auth`

## Next (T005 / operator)

1. Choose owner (e.g. your GitHub username) and confirm repo name `goalbuddy-cursor-port`
2. `gh auth login` if `gh` is not installed
3. Replace `OWNER` in README with real owner
4. `gh repo create <owner>/goalbuddy-cursor-port --public --source=. --remote=origin --push`
5. Fresh-clone verify per README Publishing section; capture output in board receipt
