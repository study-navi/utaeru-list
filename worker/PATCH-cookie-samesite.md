# Quick Edit: SameSite cookie fix (production)

GitHub Pages (`study-navi.github.io`) → Worker (`utaeru-api.manabit.workers.dev`) は **cross-site** です。
`SameSite=Lax` のセッション Cookie は `fetch(..., { credentials: 'include' })` に載らないため、
`/api/auth/me` と `/api/streamer/{id}/claim` が常に 401 になります。

## 変更箇所（2か所）

Cloudflare Dashboard → Workers → `utaeru-api` → **Quick Edit** で、
セッション Cookie を設定している行を探し、**両方**を次のように変更してください。

```diff
- SameSite=Lax
+ SameSite=None
```

対象:

1. **ログイン時** (`POST /api/auth/google` の `Set-Cookie`)
2. **ログアウト時** (`POST /api/auth/logout` の `Set-Cookie` クリア)

属性は次の形を維持してください:

```
utaeru_session=...; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=2592000
utaeru_session=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0
```

`Secure` は `SameSite=None` に必須です（既に付いていればそのまま）。

## デプロイ後の確認

```bash
curl -sS -D - -o /dev/null -X POST \
  https://utaeru-api.manabit.workers.dev/api/auth/logout \
  -H 'Content-Type: application/json' -d '{}'
# → Set-Cookie に SameSite=None が含まれること

node scripts/test-api-phase4c.mjs
# → 「logout Set-Cookie が SameSite=None」が OK になること
```

## フル Worker のデプロイ（推奨・中長期）

リポジトリの `worker/` にソースを追加済みです。Quick Edit の代わりに:

```bash
cd worker
wrangler login
wrangler deploy
```

**注意:** `SESSION_SECRET` は既存本番値と同じ secret を設定してください（変えると既存セッションが無効になります）。
