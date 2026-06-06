import { useState } from "react";
import { ClipboardList, Loader2, Search } from "lucide-react";

const MAX_POSTS = 10;

export function PostScrapeCard({ isRunning, onScrape }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");

  const urls = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, MAX_POSTS);

  async function handleSubmit() {
    if (urls.length === 0) return;
    await onScrape(urls);
    setText("");
    setOpen(false);
  }

  return (
    <div className="glass-card px-4 py-3 text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
      >
        <ClipboardList className="h-3.5 w-3.5" aria-hidden />
        Scrape specifieke posts
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            placeholder={"Plak LinkedIn post-URL's, één per regel (max 10)\nhttps://www.linkedin.com/posts/..."}
            className="w-full resize-y rounded-md border border-slate-200 bg-white/70 px-3 py-2 font-mono text-xs text-slate-700 outline-none focus:border-emerald-500"
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-400">
              {urls.length}/{MAX_POSTS} posts
            </span>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isRunning || urls.length === 0}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Bezig…
                </>
              ) : (
                <>
                  <Search className="h-3.5 w-3.5" aria-hidden />
                  Scrape {urls.length > 0 ? urls.length : ""} posts
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
