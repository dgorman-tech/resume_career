import { useQueryClient } from "@tanstack/react-query";
import { Microscope } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { toast } from "sonner";
import { deepDive } from "../lib/api";
import { DEEP_DIVE_DISCLOSURE } from "../lib/disclosure";

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
    <section className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-mono text-[11px] font-medium tracking-[0.08em] text-ink-muted">DEEP DIVE</h3>
        <button
          onClick={() => void run()}
          disabled={phase === "streaming"}
          className="flex items-center gap-1.5 rounded-md border border-hairline px-3 py-1 text-xs font-semibold text-ink transition hover:bg-sunken disabled:opacity-50"
        >
          <Microscope className="size-3.5" />
          {phase === "streaming" ? "Analyzing…" : hasExisting || phase === "done" ? "Re-run" : "Deep dive"}
        </button>
      </div>
      <p className="mb-2 max-w-[52ch] text-[11px] text-ink-muted">{DEEP_DIVE_DISCLOSURE}</p>
      {text && (
        <div className="md-body max-h-96 overflow-auto rounded-md border border-hairline bg-paper p-3 text-[13px] leading-relaxed">
          <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{text}</ReactMarkdown>
        </div>
      )}
      {phase === "error" && (
        <p className="mt-2 text-xs text-ink-muted">
          {text ? "The stream stopped early; the partial analysis is kept above." : "The deep dive couldn't run."}{" "}
          <button onClick={() => void run()} className="rounded-sm font-semibold text-teal underline">
            Try again
          </button>
        </p>
      )}
    </section>
  );
}
