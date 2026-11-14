# Audit: block-button-container
Task book: user report in the T3 thread (no separate task-book file). Revision: none.
PStack: /Volumes/SSD/.claude/plugins/cache/cursor-plugins/pstack/0.15.36 v0.15.36, playbook bug-fix
Base: main  Branch: agent/block-button-container  PR: pending

| # | Requirement (from task book) | Implemented | Verified | Evidence (code/test/artifact) | Open issue |
|---|------------------------------|-------------|----------|-------------------------------|------------|
| 1 | The block button is on the wrong layer and in the wrong container. Put it in the video card so its layer and container match the card. | yes | yes | script.user.js mountCardButton; browser repro before[].inCard matches the card uid | — |
| 2 | After a block click deletes a video card, the block button must not stay at the old position. | yes | yes | test/card-button.js feed removal; browser afterRemove has no uid 111 | — |
| 3 | When layout moves another card into that position, clicking the block button on the moved card must block that card's UP, not the previous card's UP. | yes | yes | test/card-button.js expects fid 444 after href change; browser first slot card 222 button uid 222 | — |

Constraint from v1.6.0 rollback (README, commit 2ebbc1e): do not mount the button inside the video-page UP info tree. That inline mount blanked the player. Card buttons are a different container.
