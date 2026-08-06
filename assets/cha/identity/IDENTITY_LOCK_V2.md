# Identity lock v2

1. Select one neutral, front-facing master face. No costume, room, romance pose, or strong stylization.
2. Derive front, left/right 45-degree, profile, neutral expression, and varied-light references from that same master. Reject every drifted frame manually.
3. Package only the approved derivatives as one identity pack. Do not average independently generated faces.
4. Use the pack to build a provider-supported FaceID/PuLID/IP-Adapter identity or a small character LoRA. Keep identity conditioning separate from scene and style prompts.
5. Validate close-up, half-body, full-body, profile, indoor, outdoor, daylight, and night generations. Promote to canonical only after kk approves the set.
6. Update Live2D from the same approved pack. Re-enable `useIdentityReference` only in that promotion commit.

Midjourney may be used for casting and deriving candidates, but the application runtime must use a programmatically attachable identity condition. Three unrelated front portraits are not an identity pack.
