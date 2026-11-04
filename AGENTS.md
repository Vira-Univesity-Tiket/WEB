# Repository delivery rules

- After implementing each requested change, validate the completed version, commit it, and push it to this repository's upstream branch. The user has authorized these routine pushes; do not ask for confirmation again.
- The repository is `https://github.com/Vira-Univesity-Tiket/WEB`; the current upstream branch is `origin/main`.
- Run checks appropriate to the change, including tests, typecheck, lint, build and a security review where applicable. Fix relevant failures before pushing; do not push a knowingly broken version.
- Publish source code, original assets, configuration templates, migrations, tests, lockfiles and documentation only.
- Never commit build output (`dist/`, `build/`, `out/`), dependencies (`node_modules/`), real `.env` files, credentials, private storage, database data, logs, coverage or generated test reports. Keep safe `.env.example` templates and protective `.htaccess` configuration files.
- Stage intended files explicitly and inspect the staged diff and file list before committing. Never force-add excluded artifacts.
- Fetch upstream changes and preserve other contributors' work. Never force-push or rewrite published history.
- A Git push does not deploy the application. Do not claim production deployment from a successful push.
