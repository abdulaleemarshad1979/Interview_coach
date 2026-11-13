# BRIEFING — 2026-10-14T17:34:00Z

## Mission
Investigate and fix the Interview Coach camera auto-framing so face, eyes, and cheekbones remain visible during movement with stable virtual PTZ and verified browser tests while preserving college portal and student login.

## 🔒 My Identity
- Archetype: teamwork_preview_orchestrator
- Roles: orchestrator, user_liaison, human_reporter, successor
- Working directory: /home/abdul-aleem-arshad-mohammed/Work/Interview_coach/.agents/teamwork/orchestrator
- Original parent: parent
- Original parent conversation ID: 138e67b1-feb3-455a-a722-ada214a7dff4

## 🔒 My Workflow
- **Pattern**: Project
- **Scope document**: /home/abdul-aleem-arshad-mohammed/Work/Interview_coach/PROJECT.md
1. **Decompose**: Survey full scope with Explorers, map camera framing architecture and test setup.
2. **Dispatch & Execute**: Direct iteration loop (Explorer -> Worker -> Reviewer -> Challenger -> Auditor -> Gate).
3. **On failure**: Retry -> Replace -> Skip -> Redistribute -> Redesign.
4. **Succession**: Threshold 16 spawns.
- **Work items**:
  1. Survey & Architecture Mapping [in-progress]
  2. Virtual PTZ & Landmark Framing Fix [pending]
  3. Browser E2E Test Suite & Verification [pending]
  4. Final Gate & Audit [pending]
- **Current phase**: 1
- **Current focus**: Survey & Architecture Mapping

## 🔒 Key Constraints
- NEVER write, modify, or create source code files directly.
- NEVER run build/test commands yourself — require workers to do so.
- NEVER investigate or explore the problem at the code level — dispatch Explorers for technical investigation.
- You MAY use file-editing tools ONLY for metadata/state files (.md) in your .agents/teamwork/ folder.
- Preserve existing login, ECAP college portal authentication, and session handling without modification.
- Do not push commits or deploy to any remote environment.
- Face oval, eyes, and cheekbones must remain inside visible viewport (>= 5% margin).
- No black margins, no jarring transform-origin jumps, smooth PTZ interpolation.
- Never reuse a subagent after it has delivered its handoff — always spawn fresh.

## Current Parent
- Conversation ID: 138e67b1-feb3-455a-a722-ada214a7dff4
- Updated: 2026-10-14T17:31:58Z

## Key Decisions Made
- Dispatched 3 parallel survey explorers to comprehensively map codebase, bounds/indicators, and test/auth preservation boundaries.

## Team Roster
| Agent | Type | Work Item | Status | Conv ID |
|-------|------|-----------|--------|---------|
| explorer_survey_1 | teamwork_preview_explorer | Camera framing, landmarks, PTZ | in-progress | b29f2425-3d84-4a11-bd7e-af8031bf7d77 |
| explorer_survey_2 | teamwork_preview_explorer | Viewport bounds, status indicators, dynamic zoom | in-progress | 7d077559-7343-4f1c-a553-3dc8fdda9636 |
| explorer_survey_3 | teamwork_preview_explorer | Tests & Auth/Portal preservation boundaries | in-progress | 5a9899f5-36b2-46b9-b057-385f369b2870 |

## Succession Status
- Succession required: no
- Spawn count: 3 / 16
- Pending subagents: b29f2425-3d84-4a11-bd7e-af8031bf7d77, 7d077559-7343-4f1c-a553-3dc8fdda9636, 5a9899f5-36b2-46b9-b057-385f369b2870
- Predecessor: none
- Successor: not yet spawned

## Active Timers
- Heartbeat cron: cbae87ec-acec-45a8-83f4-ee3f3c76b5c3/task-13
- Safety timer: none
- On succession: kill all timers before spawning successor
- On context truncation: run `manage_task(Action="list")` — re-create if missing

## Artifact Index
- /home/abdul-aleem-arshad-mohammed/Work/Interview_coach/.agents/teamwork/ORIGINAL_REQUEST.md — Authoritative user request
- /home/abdul-aleem-arshad-mohammed/Work/Interview_coach/.agents/teamwork/orchestrator/DISPATCH.md — Parent dispatch history
