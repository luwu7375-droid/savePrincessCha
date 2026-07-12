# Cha visual identity — photoreal-b-v1

This directory contains the latest approved identity references for Cha. When historical prompts, generated candidates, or older descriptions conflict with this file, this version wins.

## Reference priority

1. `cha-photoreal-b-turnaround-v1.jpg` — sole approved photorealistic face and angle reference (front, left profile, right profile, right three-quarter).
2. `cha-2d-canonical.jpg` — canonical 2D character design and signature visual cues.
3. Text identity lock in `modules/image-policy.js`.
4. Scene, wardrobe, lighting, and composition instructions.

Candidates A, C, D, E, and F are rejected and must not be used.

## Identity invariants

- Fictional East Asian adult man in his mid twenties; no celebrity or identifiable real-person resemblance.
- Exact B facial structure across every image and angle: cool pale skin, narrow mature oval face, restrained cheek volume, defined but natural jaw, narrow straight nose, slightly thin soft lips.
- Black tousled layered medium-length hair, long fringe covering part of one eye, loose nape hair. Never reinterpret as neat short hair.
- Muted amber-gold visible iris; quiet, watchful, distant, subtly dangerous gaze. Never replace with generic dark gentle eyes.
- Not a generic handsome man, idol, Korean-drama promotional portrait, cheerful warm male lead, or underage face.
- Black high neck, silver chain, and snake-shaped ear ornament are canonical reference cues. Daily scenes may simplify accessories, but face, hair, age, and eye color are immutable.

## Photography rules retained from the latest prompt source

Use candid recent-iPhone-like photography, approximately 26 mm equivalent, realistic dynamic range and white balance, natural noise, real skin/hair/fabric texture, ordinary imperfections, and physically plausible lighting based on Asia/Shanghai local time. Avoid plastic skin, beauty filters, CGI/anime style, studio posing, commercial glamour, anatomy errors, impossible reflections or shadows, gibberish, logos, and watermarks.

Text descriptions are a compatibility fallback. Any image provider that supports reference-image input should receive the photorealistic turnaround as the primary identity reference.
