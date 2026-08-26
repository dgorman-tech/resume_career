import { useQueryClient } from "@tanstack/react-query";
import { Microscope } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { toast } from "sonner";
import { deepDive } from "../lib/api";

type Phase = "idle" | "streaming" | "done" | "error";

export function DeepDivePanel({ jobKey, hasExisting, autoStart, onStarted }: {
  jobKey: string;
  hasExisting: boolean;
  autoStart: boolean;
  onStarted: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [text, setText] = useState("");
  const qc = useQueryClient();
  const running = useRef(false);

  const run = async () => {
    if (running.current) return;
    running.current = true;
    setPhase("streaming");
    setText("");
    try {
      await deepDive(jobKey, (chunk) => setText((t) => t + chunk));
      setPhase("done");
      qc.invalidateQueries({ queryKey: ["jobs"] });
    } catch (e) {
      setPhase("error");
      toast.error((e as Error).message);
    } finally {
      running.current = false;
    }
  };

  useEffect(() => {
    setPhase("idle");
    setText("");
  }, [jobKey]);

  useEffect(() => {
    if (autoStart) {
      onStarted();
      void run();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, jobKey]);

  return (
    <section>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-mono text-[11px] font-medium tracking-[0.08em] text-ink-muted">DEEP DIVE</h3>
        <button
          onClick={() => void run()}
          disabled={phase === "streaming"}
          className="flex items-center gap-1.5 rounded-md border border-hairline px-3 py-1 text-xs font-semibold text-ink transition hover:bg-sunken disabled:text-ink-muted"
        >
          <Microscope className="size-3.5" aria-hidden="true" />
          {phase === "streaming" ? "Analyzing…" : hasExisting || phase === "done" ? "Re-run" : "Deep dive"}
        </button>
      </div>
      {phase === "streaming" && !text && (
        <p aria-live="polite" className="mt-3 text-sm text-ink-muted">
          Reading the posting against your profile…
        </p>
      )}
      {text && (
        // No inner scroller: a scroll region nested inside the drawer's own scroll
        // traps the wheel and hides most of a six-section analysis behind 384px.
        // The analysis flows as a document and the drawer scrolls it.
        <div className="md-body mt-3 max-w-[70ch] text-ink">
          <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{text}</ReactMarkdown>
        </div>
      )}
      {phase === "error" && (
        <p className="mt-3 text-sm text-ink-muted">
          {text ? "The stream stopped early; the partial analysis is kept above." : "The deep dive couldn't run."}{" "}
          <button onClick={() => void run()} className="rounded-sm font-semibold text-teal underline">
            Try again
          </button>
        </p>
      )}
    </section>
  );
}
