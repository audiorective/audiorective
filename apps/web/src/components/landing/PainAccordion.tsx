import { useState } from "react";
import PainCard from "./PainCard";
import StateDiagram from "../diagrams/StateDiagram";
import ClockDiagram from "../diagrams/ClockDiagram";

export default function PainAccordion() {
  const [openId, setOpenId] = useState<string>("state");

  const handleToggle = (id: string) => {
    setOpenId(id);
  };

  return (
    <div className="pain-cards">
      <PainCard
        id="state"
        title="According to my state, you're wrong."
        oneLiner="Two owners, one value, and a sync bug with your name on it."
        open={openId === "state"}
        onToggle={handleToggle}
        diagram={<StateDiagram />}
      >
        <p>
          State ends up owned twice. Your UI framework wants to be the source of truth — React, Vue, Svelte all expect to own state and re-render from
          it. But the audio graph already owns state too: an <code>AudioParam</code> <em>has</em> a value, a node <em>has</em> its settings. So the
          same value lives in two places, and you're hand-writing sync code to keep them agreed — update the store, then remember to push it to the
          audio node, every time. Nothing structurally enforces that contract, so months and a few features later, a slider moves and the sound
          doesn't follow. Worse, your audio logic is now fused to one framework — and frameworks churn, unlike the stable Web Audio API standard — so
          switching means rewriting the audio layer too.
        </p>
        <p className="card-resolves">
          Resolves to → <code>@audiorective/core</code>
        </p>
      </PainCard>

      <PainCard
        id="clock"
        title="Two clocks. One of them is lying."
        oneLiner={
          <>
            The audio clock keeps perfect time. <code>setTimeout</code> flinches at every layout and GC — and that's the one most apps schedule on.
          </>
        }
        open={openId === "clock"}
        onToggle={handleToggle}
        diagram={<ClockDiagram />}
      >
        <p>
          Scheduling gets reinvented — usually wrong. The web has two clocks: the sample-accurate audio clock that actually plays your sound, and the
          jittery JavaScript clock (<code>setTimeout</code>) that's at the mercy of layout and garbage collection. The fix — a lookahead scheduler
          bridging the two — was{" "}
          <a className="inline-link" href="https://web.dev/articles/audio-scheduling" target="_blank" rel="noopener noreferrer">
            spelled out by Chris Wilson in 2013
          </a>
          , yet a remarkable number of apps <em>still</em> fire notes straight off <code>setTimeout</code> and wonder why the rhythm wobbles. Then
          swing, count-in, and a second independent loop each get their own ad-hoc patch on top.
        </p>
        <p className="card-connector">
          Audiorective's clock implements that lookahead model once, correctly — so "two clocks" stops being trivia you're expected to rediscover and
          becomes something the API just handles.
        </p>
        <p className="card-resolves">
          Resolves to → <code>@audiorective/clock</code>
        </p>
      </PainCard>
    </div>
  );
}
