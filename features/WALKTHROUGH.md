# Project walkthroughs

Open a project, choose **Walkthrough**, then **Start walkthrough**. Nova's concept has four areas: ground-floor nail studio, first-floor lounge/treatment, and two private treatment rooms. Drag to look, use WASD/arrow keys to walk, or hold the on-screen direction buttons. Area and viewpoint controls reposition the camera. Each area can be downloaded as GLB for further modeling.

The concept is based on the supplied render references and `NOVA FURNITURE 2D.pdf`. The drawing establishes four pedicure chairs, two manicure stations, furniture placements and selected dimensions. Ceiling heights, room envelopes and details are simplified. This is an interactive concept, not a construction model or a photorealistic Unreal rendering. The original reference images and PDF are not published in this public repository. Model layout data is held in the project's RLS-protected `walkthroughs.model` column.

The viewer and its Three.js dependencies are bundled and served from the portal, with no runtime CDN requirement. Rebuild with `npm ci --prefix tools/walkthrough-build` followed by `npm run build --prefix tools/walkthrough-build`. Versions are pinned in the lockfile. The readable source is `walkthrough-viewer.source.js`; the generated runtime is `walkthrough-viewer.js`.

Project designers, project managers and company-wide editors follow the existing design-file write permissions. Managing Directors remain view-only, in line with the current account policy. Clients can read only visible walkthroughs on their active projects. External hosted tours/videos are also supported; external hosting must enforce its own access controls.

## Verification

- 14 UI assertions: role gates, safe URLs, HTML escaping and built-in launch state.
- 8 scene/movement checks across the four supplied model areas, using real Three.js scene geometry and a mocked WebGL renderer.
- Collision checks confirm starts and named viewpoints do not overlap furniture or walls.
- Rollback-only SQL tests cover client isolation, internal visibility, revocation, edit denial and Ready-state constraints.
- The current notification RPC was retained from the latest main branch and verified for client audience delivery, recipient privacy, read tracking and unauthorized send rejection. No test notices remain in production.
- Local browser visual testing was blocked by the cloud browser's URL policy. Actual GPU rendering and mobile layout were not visually verified in this environment.

Supabase's advisory review also reports existing privileged RPC notices and disabled leaked-password protection. See [RPC security advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) and [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). The new walkthrough tables have RLS and an additional Managing Director view-only write restriction.
