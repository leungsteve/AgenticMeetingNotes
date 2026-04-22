# NotebookLM Presentation Prompt

Use this to generate a slide deck presentation explaining the Granola + Elastic Meeting Intelligence Pipeline and its benefits to the account team.

## Sources to Add in NotebookLM

Add these three files as sources by pasting the URLs directly into NotebookLM's "Add source" dialog:

```
https://raw.githubusercontent.com/leungsteve/AgenticMeetingNotes/main/README.md
https://raw.githubusercontent.com/leungsteve/AgenticMeetingNotes/main/docs/agent-builder-plan.md
https://raw.githubusercontent.com/leungsteve/AgenticMeetingNotes/main/project_brief.md
```

If NotebookLM does not accept raw GitHub URLs, open each one in a browser, select all, and paste it in as a "Copied text" source.

## Prompt

Paste the following into the NotebookLM chat after your sources are loaded:

---

Create a slide-by-slide outline for a 15 to 18 slide presentation for an Elastic pre-sales and post-sales account team: Account Executives, Solutions Architects, Customer Architects, and leadership. For each slide, provide a title, three to five conversational speaker notes in first person, and a brief description of any visual.

**Slides 1-3: The Problem.** Open with the pain every person on the team recognizes: the AE re-reading notes on Sunday night instead of preparing strategy, the SA typing bullet points during a whiteboard session instead of asking the next question, the CA walking into their first customer call without knowing what was promised in pre-sales, and the leader sitting through a 30-minute pipeline review to learn what a 10-second search could have answered.

**Slides 4-5: The Insight.** The intelligence already exists in every meeting. The problem is it lives in Granola, memory, and email threads. This system captures it automatically, structures it, and makes it conversational through an AI agent. The shift is from reactive (someone tells me) to proactive (I ask and get an answer in seconds).

**Slide 6: How It Works.** Three steps: Granola captures the meeting, the team member takes two minutes to review and enrich the note in the pipeline UI, and everything is searchable through the Account Intelligence Agent. Keep it visual and simple.

**Slides 7-10: One slide per role.** For each, frame it as the specific behavior change this enables, not a feature list. Use "before this system" versus "with this system."
- AE: Call prep in ten seconds, commitment tracking, competitive intel from every meeting, deal momentum signals.
- SA: Stay fully present in technical conversations, get a Salesforce 1-2-3 update for any account by asking the agent, always know the current technical environment for any account.
- CA: Walk into any post-sales account with complete visibility into pre-sales commitments and technical decisions. Identify expansion opportunities as new use cases surface.
- Leader: Pipeline health on demand, at-risk flags before they escalate, cross-account patterns visible in one query.

**Slides 11-12: The Agent in Action.** Show two concrete example interactions using fictional account names: "Tell me the latest with Meridian Systems" generating a full account briefing, and "Give me the 1-2-3 for Stratum Networks" generating a three-section Salesforce update. Frame each as before-and-after: manual effort versus ten seconds.

**Slide 13: The SA 1-2-3 Spotlight.** Dedicate a slide to this because it eliminates one of the highest-friction weekly tasks. Show the exact three-section format (two to three sentences per section, copy-paste ready) and frame it as the end of the Friday afternoon Salesforce scramble.

**Slides 14-15: What Is Live and What Is Coming.** Live today: Kibana Agent Builder agent with 13 custom tools, pipeline UI, nightly rollups and alerts. On the roadmap: embedded chat in the app, Slack slash command, and live Salesforce integration.

**Slide 16: Getting Started.** Three steps: configure the Granola meeting template, run the setup script, start asking the agent questions in Kibana. Keep it approachable and non-technical.

**Slide 17: The Vision.** Close with the cultural shift. The team that uses this system walks into every room more prepared, follows through on every commitment, and surfaces the right information at the right time without anyone having to ask. The competitive advantage is consistency: every person operating with the same quality of context regardless of tenure or memory.

Use a collaborative, energetic tone throughout. Avoid deep technical detail but feel free to mention Elastic Serverless and AI embeddings where they add confidence.

---

## Follow-up Prompt

After the initial outline is generated, use this to sharpen the per-role slides:

> Expand slides 7 through 10 with more specific language tailored to each role's daily workflow, and add a two-sentence transition from each role slide to the next.
