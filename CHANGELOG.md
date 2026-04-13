# Changelog

## [1.25.3](https://github.com/fjpulidop/specrails-hub/compare/v1.25.2...v1.25.3) (2026-04-13)


### Bug Fixes

* pass raw slash commands to Claude CLI instead of pre-resolving ([#177](https://github.com/fjpulidop/specrails-hub/issues/177)) ([3ed5730](https://github.com/fjpulidop/specrails-hub/commit/3ed573090cfe9689a41403c5c24b3e6861a73643))

## [1.25.2](https://github.com/fjpulidop/specrails-hub/compare/v1.25.1...v1.25.2) (2026-04-13)


### Bug Fixes

* add --tools default to all Claude CLI -p spawns ([#175](https://github.com/fjpulidop/specrails-hub/issues/175)) ([5d2e8d3](https://github.com/fjpulidop/specrails-hub/commit/5d2e8d3a2e1055db06e36a27f08825da27ec35f3))

## [1.25.1](https://github.com/fjpulidop/specrails-hub/compare/v1.25.0...v1.25.1) (2026-04-12)


### Bug Fixes

* correct YAML serialization and command dir for full install (SPEA-751) ([#173](https://github.com/fjpulidop/specrails-hub/issues/173)) ([7866ef5](https://github.com/fjpulidop/specrails-hub/commit/7866ef59a696b5d6f233155d5234ce3bc20a95de))

## [1.25.0](https://github.com/fjpulidop/specrails-hub/compare/v1.24.0...v1.25.0) (2026-04-11)


### Features

* add /docs documentation portal ([fcf6842](https://github.com/fjpulidop/specrails-hub/commit/fcf684288b7df7c37cc9aa340d71203bcd2c3e3d))
* add backend test coverage — 103 new tests across 6 files (341 total) ([aac5386](https://github.com/fjpulidop/specrails-hub/commit/aac53866fc65f6be1d75e8f597750f5a9e79905b))
* add component, page, and integration flow tests (223 total) ([9d9dded](https://github.com/fjpulidop/specrails-hub/commit/9d9dded2eb7b24dcf20a8f08a5a85a7f0dbacdea))
* add confirmation dialog and progress state for issue creation ([03302c4](https://github.com/fjpulidop/specrails-hub/commit/03302c4ae98c37594f6e9ce39ff41ca8aabf3d86))
* add Feature Proposal Modal for non-technical users ([d582fff](https://github.com/fjpulidop/specrails-hub/commit/d582fffab6ac8514bac4161069362eaffa85c5a8))
* add frontend test infrastructure and OpenSpec change artifacts ([62090e9](https://github.com/fjpulidop/specrails-hub/commit/62090e90608ea6d58de6fb1c6ed751261b4d0ac2))
* add frontend test infrastructure and OpenSpec change artifacts ([af608eb](https://github.com/fjpulidop/specrails-hub/commit/af608ebccb2a9f54c4d79f7c311f0895cdc1adab))
* add hook unit tests and fix Category A frontend bugs ([b4bf1eb](https://github.com/fjpulidop/specrails-hub/commit/b4bf1ebb7186b1c8906ff3c1c7b132d2c16d4e0f))
* add release pipeline, rename CLI to specrails-hub, enable npm publish ([4f48a9e](https://github.com/fjpulidop/specrails-hub/commit/4f48a9e12a7ec85a577a611e53d02060184e27e7))
* add welcome onboarding wizard with 5-step tour (SPEA-642) ([#137](https://github.com/fjpulidop/specrails-hub/issues/137)) ([701379d](https://github.com/fjpulidop/specrails-hub/commit/701379d982af9c7a38bfce31b700d13d0d021cb1))
* allow hub commands without 'hub' prefix ([1db98ec](https://github.com/fjpulidop/specrails-hub/commit/1db98ece9bd9db0af3a2620bd921db34e9d0a020))
* allow hub commands without 'hub' prefix ([08de911](https://github.com/fjpulidop/specrails-hub/commit/08de911fd9803b51b6773250a685482ff5e3380b))
* **client:** OS notifications — native alerts when jobs complete or fail (SPEA-577) ([#107](https://github.com/fjpulidop/specrails-hub/issues/107)) ([8af472b](https://github.com/fjpulidop/specrails-hub/commit/8af472bd733369d203f0c1c41cba6906c703ed9c))
* **client:** OS notifications for job completion and failure (SPEA-521) ([#92](https://github.com/fjpulidop/specrails-hub/issues/92)) ([343ea54](https://github.com/fjpulidop/specrails-hub/commit/343ea54b0975c3b653ae886cb2cd57fc3a4f86b4))
* **client:** per-project chat improvements — context, suggestions, UX (SPEA-461) ([#82](https://github.com/fjpulidop/specrails-hub/issues/82)) ([8b5b636](https://github.com/fjpulidop/specrails-hub/commit/8b5b6368c255c2256cdf2b5bd0c2a65ff4572bb9))
* **client:** redesign project dashboard with collapsible sections, DnD reordering, and pin (SPEA-608) ([#123](https://github.com/fjpulidop/specrails-hub/issues/123)) ([431f66d](https://github.com/fjpulidop/specrails-hub/commit/431f66d78552d9430f113f1f21349e90418816e6))
* **client:** useTickets hook — WS-driven auto-refresh, toast, and glow (SPEA-669) ([fe19a70](https://github.com/fjpulidop/specrails-hub/commit/fe19a702ddcd277a443ea685c3f1fdf17c26c34e))
* **client:** UX improvements batch — SPEA-489/490/491/492/493 ([#87](https://github.com/fjpulidop/specrails-hub/issues/87)) ([a23fb3c](https://github.com/fjpulidop/specrails-hub/commit/a23fb3c2898863afdb9b02a5920d50276381871c))
* command palette (Cmd+K) — instant navigation and actions (SPEA-575) ([#106](https://github.com/fjpulidop/specrails-hub/issues/106)) ([682260a](https://github.com/fjpulidop/specrails-hub/commit/682260ae697efb239c359deeb741eff092c0ad8f))
* **CommandGrid:** reorganize Home commands into Discovery & Delivery sections ([55f7b54](https://github.com/fjpulidop/specrails-hub/commit/55f7b548f6a50ae71f72467a8600973e6d89feca))
* **CommandGrid:** reorganize Home commands into Discovery & Delivery sections ([76dce1d](https://github.com/fjpulidop/specrails-hub/commit/76dce1dfac6111050413d638db4682cb00e00d06)), closes [#10](https://github.com/fjpulidop/specrails-hub/issues/10)
* cost alerts & budget guardrails (SPEA-574) ([#111](https://github.com/fjpulidop/specrails-hub/issues/111)) ([e69a273](https://github.com/fjpulidop/specrails-hub/commit/e69a2730074833367192bece66f5ae2d56829b47))
* cost alerts and daily budget guardrails (SPEA-518) ([#91](https://github.com/fjpulidop/specrails-hub/issues/91)) ([0b6223f](https://github.com/fjpulidop/specrails-hub/commit/0b6223f13d8f449de2ff0c3ad62126ef63fb99cb))
* data export — CSV/JSON export for jobs, analytics, and hub overview (SPEA-583) ([#112](https://github.com/fjpulidop/specrails-hub/issues/112)) ([ee27f63](https://github.com/fjpulidop/specrails-hub/commit/ee27f63989288eec5041c73609198b37d79137ed))
* detect missing specrails and show install guidance ([1f3c6c6](https://github.com/fjpulidop/specrails-hub/commit/1f3c6c677bfb619786944b3b025e41c3d6e3a603))
* error boundaries, loading skeletons, and global toasts (SPEA-98) ([d3a773e](https://github.com/fjpulidop/specrails-hub/commit/d3a773eb9beb3f687aca27e87da9ff452884e19b))
* Feature Proposal Modal for non-technical users ([3f0fb8c](https://github.com/fjpulidop/specrails-hub/commit/3f0fb8c10a6ebd5d4adaa0506b9a09663c1ef24e))
* global keyboard shortcuts & cheatsheet modal (SPEA-581) ([#108](https://github.com/fjpulidop/specrails-hub/issues/108)) ([aa503c6](https://github.com/fjpulidop/specrails-hub/commit/aa503c695438e122da99095593ef9be7881b3b8f))
* health check, graceful shutdown, RFC-003, hub analytics, setup persistence (SPEA-85/90/91/92) ([dac79fd](https://github.com/fjpulidop/specrails-hub/commit/dac79fdeefd36cf480b3e343ce9b01966c24f1c7))
* **hub:** chat panel context injection — dashboard state in system prompt (SPEA-144) ([#40](https://github.com/fjpulidop/specrails-hub/issues/40)) ([040e91a](https://github.com/fjpulidop/specrails-hub/commit/040e91a812c6939e69f35f11fd3f71a96a717a6d))
* **hub:** cross-project search, recent jobs, Hub Overview page (SPEA-118) ([#35](https://github.com/fjpulidop/specrails-hub/issues/35)) ([c92392f](https://github.com/fjpulidop/specrails-hub/commit/c92392f7714f7c8ffcbe570dcaba3d890accae75))
* **hub:** Feature Funnel, OpenSpec Launcher, Active Changes Tracker, Spec Artifact Browser ([#44](https://github.com/fjpulidop/specrails-hub/issues/44)) ([710e2ba](https://github.com/fjpulidop/specrails-hub/commit/710e2baaf39673a0f4cf20954b47b6b5d7176e07))
* **hub:** job comparison and performance trends view (SPEA-131) ([#39](https://github.com/fjpulidop/specrails-hub/issues/39)) ([016a292](https://github.com/fjpulidop/specrails-hub/commit/016a292e7b207f47c0d22fe4be4bfb7e4fef8616))
* **hub:** project activity timeline and notification center (SPEA-126) ([#37](https://github.com/fjpulidop/specrails-hub/issues/37)) ([9c12919](https://github.com/fjpulidop/specrails-hub/commit/9c1291966d772d98cd0769619d205dd7aef70509))
* implement onboarding wizard with split-view setup ([14b47f7](https://github.com/fjpulidop/specrails-hub/commit/14b47f77b00c42c1d38a5da62393ddf657f59687))
* initial commit — specrails web-manager multi-project hub ([05006b9](https://github.com/fjpulidop/specrails-hub/commit/05006b98a145a17302e810766205b51f66213a74))
* job dependencies and pipeline chains (SPEA-580) ([#114](https://github.com/fjpulidop/specrails-hub/issues/114)) ([db998d4](https://github.com/fjpulidop/specrails-hub/commit/db998d4db3710649c5009ed39a44916159ed2044))
* job failure pattern detection — surface recurring failures on dashboard (SPEA-560) ([#100](https://github.com/fjpulidop/specrails-hub/issues/100)) ([df16669](https://github.com/fjpulidop/specrails-hub/commit/df166695d04dc6a9b91eb359d40ef3ad89a52a17))
* job priority levels — low/normal/high/critical queue ordering (SPEA-585) ([#113](https://github.com/fjpulidop/specrails-hub/issues/113)) ([dbe3e31](https://github.com/fjpulidop/specrails-hub/commit/dbe3e31ad166a6653daa49f11119f15144407102))
* job templates & runbooks — save and reuse command sequences (SPEA-559) ([#101](https://github.com/fjpulidop/specrails-hub/issues/101)) ([5870326](https://github.com/fjpulidop/specrails-hub/commit/5870326e9d722a308c5c0924149904bb09c72c2a))
* make hub mode the default ([7a2a8b9](https://github.com/fjpulidop/specrails-hub/commit/7a2a8b92e9aa0b713573f56ab767ba2f2eb838b0))
* make proposal rows clickable and deletable in Recent Jobs ([c150736](https://github.com/fjpulidop/specrails-hub/commit/c1507362279de1ffe2d6dfb1fb745254ae654ac2))
* outbound webhooks — notify external tools on hub events (SPEA-558) ([#103](https://github.com/fjpulidop/specrails-hub/issues/103)) ([68e1c60](https://github.com/fjpulidop/specrails-hub/commit/68e1c60c69bdf515078d5cbb3b4b480020845041))
* per-project AI provider selection — Claude vs Codex (SPEA-537) ([#98](https://github.com/fjpulidop/specrails-hub/issues/98)) ([b555ca1](https://github.com/fjpulidop/specrails-hub/commit/b555ca1c81e2fe2daa882da930358edf16852bb1))
* period-over-period analytics — week/month comparison with delta indicators (SPEA-578) ([#109](https://github.com/fjpulidop/specrails-hub/issues/109)) ([4f09720](https://github.com/fjpulidop/specrails-hub/commit/4f097208c6dd82b7628ffc9853d20b5a2616706d))
* project health dashboard with traffic light indicators (SPEA-582) ([#110](https://github.com/fjpulidop/specrails-hub/issues/110)) ([0e2f4b3](https://github.com/fjpulidop/specrails-hub/commit/0e2f4b3ccad204cbd7f45fe72e920b06fe8e02ff))
* **queue:** zombie job detection and auto-termination ([#42](https://github.com/fjpulidop/specrails-hub/issues/42)) ([dbde0b4](https://github.com/fjpulidop/specrails-hub/commit/dbde0b4fc337337f0254ca128d848e4a2b56dd4c))
* redesign hub with Arc sidebar, Specs/Rails boards (SPEA-723) ([#165](https://github.com/fjpulidop/specrails-hub/issues/165)) ([ea25a92](https://github.com/fjpulidop/specrails-hub/commit/ea25a92f31c0486236da181f47b772a42893c233))
* redesign proposal modal as conversational chat experience ([33402e8](https://github.com/fjpulidop/specrails-hub/commit/33402e88c7096d6b01612761074536218b1b6a2a))
* remember navigation route per project on tab switch ([b975e25](https://github.com/fjpulidop/specrails-hub/commit/b975e252703448eb330272639b222eeeadf015ce))
* rename specrails-manager to specrails-hub ([d8c40fd](https://github.com/fjpulidop/specrails-hub/commit/d8c40fd1e4a46dc1f2f31bbce3b397cf60f71e9f))
* rename specrails-manager to specrails-hub ([4b7a589](https://github.com/fjpulidop/specrails-hub/commit/4b7a589aa9fc44bcc45f706d23f9cbe533f8d380))
* rename UI labels — Runbooks→Rails, Commands→Spec, and reorder sections (SPEA-614) ([#129](https://github.com/fjpulidop/specrails-hub/issues/129)) ([d116eda](https://github.com/fjpulidop/specrails-hub/commit/d116edadb8ec0211eacfa805a378f2dc2d91c1b7))
* render markdown in log output ([52339dc](https://github.com/fjpulidop/specrails-hub/commit/52339dc25e64859d55dd06a1ab39f90a85a086b9))
* show proposals in Recent Jobs list ([f4da7c7](https://github.com/fjpulidop/specrails-hub/commit/f4da7c7c9206f05eb390937a5f8631758fc2c025))
* SPEA-341, SPEA-451, SPEA-460, SPEA-462 — OpenSpec removal, performance, dashboard metrics, hub overview ([#81](https://github.com/fjpulidop/specrails-hub/issues/81)) ([eee56ea](https://github.com/fjpulidop/specrails-hub/commit/eee56ea8daf67576cdc534a8179bbc33c827516d))
* **tickets:** add ticket CRUD REST API endpoints (SPEA-662) ([#142](https://github.com/fjpulidop/specrails-hub/issues/142)) ([f1ac3e2](https://github.com/fjpulidop/specrails-hub/commit/f1ac3e2e13c2753cd5fc362b1b24403095bdd6da))
* **tickets:** kanban grid view with drag-and-drop (SPEA-665) ([#143](https://github.com/fjpulidop/specrails-hub/issues/143))  ([2baad4f](https://github.com/fjpulidop/specrails-hub/commit/2baad4f0a3057c8191e21a167b98e861b85ea67d))
* tiered install, SetupWizard rewrite + agent selector (SPEA-741, SPEA-745, SPEA-746) ([#170](https://github.com/fjpulidop/specrails-hub/issues/170)) ([ffcddff](https://github.com/fjpulidop/specrails-hub/commit/ffcddfff9e73a3b83c91563056e9e7b5e804572f))
* UX improvements, CLI --version, and installer fix (SPEA-489/490/491/492/493/497/498) ([#89](https://github.com/fjpulidop/specrails-hub/issues/89)) ([45872eb](https://github.com/fjpulidop/specrails-hub/commit/45872ebecbfebc95cfbd11fbc2e4931f9873e859))
* **ux:** empty states, touch accessibility, destructive confirmations (SPEA-109) ([#32](https://github.com/fjpulidop/specrails-hub/issues/32)) ([c5b9ac4](https://github.com/fjpulidop/specrails-hub/commit/c5b9ac4e0fcdd05676e4fe9afe7f04730d1796c1))
* **ux:** unsaved changes guard, tooltips, WS reconnect feedback, pagination (SPEA-110) ([#34](https://github.com/fjpulidop/specrails-hub/issues/34)) ([35afc75](https://github.com/fjpulidop/specrails-hub/commit/35afc75e32287591db394a2dc07e7c2444e7d106))
* WebSocket ticket events + chokidar file watcher (SPEA-663) ([45d3b75](https://github.com/fjpulidop/specrails-hub/commit/45d3b75d90945fddb65ce4903e4e8734bdc50240))
* welcome screen after setup completion with docs link ([671263b](https://github.com/fjpulidop/specrails-hub/commit/671263b1e519d966a7b2aeebb9b1af8d265d3b41))


### Bug Fixes

* add inline fallback prompt when propose-feature command not installed ([605e82e](https://github.com/fjpulidop/specrails-hub/commit/605e82e34fc2b38c17f0109647d45595a6ed9d5a))
* add proposal routes to legacy mode and improve error handling ([593c62c](https://github.com/fjpulidop/specrails-hub/commit/593c62cadb785b1cf885f51cf3ca8b773983dbe6))
* always render setup logs as markdown ([4f236c7](https://github.com/fjpulidop/specrails-hub/commit/4f236c7410c24cd9630d2a851a12bc2247be9e14))
* checkpoint detection matches Claude's actual /setup output ([6618831](https://github.com/fjpulidop/specrails-hub/commit/6618831e0c5c776ec7bb47e88e0c48267aa84d65))
* **ci:** add job-level if condition to exempt Dependabot from DCO check ([#69](https://github.com/fjpulidop/specrails-hub/issues/69)) ([eb22048](https://github.com/fjpulidop/specrails-hub/commit/eb220482b2545f464d1ac7284df2d157d0122070))
* **ci:** add missing permissions to sync-core-contract workflow ([#45](https://github.com/fjpulidop/specrails-hub/issues/45)) ([83c1cb0](https://github.com/fjpulidop/specrails-hub/commit/83c1cb0ed453f0d7dbd1a31d25eda502974cf4a1))
* **ci:** skip bot and merge commits in DCO sign-off check ([#67](https://github.com/fjpulidop/specrails-hub/issues/67)) ([cf65b9a](https://github.com/fjpulidop/specrails-hub/commit/cf65b9a4f706beebd89c5e95107db7c464dccd2e))
* clean server/dist before build to prevent stale test files in package ([f3c5d0f](https://github.com/fjpulidop/specrails-hub/commit/f3c5d0f2d24e0c5bdc882e7b7f6bca2931c26a18))
* **client:** project switch bugs + model selector onChange + test fix (SPEA-547, SPEA-548, SPEA-549) ([#96](https://github.com/fjpulidop/specrails-hub/issues/96)) ([4bcfbf0](https://github.com/fjpulidop/specrails-hub/commit/4bcfbf09c7d18fe253a9bf6ed2e98d1c28b925f0))
* **client:** scroll dialogs, model 4.6, useBlocker crash, toast truncation (SPEA-539) ([#94](https://github.com/fjpulidop/specrails-hub/issues/94)) ([668c5a6](https://github.com/fjpulidop/specrails-hub/commit/668c5a67703e3f83a9c858c1d38c9ae321ffdb24))
* **cli:** use /api/health for hub start detection ([#30](https://github.com/fjpulidop/specrails-hub/issues/30)) ([d36727b](https://github.com/fjpulidop/specrails-hub/commit/d36727be20ccfc268b412e724f8ad64140ccd40a))
* convert settings from route to modal dialog ([2f046e3](https://github.com/fjpulidop/specrails-hub/commit/2f046e3d2e0a65ff737db5678a604679e3fc8e0a))
* downgrade client vitest to ^3.0.0 to resolve esbuild conflict ([b9dac6e](https://github.com/fjpulidop/specrails-hub/commit/b9dac6eb5a2ed0d39754ad5efdde5705ca03fb15))
* eliminate flickering on project tab switch ([11aa421](https://github.com/fjpulidop/specrails-hub/commit/11aa4216afeea786786fdf7fa87ce3a8b931a9bb))
* enable Codex setup chat — generate synthetic sessionId and handle resume (SPEA-616) ([#134](https://github.com/fjpulidop/specrails-hub/issues/134)) ([86e7cce](https://github.com/fjpulidop/specrails-hub/commit/86e7cce8bbe7a9ff49fbd85cf1d7b3bbba2c81c3))
* error when propose-feature command not installed instead of fallback ([f07ce96](https://github.com/fjpulidop/specrails-hub/commit/f07ce969acf823d3d67a2125179ef85c0894492a))
* exclude test files from server build, add server/dist to gitignore ([b36d596](https://github.com/fjpulidop/specrails-hub/commit/b36d5962d6c01ffb232f48e6cec4df0e6c90da0e))
* final_verification checks agents+commands only, ignores manifest ([d72de62](https://github.com/fjpulidop/specrails-hub/commit/d72de6238bd976ef6ac01b90faab73b452f94345))
* final_verification requires actual agents and commands, not just manifest ([4556939](https://github.com/fjpulidop/specrails-hub/commit/4556939f53fd5f5c08917c6fc94cd6cdda87fbb9))
* improve hub startup stability on user laptops ([ad607c8](https://github.com/fjpulidop/specrails-hub/commit/ad607c87d4c30cd5fce3d820bfd268c7fdcd8cd6))
* improve hub startup stability on user laptops ([34f840d](https://github.com/fjpulidop/specrails-hub/commit/34f840d0c6b8d2a0b479f16e90d7cfbaf94c3969))
* isolate job detail, analytics, and conversations per project ([4efdd3e](https://github.com/fjpulidop/specrails-hub/commit/4efdd3e9afef38bb7a2e0d61664d2af10f8f1923))
* isolate jobs and commands per project on tab switch ([5584181](https://github.com/fjpulidop/specrails-hub/commit/55841813b78b3ddd2156d96340871e717f5b4f0e))
* move Feature Discovery section to top of dashboard ([2eafff7](https://github.com/fjpulidop/specrails-hub/commit/2eafff7fc9edd8e9459cb2bc4c91c0790a3ca048))
* pass --yes to npx specrails for non-interactive install ([a1f9860](https://github.com/fjpulidop/specrails-hub/commit/a1f98603002f6aa91abe10aff503d88be58f2ab3))
* pass project cwd to claude spawn in hub mode ([bf3d445](https://github.com/fjpulidop/specrails-hub/commit/bf3d44547d0c63388ce0f4403bf828e712e57bcc))
* preserve setup wizard state when switching project tabs ([4b4ae0f](https://github.com/fjpulidop/specrails-hub/commit/4b4ae0fd3d3ea288c9e04627f9f6fcf6815e947a))
* prevent crash when useHub is called outside HubProvider ([692d3c1](https://github.com/fjpulidop/specrails-hub/commit/692d3c10a76942038a33cb3a4bbf09ed15aed3d5))
* regenerate client lockfile to restore esbuild@0.27.4 for vitest ([2b6ab39](https://github.com/fjpulidop/specrails-hub/commit/2b6ab394642b78190bbeb39785b5acd0238bd35c))
* reliable checkpoint detection via filesystem polling + markdown in setup logs ([a76f26b](https://github.com/fjpulidop/specrails-hub/commit/a76f26b30957dc4206bd54778d3fcf37fbbaab32))
* remove Conversations page, keep chat as project sidebar ([a92a2e4](https://github.com/fjpulidop/specrails-hub/commit/a92a2e493b23b709fdb5c100652dd737cc61f487))
* remove duration display from setup checkpoints and populate raw log ([7c75aad](https://github.com/fjpulidop/specrails-hub/commit/7c75aad539d78dd39afa1458244723512b43d959))
* remove invalid ./ prefix from bin path in package.json ([6e208df](https://github.com/fjpulidop/specrails-hub/commit/6e208df42496b2fd8a32a78fc22cecea51d28148))
* remove orphaned Create Pipeline button (SPEA-633) ([#136](https://github.com/fjpulidop/specrails-hub/issues/136)) ([77449cd](https://github.com/fjpulidop/specrails-hub/commit/77449cd940046ff35a61d131d0fba8ff52162581))
* remove unused ChatHeader import in ConversationsPage ([24ca6ec](https://github.com/fjpulidop/specrails-hub/commit/24ca6ec802ae7859e1b3cebbf43588b7e2688310))
* remove unused formatDuration function ([cb47f4f](https://github.com/fjpulidop/specrails-hub/commit/cb47f4f8b65b08f4451ddd054d3e8c8002679355))
* render setup chat messages as markdown ([1e3e7df](https://github.com/fjpulidop/specrails-hub/commit/1e3e7dff1b14fd2998021160914661496749cd1a))
* reset proposal state when switching projects ([d6cbaee](https://github.com/fjpulidop/specrails-hub/commit/d6cbaeec478c9d7b0498db3e8edec7ac96846cbe))
* resolve 7 critical bugs — title, setup wizard, pipeline consolidation (SPEA-607) ([#122](https://github.com/fjpulidop/specrails-hub/issues/122)) ([8d7442d](https://github.com/fjpulidop/specrails-hub/commit/8d7442d7b1f16f480b6c6b0510da83e5267b7448))
* resolve Codex installation failure (SPEA-615) ([#131](https://github.com/fjpulidop/specrails-hub/issues/131)) ([e64b977](https://github.com/fjpulidop/specrails-hub/commit/e64b977381cc9a7341aa78081b2c3b4e7cb93476))
* resolve server path correctly when installed via npm ([2fe85fc](https://github.com/fjpulidop/specrails-hub/commit/2fe85fc21c0039876d9c3948f6d5709c1fdaa7dc))
* resolve server path correctly when installed via npm ([f0eb8eb](https://github.com/fjpulidop/specrails-hub/commit/f0eb8eb8f449ab4aefa8bb0cfd60ae4f82d892d2))
* restore project settings route and re-fetch on project switch ([7742c12](https://github.com/fjpulidop/specrails-hub/commit/7742c12b7b3bd34c6db17dbcb21ed97b6dbe7f35))
* scope GitHub issue fetching to the correct project repo ([09acfe5](https://github.com/fjpulidop/specrails-hub/commit/09acfe5e08221a09a69839460059009286bb9718))
* scope section pin/order prefs per project (SPEA-653) ([#140](https://github.com/fjpulidop/specrails-hub/issues/140)) ([74115d6](https://github.com/fjpulidop/specrails-hub/commit/74115d6a740d4df10ee9117e9e69831058bfb172))
* setup wizard now handles multi-turn Claude interaction ([9b7bbfa](https://github.com/fjpulidop/specrails-hub/commit/9b7bbfaf1d71c5e4c247f2f43082dc2b49324fd7))
* **setup:** pass --root-dir to npx specrails-core init (SPEA-478) ([8da2f8b](https://github.com/fjpulidop/specrails-hub/commit/8da2f8bce3a682ab4cd68ef40ca3af0ce1035b19))
* show codebase reading progress during proposal exploration ([ff37dde](https://github.com/fjpulidop/specrails-hub/commit/ff37ddebff70f90e3675804fc278401cf10b0961))
* show only progress indicator during issue creation, no streaming text ([f2c3d51](https://github.com/fjpulidop/specrails-hub/commit/f2c3d51b34c076fe4ecea4fd5a581bce467b45d4))
* sync wizard state on tab return during installation ([5265d45](https://github.com/fjpulidop/specrails-hub/commit/5265d452932b02e0bb3aa677e6c88db7fe66de47))
* update npx specrails → npx specrails-core references ([eaf5aa1](https://github.com/fjpulidop/specrails-hub/commit/eaf5aa16413c5b0092ffa25152bbc676098a772f))
* use 'npx specrails init --yes' instead of 'npx specrails --yes' ([974ebae](https://github.com/fjpulidop/specrails-hub/commit/974ebaec58fa6462a2e44234cf7abc51e75bf1e7))
* use cmdk keywords prop to prevent value strings leaking into palette UI (SPEA-652) ([#139](https://github.com/fjpulidop/specrails-hub/issues/139)) ([29078de](https://github.com/fjpulidop/specrails-hub/commit/29078de3f0d054077cd64f238d69706a588b4d27))
* use non-deprecated googleapis/release-please-action@v4 ([beceed7](https://github.com/fjpulidop/specrails-hub/commit/beceed724588ffd80a0f4efe8482426978bd481b))
* use project provider in setup wizard instead of PATH detection (SPEA-611) ([#125](https://github.com/fjpulidop/specrails-hub/issues/125)) ([7965789](https://github.com/fjpulidop/specrails-hub/commit/79657892e235b5f091fe95498410a1ad73067e7b))
* use provider-aware directory paths in setup wizard (SPEA-612) ([#127](https://github.com/fjpulidop/specrails-hub/issues/127)) ([8cc4810](https://github.com/fjpulidop/specrails-hub/commit/8cc4810c3aa2d478d05e6c1861eb9712cc761ac1))
* validate propose-feature command exists before creating proposal ([2a174f4](https://github.com/fjpulidop/specrails-hub/commit/2a174f46a3cbea558bbb6a2042945b30973297f3))
* validate stored section IDs to prevent stale localStorage hiding Rails section (SPEA-617) ([#132](https://github.com/fjpulidop/specrails-hub/issues/132)) ([5f846e1](https://github.com/fjpulidop/specrails-hub/commit/5f846e1aa27139554c89eda02b37d942082c3ab5))

## [1.24.0](https://github.com/fjpulidop/specrails-hub/compare/v1.23.0...v1.24.0) (2026-04-11)


### Features

* tiered install, SetupWizard rewrite + agent selector (SPEA-741, SPEA-745, SPEA-746) ([#170](https://github.com/fjpulidop/specrails-hub/issues/170)) ([ffcddff](https://github.com/fjpulidop/specrails-hub/commit/ffcddfff9e73a3b83c91563056e9e7b5e804572f))

## [1.23.0](https://github.com/fjpulidop/specrails-hub/compare/v1.22.0...v1.23.0) (2026-04-11)


### Features

* redesign hub with Arc sidebar, Specs/Rails boards (SPEA-723) ([#165](https://github.com/fjpulidop/specrails-hub/issues/165)) ([ea25a92](https://github.com/fjpulidop/specrails-hub/commit/ea25a92f31c0486236da181f47b772a42893c233))

## [1.22.0](https://github.com/fjpulidop/specrails-hub/compare/v1.21.0...v1.22.0) (2026-03-23)


### Features

* **client:** useTickets hook — WS-driven auto-refresh, toast, and glow (SPEA-669) ([fe19a70](https://github.com/fjpulidop/specrails-hub/commit/fe19a702ddcd277a443ea685c3f1fdf17c26c34e))
* **tickets:** add ticket CRUD REST API endpoints (SPEA-662) ([#142](https://github.com/fjpulidop/specrails-hub/issues/142)) ([f1ac3e2](https://github.com/fjpulidop/specrails-hub/commit/f1ac3e2e13c2753cd5fc362b1b24403095bdd6da))
* **tickets:** kanban grid view with drag-and-drop (SPEA-665) ([#143](https://github.com/fjpulidop/specrails-hub/issues/143))  ([2baad4f](https://github.com/fjpulidop/specrails-hub/commit/2baad4f0a3057c8191e21a167b98e861b85ea67d))
* WebSocket ticket events + chokidar file watcher (SPEA-663) ([45d3b75](https://github.com/fjpulidop/specrails-hub/commit/45d3b75d90945fddb65ce4903e4e8734bdc50240))


### Bug Fixes

* scope section pin/order prefs per project (SPEA-653) ([#140](https://github.com/fjpulidop/specrails-hub/issues/140)) ([74115d6](https://github.com/fjpulidop/specrails-hub/commit/74115d6a740d4df10ee9117e9e69831058bfb172))
* use cmdk keywords prop to prevent value strings leaking into palette UI (SPEA-652) ([#139](https://github.com/fjpulidop/specrails-hub/issues/139)) ([29078de](https://github.com/fjpulidop/specrails-hub/commit/29078de3f0d054077cd64f238d69706a588b4d27))

## [1.21.0](https://github.com/fjpulidop/specrails-hub/compare/v1.20.2...v1.21.0) (2026-03-23)


### Features

* add welcome onboarding wizard with 5-step tour (SPEA-642) ([#137](https://github.com/fjpulidop/specrails-hub/issues/137)) ([701379d](https://github.com/fjpulidop/specrails-hub/commit/701379d982af9c7a38bfce31b700d13d0d021cb1))


### Bug Fixes

* remove orphaned Create Pipeline button (SPEA-633) ([#136](https://github.com/fjpulidop/specrails-hub/issues/136)) ([77449cd](https://github.com/fjpulidop/specrails-hub/commit/77449cd940046ff35a61d131d0fba8ff52162581))

## [1.20.2](https://github.com/fjpulidop/specrails-hub/compare/v1.20.1...v1.20.2) (2026-03-22)


### Bug Fixes

* enable Codex setup chat — generate synthetic sessionId and handle resume (SPEA-616) ([#134](https://github.com/fjpulidop/specrails-hub/issues/134)) ([86e7cce](https://github.com/fjpulidop/specrails-hub/commit/86e7cce8bbe7a9ff49fbd85cf1d7b3bbba2c81c3))

## [1.20.1](https://github.com/fjpulidop/specrails-hub/compare/v1.20.0...v1.20.1) (2026-03-22)


### Bug Fixes

* validate stored section IDs to prevent stale localStorage hiding Rails section (SPEA-617) ([#132](https://github.com/fjpulidop/specrails-hub/issues/132)) ([5f846e1](https://github.com/fjpulidop/specrails-hub/commit/5f846e1aa27139554c89eda02b37d942082c3ab5))

## [1.20.0](https://github.com/fjpulidop/specrails-hub/compare/v1.19.2...v1.20.0) (2026-03-22)


### Features

* rename UI labels — Runbooks→Rails, Commands→Spec, and reorder sections (SPEA-614) ([#129](https://github.com/fjpulidop/specrails-hub/issues/129)) ([d116eda](https://github.com/fjpulidop/specrails-hub/commit/d116edadb8ec0211eacfa805a378f2dc2d91c1b7))


### Bug Fixes

* resolve Codex installation failure (SPEA-615) ([#131](https://github.com/fjpulidop/specrails-hub/issues/131)) ([e64b977](https://github.com/fjpulidop/specrails-hub/commit/e64b977381cc9a7341aa78081b2c3b4e7cb93476))

## [1.19.2](https://github.com/fjpulidop/specrails-hub/compare/v1.19.1...v1.19.2) (2026-03-22)


### Bug Fixes

* use provider-aware directory paths in setup wizard (SPEA-612) ([#127](https://github.com/fjpulidop/specrails-hub/issues/127)) ([8cc4810](https://github.com/fjpulidop/specrails-hub/commit/8cc4810c3aa2d478d05e6c1861eb9712cc761ac1))

## [1.19.1](https://github.com/fjpulidop/specrails-hub/compare/v1.19.0...v1.19.1) (2026-03-22)


### Bug Fixes

* use project provider in setup wizard instead of PATH detection (SPEA-611) ([#125](https://github.com/fjpulidop/specrails-hub/issues/125)) ([7965789](https://github.com/fjpulidop/specrails-hub/commit/79657892e235b5f091fe95498410a1ad73067e7b))

## [1.19.0](https://github.com/fjpulidop/specrails-hub/compare/v1.18.0...v1.19.0) (2026-03-22)


### Features

* **client:** redesign project dashboard with collapsible sections, DnD reordering, and pin (SPEA-608) ([#123](https://github.com/fjpulidop/specrails-hub/issues/123)) ([431f66d](https://github.com/fjpulidop/specrails-hub/commit/431f66d78552d9430f113f1f21349e90418816e6))


### Bug Fixes

* resolve 7 critical bugs — title, setup wizard, pipeline consolidation (SPEA-607) ([#122](https://github.com/fjpulidop/specrails-hub/issues/122)) ([8d7442d](https://github.com/fjpulidop/specrails-hub/commit/8d7442d7b1f16f480b6c6b0510da83e5267b7448))

## [1.18.0](https://github.com/fjpulidop/specrails-hub/compare/v1.17.0...v1.18.0) (2026-03-22)


### Features

* cost alerts & budget guardrails (SPEA-574) ([#111](https://github.com/fjpulidop/specrails-hub/issues/111)) ([e69a273](https://github.com/fjpulidop/specrails-hub/commit/e69a2730074833367192bece66f5ae2d56829b47))
* data export — CSV/JSON export for jobs, analytics, and hub overview (SPEA-583) ([#112](https://github.com/fjpulidop/specrails-hub/issues/112)) ([ee27f63](https://github.com/fjpulidop/specrails-hub/commit/ee27f63989288eec5041c73609198b37d79137ed))
* global keyboard shortcuts & cheatsheet modal (SPEA-581) ([#108](https://github.com/fjpulidop/specrails-hub/issues/108)) ([aa503c6](https://github.com/fjpulidop/specrails-hub/commit/aa503c695438e122da99095593ef9be7881b3b8f))
* job dependencies and pipeline chains (SPEA-580) ([#114](https://github.com/fjpulidop/specrails-hub/issues/114)) ([db998d4](https://github.com/fjpulidop/specrails-hub/commit/db998d4db3710649c5009ed39a44916159ed2044))
* period-over-period analytics — week/month comparison with delta indicators (SPEA-578) ([#109](https://github.com/fjpulidop/specrails-hub/issues/109)) ([4f09720](https://github.com/fjpulidop/specrails-hub/commit/4f097208c6dd82b7628ffc9853d20b5a2616706d))
* project health dashboard with traffic light indicators (SPEA-582) ([#110](https://github.com/fjpulidop/specrails-hub/issues/110)) ([0e2f4b3](https://github.com/fjpulidop/specrails-hub/commit/0e2f4b3ccad204cbd7f45fe72e920b06fe8e02ff))

## [1.17.0](https://github.com/fjpulidop/specrails-hub/compare/v1.16.0...v1.17.0) (2026-03-22)


### Features

* **client:** OS notifications — native alerts when jobs complete or fail (SPEA-577) ([#107](https://github.com/fjpulidop/specrails-hub/issues/107)) ([8af472b](https://github.com/fjpulidop/specrails-hub/commit/8af472bd733369d203f0c1c41cba6906c703ed9c))
* command palette (Cmd+K) — instant navigation and actions (SPEA-575) ([#106](https://github.com/fjpulidop/specrails-hub/issues/106)) ([682260a](https://github.com/fjpulidop/specrails-hub/commit/682260ae697efb239c359deeb741eff092c0ad8f))
* job priority levels — low/normal/high/critical queue ordering (SPEA-585) ([#113](https://github.com/fjpulidop/specrails-hub/issues/113)) ([dbe3e31](https://github.com/fjpulidop/specrails-hub/commit/dbe3e31ad166a6653daa49f11119f15144407102))

## [1.16.0](https://github.com/fjpulidop/specrails-hub/compare/v1.15.0...v1.16.0) (2026-03-21)


### Features

* job failure pattern detection — surface recurring failures on dashboard (SPEA-560) ([#100](https://github.com/fjpulidop/specrails-hub/issues/100)) ([df16669](https://github.com/fjpulidop/specrails-hub/commit/df166695d04dc6a9b91eb359d40ef3ad89a52a17))
* job templates & runbooks — save and reuse command sequences (SPEA-559) ([#101](https://github.com/fjpulidop/specrails-hub/issues/101)) ([5870326](https://github.com/fjpulidop/specrails-hub/commit/5870326e9d722a308c5c0924149904bb09c72c2a))
* outbound webhooks — notify external tools on hub events (SPEA-558) ([#103](https://github.com/fjpulidop/specrails-hub/issues/103)) ([68e1c60](https://github.com/fjpulidop/specrails-hub/commit/68e1c60c69bdf515078d5cbb3b4b480020845041))

## [1.15.0](https://github.com/fjpulidop/specrails-hub/compare/v1.14.2...v1.15.0) (2026-03-21)


### Features

* per-project AI provider selection — Claude vs Codex (SPEA-537) ([#98](https://github.com/fjpulidop/specrails-hub/issues/98)) ([b555ca1](https://github.com/fjpulidop/specrails-hub/commit/b555ca1c81e2fe2daa882da930358edf16852bb1))

## [1.14.2](https://github.com/fjpulidop/specrails-hub/compare/v1.14.1...v1.14.2) (2026-03-21)


### Bug Fixes

* **client:** project switch bugs + model selector onChange + test fix (SPEA-547, SPEA-548, SPEA-549) ([#96](https://github.com/fjpulidop/specrails-hub/issues/96)) ([4bcfbf0](https://github.com/fjpulidop/specrails-hub/commit/4bcfbf09c7d18fe253a9bf6ed2e98d1c28b925f0))

## [1.14.1](https://github.com/fjpulidop/specrails-hub/compare/v1.14.0...v1.14.1) (2026-03-21)


### Bug Fixes

* **client:** scroll dialogs, model 4.6, useBlocker crash, toast truncation (SPEA-539) ([#94](https://github.com/fjpulidop/specrails-hub/issues/94)) ([668c5a6](https://github.com/fjpulidop/specrails-hub/commit/668c5a67703e3f83a9c858c1d38c9ae321ffdb24))

## [1.14.0](https://github.com/fjpulidop/specrails-hub/compare/v1.13.0...v1.14.0) (2026-03-21)


### Features

* **client:** OS notifications for job completion and failure (SPEA-521) ([#92](https://github.com/fjpulidop/specrails-hub/issues/92)) ([343ea54](https://github.com/fjpulidop/specrails-hub/commit/343ea54b0975c3b653ae886cb2cd57fc3a4f86b4))
* cost alerts and daily budget guardrails (SPEA-518) ([#91](https://github.com/fjpulidop/specrails-hub/issues/91)) ([0b6223f](https://github.com/fjpulidop/specrails-hub/commit/0b6223f13d8f449de2ff0c3ad62126ef63fb99cb))

## [1.13.0](https://github.com/fjpulidop/specrails-hub/compare/v1.12.0...v1.13.0) (2026-03-21)


### Features

* UX improvements, CLI --version, and installer fix (SPEA-489/490/491/492/493/497/498) ([#89](https://github.com/fjpulidop/specrails-hub/issues/89)) ([45872eb](https://github.com/fjpulidop/specrails-hub/commit/45872ebecbfebc95cfbd11fbc2e4931f9873e859))

## [1.12.0](https://github.com/fjpulidop/specrails-hub/compare/v1.11.1...v1.12.0) (2026-03-21)


### Features

* **client:** UX improvements batch — SPEA-489/490/491/492/493 ([#87](https://github.com/fjpulidop/specrails-hub/issues/87)) ([a23fb3c](https://github.com/fjpulidop/specrails-hub/commit/a23fb3c2898863afdb9b02a5920d50276381871c))

## [1.11.1](https://github.com/fjpulidop/specrails-hub/compare/v1.11.0...v1.11.1) (2026-03-21)


### Bug Fixes

* **setup:** pass --root-dir to npx specrails-core init (SPEA-478) ([8da2f8b](https://github.com/fjpulidop/specrails-hub/commit/8da2f8bce3a682ab4cd68ef40ca3af0ce1035b19))

## [1.11.0](https://github.com/fjpulidop/specrails-hub/compare/v1.10.1...v1.11.0) (2026-03-21)


### Features

* **client:** per-project chat improvements — context, suggestions, UX (SPEA-461) ([#82](https://github.com/fjpulidop/specrails-hub/issues/82)) ([8b5b636](https://github.com/fjpulidop/specrails-hub/commit/8b5b6368c255c2256cdf2b5bd0c2a65ff4572bb9))
* SPEA-341, SPEA-451, SPEA-460, SPEA-462 — OpenSpec removal, performance, dashboard metrics, hub overview ([#81](https://github.com/fjpulidop/specrails-hub/issues/81)) ([eee56ea](https://github.com/fjpulidop/specrails-hub/commit/eee56ea8daf67576cdc534a8179bbc33c827516d))

## [1.10.1](https://github.com/fjpulidop/specrails-hub/compare/v1.10.0...v1.10.1) (2026-03-20)


### Bug Fixes

* **ci:** add job-level if condition to exempt Dependabot from DCO check ([#69](https://github.com/fjpulidop/specrails-hub/issues/69)) ([eb22048](https://github.com/fjpulidop/specrails-hub/commit/eb220482b2545f464d1ac7284df2d157d0122070))

## [1.10.0](https://github.com/fjpulidop/specrails-hub/compare/v1.9.0...v1.10.0) (2026-03-20)


### Features

* **hub:** Feature Funnel, OpenSpec Launcher, Active Changes Tracker, Spec Artifact Browser ([#44](https://github.com/fjpulidop/specrails-hub/issues/44)) ([710e2ba](https://github.com/fjpulidop/specrails-hub/commit/710e2baaf39673a0f4cf20954b47b6b5d7176e07))


### Bug Fixes

* **ci:** add missing permissions to sync-core-contract workflow ([#45](https://github.com/fjpulidop/specrails-hub/issues/45)) ([83c1cb0](https://github.com/fjpulidop/specrails-hub/commit/83c1cb0ed453f0d7dbd1a31d25eda502974cf4a1))
* **ci:** skip bot and merge commits in DCO sign-off check ([#67](https://github.com/fjpulidop/specrails-hub/issues/67)) ([cf65b9a](https://github.com/fjpulidop/specrails-hub/commit/cf65b9a4f706beebd89c5e95107db7c464dccd2e))

## [1.9.0](https://github.com/fjpulidop/specrails-hub/compare/v1.8.0...v1.9.0) (2026-03-20)


### Features

* **queue:** zombie job detection and auto-termination ([#42](https://github.com/fjpulidop/specrails-hub/issues/42)) ([dbde0b4](https://github.com/fjpulidop/specrails-hub/commit/dbde0b4fc337337f0254ca128d848e4a2b56dd4c))

## [1.8.0](https://github.com/fjpulidop/specrails-hub/compare/v1.7.0...v1.8.0) (2026-03-20)


### Features

* **hub:** chat panel context injection — dashboard state in system prompt (SPEA-144) ([#40](https://github.com/fjpulidop/specrails-hub/issues/40)) ([040e91a](https://github.com/fjpulidop/specrails-hub/commit/040e91a812c6939e69f35f11fd3f71a96a717a6d))

## [1.7.0](https://github.com/fjpulidop/specrails-hub/compare/v1.6.0...v1.7.0) (2026-03-20)


### Features

* **hub:** job comparison and performance trends view (SPEA-131) ([#39](https://github.com/fjpulidop/specrails-hub/issues/39)) ([016a292](https://github.com/fjpulidop/specrails-hub/commit/016a292e7b207f47c0d22fe4be4bfb7e4fef8616))
* **hub:** project activity timeline and notification center (SPEA-126) ([#37](https://github.com/fjpulidop/specrails-hub/issues/37)) ([9c12919](https://github.com/fjpulidop/specrails-hub/commit/9c1291966d772d98cd0769619d205dd7aef70509))

## [1.6.0](https://github.com/fjpulidop/specrails-hub/compare/v1.5.0...v1.6.0) (2026-03-20)


### Features

* **hub:** cross-project search, recent jobs, Hub Overview page (SPEA-118) ([#35](https://github.com/fjpulidop/specrails-hub/issues/35)) ([c92392f](https://github.com/fjpulidop/specrails-hub/commit/c92392f7714f7c8ffcbe570dcaba3d890accae75))

## [1.5.0](https://github.com/fjpulidop/specrails-hub/compare/v1.4.1...v1.5.0) (2026-03-20)


### Features

* **ux:** unsaved changes guard, tooltips, WS reconnect feedback, pagination (SPEA-110) ([#34](https://github.com/fjpulidop/specrails-hub/issues/34)) ([35afc75](https://github.com/fjpulidop/specrails-hub/commit/35afc75e32287591db394a2dc07e7c2444e7d106))

## [1.4.1](https://github.com/fjpulidop/specrails-hub/compare/v1.4.0...v1.4.1) (2026-03-20)


### Bug Fixes

* **cli:** use /api/health for hub start detection ([#30](https://github.com/fjpulidop/specrails-hub/issues/30)) ([d36727b](https://github.com/fjpulidop/specrails-hub/commit/d36727be20ccfc268b412e724f8ad64140ccd40a))

## [1.4.0](https://github.com/fjpulidop/specrails-hub/compare/v1.3.1...v1.4.0) (2026-03-20)


### Features

* error boundaries, loading skeletons, and global toasts (SPEA-98) ([d3a773e](https://github.com/fjpulidop/specrails-hub/commit/d3a773eb9beb3f687aca27e87da9ff452884e19b))
* health check, graceful shutdown, RFC-003, hub analytics, setup persistence (SPEA-85/90/91/92) ([dac79fd](https://github.com/fjpulidop/specrails-hub/commit/dac79fdeefd36cf480b3e343ce9b01966c24f1c7))

## [1.3.1](https://github.com/fjpulidop/specrails-hub/compare/v1.3.0...v1.3.1) (2026-03-19)


### Bug Fixes

* downgrade client vitest to ^3.0.0 to resolve esbuild conflict ([b9dac6e](https://github.com/fjpulidop/specrails-hub/commit/b9dac6eb5a2ed0d39754ad5efdde5705ca03fb15))
* regenerate client lockfile to restore esbuild@0.27.4 for vitest ([2b6ab39](https://github.com/fjpulidop/specrails-hub/commit/2b6ab394642b78190bbeb39785b5acd0238bd35c))

## [1.3.0](https://github.com/fjpulidop/specrails-hub/compare/v1.2.1...v1.3.0) (2026-03-19)


### Features

* add /docs documentation portal ([fcf6842](https://github.com/fjpulidop/specrails-hub/commit/fcf684288b7df7c37cc9aa340d71203bcd2c3e3d))


### Bug Fixes

* improve hub startup stability on user laptops ([ad607c8](https://github.com/fjpulidop/specrails-hub/commit/ad607c87d4c30cd5fce3d820bfd268c7fdcd8cd6))
* improve hub startup stability on user laptops ([34f840d](https://github.com/fjpulidop/specrails-hub/commit/34f840d0c6b8d2a0b479f16e90d7cfbaf94c3969))

## [1.2.1](https://github.com/fjpulidop/specrails-hub/compare/v1.2.0...v1.2.1) (2026-03-19)


### Bug Fixes

* resolve server path correctly when installed via npm ([2fe85fc](https://github.com/fjpulidop/specrails-hub/commit/2fe85fc21c0039876d9c3948f6d5709c1fdaa7dc))
* resolve server path correctly when installed via npm ([f0eb8eb](https://github.com/fjpulidop/specrails-hub/commit/f0eb8eb8f449ab4aefa8bb0cfd60ae4f82d892d2))

## [1.2.0](https://github.com/fjpulidop/specrails-hub/compare/v1.1.1...v1.2.0) (2026-03-19)


### Features

* allow hub commands without 'hub' prefix ([1db98ec](https://github.com/fjpulidop/specrails-hub/commit/1db98ece9bd9db0af3a2620bd921db34e9d0a020))
* allow hub commands without 'hub' prefix ([08de911](https://github.com/fjpulidop/specrails-hub/commit/08de911fd9803b51b6773250a685482ff5e3380b))

## [1.1.1](https://github.com/fjpulidop/specrails-hub/compare/v1.1.0...v1.1.1) (2026-03-19)


### Bug Fixes

* remove invalid ./ prefix from bin path in package.json ([6e208df](https://github.com/fjpulidop/specrails-hub/commit/6e208df42496b2fd8a32a78fc22cecea51d28148))

## [1.1.0](https://github.com/fjpulidop/specrails-hub/compare/v1.0.0...v1.1.0) (2026-03-19)


### Features

* add backend test coverage — 103 new tests across 6 files (341 total) ([aac5386](https://github.com/fjpulidop/specrails-hub/commit/aac53866fc65f6be1d75e8f597750f5a9e79905b))
* add component, page, and integration flow tests (223 total) ([9d9dded](https://github.com/fjpulidop/specrails-hub/commit/9d9dded2eb7b24dcf20a8f08a5a85a7f0dbacdea))
* add confirmation dialog and progress state for issue creation ([03302c4](https://github.com/fjpulidop/specrails-hub/commit/03302c4ae98c37594f6e9ce39ff41ca8aabf3d86))
* add Feature Proposal Modal for non-technical users ([d582fff](https://github.com/fjpulidop/specrails-hub/commit/d582fffab6ac8514bac4161069362eaffa85c5a8))
* add frontend test infrastructure and OpenSpec change artifacts ([62090e9](https://github.com/fjpulidop/specrails-hub/commit/62090e90608ea6d58de6fb1c6ed751261b4d0ac2))
* add frontend test infrastructure and OpenSpec change artifacts ([af608eb](https://github.com/fjpulidop/specrails-hub/commit/af608ebccb2a9f54c4d79f7c311f0895cdc1adab))
* add hook unit tests and fix Category A frontend bugs ([b4bf1eb](https://github.com/fjpulidop/specrails-hub/commit/b4bf1ebb7186b1c8906ff3c1c7b132d2c16d4e0f))
* add release pipeline, rename CLI to specrails-hub, enable npm publish ([4f48a9e](https://github.com/fjpulidop/specrails-hub/commit/4f48a9e12a7ec85a577a611e53d02060184e27e7))
* **CommandGrid:** reorganize Home commands into Discovery & Delivery sections ([55f7b54](https://github.com/fjpulidop/specrails-hub/commit/55f7b548f6a50ae71f72467a8600973e6d89feca))
* **CommandGrid:** reorganize Home commands into Discovery & Delivery sections ([76dce1d](https://github.com/fjpulidop/specrails-hub/commit/76dce1dfac6111050413d638db4682cb00e00d06)), closes [#10](https://github.com/fjpulidop/specrails-hub/issues/10)
* detect missing specrails and show install guidance ([1f3c6c6](https://github.com/fjpulidop/specrails-hub/commit/1f3c6c677bfb619786944b3b025e41c3d6e3a603))
* Feature Proposal Modal for non-technical users ([3f0fb8c](https://github.com/fjpulidop/specrails-hub/commit/3f0fb8c10a6ebd5d4adaa0506b9a09663c1ef24e))
* implement onboarding wizard with split-view setup ([14b47f7](https://github.com/fjpulidop/specrails-hub/commit/14b47f77b00c42c1d38a5da62393ddf657f59687))
* initial commit — specrails web-manager multi-project hub ([05006b9](https://github.com/fjpulidop/specrails-hub/commit/05006b98a145a17302e810766205b51f66213a74))
* make hub mode the default ([7a2a8b9](https://github.com/fjpulidop/specrails-hub/commit/7a2a8b92e9aa0b713573f56ab767ba2f2eb838b0))
* make proposal rows clickable and deletable in Recent Jobs ([c150736](https://github.com/fjpulidop/specrails-hub/commit/c1507362279de1ffe2d6dfb1fb745254ae654ac2))
* redesign proposal modal as conversational chat experience ([33402e8](https://github.com/fjpulidop/specrails-hub/commit/33402e88c7096d6b01612761074536218b1b6a2a))
* remember navigation route per project on tab switch ([b975e25](https://github.com/fjpulidop/specrails-hub/commit/b975e252703448eb330272639b222eeeadf015ce))
* rename specrails-manager to specrails-hub ([d8c40fd](https://github.com/fjpulidop/specrails-hub/commit/d8c40fd1e4a46dc1f2f31bbce3b397cf60f71e9f))
* rename specrails-manager to specrails-hub ([4b7a589](https://github.com/fjpulidop/specrails-hub/commit/4b7a589aa9fc44bcc45f706d23f9cbe533f8d380))
* render markdown in log output ([52339dc](https://github.com/fjpulidop/specrails-hub/commit/52339dc25e64859d55dd06a1ab39f90a85a086b9))
* show proposals in Recent Jobs list ([f4da7c7](https://github.com/fjpulidop/specrails-hub/commit/f4da7c7c9206f05eb390937a5f8631758fc2c025))
* welcome screen after setup completion with docs link ([671263b](https://github.com/fjpulidop/specrails-hub/commit/671263b1e519d966a7b2aeebb9b1af8d265d3b41))


### Bug Fixes

* add inline fallback prompt when propose-feature command not installed ([605e82e](https://github.com/fjpulidop/specrails-hub/commit/605e82e34fc2b38c17f0109647d45595a6ed9d5a))
* add proposal routes to legacy mode and improve error handling ([593c62c](https://github.com/fjpulidop/specrails-hub/commit/593c62cadb785b1cf885f51cf3ca8b773983dbe6))
* always render setup logs as markdown ([4f236c7](https://github.com/fjpulidop/specrails-hub/commit/4f236c7410c24cd9630d2a851a12bc2247be9e14))
* checkpoint detection matches Claude's actual /setup output ([6618831](https://github.com/fjpulidop/specrails-hub/commit/6618831e0c5c776ec7bb47e88e0c48267aa84d65))
* clean server/dist before build to prevent stale test files in package ([f3c5d0f](https://github.com/fjpulidop/specrails-hub/commit/f3c5d0f2d24e0c5bdc882e7b7f6bca2931c26a18))
* convert settings from route to modal dialog ([2f046e3](https://github.com/fjpulidop/specrails-hub/commit/2f046e3d2e0a65ff737db5678a604679e3fc8e0a))
* eliminate flickering on project tab switch ([11aa421](https://github.com/fjpulidop/specrails-hub/commit/11aa4216afeea786786fdf7fa87ce3a8b931a9bb))
* error when propose-feature command not installed instead of fallback ([f07ce96](https://github.com/fjpulidop/specrails-hub/commit/f07ce969acf823d3d67a2125179ef85c0894492a))
* exclude test files from server build, add server/dist to gitignore ([b36d596](https://github.com/fjpulidop/specrails-hub/commit/b36d5962d6c01ffb232f48e6cec4df0e6c90da0e))
* final_verification checks agents+commands only, ignores manifest ([d72de62](https://github.com/fjpulidop/specrails-hub/commit/d72de6238bd976ef6ac01b90faab73b452f94345))
* final_verification requires actual agents and commands, not just manifest ([4556939](https://github.com/fjpulidop/specrails-hub/commit/4556939f53fd5f5c08917c6fc94cd6cdda87fbb9))
* isolate job detail, analytics, and conversations per project ([4efdd3e](https://github.com/fjpulidop/specrails-hub/commit/4efdd3e9afef38bb7a2e0d61664d2af10f8f1923))
* isolate jobs and commands per project on tab switch ([5584181](https://github.com/fjpulidop/specrails-hub/commit/55841813b78b3ddd2156d96340871e717f5b4f0e))
* move Feature Discovery section to top of dashboard ([2eafff7](https://github.com/fjpulidop/specrails-hub/commit/2eafff7fc9edd8e9459cb2bc4c91c0790a3ca048))
* pass --yes to npx specrails for non-interactive install ([a1f9860](https://github.com/fjpulidop/specrails-hub/commit/a1f98603002f6aa91abe10aff503d88be58f2ab3))
* pass project cwd to claude spawn in hub mode ([bf3d445](https://github.com/fjpulidop/specrails-hub/commit/bf3d44547d0c63388ce0f4403bf828e712e57bcc))
* preserve setup wizard state when switching project tabs ([4b4ae0f](https://github.com/fjpulidop/specrails-hub/commit/4b4ae0fd3d3ea288c9e04627f9f6fcf6815e947a))
* prevent crash when useHub is called outside HubProvider ([692d3c1](https://github.com/fjpulidop/specrails-hub/commit/692d3c10a76942038a33cb3a4bbf09ed15aed3d5))
* reliable checkpoint detection via filesystem polling + markdown in setup logs ([a76f26b](https://github.com/fjpulidop/specrails-hub/commit/a76f26b30957dc4206bd54778d3fcf37fbbaab32))
* remove Conversations page, keep chat as project sidebar ([a92a2e4](https://github.com/fjpulidop/specrails-hub/commit/a92a2e493b23b709fdb5c100652dd737cc61f487))
* remove duration display from setup checkpoints and populate raw log ([7c75aad](https://github.com/fjpulidop/specrails-hub/commit/7c75aad539d78dd39afa1458244723512b43d959))
* remove unused ChatHeader import in ConversationsPage ([24ca6ec](https://github.com/fjpulidop/specrails-hub/commit/24ca6ec802ae7859e1b3cebbf43588b7e2688310))
* remove unused formatDuration function ([cb47f4f](https://github.com/fjpulidop/specrails-hub/commit/cb47f4f8b65b08f4451ddd054d3e8c8002679355))
* render setup chat messages as markdown ([1e3e7df](https://github.com/fjpulidop/specrails-hub/commit/1e3e7dff1b14fd2998021160914661496749cd1a))
* reset proposal state when switching projects ([d6cbaee](https://github.com/fjpulidop/specrails-hub/commit/d6cbaeec478c9d7b0498db3e8edec7ac96846cbe))
* restore project settings route and re-fetch on project switch ([7742c12](https://github.com/fjpulidop/specrails-hub/commit/7742c12b7b3bd34c6db17dbcb21ed97b6dbe7f35))
* scope GitHub issue fetching to the correct project repo ([09acfe5](https://github.com/fjpulidop/specrails-hub/commit/09acfe5e08221a09a69839460059009286bb9718))
* setup wizard now handles multi-turn Claude interaction ([9b7bbfa](https://github.com/fjpulidop/specrails-hub/commit/9b7bbfaf1d71c5e4c247f2f43082dc2b49324fd7))
* show codebase reading progress during proposal exploration ([ff37dde](https://github.com/fjpulidop/specrails-hub/commit/ff37ddebff70f90e3675804fc278401cf10b0961))
* show only progress indicator during issue creation, no streaming text ([f2c3d51](https://github.com/fjpulidop/specrails-hub/commit/f2c3d51b34c076fe4ecea4fd5a581bce467b45d4))
* sync wizard state on tab return during installation ([5265d45](https://github.com/fjpulidop/specrails-hub/commit/5265d452932b02e0bb3aa677e6c88db7fe66de47))
* update npx specrails → npx specrails-core references ([eaf5aa1](https://github.com/fjpulidop/specrails-hub/commit/eaf5aa16413c5b0092ffa25152bbc676098a772f))
* use 'npx specrails init --yes' instead of 'npx specrails --yes' ([974ebae](https://github.com/fjpulidop/specrails-hub/commit/974ebaec58fa6462a2e44234cf7abc51e75bf1e7))
* use non-deprecated googleapis/release-please-action@v4 ([beceed7](https://github.com/fjpulidop/specrails-hub/commit/beceed724588ffd80a0f4efe8482426978bd481b))
* validate propose-feature command exists before creating proposal ([2a174f4](https://github.com/fjpulidop/specrails-hub/commit/2a174f46a3cbea558bbb6a2042945b30973297f3))

## 1.0.0 (2026-03-19)


### Features

* add backend test coverage — 103 new tests across 6 files (341 total) ([aac5386](https://github.com/fjpulidop/specrails-hub/commit/aac53866fc65f6be1d75e8f597750f5a9e79905b))
* add component, page, and integration flow tests (223 total) ([9d9dded](https://github.com/fjpulidop/specrails-hub/commit/9d9dded2eb7b24dcf20a8f08a5a85a7f0dbacdea))
* add confirmation dialog and progress state for issue creation ([03302c4](https://github.com/fjpulidop/specrails-hub/commit/03302c4ae98c37594f6e9ce39ff41ca8aabf3d86))
* add Feature Proposal Modal for non-technical users ([d582fff](https://github.com/fjpulidop/specrails-hub/commit/d582fffab6ac8514bac4161069362eaffa85c5a8))
* add frontend test infrastructure and OpenSpec change artifacts ([62090e9](https://github.com/fjpulidop/specrails-hub/commit/62090e90608ea6d58de6fb1c6ed751261b4d0ac2))
* add frontend test infrastructure and OpenSpec change artifacts ([af608eb](https://github.com/fjpulidop/specrails-hub/commit/af608ebccb2a9f54c4d79f7c311f0895cdc1adab))
* add hook unit tests and fix Category A frontend bugs ([b4bf1eb](https://github.com/fjpulidop/specrails-hub/commit/b4bf1ebb7186b1c8906ff3c1c7b132d2c16d4e0f))
* add release pipeline, rename CLI to specrails-hub, enable npm publish ([4f48a9e](https://github.com/fjpulidop/specrails-hub/commit/4f48a9e12a7ec85a577a611e53d02060184e27e7))
* **CommandGrid:** reorganize Home commands into Discovery & Delivery sections ([55f7b54](https://github.com/fjpulidop/specrails-hub/commit/55f7b548f6a50ae71f72467a8600973e6d89feca))
* **CommandGrid:** reorganize Home commands into Discovery & Delivery sections ([76dce1d](https://github.com/fjpulidop/specrails-hub/commit/76dce1dfac6111050413d638db4682cb00e00d06)), closes [#10](https://github.com/fjpulidop/specrails-hub/issues/10)
* detect missing specrails and show install guidance ([1f3c6c6](https://github.com/fjpulidop/specrails-hub/commit/1f3c6c677bfb619786944b3b025e41c3d6e3a603))
* Feature Proposal Modal for non-technical users ([3f0fb8c](https://github.com/fjpulidop/specrails-hub/commit/3f0fb8c10a6ebd5d4adaa0506b9a09663c1ef24e))
* implement onboarding wizard with split-view setup ([14b47f7](https://github.com/fjpulidop/specrails-hub/commit/14b47f77b00c42c1d38a5da62393ddf657f59687))
* initial commit — specrails web-manager multi-project hub ([05006b9](https://github.com/fjpulidop/specrails-hub/commit/05006b98a145a17302e810766205b51f66213a74))
* make hub mode the default ([7a2a8b9](https://github.com/fjpulidop/specrails-hub/commit/7a2a8b92e9aa0b713573f56ab767ba2f2eb838b0))
* make proposal rows clickable and deletable in Recent Jobs ([c150736](https://github.com/fjpulidop/specrails-hub/commit/c1507362279de1ffe2d6dfb1fb745254ae654ac2))
* redesign proposal modal as conversational chat experience ([33402e8](https://github.com/fjpulidop/specrails-hub/commit/33402e88c7096d6b01612761074536218b1b6a2a))
* remember navigation route per project on tab switch ([b975e25](https://github.com/fjpulidop/specrails-hub/commit/b975e252703448eb330272639b222eeeadf015ce))
* rename specrails-manager to specrails-hub ([d8c40fd](https://github.com/fjpulidop/specrails-hub/commit/d8c40fd1e4a46dc1f2f31bbce3b397cf60f71e9f))
* rename specrails-manager to specrails-hub ([4b7a589](https://github.com/fjpulidop/specrails-hub/commit/4b7a589aa9fc44bcc45f706d23f9cbe533f8d380))
* render markdown in log output ([52339dc](https://github.com/fjpulidop/specrails-hub/commit/52339dc25e64859d55dd06a1ab39f90a85a086b9))
* show proposals in Recent Jobs list ([f4da7c7](https://github.com/fjpulidop/specrails-hub/commit/f4da7c7c9206f05eb390937a5f8631758fc2c025))
* welcome screen after setup completion with docs link ([671263b](https://github.com/fjpulidop/specrails-hub/commit/671263b1e519d966a7b2aeebb9b1af8d265d3b41))


### Bug Fixes

* add inline fallback prompt when propose-feature command not installed ([605e82e](https://github.com/fjpulidop/specrails-hub/commit/605e82e34fc2b38c17f0109647d45595a6ed9d5a))
* add proposal routes to legacy mode and improve error handling ([593c62c](https://github.com/fjpulidop/specrails-hub/commit/593c62cadb785b1cf885f51cf3ca8b773983dbe6))
* always render setup logs as markdown ([4f236c7](https://github.com/fjpulidop/specrails-hub/commit/4f236c7410c24cd9630d2a851a12bc2247be9e14))
* checkpoint detection matches Claude's actual /setup output ([6618831](https://github.com/fjpulidop/specrails-hub/commit/6618831e0c5c776ec7bb47e88e0c48267aa84d65))
* clean server/dist before build to prevent stale test files in package ([f3c5d0f](https://github.com/fjpulidop/specrails-hub/commit/f3c5d0f2d24e0c5bdc882e7b7f6bca2931c26a18))
* convert settings from route to modal dialog ([2f046e3](https://github.com/fjpulidop/specrails-hub/commit/2f046e3d2e0a65ff737db5678a604679e3fc8e0a))
* eliminate flickering on project tab switch ([11aa421](https://github.com/fjpulidop/specrails-hub/commit/11aa4216afeea786786fdf7fa87ce3a8b931a9bb))
* error when propose-feature command not installed instead of fallback ([f07ce96](https://github.com/fjpulidop/specrails-hub/commit/f07ce969acf823d3d67a2125179ef85c0894492a))
* exclude test files from server build, add server/dist to gitignore ([b36d596](https://github.com/fjpulidop/specrails-hub/commit/b36d5962d6c01ffb232f48e6cec4df0e6c90da0e))
* final_verification checks agents+commands only, ignores manifest ([d72de62](https://github.com/fjpulidop/specrails-hub/commit/d72de6238bd976ef6ac01b90faab73b452f94345))
* final_verification requires actual agents and commands, not just manifest ([4556939](https://github.com/fjpulidop/specrails-hub/commit/4556939f53fd5f5c08917c6fc94cd6cdda87fbb9))
* isolate job detail, analytics, and conversations per project ([4efdd3e](https://github.com/fjpulidop/specrails-hub/commit/4efdd3e9afef38bb7a2e0d61664d2af10f8f1923))
* isolate jobs and commands per project on tab switch ([5584181](https://github.com/fjpulidop/specrails-hub/commit/55841813b78b3ddd2156d96340871e717f5b4f0e))
* move Feature Discovery section to top of dashboard ([2eafff7](https://github.com/fjpulidop/specrails-hub/commit/2eafff7fc9edd8e9459cb2bc4c91c0790a3ca048))
* pass --yes to npx specrails for non-interactive install ([a1f9860](https://github.com/fjpulidop/specrails-hub/commit/a1f98603002f6aa91abe10aff503d88be58f2ab3))
* pass project cwd to claude spawn in hub mode ([bf3d445](https://github.com/fjpulidop/specrails-hub/commit/bf3d44547d0c63388ce0f4403bf828e712e57bcc))
* preserve setup wizard state when switching project tabs ([4b4ae0f](https://github.com/fjpulidop/specrails-hub/commit/4b4ae0fd3d3ea288c9e04627f9f6fcf6815e947a))
* prevent crash when useHub is called outside HubProvider ([692d3c1](https://github.com/fjpulidop/specrails-hub/commit/692d3c10a76942038a33cb3a4bbf09ed15aed3d5))
* reliable checkpoint detection via filesystem polling + markdown in setup logs ([a76f26b](https://github.com/fjpulidop/specrails-hub/commit/a76f26b30957dc4206bd54778d3fcf37fbbaab32))
* remove Conversations page, keep chat as project sidebar ([a92a2e4](https://github.com/fjpulidop/specrails-hub/commit/a92a2e493b23b709fdb5c100652dd737cc61f487))
* remove duration display from setup checkpoints and populate raw log ([7c75aad](https://github.com/fjpulidop/specrails-hub/commit/7c75aad539d78dd39afa1458244723512b43d959))
* remove unused ChatHeader import in ConversationsPage ([24ca6ec](https://github.com/fjpulidop/specrails-hub/commit/24ca6ec802ae7859e1b3cebbf43588b7e2688310))
* remove unused formatDuration function ([cb47f4f](https://github.com/fjpulidop/specrails-hub/commit/cb47f4f8b65b08f4451ddd054d3e8c8002679355))
* render setup chat messages as markdown ([1e3e7df](https://github.com/fjpulidop/specrails-hub/commit/1e3e7dff1b14fd2998021160914661496749cd1a))
* reset proposal state when switching projects ([d6cbaee](https://github.com/fjpulidop/specrails-hub/commit/d6cbaeec478c9d7b0498db3e8edec7ac96846cbe))
* restore project settings route and re-fetch on project switch ([7742c12](https://github.com/fjpulidop/specrails-hub/commit/7742c12b7b3bd34c6db17dbcb21ed97b6dbe7f35))
* scope GitHub issue fetching to the correct project repo ([09acfe5](https://github.com/fjpulidop/specrails-hub/commit/09acfe5e08221a09a69839460059009286bb9718))
* setup wizard now handles multi-turn Claude interaction ([9b7bbfa](https://github.com/fjpulidop/specrails-hub/commit/9b7bbfaf1d71c5e4c247f2f43082dc2b49324fd7))
* show codebase reading progress during proposal exploration ([ff37dde](https://github.com/fjpulidop/specrails-hub/commit/ff37ddebff70f90e3675804fc278401cf10b0961))
* show only progress indicator during issue creation, no streaming text ([f2c3d51](https://github.com/fjpulidop/specrails-hub/commit/f2c3d51b34c076fe4ecea4fd5a581bce467b45d4))
* sync wizard state on tab return during installation ([5265d45](https://github.com/fjpulidop/specrails-hub/commit/5265d452932b02e0bb3aa677e6c88db7fe66de47))
* update npx specrails → npx specrails-core references ([eaf5aa1](https://github.com/fjpulidop/specrails-hub/commit/eaf5aa16413c5b0092ffa25152bbc676098a772f))
* use 'npx specrails init --yes' instead of 'npx specrails --yes' ([974ebae](https://github.com/fjpulidop/specrails-hub/commit/974ebaec58fa6462a2e44234cf7abc51e75bf1e7))
* use non-deprecated googleapis/release-please-action@v4 ([beceed7](https://github.com/fjpulidop/specrails-hub/commit/beceed724588ffd80a0f4efe8482426978bd481b))
* validate propose-feature command exists before creating proposal ([2a174f4](https://github.com/fjpulidop/specrails-hub/commit/2a174f46a3cbea558bbb6a2042945b30973297f3))
