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

- Keep TV launch changes in the served /web bridge; delegate to the shared base to preserve existing desktop/mobile controls and saves.
- TV downloads ROM and BIOS sequentially, validates ZIP structure before starting, and passes verified blobs by real URL through its adapter because FBNeo requires ZIP filenames and File objects break filename lookup.
- TV compatibility transformations must fail closed when the shared player changes, avoiding silent mismatch and duplicate player implementations.
