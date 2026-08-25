import { useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
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
    <section className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[10px] font-bold tracking-widest text-ink-muted">DEEP DIVE</h3>
        <button
          onClick={() => void run()}
          disabled={phase === "streaming"}
          className="grad-bg flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-white disabled:opacity-50"
        >
          <Sparkles className="size-3.5" />
          {phase === "streaming" ? "Analyzing…" : hasExisting || phase === "done" ? "Re-run" : "Deep dive"}
        </button>
      </div>
      {text && (
        <div className="prose-sm glass max-h-96 overflow-auto rounded-lg p-3 text-[13px] leading-relaxed [&_h1]:mt-3 [&_h1]:text-sm [&_h1]:font-bold [&_h1]:text-teal">
          <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{text}</ReactMarkdown>
        </div>
      )}
      {phase === "error" && text && (
        <button onClick={() => void run()} className="mt-2 text-xs text-amber underline">
          Stream interrupted — retry (partial text kept above)
        </button>
      )}
    </section>
  );
}
