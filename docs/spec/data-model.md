# Spec: Dátový model

**Status:** Návrh (Supabase až vo Fáze 3; do vtedy súborový výstup `projects.json`)

## Princípy

- **Projekt je samostatná entita** nad repami aj webmi (pozri [ADR 0003](../adr/0003-project-as-entity-1n.md)).
- Multi-user ready od začiatku: každá tabuľka má `user_id` a RLS politiku `user_id = auth.uid()`.
- Surové dáta zo zdrojov (`repos`, `sites`) sa oddeľujú od používateľských rozhodnutí (`projects`, viditeľnosť, texty), aby re-sync neprepísal úpravy.

## Tabuľky

| Tabuľka | Kľúčové stĺpce | Poznámka |
|---|---|---|
| `sources` | `id`, `user_id`, `provider` (`github`/`netlify`), `token_secret_id`, `account_login`, `last_synced_at` | token v Supabase Vault, nikdy v plain texte |
| `repos` | `id`, `user_id`, `provider`, `full_name`, `private`, `fork`, `archived`, `homepage`, `language`, `topics[]`, `pushed_at`, `description` | upsert pri sync, kľúč `(user_id, provider, full_name)` |
| `sites` | `id`, `user_id`, `netlify_site_id`, `name`, `domain`, `framework`, `screenshot_url`, `last_deploy_at`, `deploy_context`, `facts jsonb` | `facts` = funkcie, crony, lighthouse |
| `projects` | `id`, `user_id`, `slug`, `title`, `hidden`, `hidden_reason`, `is_client`, `anonymize`, `sort_order` | vlastník používateľských rozhodnutí |
| `project_repos` | `project_id`, `repo_id`, `is_primary` | 1 projekt : N rep |
| `project_sites` | `project_id`, `site_id`, `match_source`, `is_primary` | 1 projekt : N webov |
| `project_analysis` | `id`, `project_id`, `facts jsonb`, `output jsonb`, `model`, `version`, `created_at` | história verzií, aktívna = najnovšia |
| `screenshots` | `id`, `project_id`, `site_id`, `viewport` (`desktop`/`mobile`), `source` (`netlify`/`playwright`/`upload`), `storage_path`, `taken_at` | |
| `portfolios` | `id`, `user_id`, `theme`, `profile jsonb`, `settings jsonb`, `last_published_at`, `netlify_site_id` | výstupný web |

## Vzťahy

```
sources 1─N repos
sources 1─N sites
projects N─M repos   (project_repos)
projects N─M sites   (project_sites)
projects 1─N project_analysis
projects 1─N screenshots
portfolios 1─N projects (cez user_id + sort_order)
```

## Re-sync pravidlá

- `repos` a `sites` sa vždy prepisujú zo zdroja.
- `projects` sa vytvárajú len pre nové páry. Existujúci projekt (aj ručne upravený) sa nemení.
- Zmazaný web/repo v zdroji → väzba sa označí ako `orphaned`, projekt ostáva, kým ho používateľ nezmaže.
