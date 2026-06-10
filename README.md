# Vira Shuttle - cPanel / Apache Deployment

Frontend: `https://vira.bog.co.ir`
Backend: `https://vira.bog.co.ir/api1`

Important:
- Browser code must only call relative `/api1/...` paths.
- Apache/LiteSpeed must not rewrite or proxy `/api1/*` away from this host.
- SPA fallback must never capture `/api1` or `/socket`.

## Files
- `public/.htaccess`
- `backend/.htaccess`
- `backend/config/backend-config/index.js`
- `.env`
- `.env.example`
- `public/runtime-config.json`

## Apache/LiteSpeed flow
1. Request hits `https://vira.bog.co.ir/api1/...`
2. API app on the same host returns JSON
3. Frontend routes fall back to `index.html` only for non-API paths

## Notes
- Frontend `VITE_API_BASE_URL` should stay `/api1`.
- Backend CORS must allow `https://vira.bog.co.ir`.
- No browser-visible direct backend origin calls.
