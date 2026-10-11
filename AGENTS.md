<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Google Drive saves go through the Lovable connector gateway (LOVABLE_API_KEY + GOOGLE_DRIVE_API_KEY), never raw Google OAuth env vars — the project has no Google client credentials.
- The Supabase client fallback URL/key must match this project's own backend — a stale fallback silently breaks sign-in on the published site.
